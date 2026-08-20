import { zValidator } from "@hono/zod-validator";
import {
	centers,
	checkIns,
	children,
	classroomAssignments,
	classrooms,
	staffAssignments,
} from "@pebbledesk/db";
import {
	attendanceQuerySchema,
	checkInHistoryQuerySchema,
	checkInSchema,
	checkOutSchema,
	DEFAULT_CENTER_TIMEZONE,
	toLocalDay,
} from "@pebbledesk/shared";
import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { requireAuth, requireCenter } from "../middleware/auth.js";
import { evaluateRoomRatio } from "../services/ratio.js";

const CHECK_IN_HISTORY_LIMIT = 5000;
const ATTENDANCE_LIST_LIMIT = 2000;

const checkInsRoutes = new Hono<AppEnv>();

checkInsRoutes.use("*", requireAuth, requireCenter);

function invariantMissingAuthContext(): never {
	throw new HTTPException(500, { message: "Internal server error" });
}

type DbClient = AppEnv["Variables"]["db"];
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

async function ensureCenterOwnedCheckInRelations(
	db: DbClient | DbTransaction,
	centerId: string,
	childId: string,
	classroomId: string,
) {
	const [centerRow] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	const timezone = centerRow?.timezone ?? DEFAULT_CENTER_TIMEZONE;
	const today = toLocalDay(new Date(), timezone);
	const [child] = await db
		.select({ id: children.id, enrollmentStatus: children.enrollmentStatus })
		.from(children)
		.where(and(eq(children.id, childId), eq(children.centerId, centerId)))
		.limit(1);

	if (!child) {
		notFound("Child not found");
	}
	if (child.enrollmentStatus !== "active") {
		badRequest("Only active children can be checked in");
	}

	const [classroom] = await db
		.select({ id: classrooms.id, archivedAt: classrooms.archivedAt })
		.from(classrooms)
		.where(and(eq(classrooms.id, classroomId), eq(classrooms.centerId, centerId)))
		.limit(1);

	if (!classroom) {
		notFound("Classroom not found");
	}
	if (classroom.archivedAt) {
		badRequest("Cannot check children into an archived classroom");
	}

	const [assignment] = await db
		.select({ id: classroomAssignments.id })
		.from(classroomAssignments)
		.where(
			and(
				eq(classroomAssignments.centerId, centerId),
				eq(classroomAssignments.childId, childId),
				eq(classroomAssignments.classroomId, classroomId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		)
		.limit(1);

	if (!assignment) {
		notFound("Child is not actively assigned to this classroom");
	}
}

async function getAssignedStaffClassroomIds(
	db: DbClient | DbTransaction,
	centerId: string,
	membershipId: string,
) {
	const [centerRow] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	const timezone = centerRow?.timezone ?? DEFAULT_CENTER_TIMEZONE;
	const today = toLocalDay(new Date(), timezone);
	const assignments = await db
		.select({ classroomId: staffAssignments.classroomId })
		.from(staffAssignments)
		.where(
			and(
				eq(staffAssignments.centerId, centerId),
				eq(staffAssignments.membershipId, membershipId),
				lte(staffAssignments.effectiveDate, today),
				or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
			),
		);

	return assignments.map((assignment) => assignment.classroomId);
}

async function assertStaffCheckInClassroomAccess(
	db: DbClient | DbTransaction,
	centerId: string,
	role: AppEnv["Variables"]["role"],
	membershipId: string,
	classroomId: string,
) {
	if (role !== "staff") return;

	const classroomIds = await getAssignedStaffClassroomIds(db, centerId, membershipId);
	if (!classroomIds.includes(classroomId)) {
		forbidden("Staff can only manage child check-ins for assigned classrooms");
	}
}

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

// GET /history — historical records (MUST be before /:id routes)
checkInsRoutes.get(
	"/history",
	requireAuth,
	zValidator("query", checkInHistoryQuerySchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const role = c.get("role");
		const membershipId = c.get("membershipId");
		const { childId, from, to } = c.req.valid("query");
		const timezone = await getCenterTimezone(db, centerId);
		const today = toLocalDay(new Date(), timezone);

		const conditions = [
			eq(checkIns.centerId, centerId),
			eq(checkIns.childId, childId),
			sql<boolean>`DATE(${checkIns.checkedInAt} AT TIME ZONE ${timezone}) >= ${from}`,
			sql<boolean>`DATE(${checkIns.checkedInAt} AT TIME ZONE ${timezone}) <= ${to}`,
		];

		// Staff can only see check-ins they performed
		if (role === "staff") {
			// membershipId is guaranteed by requireAuth when role is set
			if (!membershipId) invariantMissingAuthContext();
			conditions.push(sql<boolean>`exists (
				select 1 from ${staffAssignments}
				where ${staffAssignments.centerId} = ${centerId}
					and ${staffAssignments.membershipId} = ${membershipId}
					and ${staffAssignments.classroomId} = ${checkIns.classroomId}
					and ${staffAssignments.effectiveDate} <= ${today}
					and (
						${staffAssignments.endDate} is null
						or ${staffAssignments.endDate} > ${today}
					)
			)`);
		}

		const records = await db
			.select()
			.from(checkIns)
			.where(and(...conditions))
			.orderBy(desc(checkIns.checkedInAt))
			.limit(CHECK_IN_HISTORY_LIMIT + 1);

		if (records.length > CHECK_IN_HISTORY_LIMIT) {
			badRequest(
				"Too many check-in records for the selected date range — narrow the date range and try again.",
			);
		}

		return c.json({ checkIns: records });
	},
);

const SIGNATURE_MAX_BYTES = 200 * 1024;

function guardSignatureSize(signatureData: string | undefined, fieldName: string): void {
	if (signatureData === undefined) return;
	const byteLength = new TextEncoder().encode(signatureData).length;
	if (byteLength > SIGNATURE_MAX_BYTES) {
		throw new HTTPException(413, {
			message: `${fieldName} exceeds the 200 KB size limit`,
		});
	}
}

// POST / — check in a child
checkInsRoutes.post("/", requireAuth, zValidator("json", checkInSchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const membershipId = c.get("membershipId");
	const role = c.get("role");
	const data = c.req.valid("json");

	guardSignatureSize(data.signatureData, "checkInSignature");

	const result = await db.transaction(async (tx) => {
		await ensureCenterOwnedCheckInRelations(tx, centerId, data.childId, data.classroomId);

		// Check for existing open check-in
		const existing = await tx
			.select({ id: checkIns.id })
			.from(checkIns)
			.where(
				and(
					eq(checkIns.centerId, centerId),
					eq(checkIns.childId, data.childId),
					isNull(checkIns.checkedOutAt),
				),
			)
			.limit(1);

		if (existing.length > 0) {
			badRequest("Child is already checked in");
		}

		// membershipId is guaranteed by requireAuth when centerId is set
		if (!membershipId) invariantMissingAuthContext();
		await assertStaffCheckInClassroomAccess(tx, centerId, role, membershipId, data.classroomId);

		const [checkIn] = await tx
			.insert(checkIns)
			.values({
				centerId,
				childId: data.childId,
				classroomId: data.classroomId,
				checkedInBy: membershipId,
				notes: data.notes,
				isLate: data.isLate ?? false,
				checkInSignature: data.signatureData ?? null,
			})
			.returning();

		if (!checkIn) {
			throw new Error("Failed to create check-in");
		}

		await evaluateRoomRatio(data.classroomId, centerId, tx);

		return checkIn;
	});

	return c.json({ checkIn: result }, 201);
});

// PATCH /:id/check-out — check out a child
checkInsRoutes.patch(
	"/:id/check-out",
	requireAuth,
	zValidator("json", checkOutSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const idParse = idSchema.safeParse(c.req.param("id"));
		if (!idParse.success) return c.json({ error: "Invalid check-in ID" }, 400);
		const id = idParse.data;
		const db = c.get("db");
		const membershipId = c.get("membershipId");
		const role = c.get("role");
		const data = c.req.valid("json");

		guardSignatureSize(data.signatureData, "checkOutSignature");

		const result = await db.transaction(async (tx) => {
			// Find the open check-in
			const [existing] = await tx
				.select()
				.from(checkIns)
				.where(
					and(eq(checkIns.id, id), eq(checkIns.centerId, centerId), isNull(checkIns.checkedOutAt)),
				)
				.limit(1);

			if (!existing) {
				notFound("Check-in not found or already checked out");
			}

			if (!membershipId) invariantMissingAuthContext();
			await assertStaffCheckInClassroomAccess(
				tx,
				centerId,
				role,
				membershipId,
				existing.classroomId,
			);

			const [updated] = await tx
				.update(checkIns)
				.set({
					checkedOutAt: new Date(),
					checkedOutBy: membershipId,
					notes: data.notes ?? existing.notes,
					checkOutSignature: data.signatureData ?? null,
				})
				.where(
					and(eq(checkIns.id, id), eq(checkIns.centerId, centerId), isNull(checkIns.checkedOutAt)),
				)
				.returning();

			if (!updated) {
				notFound("Check-in not found or already checked out");
			}

			await evaluateRoomRatio(existing.classroomId, centerId, tx);

			return updated;
		});

		return c.json({ checkIn: result });
	},
);

// GET / — today's attendance
checkInsRoutes.get("/", requireAuth, zValidator("query", attendanceQuerySchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const { classroomId, date, childId } = c.req.valid("query");
	const timezone = await getCenterTimezone(db, centerId);

	const targetDate = date ?? getDateKey(new Date(), timezone);
	const today = toLocalDay(new Date(), timezone);

	const conditions = [
		eq(checkIns.centerId, centerId),
		sql<boolean>`DATE(${checkIns.checkedInAt} AT TIME ZONE ${timezone}) = ${targetDate}`,
	];

	if (classroomId) {
		conditions.push(eq(checkIns.classroomId, classroomId));
	}

	if (childId) {
		conditions.push(eq(checkIns.childId, childId));
	}

	// Staff filtering: only see check-ins for actively assigned classrooms
	if (role === "staff") {
		// membershipId is guaranteed by requireAuth when role is set
		if (!membershipId) invariantMissingAuthContext();
		conditions.push(sql<boolean>`exists (
			select 1 from ${staffAssignments}
			where ${staffAssignments.centerId} = ${centerId}
				and ${staffAssignments.membershipId} = ${membershipId}
				and ${staffAssignments.classroomId} = ${checkIns.classroomId}
				and ${staffAssignments.effectiveDate} <= ${today}
				and (
					${staffAssignments.endDate} is null
					or ${staffAssignments.endDate} > ${today}
				)
		)`);
	}

	const records = await db
		.select()
		.from(checkIns)
		.where(and(...conditions))
		.orderBy(desc(checkIns.checkedInAt))
		.limit(ATTENDANCE_LIST_LIMIT + 1);

	if (records.length > ATTENDANCE_LIST_LIMIT) {
		badRequest("Too many check-in records for this day to display.");
	}

	return c.json({ checkIns: records });
});

export { checkInsRoutes };
