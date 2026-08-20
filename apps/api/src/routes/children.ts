import { zValidator } from "@hono/zod-validator";
import {
	centers,
	checkIns,
	childGuardians,
	children,
	classroomAssignments,
	classrooms,
	guardians,
	staffAssignments,
} from "@pebbledesk/db";
import {
	AGE_GROUPS,
	createChildSchema,
	DEFAULT_CENTER_TIMEZONE,
	ENROLLMENT_STATUSES,
	enrollChildSchema,
	linkGuardianSchema,
	toLocalDay,
	updateChildSchema,
	updateGuardianLinkSchema,
} from "@pebbledesk/shared";
import { and, eq, gt, ilike, isNull, lte, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { paginationSchema, resolvePagination } from "../lib/pagination.js";
import { assertCanAddActiveChildren } from "../lib/plan-limits.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";
import { createChild, enrollChild } from "../services/children.js";
import {
	DUPLICATE_GUARDIAN_EMAIL_MESSAGE,
	DUPLICATE_GUARDIAN_LINK_MESSAGE,
	linkGuardianToChild,
} from "../services/guardians.js";

const childrenRoutes = new Hono<AppEnv>();

childrenRoutes.use("*", requireAuth, requireCenter);

async function getCenterTimezone(db: AppEnv["Variables"]["db"], centerId: string): Promise<string> {
	const [center] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	return center?.timezone ?? DEFAULT_CENTER_TIMEZONE;
}

function parseOptionalChildListFilters(input: {
	status?: string;
	ageGroup?: string;
	classroomId?: string;
}) {
	if (input.status && !(ENROLLMENT_STATUSES as readonly string[]).includes(input.status)) {
		badRequest("Invalid enrollment status");
	}

	if (input.ageGroup && !(AGE_GROUPS as readonly string[]).includes(input.ageGroup)) {
		badRequest("Invalid age group");
	}

	const classroomIdResult = input.classroomId
		? idSchema.safeParse(input.classroomId)
		: { success: true as const, data: undefined };
	if (!classroomIdResult.success) {
		badRequest("Invalid classroom ID");
	}

	return {
		status: input.status as (typeof ENROLLMENT_STATUSES)[number] | undefined,
		ageGroup: input.ageGroup as (typeof AGE_GROUPS)[number] | undefined,
		classroomId: classroomIdResult.data,
	};
}

async function assertStaffChildAccess(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	role: AppEnv["Variables"]["role"],
	membershipId: string,
	childId: string,
	today: string,
) {
	if (role !== "staff") return;

	const staffRooms = await db
		.select({ classroomId: staffAssignments.classroomId })
		.from(staffAssignments)
		.where(
			and(
				eq(staffAssignments.membershipId, membershipId),
				eq(staffAssignments.centerId, centerId),
				lte(staffAssignments.effectiveDate, today),
				or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
			),
		);

	const roomIds = staffRooms.map((room) => room.classroomId);
	if (roomIds.length === 0) {
		notFound("Child not found");
	}

	const assignments = await db
		.select({ classroomId: classroomAssignments.classroomId })
		.from(classroomAssignments)
		.where(
			and(
				eq(classroomAssignments.childId, childId),
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		);

	if (!assignments.some((assignment) => roomIds.includes(assignment.classroomId))) {
		notFound("Child not found");
	}
}

async function endActiveClassroomAssignments(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	childId: string,
	today: string,
) {
	await db
		.update(classroomAssignments)
		.set({ endDate: today })
		.where(
			and(
				eq(classroomAssignments.childId, childId),
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		);
}

async function closeOpenChildCheckIns(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	childId: string,
	membershipId: string,
) {
	await db
		.update(checkIns)
		.set({ checkedOutAt: new Date(), checkedOutBy: membershipId })
		.where(
			and(
				eq(checkIns.childId, childId),
				eq(checkIns.centerId, centerId),
				isNull(checkIns.checkedOutAt),
			),
		);
}

// POST /enroll — enrollment transaction (BEFORE /:id to avoid route conflict)
childrenRoutes.post(
	"/enroll",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", enrollChildSchema, (result, c) => {
		if (!result.success) {
			return c.text(result.error.issues[0]?.message ?? "Invalid enrollment payload", 400);
		}
	}),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");

		let result: Awaited<ReturnType<typeof enrollChild>>;
		try {
			result = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select 1 from ${centers} where ${centers.id} = ${centerId} for update`,
				);
				return enrollChild(db, centerId, data, tx);
			});
		} catch (error) {
			if (error instanceof Error && error.message === DUPLICATE_GUARDIAN_EMAIL_MESSAGE) {
				throw new HTTPException(409, { message: "guardian_duplicate" });
			}
			if (error instanceof Error && error.message === DUPLICATE_GUARDIAN_LINK_MESSAGE) {
				throw new HTTPException(409, { message: "guardian_link_duplicate" });
			}
			throw error;
		}

		return c.json(result, 201);
	},
);

// GET / — list children
childrenRoutes.get("/", requireAuth, zValidator("query", paginationSchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");

	const search = c.req.query("search");
	const { status, ageGroup, classroomId } = parseOptionalChildListFilters({
		status: c.req.query("status"),
		ageGroup: c.req.query("ageGroup"),
		classroomId: c.req.query("classroomId"),
	});
	const { limit, offset } = resolvePagination(c.req.valid("query"));
	const tz = await getCenterTimezone(db, centerId);
	const today = toLocalDay(new Date(), tz);

	const conditions = [eq(children.centerId, centerId)];

	// Default: hide withdrawn unless explicitly requested
	if (status) {
		conditions.push(eq(children.enrollmentStatus, status));
	} else {
		conditions.push(ne(children.enrollmentStatus, "withdrawn"));
	}

	if (ageGroup) {
		conditions.push(eq(children.ageGroup, ageGroup));
	}

	if (search) {
		const searchClause = or(
			ilike(children.firstName, `%${search}%`),
			ilike(children.lastName, `%${search}%`),
		);
		if (searchClause) conditions.push(searchClause);
	}

	// Staff filtering: only see children in their assigned classrooms
	if (role === "staff") {
		// Find classrooms this staff member is assigned to
		if (!membershipId) throw new Response(null, { status: 500 });
		const staffRooms = await db
			.select({ classroomId: staffAssignments.classroomId })
			.from(staffAssignments)
			.where(
				and(
					eq(staffAssignments.membershipId, membershipId), // membershipId guaranteed by requireAuth when role is set
					eq(staffAssignments.centerId, centerId),
					lte(staffAssignments.effectiveDate, today),
					or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
				),
			);

		const roomIds = staffRooms.map((r) => r.classroomId);

		if (roomIds.length === 0) {
			return c.json({ children: [] });
		}

		// Find children assigned to those classrooms
		const childAssignments = await db
			.select({ childId: classroomAssignments.childId })
			.from(classroomAssignments)
			.where(
				and(
					eq(classroomAssignments.centerId, centerId),
					lte(classroomAssignments.effectiveDate, today),
					or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
					or(...roomIds.map((id) => eq(classroomAssignments.classroomId, id))),
				),
			);

		const childIds = childAssignments.map((a) => a.childId);

		if (childIds.length === 0) {
			return c.json({ children: [] });
		}

		const childIdClause = or(...childIds.map((id) => eq(children.id, id)));
		if (childIdClause) conditions.push(childIdClause);
	}

	// If classroomId filter provided, find children in that classroom
	if (classroomId) {
		const assignments = await db
			.select({ childId: classroomAssignments.childId })
			.from(classroomAssignments)
			.where(
				and(
					eq(classroomAssignments.classroomId, classroomId),
					eq(classroomAssignments.centerId, centerId),
					lte(classroomAssignments.effectiveDate, today),
					or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
				),
			);

		const assignedIds = assignments.map((a) => a.childId);

		if (assignedIds.length === 0) {
			return c.json({ children: [] });
		}

		const assignedIdClause = or(...assignedIds.map((id) => eq(children.id, id)));
		if (assignedIdClause) conditions.push(assignedIdClause);
	}

	const results = await db
		.select()
		.from(children)
		.where(and(...conditions))
		.limit(limit)
		.offset(offset);

	return c.json({ children: results });
});

// GET /:id — get child with guardians and current classroom
childrenRoutes.get("/:id", requireAuth, async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;
	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const tz = await getCenterTimezone(db, centerId);
	const today = toLocalDay(new Date(), tz);

	// Get child
	const [child] = await db
		.select()
		.from(children)
		.where(and(eq(children.id, id), eq(children.centerId, centerId)))
		.limit(1);

	if (!child) notFound("Child not found");

	if (!membershipId) throw new Response(null, { status: 500 });
	await assertStaffChildAccess(db, centerId, role, membershipId, id, today);

	// Get current classroom assignment
	const [currentAssignment] = await db
		.select({
			assignmentId: classroomAssignments.id,
			classroomId: classroomAssignments.classroomId,
			effectiveDate: classroomAssignments.effectiveDate,
			classroomName: classrooms.name,
			classroomAgeGroup: classrooms.ageGroup,
		})
		.from(classroomAssignments)
		.leftJoin(
			classrooms,
			and(eq(classroomAssignments.classroomId, classrooms.id), eq(classrooms.centerId, centerId)),
		)
		.where(
			and(
				eq(classroomAssignments.childId, id),
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		)
		.limit(1);

	// Get guardians — join is scoped by centerId to prevent cross-center data leakage
	const childGuardianRows = await db
		.select({
			guardianId: guardians.id,
			firstName: guardians.firstName,
			lastName: guardians.lastName,
			email: guardians.email,
			phone: guardians.phone,
			isPrimary: childGuardians.isPrimary,
			authorizedPickup: childGuardians.authorizedPickup,
			relationship: childGuardians.relationship,
		})
		.from(childGuardians)
		.leftJoin(
			guardians,
			and(eq(childGuardians.guardianId, guardians.id), eq(guardians.centerId, centerId)),
		)
		.where(and(eq(childGuardians.childId, id), eq(childGuardians.centerId, centerId)));

	const primaryGuardian = childGuardianRows.find((g) => g.isPrimary);
	const primaryGuardianName = primaryGuardian
		? `${primaryGuardian.firstName} ${primaryGuardian.lastName}`
		: null;

	return c.json({
		child,
		currentClassroom: currentAssignment
			? {
					id: currentAssignment.classroomId,
					name: currentAssignment.classroomName,
					ageGroup: currentAssignment.classroomAgeGroup,
					assignmentId: currentAssignment.assignmentId,
					effectiveDate: currentAssignment.effectiveDate,
				}
			: null,
		guardians: childGuardianRows.map((g) => ({
			id: g.guardianId,
			firstName: g.firstName,
			lastName: g.lastName,
			email: g.email,
			phone: g.phone,
			isPrimary: g.isPrimary,
			authorizedPickup: g.authorizedPickup,
			relationship: g.relationship,
		})),
		primaryGuardianName,
	});
});

// POST / — create child
childrenRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createChildSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");

		const child = await db.transaction(async (tx) => {
			await tx.execute(sql`select 1 from ${centers} where ${centers.id} = ${centerId} for update`);
			return createChild(tx, centerId, data);
		});

		return c.json({ child }, 201);
	},
);

// PATCH /:id — update child
childrenRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateChildSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const parseResult = idSchema.safeParse(c.req.param("id"));
		if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const id = parseResult.data;
		const db = c.get("db");
		const data = c.req.valid("json");
		const membershipId = c.get("membershipId");

		const updateData: Partial<typeof children.$inferInsert> = {};
		if (data.firstName !== undefined) updateData.firstName = data.firstName;
		if (data.lastName !== undefined) updateData.lastName = data.lastName;
		if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth;
		if (data.ageGroup !== undefined) updateData.ageGroup = data.ageGroup;
		if (data.enrollmentStatus !== undefined) updateData.enrollmentStatus = data.enrollmentStatus;
		if (data.enrollmentStatus === "withdrawn") updateData.withdrawnAt = new Date();
		if (data.subsidyEligible !== undefined) updateData.subsidyEligible = data.subsidyEligible;
		if (data.allergies !== undefined) updateData.allergies = data.allergies;
		if (data.immunizations !== undefined) updateData.immunizations = data.immunizations;
		if (data.notes !== undefined) updateData.notes = data.notes;

		let updated: typeof children.$inferSelect | undefined;
		if (data.enrollmentStatus === "active") {
			updated = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select 1 from ${centers} where ${centers.id} = ${centerId} for update`,
				);

				const [existing] = await tx
					.select({ enrollmentStatus: children.enrollmentStatus })
					.from(children)
					.where(and(eq(children.id, id), eq(children.centerId, centerId)))
					.limit(1);

				if (!existing) notFound("Child not found");

				await assertCanAddActiveChildren(
					tx,
					centerId,
					existing.enrollmentStatus === "active" ? 0 : 1,
				);

				if (existing.enrollmentStatus !== "active") {
					updateData.withdrawnAt = null;
					updateData.enrolledAt = new Date();
				}

				const [row] = await tx
					.update(children)
					.set(updateData)
					.where(and(eq(children.id, id), eq(children.centerId, centerId)))
					.returning();

				return row;
			});
		} else {
			const [row] = await db
				.update(children)
				.set(updateData)
				.where(and(eq(children.id, id), eq(children.centerId, centerId)))
				.returning();
			updated = row;
		}

		if (!updated) notFound("Child not found");

		const shouldClearLiveState =
			data.enrollmentStatus !== undefined && data.enrollmentStatus !== "active";
		if (shouldClearLiveState) {
			if (!membershipId) forbidden("No center membership found");
			await closeOpenChildCheckIns(db, centerId, id, membershipId);
			const tz = await getCenterTimezone(db, centerId);
			const today = toLocalDay(new Date(), tz);
			await endActiveClassroomAssignments(db, centerId, id, today);
		}

		return c.json({ child: updated });
	},
);

