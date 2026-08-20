import { zValidator } from "@hono/zod-validator";
import {
	centers,
	checkIns,
	children,
	classroomAssignments,
	classrooms,
	memberships,
	staffAssignments,
	staffCheckIns,
	users,
} from "@pebbledesk/db";
import {
	AGE_GROUPS,
	createClassroomSchema,
	DEFAULT_CENTER_TIMEZONE,
	toLocalDay,
	updateClassroomSchema,
} from "@pebbledesk/shared";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

const classroomsRoutes = new Hono<AppEnv>();

classroomsRoutes.use("*", requireAuth, requireCenter);

async function getCenterTimezone(db: AppEnv["Variables"]["db"], centerId: string): Promise<string> {
	const [center] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	return center?.timezone ?? DEFAULT_CENTER_TIMEZONE;
}

function parseOptionalAgeGroupFilter(ageGroup?: string) {
	if (!ageGroup) return undefined;
	if (!(AGE_GROUPS as readonly string[]).includes(ageGroup)) {
		badRequest("Invalid age group");
	}
	return ageGroup as (typeof AGE_GROUPS)[number];
}

const assignChildSchema = z.object({
	childId: idSchema,
	effectiveDate: z.string().date(),
});

const assignStaffSchema = z.object({
	membershipId: idSchema,
	effectiveDate: z.string().date(),
});

// GET / — list classrooms with child/staff counts
classroomsRoutes.get("/", requireAuth, async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");

	const ageGroup = parseOptionalAgeGroupFilter(c.req.query("ageGroup"));
	const includeArchived = c.req.query("includeArchived") === "true";
	const today = new Date().toISOString().slice(0, 10);

	const conditions = [eq(classrooms.centerId, centerId)];
	const staffAssignmentConditions = [
		eq(staffAssignments.classroomId, classrooms.id),
		eq(staffAssignments.centerId, centerId),
		lte(staffAssignments.effectiveDate, today),
		or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
	];

	if (!includeArchived) {
		conditions.push(isNull(classrooms.archivedAt));
	}

	if (role === "staff") {
		if (!membershipId) forbidden("No center membership found");
		conditions.push(eq(staffAssignments.membershipId, membershipId));
	} else if (role !== "owner" && role !== "director") {
		forbidden("Insufficient permissions");
	}

	if (ageGroup) {
		conditions.push(eq(classrooms.ageGroup, ageGroup));
	}

	const results = await db
		.select({
			id: classrooms.id,
			centerId: classrooms.centerId,
			name: classrooms.name,
			ageGroup: classrooms.ageGroup,
			maxCapacity: classrooms.maxCapacity,
			minRatioStaff: classrooms.minRatioStaff,
			minRatioChildren: classrooms.minRatioChildren,
			createdAt: classrooms.createdAt,
			archivedAt: classrooms.archivedAt,
			childCount: sql<number>`count(distinct ${classroomAssignments.id})`.as("child_count"),
			staffCount: sql<number>`count(distinct ${staffAssignments.id})`.as("staff_count"),
		})
		.from(classrooms)
		.leftJoin(
			classroomAssignments,
			and(
				eq(classroomAssignments.classroomId, classrooms.id),
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		)
		.leftJoin(staffAssignments, and(...staffAssignmentConditions))
		.where(and(...conditions))
		.groupBy(classrooms.id);

	return c.json({ classrooms: results });
});

