/**
 * Auth & authorization middleware.
 *
 * Role-permission grant table (source of truth: packages/shared/src/constants/roles.ts):
 *   - owner    → ALL permissions (full superset, including audit-log:read, quickbooks:manage,
 *                members:remove, center:settings, subsidies:manage, payments:manage, etc.)
 *   - director → operational + read permissions (check-in, ratios, children, guardians,
 *                classrooms, messages, schedules, subsidies, reports, audit-log:read,
 *                invoices:manage, payments:manage, members:invite).
 *                NOTE: director does NOT have quickbooks:manage, members:remove, or
 *                center:settings.
 *   - staff    → ONLY: check-in:create, check-in:read-own-room, ratios:read-own-room,
 *                messages:send-own-room. Staff has NO access to audit-log, invoices,
 *                quickbooks, center settings, member management, schedules, subsidies,
 *                reports, or cross-room reads.
 *
 * Route handlers should prefer the most specific guard available:
 *   - requireRole(...roles)       — explicit role intent (preferred for sensitive routes)
 *   - requirePermission(perm)     — capability-style gate via the table above
 *   - Compose both as belt-and-suspenders on audit-log / billing / settings routes so a
 *     future change to the permission table cannot silently widen access.
 */
import { createAuth } from "@pebbledesk/auth";
import { assertProductionDbDriver, createDb, resolveConnectionString } from "@pebbledesk/db";
import { renderSignupEmailConfirmation } from "@pebbledesk/emails";
import { hasPermission, type Permission, type Role } from "@pebbledesk/shared";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/context.js";
import { sendEmail } from "../lib/email.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { getAllowedWebOrigins, resolveAuthBaseUrl } from "../lib/local-origins.js";
import { resolveActiveMembershipContext } from "../lib/membership-context.js";

/**
 * WeakMap-keyed assertion cache — keyed on the env bindings object so the check
 * fires once per unique Cloudflare Worker isolate binding context instead of once
 * per module lifetime. A module-level boolean would stick after the first request
 * even if the Worker isolate is reused with different env bindings.
 */
const asserted = new WeakMap<object, boolean>();
const AUTH_ONLY_PATHS = new Set([
	"/api/memberships/mine",
	"/api/memberships/switch",
	"/api/overview/multi-center",
]);

function assertOnce(env: object, check: () => void): void {
	if (!asserted.has(env)) {
		check();
		asserted.set(env, true);
	}
}

/** Narrows errors thrown by Better Auth's `getSession` to session-validation failures.
 *  Better Auth (via better-call) attaches a numeric `status` field to APIError instances.
 *  DB/network errors are plain `Error` objects without `status`, so they are not caught. */
function isSessionValidationError(err: unknown): boolean {
	return (
		err instanceof Error &&
		(("status" in err && typeof (err as { status: unknown }).status === "number") ||
			("statusCode" in err && typeof (err as { statusCode: unknown }).statusCode === "number") ||
			err.name === "APIError")
	);
}

export async function resolveSessionUserId(
	auth: ReturnType<typeof createAuth>,
	headers: Headers,
): Promise<string | null> {
	try {
		const session = await auth.api.getSession({ headers });
		return session?.user?.id ?? null;
	} catch (err: unknown) {
		if (isSessionValidationError(err)) {
			return null;
		}
		throw err;
	}
}

export const initMiddleware = createMiddleware<AppEnv>(async (c, next) => {
	// Derive isProduction before assertOnce so the production check is not
	// cached under a non-production env object (e.g. a preview request that
	// first touches an isolate would otherwise mark it "asserted" with
	// isProduction=false, letting a later production binding skip the check).
	const isProduction = c.env.APP_URL.startsWith("https://");
	if (isProduction) {
		assertOnce(c.env, () => {
			assertProductionDbDriver(c.env.HYPERDRIVE, true);
		});
	}

	const connectionString = resolveConnectionString(c.env.HYPERDRIVE, c.env.DATABASE_URL);

	const db = createDb(connectionString, {
		hyperdriveBound: Boolean(c.env.HYPERDRIVE),
	});
	const auth = createAuth({
		db,
		secret: c.env.BETTER_AUTH_SECRET,
		baseURL: resolveAuthBaseUrl(c.env.BETTER_AUTH_URL, c.req.url),
		trustedOrigins: getAllowedWebOrigins(c.env.APP_URL),
		googleClientId: c.env.GOOGLE_CLIENT_ID,
		googleClientSecret: c.env.GOOGLE_CLIENT_SECRET,
		isProduction: c.env.APP_URL.startsWith("https://"),
		sendVerificationEmail: async ({ user, url }) => {
			try {
				const rendered = await renderSignupEmailConfirmation({
					name: user.name ?? undefined,
					verificationUrl: url,
				});
				await sendEmail({
					to: user.email,
					from: c.env.RESEND_FROM_EMAIL,
					subject: rendered.subject,
					html: rendered.html,
					text: rendered.text,
					apiKey: c.env.RESEND_API_KEY,
					tags: [
						{ name: "campaign", value: "signup-trial" },
						{ name: "template", value: "signup-email-confirmation" },
					],
				});
			} catch (error) {
				console.warn(
					"Signup verification email send failed",
					error instanceof Error ? error.message : "unknown error",
				);
			}
		},
	});

	c.set("db", db);
	c.set("auth", auth);

	await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	const auth = c.get("auth");
	const db = c.get("db");

	const userId = await resolveSessionUserId(auth, c.req.raw.headers);
	if (!userId) {
		unauthorized();
	}

	c.set("userId", userId);

	const membership = await resolveActiveMembershipContext(db, userId, c);

	if (membership && "error" in membership) {
		if (AUTH_ONLY_PATHS.has(c.req.path)) {
			await next();
			return;
		}
		return c.json({ error: membership.error, centers: membership.centers }, 409);
	}

	if (membership) {
		c.set("centerId", membership.centerId);
		c.set("membershipId", membership.membershipId);
		c.set("role", membership.role as Role);
	}

	await next();
});

export function requireRole(...roles: Role[]) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const role = c.get("role");

		if (!role || !roles.includes(role)) {
			forbidden("Insufficient permissions");
		}

		await next();
	});
}

export function requirePermission(permission: Permission) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const role = c.get("role");

		if (!role || !hasPermission(role, permission)) {
			forbidden("Insufficient permissions");
		}

		await next();
	});
}

export const requireCenter = createMiddleware<AppEnv>(async (c, next) => {
	const centerId = c.get("centerId");
	if (!centerId) {
		forbidden("No center membership found");
	}
	await next();
});
