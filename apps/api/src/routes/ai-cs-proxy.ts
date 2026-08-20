import type { Database } from "@pebbledesk/db";
import { aiCsEscalations, aiCsSessionOwners } from "@pebbledesk/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { captureScheduledException } from "../lib/sentry.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * Authenticated BFF for the Ventora AI-CS Worker.
 *
 * Routes: POST /v1/{sessions,chat,escalations} (mounted at /api/ai-cs)
 *
 * Every call is gated behind a valid better-auth session via requireAuth.
 * The BFF:
 *  1. Injects server-owned appId + userId for session creation (never trusts client).
 *  2. Signs each request with AI_CS_CLIENT_ASSERTION_SECRET (HMAC-SHA256, WebCrypto).
 *  3. Forwards to the AI-CS Worker at /v1/<route>.
 *  4. Streams chat SSE responses through unbuffered.
 *  5. Persists escalations to Neon before forwarding (best-effort, never blocks forward).
 *  6. Records session ownership on creation and verifies it on chat/escalations (IDOR fix).
 *
 * Fails closed: 503 when secrets/origin unset, 401 unauthenticated, 400 malformed,
 * 404 when session not owned by authed user, 502 when the Worker is unreachable.
 */

const APP_ID = "pebbledesk";

type StableJsonValue =
	| string
	| number
	| boolean
	| null
	| StableJsonValue[]
	| { [key: string]: StableJsonValue | undefined };

type AiCsRoute = "sessions" | "chat" | "escalations";

const ROUTES: readonly AiCsRoute[] = ["sessions", "chat", "escalations"];

export const aiCsProxyRouter = new Hono<AppEnv>();

aiCsProxyRouter.use("/v1/*", requireAuth);