// GET /:id — get classroom with counts
// Staff may view classrooms they are actively assigned to; owner/director may view any.
classroomsRoutes.get("/:id", requireAuth, async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const idValidation = idSchema.safeParse(c.req.param("id"));
	if (!idValidation.success) {
		return c.json({ error: "Invalid ID format" }, 400);
	}
	const id = idValidation.data;
	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const today = new Date().toISOString().slice(0, 10);

	// Staff may only view classrooms they are currently assigned to.
	if (role === "staff") {
		if (!membershipId) forbidden("No center membership found");
		const [assignment] = await db
			.select({ id: staffAssignments.id })
			.from(staffAssignments)
			.where(
				and(
					eq(staffAssignments.classroomId, id),
					eq(staffAssignments.centerId, centerId),
					eq(staffAssignments.membershipId, membershipId),
					lte(staffAssignments.effectiveDate, today),
					or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
				),
			)
			.limit(1);
		if (!assignment) notFound("Classroom not found");
	} else if (role !== "owner" && role !== "director") {
		forbidden("Insufficient permissions");
	}

	const [classroom] = await db
		.select({
			id: classrooms.id,
			centerId: classrooms.centerId,
			name: classrooms.name,
			ageGroup: classrooms.ageGroup,
			maxCapacity: classrooms.maxCapacity,
			minRatioStaff: classrooms.minRatioStaff,
			minRatioChildren: classrooms.minRatioChildren,
			createdAt: classrooms.createdAt,
			archivedAt: classrooms.archivedAt,
			childCount: sql<number>`count(distinct ${classroomAssignments.id})`.as("child_count"),
			staffCount: sql<number>`count(distinct ${staffAssignments.id})`.as("staff_count"),
		})
		.from(classrooms)
		.leftJoin(
			classroomAssignments,
			and(
				eq(classroomAssignments.classroomId, classrooms.id),
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		)
		.leftJoin(
			staffAssignments,
			and(
				eq(staffAssignments.classroomId, classrooms.id),
				eq(staffAssignments.centerId, centerId),
				lte(staffAssignments.effectiveDate, today),
				or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
			),
		)
		.where(and(eq(classrooms.id, id), eq(classrooms.centerId, centerId)))
		.groupBy(classrooms.id)
		.limit(1);

	if (!classroom) notFound("Classroom not found");

	return c.json({ classroom });
});

// POST / — create classroom
classroomsRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createClassroomSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");

		const [classroom] = await db
			.insert(classrooms)
			.values({
				centerId,
				name: data.name,
				ageGroup: data.ageGroup,
				maxCapacity: data.maxCapacity,
				minRatioStaff: data.minRatioStaff,
				minRatioChildren: data.minRatioChildren,
			})
			.returning();

		if (!classroom) {
			throw new Error("Failed to create classroom");
		}

		return c.json({ classroom }, 201);
	},
);

// PATCH /:id — update classroom
classroomsRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateClassroomSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const idValidation = idSchema.safeParse(c.req.param("id"));
		if (!idValidation.success) {
			return c.json({ error: "Invalid ID format" }, 400);
		}
		const id = idValidation.data;
		const db = c.get("db");
		const data = c.req.valid("json");

		const updateData: Partial<typeof classrooms.$inferInsert> = {};
		if (data.name !== undefined) updateData.name = data.name;
		if (data.ageGroup !== undefined) updateData.ageGroup = data.ageGroup;
		if (data.maxCapacity !== undefined) updateData.maxCapacity = data.maxCapacity;
		if (data.minRatioStaff !== undefined) updateData.minRatioStaff = data.minRatioStaff;
		if (data.minRatioChildren !== undefined) updateData.minRatioChildren = data.minRatioChildren;

		const [updated] = await db
			.update(classrooms)
			.set(updateData)
			.where(and(eq(classrooms.id, id), eq(classrooms.centerId, centerId)))
			.returning();

		if (!updated) notFound("Classroom not found");

		return c.json({ classroom: updated });
	},
);