// POST /:id/withdraw — withdraw child
childrenRoutes.post("/:id/withdraw", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");
	const membershipId = c.get("membershipId");
	if (!membershipId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;
	const db = c.get("db");

	const [updated] = await db
		.update(children)
		.set({
			enrollmentStatus: "withdrawn",
			withdrawnAt: new Date(),
		})
		.where(and(eq(children.id, id), eq(children.centerId, centerId)))
		.returning();

	if (!updated) notFound("Child not found");

	await closeOpenChildCheckIns(db, centerId, id, membershipId);
	const tz = await getCenterTimezone(db, centerId);
	const today = toLocalDay(new Date(), tz);
	await endActiveClassroomAssignments(db, centerId, id, today);

	return c.json({ child: updated });
});

// POST /:id/reactivate — reactivate child
childrenRoutes.post("/:id/reactivate", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;
	const db = c.get("db");

	const updated = await db.transaction(async (tx) => {
		await tx.execute(sql`select 1 from ${centers} where ${centers.id} = ${centerId} for update`);

		const [existing] = await tx
			.select({ enrollmentStatus: children.enrollmentStatus })
			.from(children)
			.where(and(eq(children.id, id), eq(children.centerId, centerId)))
			.limit(1);

		if (!existing) notFound("Child not found");

		await assertCanAddActiveChildren(tx, centerId, existing.enrollmentStatus === "active" ? 0 : 1);

		const [row] = await tx
			.update(children)
			.set({
				enrollmentStatus: "active",
				withdrawnAt: null,
				enrolledAt: new Date(),
			})
			.where(and(eq(children.id, id), eq(children.centerId, centerId)))
			.returning();

		return row;
	});

	if (!updated) notFound("Child not found");

	return c.json({ child: updated });
});

