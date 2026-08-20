import { zValidator } from "@hono/zod-validator";
import { classrooms, memberships, schedules, shifts } from "@pebbledesk/db";
import { createShiftSchema, shiftQuerySchema, updateShiftSchema } from "@pebbledesk/shared";
import { and, asc, eq, lt, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { PAGE_MAX } from "../lib/pagination.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

const shiftsRoutes = new Hono<AppEnv>();

shiftsRoutes.use("*", requireAuth, requireCenter);

function parseShiftId(value: string) {
	const parsed = idSchema.safeParse(value);
	if (!parsed.success) badRequest("Invalid shift ID");
	return parsed.data;
}

// The application-level `checkShiftOverlap` cannot prevent two concurrent
// requests from each passing their overlap read and then both inserting. The
// `shifts_no_overlap` GiST exclusion constraint (migration 0066) is the
// race-safe backstop: Postgres raises error 23P01 when a write would create an
// overlapping shift for the same center/schedule/staff/day. Detect that here
// (recursing into wrapped `cause` chains, as the driver nests the original
// error) so the route can surface a 409 instead of a generic 500.
function isShiftOverlapExclusionViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;

	const code = (error as { code?: unknown }).code;
	const constraint = (error as { constraint?: unknown }).constraint;
	const message = (error as { message?: unknown }).message;
	if (
		code === "23P01" &&
		(constraint === "shifts_no_overlap" ||
			(typeof message === "string" && message.includes("shifts_no_overlap")))
	) {
		return true;
	}

	if ("cause" in error) {
		return isShiftOverlapExclusionViolation((error as { cause?: unknown }).cause);
	}

	return false;
}

async function checkShiftOverlap(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	scheduleId: string,
	membershipId: string,
	dayOfWeek: number,
	startTime: string,
	endTime: string,
	excludeShiftId?: string,
): Promise<void> {
	const conditions = [
		eq(shifts.centerId, centerId),
		eq(shifts.scheduleId, scheduleId),
		eq(shifts.membershipId, membershipId),
		eq(shifts.dayOfWeek, dayOfWeek),
		lt(shifts.startTime, endTime),
	];
	if (excludeShiftId) {
		conditions.push(ne(shifts.id, excludeShiftId));
	}
	const overlapping = await db
		.select({ id: shifts.id, startTime: shifts.startTime, endTime: shifts.endTime })
		.from(shifts)
		.where(and(...conditions));
	const hasOverlap = overlapping.some((s) => s.startTime < endTime && startTime < s.endTime);
	if (hasOverlap) {
		badRequest("Shift overlaps an existing shift for this staff member on this day");
	}
}

async function ensureCenterOwnedShiftRelations(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	input: {
		scheduleId?: string;
		membershipId?: string;
		classroomId?: string;
	},
) {
	if (input.scheduleId) {
		const [schedule] = await db
			.select({ id: schedules.id })
			.from(schedules)
			.where(and(eq(schedules.id, input.scheduleId), eq(schedules.centerId, centerId)))
			.limit(1);

		if (!schedule) notFound("Schedule not found");
	}

	if (input.membershipId) {
		const [membership] = await db
			.select({
				id: memberships.id,
				acceptedAt: memberships.acceptedAt,
				deactivatedAt: memberships.deactivatedAt,
			})
			.from(memberships)
			.where(and(eq(memberships.id, input.membershipId), eq(memberships.centerId, centerId)))
			.limit(1);

		if (!membership) notFound("Membership not found");
		if (!membership.acceptedAt) {
			badRequest("Staff member must accept the center invitation before scheduling");
		}
		if (membership.deactivatedAt) {
			badRequest("Staff member is no longer active in this center");
		}
	}

	if (input.classroomId) {
		const [classroom] = await db
			.select({ id: classrooms.id })
			.from(classrooms)
			.where(and(eq(classrooms.id, input.classroomId), eq(classrooms.centerId, centerId)))
			.limit(1);

		if (!classroom) notFound("Classroom not found");
	}
}