// POST /:id/archive — archive classroom
classroomsRoutes.post("/:id/archive", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");
	const membershipId = c.get("membershipId");
	if (!membershipId) forbidden("No center membership found");

	const idValidation = idSchema.safeParse(c.req.param("id"));
	if (!idValidation.success) {
		return c.json({ error: "Invalid ID format" }, 400);
	}
	const id = idValidation.data;
	const db = c.get("db");
	const archivedAt = new Date();
	const tz = await getCenterTimezone(db, centerId);
	const today = toLocalDay(archivedAt, tz);

	const [updated] = await db
		.update(classrooms)
		.set({ archivedAt })
		.where(and(eq(classrooms.id, id), eq(classrooms.centerId, centerId)))
		.returning();

	if (!updated) notFound("Classroom not found");

	await db
		.update(checkIns)
		.set({ checkedOutAt: archivedAt, checkedOutBy: membershipId })
		.where(
			and(
				eq(checkIns.classroomId, id),
				eq(checkIns.centerId, centerId),
				isNull(checkIns.checkedOutAt),
			),
		);

	await db
		.update(staffCheckIns)
		.set({ clockedOutAt: archivedAt })
		.where(
			and(
				eq(staffCheckIns.classroomId, id),
				eq(staffCheckIns.centerId, centerId),
				isNull(staffCheckIns.clockedOutAt),
			),
		);

	await db
		.update(classroomAssignments)
		.set({ endDate: today })
		.where(
			and(
				eq(classroomAssignments.classroomId, id),
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		);

	await db
		.update(staffAssignments)
		.set({ endDate: today })
		.where(
			and(
				eq(staffAssignments.classroomId, id),
				eq(staffAssignments.centerId, centerId),
				lte(staffAssignments.effectiveDate, today),
				or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
			),
		);

	return c.json({ classroom: updated });
});

// POST /:id/unarchive — unarchive classroom
classroomsRoutes.post(
	"/:id/unarchive",
	requireAuth,
	requireRole("owner", "director"),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const idValidation = idSchema.safeParse(c.req.param("id"));
		if (!idValidation.success) {
			return c.json({ error: "Invalid ID format" }, 400);
		}
		const id = idValidation.data;
		const db = c.get("db");

		const [updated] = await db
			.update(classrooms)
			.set({ archivedAt: null })
			.where(and(eq(classrooms.id, id), eq(classrooms.centerId, centerId)))
			.returning();

		if (!updated) notFound("Classroom not found");

		return c.json({ classroom: updated });
	},
);

// GET /:id/children — list children currently assigned
classroomsRoutes.get("/:id/children", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const idValidation = idSchema.safeParse(c.req.param("id"));
	if (!idValidation.success) {
		return c.json({ error: "Invalid ID format" }, 400);
	}
	const id = idValidation.data;
	const db = c.get("db");
	const today = toLocalDay(new Date(), await getCenterTimezone(db, centerId));

	const assigned = await db
		.select({
			assignmentId: classroomAssignments.id,
			childId: classroomAssignments.childId,
			effectiveDate: classroomAssignments.effectiveDate,
			firstName: children.firstName,
			lastName: children.lastName,
			dateOfBirth: children.dateOfBirth,
			ageGroup: children.ageGroup,
		})
		.from(classroomAssignments)
		.leftJoin(
			children,
			and(eq(classroomAssignments.childId, children.id), eq(children.centerId, centerId)),
		)
		.where(
			and(
				eq(classroomAssignments.classroomId, id),
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		);

	return c.json({ children: assigned });
});

// GET /:id/staff — list staff currently assigned
classroomsRoutes.get("/:id/staff", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const idValidation = idSchema.safeParse(c.req.param("id"));
	if (!idValidation.success) {
		return c.json({ error: "Invalid ID format" }, 400);
	}
	const id = idValidation.data;
	const db = c.get("db");
	const today = toLocalDay(new Date(), await getCenterTimezone(db, centerId));

	const assigned = await db
		.select({
			assignmentId: staffAssignments.id,
			membershipId: staffAssignments.membershipId,
			effectiveDate: staffAssignments.effectiveDate,
			role: memberships.role,
			userName: users.name,
			userEmail: users.email,
		})
		.from(staffAssignments)
		.leftJoin(
			memberships,
			and(eq(staffAssignments.membershipId, memberships.id), eq(memberships.centerId, centerId)),
		)
		.leftJoin(users, eq(memberships.userId, users.id))
		.where(
			and(
				eq(staffAssignments.classroomId, id),
				eq(staffAssignments.centerId, centerId),
				lte(staffAssignments.effectiveDate, today),
				or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
			),
		);

	return c.json({ staff: assigned });
});