// GET /:id/guardians — list guardians for child
childrenRoutes.get("/:id/guardians", requireAuth, async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;
	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const tz = await getCenterTimezone(db, centerId);
	const today = toLocalDay(new Date(), tz);

	// Verify child belongs to center
	const [child] = await db
		.select({ id: children.id })
		.from(children)
		.where(and(eq(children.id, id), eq(children.centerId, centerId)))
		.limit(1);

	if (!child) notFound("Child not found");

	if (!membershipId) throw new Response(null, { status: 500 });
	await assertStaffChildAccess(db, centerId, role, membershipId, id, today);

	// Guardian join is scoped by centerId to prevent cross-center data leakage
	const results = await db
		.select({
			guardianId: guardians.id,
			firstName: guardians.firstName,
			lastName: guardians.lastName,
			email: guardians.email,
			phone: guardians.phone,
			isPrimary: childGuardians.isPrimary,
			authorizedPickup: childGuardians.authorizedPickup,
			relationship: childGuardians.relationship,
		})
		.from(childGuardians)
		.leftJoin(
			guardians,
			and(eq(childGuardians.guardianId, guardians.id), eq(guardians.centerId, centerId)),
		)
		.where(and(eq(childGuardians.childId, id), eq(childGuardians.centerId, centerId)));

	return c.json({ guardians: results });
});