shiftsRoutes.get("/", requireAuth, zValidator("query", shiftQuerySchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const role = c.get("role");
	const currentMembershipId = c.get("membershipId");
	const { scheduleId, membershipId, classroomId, dayOfWeek } = c.req.valid("query");
	const conditions = [eq(shifts.centerId, centerId)];

	if (scheduleId) conditions.push(eq(shifts.scheduleId, scheduleId));
	if (classroomId) conditions.push(eq(shifts.classroomId, classroomId));
	if (dayOfWeek !== undefined) conditions.push(eq(shifts.dayOfWeek, dayOfWeek));

	if (role === "staff") {
		// currentMembershipId is guaranteed by requireAuth when role is set
		if (!currentMembershipId) throw new Response(null, { status: 500 });
		conditions.push(eq(shifts.membershipId, currentMembershipId));
	} else if (membershipId) {
		conditions.push(eq(shifts.membershipId, membershipId));
	}

	const results = await db
		.select()
		.from(shifts)
		.where(and(...conditions))
		.orderBy(asc(shifts.dayOfWeek), asc(shifts.startTime), asc(shifts.id))
		.limit(PAGE_MAX);
	return c.json({ shifts: results });
});

shiftsRoutes.get("/:id", requireAuth, async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const role = c.get("role");
	const currentMembershipId = c.get("membershipId");
	const id = parseShiftId(c.req.param("id"));
	const conditions = [eq(shifts.id, id), eq(shifts.centerId, centerId)];

	if (role === "staff") {
		if (!currentMembershipId) throw new Response(null, { status: 500 });
		conditions.push(eq(shifts.membershipId, currentMembershipId));
	}

	const [shift] = await db
		.select()
		.from(shifts)
		.where(and(...conditions))
		.limit(1);

	if (!shift) notFound("Shift not found");
	return c.json({ shift });
});

shiftsRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createShiftSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const input = c.req.valid("json");
		await ensureCenterOwnedShiftRelations(db, centerId, input);
		await checkShiftOverlap(
			db,
			centerId,
			input.scheduleId,
			input.membershipId,
			input.dayOfWeek,
			input.startTime,
			input.endTime,
		);
		let shift: typeof shifts.$inferSelect | undefined;
		try {
			[shift] = await db
				.insert(shifts)
				.values({ centerId, ...input })
				.returning();
		} catch (err) {
			if (isShiftOverlapExclusionViolation(err)) {
				conflict("Shift overlaps an existing shift for this staff member on this day");
			}
			throw err;
		}

		if (!shift) {
			throw new Error("Failed to create shift");
		}

		return c.json({ shift }, 201);
	},
);

shiftsRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateShiftSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const input = c.req.valid("json");
		const id = parseShiftId(c.req.param("id"));
		const [existing] = await db
			.select({
				startTime: shifts.startTime,
				endTime: shifts.endTime,
				scheduleId: shifts.scheduleId,
				membershipId: shifts.membershipId,
				dayOfWeek: shifts.dayOfWeek,
			})
			.from(shifts)
			.where(and(eq(shifts.id, id), eq(shifts.centerId, centerId)))
			.limit(1);

		if (!existing) notFound("Shift not found");

		const startTime = input.startTime ?? existing.startTime;
		const endTime = input.endTime ?? existing.endTime;
		if (startTime >= endTime) {
			badRequest("startTime must be before endTime");
		}

		await ensureCenterOwnedShiftRelations(db, centerId, input);
		const effectiveScheduleId = input.scheduleId ?? existing.scheduleId;
		const effectiveMembershipId = input.membershipId ?? existing.membershipId;
		const effectiveDayOfWeek = input.dayOfWeek ?? existing.dayOfWeek;
		await checkShiftOverlap(
			db,
			centerId,
			effectiveScheduleId,
			effectiveMembershipId,
			effectiveDayOfWeek,
			startTime,
			endTime,
			id,
		);
		let shift: typeof shifts.$inferSelect | undefined;
		try {
			[shift] = await db
				.update(shifts)
				.set(input)
				.where(and(eq(shifts.id, id), eq(shifts.centerId, centerId)))
				.returning();
		} catch (err) {
			if (isShiftOverlapExclusionViolation(err)) {
				conflict("Shift overlaps an existing shift for this staff member on this day");
			}
			throw err;
		}

		if (!shift) notFound("Shift not found");
		return c.json({ shift });
	},
);

shiftsRoutes.delete("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const id = parseShiftId(c.req.param("id"));
	const [shift] = await db
		.delete(shifts)
		.where(and(eq(shifts.id, id), eq(shifts.centerId, centerId)))
		.returning();

	if (!shift) notFound("Shift not found");
	return c.json({ success: true });
});

export { shiftsRoutes };
