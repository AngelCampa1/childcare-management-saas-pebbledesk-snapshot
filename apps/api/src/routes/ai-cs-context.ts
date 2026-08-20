import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";

/**
 * Signed AI-CS application-context endpoint.
 *
 * The Ventora AI-CS Worker calls this endpoint server-to-server while answering
 * a support question. It mirrors the boardstack pattern:
 *   - The Worker signs GET /api/ai-cs/context?appId&userId[&currentPath] with
 *     the shared AI_CS_CONTEXT_SECRET via X-Ventora-{Timestamp,Nonce,Signature}.
 *   - This endpoint verifies the signature, consumes the nonce once (replay
 *     protection in D1), then returns a signed AiCsAppContext describing
 *     PebbleDesk's help surface, navigation, and childcare compliance topics.
 *
 * The returned context contains only public in-app help content — no secrets,
 * credentials, or per-tenant data.
 */

const APP_ID = "pebbledesk";
const APP_NAME = "PebbleDesk";
const APP_BASE_URL = "https://my.pebbledesk.app";
const MAX_SKEW_MS = 5 * 60 * 1000;

type ContextSource = {
	id: string;
	title: string;
	url: string;
	excerpt: string;
};

type NavigationTarget = {
	label: string;
	path: string;
	description: string;
};

type WorkflowStep = {
	id: string;
	label: string;
	status: "next";
	path: string;
};

type AiCsAppContext = {
	assistantId: "ai-cs";
	appId: string;
	appName: string;
	authenticatedOnly: true;
	description: string;
	sources: ContextSource[];
	navigation: NavigationTarget[];
	workflow: WorkflowStep[];
};

type HmacHeaders = {
	timestamp: string;
	nonce: string;
	signature: string;
};

const SOURCES: ContextSource[] = [
	{
		id: "ratios",
		title: "Classroom Ratios",
		url: `${APP_BASE_URL}/help/ratios`,
		excerpt:
			"Monitor staff-to-child ratios by classroom in real time. Alerts fire when a room nears or breaches its licensed ratio limit.",
	},
	{
		id: "attendance",
		title: "Daily Attendance",
		url: `${APP_BASE_URL}/help/attendance`,
		excerpt:
			"Record check-ins and check-outs for children. The attendance roster shows who is present, late, or absent at any moment.",
	},
	{
		id: "children",
		title: "Child Profiles",
		url: `${APP_BASE_URL}/help/children`,
		excerpt:
			"Manage enrollment records, health information, authorized pickups, guardians, and subsidy eligibility for each child.",
	},
	{
		id: "billing",
		title: "Billing and Invoices",
		url: `${APP_BASE_URL}/help/billing`,
		excerpt:
			"Create and send invoices to guardians. Track payments, set up recurring billing, and reconcile balances.",
	},
	{
		id: "reports",
		title: "Compliance Reports",
		url: `${APP_BASE_URL}/help/reports`,
		excerpt:
			"Generate attendance, ratio, subsidy, and financial reports required by licensing agencies.",
	},
	{
		id: "subsidies",
		title: "Subsidy Claims",
		url: `${APP_BASE_URL}/help/subsidies`,
		excerpt:
			"Manage child-care subsidy cases, draft and submit claims, and track payment status per period.",
	},
	{
		id: "staff",
		title: "Staff and Scheduling",
		url: `${APP_BASE_URL}/help/staff`,
		excerpt:
			"Add staff members, assign them to classrooms, manage schedules, and track check-in times.",
	},
	{
		id: "classrooms",
		title: "Classroom Setup",
		url: `${APP_BASE_URL}/help/classrooms`,
		excerpt:
			"Configure classroom capacity, age groups, and assigned staff. Licensed capacity drives ratio enforcement.",
	},
];

const NAVIGATION: NavigationTarget[] = [
	{
		label: "Dashboard",
		path: "/dashboard",
		description: "Overview of ratio status and daily snapshot",
	},
	{ label: "Attendance", path: "/attendance", description: "Daily attendance roster and check-in" },
	{ label: "Ratios", path: "/ratios", description: "Live classroom ratio compliance board" },
	{ label: "Children", path: "/children", description: "Child enrollment and profiles" },
	{ label: "Classrooms", path: "/classrooms", description: "Classroom configuration and capacity" },
	{ label: "Reports", path: "/reports", description: "Compliance and financial reports" },
	{ label: "Billing", path: "/billing", description: "Invoices and payment tracking" },
	{ label: "Subsidies", path: "/subsidies", description: "Subsidy cases and claim submission" },
	{ label: "Scheduling", path: "/scheduling", description: "Staff schedules and shifts" },
	{ label: "Members", path: "/settings/members", description: "Staff accounts and roles" },
	{ label: "Settings", path: "/settings", description: "Center details and preferences" },
	{ label: "Account", path: "/account", description: "Subscription and billing plan" },
];

const WORKFLOW: WorkflowStep[] = [
	{ id: "add-center", label: "Set up your center", status: "next", path: "/onboarding" },
	{ id: "add-classrooms", label: "Add classrooms", status: "next", path: "/classrooms" },
	{ id: "enroll-children", label: "Enroll children", status: "next", path: "/children" },
	{ id: "add-staff", label: "Add staff members", status: "next", path: "/settings/members" },
	{ id: "check-ratios", label: "Review ratio compliance", status: "next", path: "/ratios" },
];

export const aiCsContextRouter = new Hono<AppEnv>();