for (const route of ROUTES) {
	aiCsProxyRouter.post(`/v1/${route}`, async (c) => {
		const secret = c.env.AI_CS_CLIENT_ASSERTION_SECRET;
		const workerOrigin = c.env.AI_CS_WORKER_ORIGIN;
		if (!secret || !workerOrigin) {
			return c.json({ error: "AI support unavailable" }, 503);
		}

		const rawBody = (await c.req.json().catch(() => null)) as StableJsonValue | null;
		if (rawBody === null || typeof rawBody !== "object" || Array.isArray(rawBody)) {
			return c.json({ error: "Invalid request" }, 400);
		}

		const userId = c.get("userId");

		if (route === "chat" || route === "escalations") {
			const sessionId = rawBody.sessionId;
			if (typeof sessionId !== "string" || sessionId.length === 0) {
				return c.json({ error: "Invalid request" }, 400);
			}
			const owned = await assertSessionOwnership(c.get("db"), sessionId, userId);
			if (!owned) {
				return c.json({ error: "Session not found" }, 404);
			}
		}

		if (route === "escalations") {
			const ticket = buildEscalationTicket(rawBody, userId);
			if (!ticket) {
				return c.json({ error: "Invalid request" }, 400);
			}
			// Look up the authenticated user's email for the durable ticket record.
			const userEmail = await resolveUserEmail(c.get("auth"), c.req.raw.headers);
			await persistEscalation(c.get("db"), { ...ticket, userEmail });
		}

		const forwardBody = buildForwardBody(route, rawBody, userId, {
			centerId: c.get("centerId"),
			role: c.get("role"),
		});
		const workerPath = `/v1/${route}`;
		const timestamp = new Date().toISOString();
		const nonce = crypto.randomUUID();
		const payload = await buildAssertionPayload({
			timestamp,
			nonce,
			method: "POST",
			path: workerPath,
			body: forwardBody,
		});
		const origin = resolveOrigin(c.req.raw.headers, c.env.APP_URL);

		const upstream = await fetch(`${workerOrigin}${workerPath}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: origin,
				"X-Ventora-Timestamp": timestamp,
				"X-Ventora-Nonce": nonce,
				"X-Ventora-Signature": await signPayload(payload, secret),
			},
			body: JSON.stringify(forwardBody),
		}).catch(() => null);

		if (!upstream) {
			return c.json({ error: "AI support unavailable" }, 502);
		}

		if (route === "chat") {
			if (!upstream.ok) {
				if (upstream.status === 404) {
					return c.json({ error: "Session not found" }, 404);
				}
				return c.json({ error: "AI support unavailable" }, 502);
			}
			if (!upstream.body) {
				return c.json({ error: "AI support unavailable" }, 502);
			}
			return new Response(upstream.body, {
				status: upstream.status,
				headers: {
					"Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
					"Cache-Control": "no-cache",
				},
			});
		}

		if (!upstream.ok) {
			return c.json({ error: "AI support unavailable" }, 502);
		}

		const responseBody = await upstream.text();

		if (route === "sessions") {
			await recordSessionOwnership(c.get("db"), responseBody, userId);
		}

		return new Response(responseBody, {
			status: upstream.status,
			headers: { "Content-Type": "application/json" },
		});
	});
}

/**
 * Checks that the given sessionId is owned by the given userId.
 * Fails closed: returns false if the db is unavailable or the query throws.
 */
export async function assertSessionOwnership(
	db: Database,
	sessionId: string,
	userId: string,
): Promise<boolean> {
	if (typeof db.select !== "function") {
		return false;
	}
	try {
		const rows = await db
			.select({ sessionId: aiCsSessionOwners.sessionId })
			.from(aiCsSessionOwners)
			.where(and(eq(aiCsSessionOwners.sessionId, sessionId), eq(aiCsSessionOwners.userId, userId)))
			.limit(1);
		return rows.length > 0;
	} catch (err) {
		captureScheduledException(err, "ai-cs-ownership-check");
		return false;
	}
}

/**
 * Best-effort: parses the upstream session-creation response and records
 * ownership. Never throws — errors are captured and the upstream body is
 * always returned to the client unchanged.
 */
async function recordSessionOwnership(
	db: Database,
	responseBody: string,
	userId: string,
): Promise<void> {
	try {
		const parsed: unknown = JSON.parse(responseBody);
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed) ||
			typeof (parsed as { sessionId?: unknown }).sessionId !== "string"
		) {
			return;
		}
		const sessionId = (parsed as { sessionId: string }).sessionId;
		await db.insert(aiCsSessionOwners).values({ sessionId, userId }).onConflictDoNothing();
	} catch (err) {
		captureScheduledException(err, "ai-cs-session-ownership-record");
	}
}

export function buildForwardBody(
	route: AiCsRoute,
	requestBody: { [key: string]: StableJsonValue | undefined },
	userId: string,
	ctx: { centerId?: string; role?: string },
): StableJsonValue {
	if (route === "sessions") {
		const forward: { [key: string]: StableJsonValue | undefined } = {
			appId: APP_ID,
			userId,
		};
		if (requestBody.currentPath !== undefined) {
			forward.currentPath = requestBody.currentPath;
		}
		const metadata: { [key: string]: string } = {};
		if (ctx.centerId) metadata.centerId = ctx.centerId;
		if (ctx.role) metadata.role = ctx.role;
		if (Object.keys(metadata).length > 0) {
			forward.metadata = metadata;
		}
		return forward;
	}

	if (route === "chat") {
		const forward: { [key: string]: StableJsonValue | undefined } = {
			sessionId: requestBody.sessionId,
			message: requestBody.message,
		};
		if (requestBody.currentPath !== undefined) {
			forward.currentPath = requestBody.currentPath;
		}
		return forward;
	}

	// escalations
	const forward: { [key: string]: StableJsonValue | undefined } = {
		sessionId: requestBody.sessionId,
	};
	if (requestBody.reason !== undefined) forward.reason = requestBody.reason;
	if (requestBody.message !== undefined) forward.message = requestBody.message;
	if (requestBody.contact !== undefined) forward.contact = requestBody.contact;
	return forward;
}

export type EscalationTicket = {
	userId: string;
	userEmail: string;
	sessionId: string;
	reason: string | null;
	message: string | null;
	contact: string | null;
};

export function buildEscalationTicket(
	body: { [key: string]: StableJsonValue | undefined },
	userId: string,
): Omit<EscalationTicket, "userEmail"> | null {
	const sessionId = body.sessionId;
	if (typeof sessionId !== "string" || sessionId.length === 0) {
		return null;
	}
	return {
		userId,
		sessionId,
		reason: typeof body.reason === "string" ? body.reason : null,
		message: typeof body.message === "string" ? body.message : null,
		contact: normalizeContact(body.contact),
	};
}

function normalizeContact(contact: StableJsonValue | undefined): string | null {
	if (contact === undefined || contact === null) return null;
	if (typeof contact === "string") return contact;
	return JSON.stringify(contact);
}

async function resolveUserEmail(
	auth: ReturnType<typeof import("@pebbledesk/auth").createAuth>,
	headers: Headers,
): Promise<string> {
	try {
		const session = await auth.api.getSession({ headers });
		return session?.user?.email ?? "";
	} catch {
		return "";
	}
}

async function persistEscalation(db: Database, ticket: EscalationTicket): Promise<void> {
	try {
		await db.insert(aiCsEscalations).values(ticket);
	} catch (err) {
		captureScheduledException(err, "ai-cs-escalation-persist");
	}
}

export async function buildAssertionPayload(input: {
	timestamp: string;
	nonce: string;
	method: string;
	path: string;
	body: StableJsonValue;
}): Promise<string> {
	const bodyHash = await sha256Hex(stableJson(input.body));
	return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
}

async function signPayload(payload: string, secret: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
	return bytesToHex(new Uint8Array(sig));
}

function stableJson(value: StableJsonValue): string {
	return JSON.stringify(sortStable(value));
}

function sortStable(value: StableJsonValue): StableJsonValue {
	if (Array.isArray(value)) return value.map(sortStable);
	if (value === null || typeof value !== "object") return value;
	const sorted: { [key: string]: StableJsonValue } = {};
	for (const key of Object.keys(value).sort()) {
		const child = value[key];
		if (child !== undefined) sorted[key] = sortStable(child);
	}
	return sorted;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function resolveOrigin(_headers: Headers, appUrl: string): string {
	return appUrl;
}
