import { zValidator } from "@hono/zod-validator";
import { schedules, shifts, timeEntries } from "@pebbledesk/db";
import { createTimeEntryAdjustmentSchema, TIME_ENTRY_STATUSES } from "@pebbledesk/shared";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { PAGE_MAX, resolvePagination } from "../lib/pagination.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

// timeEntryQuerySchema uses .refine() making it ZodEffects which lacks .merge().
// Compose a flat combined schema to validate all query params together.
const timeEntryListQuerySchema = z
	.object({
		from: z.string().date().optional(),
		to: z.string().date().optional(),
		membershipId: idSchema.optional(),
		classroomId: idSchema.optional(),
		status: z.enum(TIME_ENTRY_STATUSES).optional(),
		limit: z.coerce.number().int().min(1).max(PAGE_MAX).optional(),
		cursor: z.coerce.number().int().min(0).optional(),
	})
	.refine((data) => !data.from || !data.to || data.from <= data.to, {
		message: "from must be on or before to",
		path: ["from"],
	});

const timeEntriesRoutes = new Hono<AppEnv>();

timeEntriesRoutes.use("*", requireAuth, requireCenter);

timeEntriesRoutes.get(
	"/",
	requireAuth,
	zValidator("query", timeEntryListQuerySchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const role = c.get("role");
		const currentMembershipId = c.get("membershipId");
		const { from, to, membershipId, classroomId, status } = c.req.valid("query");
		const { limit, offset } = resolvePagination(c.req.valid("query"));
		const conditions = [eq(timeEntries.centerId, centerId)];

		if (from) conditions.push(gte(timeEntries.date, from));
		if (to) conditions.push(lte(timeEntries.date, to));
		if (status) conditions.push(eq(timeEntries.status, status));
		if (classroomId) {
			conditions.push(sql`exists (
				select 1
				from ${shifts}
				inner join ${schedules} on ${shifts.scheduleId} = ${schedules.id}
				where ${shifts.centerId} = ${timeEntries.centerId}
					and ${schedules.centerId} = ${timeEntries.centerId}
					and ${shifts.membershipId} = ${timeEntries.membershipId}
					and ${shifts.classroomId} = ${classroomId}
					and ${shifts.dayOfWeek} = extract(dow from ${timeEntries.date}::date)
					and ${schedules.effectiveFrom} <= ${timeEntries.date}
					and (${schedules.effectiveUntil} is null or ${schedules.effectiveUntil} >= ${timeEntries.date})
			)`);
		}

		if (role === "staff") {
			// currentMembershipId is guaranteed by requireAuth when role is set
			if (!currentMembershipId) throw new Response(null, { status: 500 });
			conditions.push(eq(timeEntries.membershipId, currentMembershipId));
		} else if (membershipId) {
			conditions.push(eq(timeEntries.membershipId, membershipId));
		}

		const results = await db
			.select()
			.from(timeEntries)
			.where(and(...conditions))
			.orderBy(asc(timeEntries.date), asc(timeEntries.id))
			.limit(limit)
			.offset(offset);
		return c.json({ timeEntries: results });
	},
);

timeEntriesRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createTimeEntryAdjustmentSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const idValidation = idSchema.safeParse(c.req.param("id"));
		if (!idValidation.success) return c.json({ error: "Invalid ID format" }, 400);
		const id = idValidation.data;

		const db = c.get("db");
		const [timeEntry] = await db
			.update(timeEntries)
			.set({ ...c.req.valid("json"), updatedAt: new Date() })
			.where(and(eq(timeEntries.id, id), eq(timeEntries.centerId, centerId)))
			.returning();

		if (!timeEntry) notFound("Time entry not found");
		return c.json({ timeEntry });
	},
);

export { timeEntriesRoutes };