// POST /:id/guardians — link guardian to child
childrenRoutes.post(
	"/:id/guardians",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", linkGuardianSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const parseResult = idSchema.safeParse(c.req.param("id"));
		if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const childId = parseResult.data;
		const db = c.get("db");
		const data = c.req.valid("json");

		// Verify child belongs to center
		const [child] = await db
			.select({ id: children.id })
			.from(children)
			.where(and(eq(children.id, childId), eq(children.centerId, centerId)))
			.limit(1);

		if (!child) notFound("Child not found");

		// Verify guardian belongs to center
		const [guardian] = await db
			.select({ id: guardians.id })
			.from(guardians)
			.where(and(eq(guardians.id, data.guardianId), eq(guardians.centerId, centerId)))
			.limit(1);

		if (!guardian) notFound("Guardian not found");

		try {
			await linkGuardianToChild(db, centerId, childId, {
				guardianId: data.guardianId,
				isPrimary: data.isPrimary,
				authorizedPickup: data.authorizedPickup,
				relationship: data.relationship,
			});
		} catch (error) {
			if (error instanceof Error && error.message === DUPLICATE_GUARDIAN_LINK_MESSAGE) {
				throw new HTTPException(409, { message: "guardian_link_duplicate" });
			}
			throw error;
		}

		return c.json({ linked: true }, 201);
	},
);

