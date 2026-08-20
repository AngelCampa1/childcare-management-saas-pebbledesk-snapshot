import { zValidator } from "@hono/zod-validator";
import { centers, classrooms, memberships, staffAssignments, staffCheckIns } from "@pebbledesk/db";
import {
	DEFAULT_CENTER_TIMEZONE,
	staffAttendanceQuerySchema,
	staffCheckInSchema,
	toLocalDay,
} from "@pebbledesk/shared";
import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { requireAuth, requireCenter } from "../middleware/auth.js";
import { evaluateRoomRatio } from "../services/ratio.js";
import { upsertTimeEntryFromClockOut } from "../services/time-entries.js";

const STAFF_ATTENDANCE_LIST_LIMIT = 2000;

const staffCheckInsRoutes = new Hono<AppEnv>();

staffCheckInsRoutes.use("*", requireAuth, requireCenter);

function getDateKey(value: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(value);

	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;

	if (!year || !month || !day) {
		throw new Error(`Unable to format date for timezone ${timezone}`);
	}

	return `${year}-${month}-${day}`;
}

async function getCenterTimezone(db: AppEnv["Variables"]["db"], centerId: string): Promise<string> {
	const [center] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);

	return center?.timezone ?? DEFAULT_CENTER_TIMEZONE;
}

// POST / — clock in staff
staffCheckInsRoutes.post("/", requireAuth, zValidator("json", staffCheckInSchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	// currentMembershipId is guaranteed by requireAuth when centerId is set
	const currentMembershipId = c.get("membershipId");
	if (!currentMembershipId) throw new Response(null, { status: 500 });
	const role = c.get("role");
	const data = c.req.valid("json");

	// Determine the membership to clock in
	const targetMembershipId = data.membershipId ?? currentMembershipId;

	// Staff can only clock themselves in
	if (role === "staff" && data.membershipId && data.membershipId !== currentMembershipId) {
		forbidden("Staff can only clock themselves in");
	}

	if (data.membershipId) {
		const [membership] = await db
			.select({
				id: memberships.id,
				acceptedAt: memberships.acceptedAt,
				deactivatedAt: memberships.deactivatedAt,
			})
			.from(memberships)
			.where(and(eq(memberships.id, targetMembershipId), eq(memberships.centerId, centerId)))
			.limit(1);

		if (!membership) {
			notFound("Membership not found");
		}
		if (!membership.acceptedAt) {
			badRequest("Staff member must accept the center invitation before clock-in");
		}
		if (membership.deactivatedAt) {
			badRequest("Staff member is no longer active in this center");
		}
	}

	const [classroom] = await db
		.select({ id: classrooms.id, archivedAt: classrooms.archivedAt })
		.from(classrooms)
		.where(and(eq(classrooms.id, data.classroomId), eq(classrooms.centerId, centerId)))
		.limit(1);

	if (!classroom) {
		notFound("Classroom not found");
	}
	if (classroom.archivedAt) {
		badRequest("Cannot clock staff into an archived classroom");
	}

	if (role === "staff") {
		const [centerRow] = await db
			.select({ timezone: centers.timezone })
			.from(centers)
			.where(eq(centers.id, centerId))
			.limit(1);
		const staffTimezone = centerRow?.timezone ?? DEFAULT_CENTER_TIMEZONE;
		const today = toLocalDay(new Date(), staffTimezone);
		const [assignment] = await db
			.select({ id: staffAssignments.id })
			.from(staffAssignments)
			.where(
				and(
					eq(staffAssignments.centerId, centerId),
					eq(staffAssignments.membershipId, currentMembershipId),
					eq(staffAssignments.classroomId, data.classroomId),
					lte(staffAssignments.effectiveDate, today),
					or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
				),
			)
			.limit(1);

		if (!assignment) {
			forbidden("Staff can only clock into their assigned classrooms");
		}
	}

	const result = await db.transaction(async (tx) => {
		// Check for existing open clock-in
		const existing = await tx
			.select({ id: staffCheckIns.id })
			.from(staffCheckIns)
			.where(
				and(
					eq(staffCheckIns.centerId, centerId),
					eq(staffCheckIns.membershipId, targetMembershipId),
					isNull(staffCheckIns.clockedOutAt),
				),
			)
			.limit(1);

		if (existing.length > 0) {
			badRequest("Staff member is already clocked in");
		}

		const [staffCheckIn] = await tx
			.insert(staffCheckIns)
			.values({
				centerId,
				membershipId: targetMembershipId,
				classroomId: data.classroomId,
			})
			.returning();

		if (!staffCheckIn) {
			throw new Error("Failed to create staff check-in");
		}

		await evaluateRoomRatio(data.classroomId, centerId, tx);

		return staffCheckIn;
	});

	return c.json({ staffCheckIn: result }, 201);
});

