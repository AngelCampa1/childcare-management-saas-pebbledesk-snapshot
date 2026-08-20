import { zValidator } from "@hono/zod-validator";
import { schedules } from "@pebbledesk/db";
import {
	createScheduleSchema,
	scheduleQuerySchema,
	updateScheduleSchema,
} from "@pebbledesk/shared";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { PAGE_MAX } from "../lib/pagination.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

const schedulesRoutes = new Hono<AppEnv>();

schedulesRoutes.use("*", requireAuth, requireCenter);

function parseScheduleId(value: string) {
	const parsed = idSchema.safeParse(value);
	if (!parsed.success) badRequest("Invalid schedule ID");
	return parsed.data;
}

schedulesRoutes.get("/", requireAuth, zValidator("query", scheduleQuerySchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const { activeOn } = c.req.valid("query");
	const conditions = [eq(schedules.centerId, centerId)];

	if (activeOn) {
		conditions.push(lte(schedules.effectiveFrom, activeOn));
		const activeUntilCondition = or(
			isNull(schedules.effectiveUntil),
			sql`${schedules.effectiveUntil} >= ${activeOn}`,
		);
		if (activeUntilCondition) {
			conditions.push(activeUntilCondition);
		}
	}

	const results = await db
		.select()
		.from(schedules)
		.where(and(...conditions))
		.orderBy(asc(schedules.effectiveFrom), asc(schedules.id))
		.limit(PAGE_MAX);

	return c.json({ schedules: results });
});

schedulesRoutes.get("/:id", requireAuth, async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const id = parseScheduleId(c.req.param("id"));
	const [schedule] = await db
		.select()
		.from(schedules)
		.where(and(eq(schedules.id, id), eq(schedules.centerId, centerId)))
		.limit(1);

	if (!schedule) notFound("Schedule not found");
	return c.json({ schedule });
});

schedulesRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createScheduleSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");
		const [schedule] = await db
			.insert(schedules)
			.values({ centerId, ...data })
			.returning();

		if (!schedule) {
			throw new Error("Failed to create schedule");
		}

		return c.json({ schedule }, 201);
	},
);

schedulesRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateScheduleSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const id = parseScheduleId(c.req.param("id"));
		const input = c.req.valid("json");
		const [existing] = await db
			.select({
				effectiveFrom: schedules.effectiveFrom,
				effectiveUntil: schedules.effectiveUntil,
			})
			.from(schedules)
			.where(and(eq(schedules.id, id), eq(schedules.centerId, centerId)))
			.limit(1);

		if (!existing) notFound("Schedule not found");

		const effectiveFrom = input.effectiveFrom ?? existing.effectiveFrom;
		const effectiveUntil = input.effectiveUntil ?? existing.effectiveUntil;
		if (effectiveUntil && effectiveFrom > effectiveUntil) {
			badRequest("effectiveFrom must be on or before effectiveUntil");
		}

		const [schedule] = await db
			.update(schedules)
			.set({ ...input, updatedAt: new Date() })
			.where(and(eq(schedules.id, id), eq(schedules.centerId, centerId)))
			.returning();

		if (!schedule) notFound("Schedule not found");
		return c.json({ schedule });
	},
);

schedulesRoutes.delete("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const id = parseScheduleId(c.req.param("id"));
	const [schedule] = await db
		.delete(schedules)
		.where(and(eq(schedules.id, id), eq(schedules.centerId, centerId)))
		.returning();

	if (!schedule) notFound("Schedule not found");
	return c.json({ success: true });
});

export { schedulesRoutes };