aiCsContextRouter.get("/context", async (c) => {
	const appId = c.req.query("appId");
	if (appId !== APP_ID) {
		return c.json({ error: "Unknown app" }, 404);
	}

	const secret = c.env.AI_CS_CONTEXT_SECRET;
	const nonceDb = c.env.AI_CS_NONCE_DB;
	if (!secret || !nonceDb) {
		return c.json({ error: "App context unavailable" }, 503);
	}

	const userId = c.req.query("userId");
	if (!userId) {
		return c.json({ error: "Missing signature" }, 401);
	}

	const hmacHeaders = readHmacHeaders(c.req.raw.headers);
	if (!hmacHeaders) {
		return c.json({ error: "Missing signature" }, 401);
	}

	const requestUrl = new URL(c.req.url);
	const path = `${requestUrl.pathname}${requestUrl.search}`;

	const requestPayload = await buildHmacPayload({
		timestamp: hmacHeaders.timestamp,
		nonce: hmacHeaders.nonce,
		method: "GET",
		path,
		body: { appId, userId },
	});
	const verified = await verifyHmacSignature({
		payload: requestPayload,
		signature: hmacHeaders.signature,
		secret,
		timestamp: hmacHeaders.timestamp,
	});
	if (!verified) {
		return c.json({ error: "Invalid signature" }, 401);
	}

	const nonceAccepted = await consumeNonce(hmacHeaders.nonce, hmacHeaders.timestamp, nonceDb).catch(
		() => null,
	);
	if (nonceAccepted === null) {
		return c.json({ error: "App context unavailable" }, 503);
	}
	if (!nonceAccepted) {
		return c.json({ error: "Invalid signature" }, 401);
	}

	const body = buildPebbleDeskAppContext();
	const responseTimestamp = new Date().toISOString();
	const responseNonce = crypto.randomUUID();
	const responsePayload = await buildHmacPayload({
		timestamp: responseTimestamp,
		nonce: responseNonce,
		method: "GET",
		path,
		body,
	});

	return c.json(body, 200, {
		"Cache-Control": "private, max-age=300",
		"X-Ventora-Timestamp": responseTimestamp,
		"X-Ventora-Nonce": responseNonce,
		"X-Ventora-Signature": await signHmacPayload(responsePayload, secret),
	});
});

export function buildPebbleDeskAppContext(): AiCsAppContext {
	return {
		assistantId: "ai-cs",
		appId: APP_ID,
		appName: APP_NAME,
		authenticatedOnly: true,
		description:
			"Authenticated in-app support for PebbleDesk, the audit-ready childcare center administration platform. Helps licensed childcare directors and owners with ratio compliance, daily attendance, child enrollment, staff scheduling, billing, subsidy claims, and compliance reporting.",
		sources: SOURCES,
		navigation: NAVIGATION,
		workflow: WORKFLOW,
	};
}

function readHmacHeaders(headers: Headers): HmacHeaders | null {
	const timestamp = headers.get("X-Ventora-Timestamp");
	const nonce = headers.get("X-Ventora-Nonce");
	const signature = headers.get("X-Ventora-Signature");
	return timestamp && nonce && signature ? { timestamp, nonce, signature } : null;
}

export async function buildHmacPayload(input: {
	timestamp: string;
	nonce: string;
	method: string;
	path: string;
	body: unknown;
}): Promise<string> {
	const bodyHash = await sha256Hex(stableJson(input.body));
	return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
}

export async function verifyHmacSignature(input: {
	payload: string;
	signature: string;
	secret: string;
	timestamp: string;
	nowMs?: number;
}): Promise<boolean> {
	const nowMs = input.nowMs ?? Date.now();
	const timestampMs = Date.parse(input.timestamp);
	if (Number.isNaN(timestampMs)) return false;
	if (Math.abs(nowMs - timestampMs) > MAX_SKEW_MS) return false;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(input.secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const sigBytes = hexToBytes(input.signature);
	if (!sigBytes) return false;
	return crypto.subtle.verify(
		"HMAC",
		key,
		sigBytes.buffer as ArrayBuffer,
		encoder.encode(input.payload),
	);
}

export async function signHmacPayload(payload: string, secret: string): Promise<string> {
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

async function consumeNonce(
	nonce: string,
	timestamp: string,
	database: D1Database,
	nowMs: number = Date.now(),
): Promise<boolean> {
	const timestampMs = Date.parse(timestamp);
	const expiresAt = timestampMs + MAX_SKEW_MS;

	await database.prepare("DELETE FROM ai_cs_nonces WHERE expires_at <= ?").bind(nowMs).run();
	const result = await database
		.prepare("INSERT OR IGNORE INTO ai_cs_nonces (nonce, expires_at) VALUES (?, ?)")
		.bind(nonce, expiresAt)
		.run();

	if (!result.success) return false;
	return result.meta.changes === 1;
}

function stableJson(value: unknown): string {
	return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortStable);
	if (value === null || typeof value !== "object") return value;
	const obj = value as Record<string, unknown>;
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(obj).sort()) {
		sorted[key] = sortStable(obj[key]);
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

function hexToBytes(hex: string): Uint8Array | null {
	if (hex.length % 2 !== 0) return null;
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		const byte = Number.parseInt(hex.slice(i, i + 2), 16);
		if (Number.isNaN(byte)) return null;
		bytes[i / 2] = byte;
	}
	return bytes;
}
