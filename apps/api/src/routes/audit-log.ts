import { zValidator } from "@hono/zod-validator";
import { auditLog, centers, users } from "@pebbledesk/db";
import {
	auditLogQuerySchema,
	DEFAULT_CENTER_TIMEZONE,
	toUtcMidnightForLocalDate,
} from "@pebbledesk/shared";
import { and, desc, eq, gte, ilike, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { forbidden } from "../lib/errors.js";
import { requireAuth, requireCenter, requirePermission, requireRole } from "../middleware/auth.js";

/** Returns the next calendar date string (YYYY-MM-DD) after the given one. */
function nextLocalDate(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

const auditLogRoutes = new Hono<AppEnv>();

auditLogRoutes.use("*", requireAuth, requireCenter);

// Belt-and-suspenders: requirePermission gates by the role→permission table
// (packages/shared/src/constants/roles.ts), and requireRole encodes the spec
// intent at the route level (audit log is Owner/Director only). Both must
// pass — neither alone can leak audit history to staff if one is misconfigured.
auditLogRoutes.get(
	"/",
	requireAuth,
	requirePermission("audit-log:read"),
	requireRole("owner", "director"),
	zValidator("query", auditLogQuerySchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const query = c.req.valid("query");

		const [centerRow] = await db
			.select({ timezone: centers.timezone })
			.from(centers)
			.where(eq(centers.id, centerId))
			.limit(1);
		const tz = centerRow?.timezone ?? DEFAULT_CENTER_TIMEZONE;

		const conditions = [eq(auditLog.centerId, centerId)];
		if (query.action) conditions.push(ilike(sql`${auditLog.action}::text`, `%${query.action}%`));
		// Exact match on entityType: stored values are exact route segments and the UI filter
		// sends whole segment names. A substring match would let "check-ins" also return
		// "staff-check-ins" rows (and similar prefixes), bleeding categories together.
		if (query.entityType) conditions.push(eq(auditLog.entityType, query.entityType));
		if (query.entityId) conditions.push(eq(auditLog.entityId, query.entityId));
		if (query.userId) conditions.push(eq(auditLog.userId, query.userId));
		if (query.from)
			conditions.push(gte(auditLog.createdAt, toUtcMidnightForLocalDate(query.from, tz)));
		if (query.to)
			conditions.push(
				lt(auditLog.createdAt, toUtcMidnightForLocalDate(nextLocalDate(query.to), tz)),
			);

		const PAGE_DEFAULT = 50;
		const PAGE_MAX = 200;
		const pageLimit = Math.min(query.limit ?? PAGE_DEFAULT, PAGE_MAX);
		const pageOffset = query.cursor ?? 0;

		const entries = await db
			.select({
				id: auditLog.id,
				centerId: auditLog.centerId,
				userId: auditLog.userId,
				userName: users.name,
				action: auditLog.action,
				entityType: auditLog.entityType,
				entityId: auditLog.entityId,
				changes: auditLog.changes,
				ipAddress: auditLog.ipAddress,
				createdAt: auditLog.createdAt,
			})
			.from(auditLog)
			.leftJoin(users, eq(auditLog.userId, users.id))
			.where(and(...conditions))
			.orderBy(desc(auditLog.createdAt))
			.limit(pageLimit)
			.offset(pageOffset);

		const nextCursor = entries.length === pageLimit ? pageOffset + entries.length : null;

		return c.json({ entries, nextCursor });
	},
);

export { auditLogRoutes };