// POST /:id/children — assign child to classroom
classroomsRoutes.post(
	"/:id/children",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", assignChildSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const classroomIdValidation = idSchema.safeParse(c.req.param("id"));
		if (!classroomIdValidation.success) {
			return c.json({ error: "Invalid ID format" }, 400);
		}
		const classroomId = classroomIdValidation.data;
		const db = c.get("db");
		const { childId, effectiveDate } = c.req.valid("json");

		// Verify classroom exists and belongs to center
		const [classroom] = await db
			.select({ id: classrooms.id, archivedAt: classrooms.archivedAt })
			.from(classrooms)
			.where(and(eq(classrooms.id, classroomId), eq(classrooms.centerId, centerId)))
			.limit(1);

		if (!classroom) notFound("Classroom not found");
		if (classroom.archivedAt) {
			badRequest("Cannot assign children to an archived classroom");
		}

		// Verify child exists and belongs to center
		const [child] = await db
			.select({ id: children.id, enrollmentStatus: children.enrollmentStatus })
			.from(children)
			.where(and(eq(children.id, childId), eq(children.centerId, centerId)))
			.limit(1);

		if (!child) notFound("Child not found");
		if (child.enrollmentStatus !== "active") {
			badRequest("Only active children can be assigned to classrooms");
		}

		// Reject if a future-dated assignment exists that the terminate-UPDATE would not close
		const futureAssignments = await db
			.select({ id: classroomAssignments.id })
			.from(classroomAssignments)
			.where(
				and(
					eq(classroomAssignments.childId, childId),
					eq(classroomAssignments.centerId, centerId),
					gt(classroomAssignments.effectiveDate, effectiveDate),
				),
			);

		if (futureAssignments.length > 0) {
			return c.json(
				{
					error: "Child has a future-dated classroom assignment; resolve it before reassigning",
				},
				409,
			);
		}

		// End any existing active assignment for this child
		await db
			.update(classroomAssignments)
			.set({ endDate: effectiveDate })
			.where(
				and(
					eq(classroomAssignments.childId, childId),
					eq(classroomAssignments.centerId, centerId),
					lte(classroomAssignments.effectiveDate, effectiveDate),
					or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, effectiveDate)),
				),
			);

		// Create new assignment
		const [assignment] = await db
			.insert(classroomAssignments)
			.values({
				centerId,
				childId,
				classroomId,
				effectiveDate,
			})
			.returning();

		if (!assignment) {
			throw new Error("Failed to create classroom assignment");
		}

		return c.json({ assignment }, 201);
	},
);

// DELETE /:id/children/:childId — end child assignment
classroomsRoutes.delete(
	"/:id/children/:childId",
	requireAuth,
	requireRole("owner", "director"),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const classroomIdValidation = idSchema.safeParse(c.req.param("id"));
		if (!classroomIdValidation.success) {
			return c.json({ error: "Invalid ID format" }, 400);
		}
		const classroomId = classroomIdValidation.data;
		const childIdValidation = idSchema.safeParse(c.req.param("childId"));
		if (!childIdValidation.success) return c.json({ error: "Invalid ID format" }, 400);
		const childId = childIdValidation.data;
		const db = c.get("db");

		const tz = await getCenterTimezone(db, centerId);
		const today = toLocalDay(new Date(), tz);

		const [updated] = await db
			.update(classroomAssignments)
			.set({ endDate: today })
			.where(
				and(
					eq(classroomAssignments.classroomId, classroomId),
					eq(classroomAssignments.childId, childId),
					eq(classroomAssignments.centerId, centerId),
					lte(classroomAssignments.effectiveDate, today),
					or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
				),
			)
			.returning();

		if (!updated) notFound("Active assignment not found");

		return c.json({ assignment: updated });
	},
);