// PATCH /:id/guardians/:guardianId — update guardian link
childrenRoutes.patch(
	"/:id/guardians/:guardianId",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateGuardianLinkSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const childParseResult = idSchema.safeParse(c.req.param("id"));
		if (!childParseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const childId = childParseResult.data;

		const guardianParseResult = idSchema.safeParse(c.req.param("guardianId"));
		if (!guardianParseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const guardianId = guardianParseResult.data;
		const db = c.get("db");
		const data = c.req.valid("json");

		const updateData: Partial<typeof childGuardians.$inferInsert> = {};
		if (data.isPrimary !== undefined) updateData.isPrimary = data.isPrimary;
		if (data.authorizedPickup !== undefined) updateData.authorizedPickup = data.authorizedPickup;
		if (data.relationship !== undefined) updateData.relationship = data.relationship;

		// Verify child belongs to center
		const [child] = await db
			.select({ id: children.id })
			.from(children)
			.where(and(eq(children.id, childId), eq(children.centerId, centerId)))
			.limit(1);

		if (!child) notFound("Child not found");

		let updated: typeof childGuardians.$inferSelect | undefined;
		if (data.isPrimary === true) {
			await db
				.update(childGuardians)
				.set({ isPrimary: false })
				.where(
					and(
						eq(childGuardians.centerId, centerId),
						eq(childGuardians.childId, childId),
						ne(childGuardians.guardianId, guardianId),
					),
				);

			[updated] = await db
				.update(childGuardians)
				.set({ ...updateData, isPrimary: true })
				.where(
					and(
						eq(childGuardians.centerId, centerId),
						eq(childGuardians.childId, childId),
						eq(childGuardians.guardianId, guardianId),
					),
				)
				.returning();
		} else {
			[updated] = await db
				.update(childGuardians)
				.set(updateData)
				.where(
					and(
						eq(childGuardians.centerId, centerId),
						eq(childGuardians.childId, childId),
						eq(childGuardians.guardianId, guardianId),
					),
				)
				.returning();
		}

		if (!updated) notFound("Guardian link not found");

		return c.json({ link: updated });
	},
);

// DELETE /:id/guardians/:guardianId — unlink guardian from child
childrenRoutes.delete(
	"/:id/guardians/:guardianId",
	requireAuth,
	requireRole("owner", "director"),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const childParseResult = idSchema.safeParse(c.req.param("id"));
		if (!childParseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const childId = childParseResult.data;

		const guardianParseResult = idSchema.safeParse(c.req.param("guardianId"));
		if (!guardianParseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const guardianId = guardianParseResult.data;
		const db = c.get("db");

		// Verify child belongs to center
		const [child] = await db
			.select({ id: children.id })
			.from(children)
			.where(and(eq(children.id, childId), eq(children.centerId, centerId)))
			.limit(1);

		if (!child) notFound("Child not found");

		const [existingLink] = await db
			.select({ childId: childGuardians.childId, guardianId: childGuardians.guardianId })
			.from(childGuardians)
			.where(
				and(
					eq(childGuardians.centerId, centerId),
					eq(childGuardians.childId, childId),
					eq(childGuardians.guardianId, guardianId),
				),
			)
			.limit(1);

		if (!existingLink) notFound("Guardian link not found");

		const [remainingGuardian] = await db
			.select({ guardianId: childGuardians.guardianId })
			.from(childGuardians)
			.where(
				and(
					eq(childGuardians.centerId, centerId),
					eq(childGuardians.childId, childId),
					ne(childGuardians.guardianId, guardianId),
				),
			)
			.limit(1);

		if (!remainingGuardian) {
			throw new HTTPException(409, { message: "child_requires_guardian" });
		}

		const [deleted] = await db
			.delete(childGuardians)
			.where(
				and(
					eq(childGuardians.centerId, centerId),
					eq(childGuardians.childId, childId),
					eq(childGuardians.guardianId, guardianId),
				),
			)
			.returning();

		if (!deleted) notFound("Guardian link not found");

		return c.json({ unlinked: true });
	},
);

export { childrenRoutes };