// PATCH /:id/clock-out — clock out staff
staffCheckInsRoutes.patch("/:id/clock-out", requireAuth, async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const idParse = idSchema.safeParse(c.req.param("id"));
	if (!idParse.success) return c.json({ error: "Invalid ID format" }, 400);
	const id = idParse.data;
	const db = c.get("db");
	const currentMembershipId = c.get("membershipId");
	const role = c.get("role");

	const result = await db.transaction(async (tx) => {
		// Find the open clock-in
		const [existing] = await tx
			.select()
			.from(staffCheckIns)
			.where(
				and(
					eq(staffCheckIns.id, id),
					eq(staffCheckIns.centerId, centerId),
					isNull(staffCheckIns.clockedOutAt),
				),
			)
			.limit(1);

		if (!existing) {
			notFound("Staff check-in not found or already clocked out");
		}

		// Staff can only clock themselves out
		if (role === "staff" && existing.membershipId !== currentMembershipId) {
			forbidden("Staff can only clock themselves out");
		}

		const [updated] = await tx
			.update(staffCheckIns)
			.set({ clockedOutAt: new Date() })
			.where(
				and(
					eq(staffCheckIns.id, id),
					eq(staffCheckIns.centerId, centerId),
					isNull(staffCheckIns.clockedOutAt),
				),
			)
			.returning();

		if (!updated) {
			throw new Error("Failed to update staff check-in");
		}

		await upsertTimeEntryFromClockOut(tx, {
			centerId,
			membershipId: updated.membershipId,
			clockedInAt: new Date(existing.clockedInAt),
			clockedOutAt: new Date(updated.clockedOutAt ?? new Date()),
		});

		await evaluateRoomRatio(existing.classroomId, centerId, tx);

		return updated;
	});

	return c.json({ staffCheckIn: result });
});

// GET / — today's staff attendance.
// Owners/directors see every staff member; staff see only their own check-ins
// (scoped to their membership) so the Clock In/Out toggle can read its own
// active state without exposing the whole roster.
staffCheckInsRoutes.get(
	"/",
	requireAuth,
	zValidator("query", staffAttendanceQuerySchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const role = c.get("role");
		const currentMembershipId = c.get("membershipId");
		const { classroomId, date } = c.req.valid("query");
		const timezone = await getCenterTimezone(db, centerId);
		const targetDate = date ?? getDateKey(new Date(), timezone);

		const conditions = [
			eq(staffCheckIns.centerId, centerId),
			sql<boolean>`DATE(${staffCheckIns.clockedInAt} AT TIME ZONE ${timezone}) = ${targetDate}`,
		];

		if (classroomId) {
			conditions.push(eq(staffCheckIns.classroomId, classroomId));
		}

		// Staff filtering: only see check-ins for classrooms they are actively
		// assigned to — mirroring the child check-ins GET. This lets the Clock
		// In/Out toggle read its own active state AND lets the per-room ratio badge
		// count every coworker clocked into the same room, without exposing the
		// full cross-classroom roster.
		if (role === "staff") {
			// currentMembershipId is guaranteed by requireAuth when role is set
			if (!currentMembershipId) throw new Response(null, { status: 500 });
			const assignmentDay = toLocalDay(new Date(), timezone);
			conditions.push(sql<boolean>`exists (
				select 1 from ${staffAssignments}
				where ${staffAssignments.centerId} = ${centerId}
					and ${staffAssignments.membershipId} = ${currentMembershipId}
					and ${staffAssignments.classroomId} = ${staffCheckIns.classroomId}
					and ${staffAssignments.effectiveDate} <= ${assignmentDay}
					and (
						${staffAssignments.endDate} is null
						or ${staffAssignments.endDate} > ${assignmentDay}
					)
			)`);
		}

		const records = await db
			.select()
			.from(staffCheckIns)
			.where(and(...conditions))
			.orderBy(desc(staffCheckIns.clockedInAt))
			.limit(STAFF_ATTENDANCE_LIST_LIMIT + 1);

		if (records.length > STAFF_ATTENDANCE_LIST_LIMIT) {
			badRequest("Too many staff check-in records for this day to display.");
		}

		return c.json({ staffCheckIns: records });
	},
);

export { staffCheckInsRoutes };