// POST /:id/staff — assign staff member
classroomsRoutes.post(
	"/:id/staff",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", assignStaffSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const classroomIdValidation = idSchema.safeParse(c.req.param("id"));
		if (!classroomIdValidation.success) {
			return c.json({ error: "Invalid ID format" }, 400);
		}
		const classroomId = classroomIdValidation.data;
		const db = c.get("db");
		const { membershipId, effectiveDate } = c.req.valid("json");

		// Verify classroom exists and belongs to center
		const [classroom] = await db
			.select({ id: classrooms.id, archivedAt: classrooms.archivedAt })
			.from(classrooms)
			.where(and(eq(classrooms.id, classroomId), eq(classrooms.centerId, centerId)))
			.limit(1);

		if (!classroom) notFound("Classroom not found");
		if (classroom.archivedAt) {
			badRequest("Cannot assign staff to an archived classroom");
		}

		// Verify membership exists and belongs to center
		const [member] = await db
			.select({
				id: memberships.id,
				acceptedAt: memberships.acceptedAt,
				deactivatedAt: memberships.deactivatedAt,
			})
			.from(memberships)
			.where(and(eq(memberships.id, membershipId), eq(memberships.centerId, centerId)))
			.limit(1);

		if (!member) notFound("Staff member not found");
		if (!member.acceptedAt) {
			badRequest("Staff member must accept the center invitation before assignment");
		}
		if (member.deactivatedAt) {
			badRequest("Staff member is no longer active in this center");
		}

		// Check if already assigned to this classroom
		const [existing] = await db
			.select({ id: staffAssignments.id })
			.from(staffAssignments)
			.where(
				and(
					eq(staffAssignments.membershipId, membershipId),
					eq(staffAssignments.classroomId, classroomId),
					eq(staffAssignments.centerId, centerId),
					lte(staffAssignments.effectiveDate, effectiveDate),
					or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, effectiveDate)),
				),
			)
			.limit(1);

		if (existing) badRequest("Staff member is already assigned to this classroom");

		const [assignment] = await db
			.insert(staffAssignments)
			.values({
				centerId,
				membershipId,
				classroomId,
				effectiveDate,
			})
			.returning();

		if (!assignment) {
			throw new Error("Failed to create staff assignment");
		}

		return c.json({ assignment }, 201);
	},
);

// DELETE /:id/staff/:membershipId — end staff assignment
classroomsRoutes.delete(
	"/:id/staff/:membershipId",
	requireAuth,
	requireRole("owner", "director"),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const classroomIdValidation = idSchema.safeParse(c.req.param("id"));
		if (!classroomIdValidation.success) {
			return c.json({ error: "Invalid ID format" }, 400);
		}
		const classroomId = classroomIdValidation.data;
		const membershipIdValidation = idSchema.safeParse(c.req.param("membershipId"));
		if (!membershipIdValidation.success) return c.json({ error: "Invalid ID format" }, 400);
		const membershipId = membershipIdValidation.data;
		const db = c.get("db");

		const tz = await getCenterTimezone(db, centerId);
		const today = toLocalDay(new Date(), tz);

		const [updated] = await db
			.update(staffAssignments)
			.set({ endDate: today })
			.where(
				and(
					eq(staffAssignments.classroomId, classroomId),
					eq(staffAssignments.membershipId, membershipId),
					eq(staffAssignments.centerId, centerId),
					lte(staffAssignments.effectiveDate, today),
					or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
				),
			)
			.returning();

		if (!updated) notFound("Active staff assignment not found");

		return c.json({ assignment: updated });
	},
);

export { classroomsRoutes };
