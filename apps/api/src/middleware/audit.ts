import { auditLog } from "@pebbledesk/db";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/context.js";
import { captureApiException } from "../lib/sentry.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REDACTED_VALUE = "[REDACTED]";
const BASE_SENSITIVE_KEY_PARTS = ["address", "email", "password", "phone", "secret", "token"];
const CHILD_FAMILY_STAFF_ENTITY_TYPES = new Set([
	"children",
	"guardians",
	"members",
	"memberships",
	"staff-check-ins",
	"time-entries",
]);
const CHILD_FAMILY_STAFF_PII_KEYS = new Set([
	"allergies",
	"dateofbirth",
	"dob",
	"emergencycontact",
	"firstname",
	"guardianname",
	"guardianphone",
	"healthnotes",
	"immunizations",
	"lastname",
	"medicalnotes",
	"notes",
	"relationship",
	"staffemail",
	"staffname",
]);
// Routes skipped by the generic middleware because the handler writes its own richer audit row.
// The download endpoint is intentionally NOT listed here so the middleware covers it.
const SKIPPED_AUDIT_PATHS = new Set<string>(["/api/reports/generate"]);
const PAYMENT_REVERSAL_PATH_RE =
	/^\/api\/payments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/reverse$/i;

type SanitizedAuditChanges = {
	before?: Record<string, unknown>;
	after?: Record<string, unknown>;
	changedFields: string[];
};

function isSensitiveAuditKey(key: string, entityType?: string): boolean {
	const normalizedKey = key.toLowerCase();
	if (BASE_SENSITIVE_KEY_PARTS.some((sensitiveKey) => normalizedKey.includes(sensitiveKey))) {
		return true;
	}

	return (
		Boolean(entityType && CHILD_FAMILY_STAFF_ENTITY_TYPES.has(entityType)) &&
		CHILD_FAMILY_STAFF_PII_KEYS.has(normalizedKey)
	);
}

function sanitizeAuditValue(key: string, value: unknown, entityType?: string): unknown {
	if (isSensitiveAuditKey(key, entityType)) {
		return REDACTED_VALUE;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => (typeof entry === "object" && entry ? "[OBJECT]" : entry));
	}

	if (value && typeof value === "object") {
		return "[OBJECT]";
	}

	return value;
}

export function sanitizeAuditChanges(
	payload: Record<string, unknown>,
	options: { entityType?: string } = {},
): SanitizedAuditChanges {
	return {
		after: Object.fromEntries(
			Object.entries(payload).map(([key, value]) => [
				key,
				sanitizeAuditValue(key, value, options.entityType),
			]),
		),
		changedFields: Object.keys(payload),
	};
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractEntityId(segments: string[]): string {
	const candidate = segments[1];
	return candidate && UUID_RE.test(candidate) ? candidate : "unknown";
}

export const auditMiddleware = createMiddleware<AppEnv>(async (c, next) => {
	let requestChanges: SanitizedAuditChanges | undefined;
	const contentType = c.req.header("content-type") ?? "";
	const path = c.req.path;
	const segments = path.replace(/^\/api\//, "").split("/");
	const entityType = segments[0] ?? "unknown";
	if (
		MUTATION_METHODS.has(c.req.method) &&
		contentType.includes("application/json") &&
		!path.startsWith("/api/auth")
	) {
		try {
			const body = await c.req.raw.clone().json();
			if (body && typeof body === "object" && !Array.isArray(body)) {
				requestChanges = sanitizeAuditChanges(body as Record<string, unknown>, { entityType });
			}
		} catch {
			requestChanges = undefined;
		}
	}

	await next();

	const method = c.req.method;
	if (!MUTATION_METHODS.has(method)) return;
	if (c.res.status >= 400) return;

	// Skip auth routes
	if (
		path.startsWith("/api/auth") ||
		SKIPPED_AUDIT_PATHS.has(path) ||
		PAYMENT_REVERSAL_PATH_RE.test(path)
	) {
		return;
	}

	try {
		const db = c.get("db");
		const userId = c.get("userId");
		const centerId = c.get("centerId");

		if (!db || !userId) return;

		const action = method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
		const entityId = extractEntityId(segments);

		await db.insert(auditLog).values({
			centerId: centerId ?? null,
			userId,
			action: action as "create" | "update" | "delete" | "login" | "logout" | "export" | "import",
			entityType,
			entityId,
			changes: requestChanges ?? { changedFields: [] },
			ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
		});
	} catch (err) {
		console.error("[audit] Failed to write audit log:", err);
		captureApiException(err, c, { task: "audit-log" });
	}
});
