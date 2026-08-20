import { zValidator } from "@hono/zod-validator";
import {
	centers,
	childGuardians,
	children,
	classroomAssignments,
	classrooms,
	guardians,
	invoices,
	staffAssignments,
} from "@pebbledesk/db";
import type { GuardianDirectoryEntry } from "@pebbledesk/shared";
import {
	createGuardianSchema,
	DEFAULT_CENTER_TIMEZONE,
	toLocalDay,
	updateGuardianSchema,
} from "@pebbledesk/shared";
import { and, eq, gt, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { paginationSchema, resolvePagination } from "../lib/pagination.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";
import { createGuardian, DUPLICATE_GUARDIAN_EMAIL_MESSAGE } from "../services/guardians.js";

const guardiansRoutes = new Hono<AppEnv>();

guardiansRoutes.use("*", requireAuth, requireCenter);

async function assertStaffGuardianAccess(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	role: AppEnv["Variables"]["role"],
	membershipId: string,
	guardianId: string,
	today: string,
): Promise<string[] | null> {
	if (role !== "staff") return null;

	const staffRooms = await db
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

	const roomIds = staffRooms.map((room) => room.classroomId);
	if (roomIds.length === 0) {
		notFound("Guardian not found");
	}

	const linkedChildren = await db
		.select({ childId: childGuardians.childId })
		.from(childGuardians)
		.where(and(eq(childGuardians.centerId, centerId), eq(childGuardians.guardianId, guardianId)));

	const childIds = linkedChildren.map((child) => child.childId);
	if (childIds.length === 0) {
		notFound("Guardian not found");
	}

	const currentAssignments = await db
		.select({
			childId: classroomAssignments.childId,
			classroomId: classroomAssignments.classroomId,
		})
		.from(classroomAssignments)
		.where(
			and(
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
				or(...childIds.map((childId) => eq(classroomAssignments.childId, childId))),
			),
		);

	const accessibleChildIds = currentAssignments
		.filter((assignment) => roomIds.includes(assignment.classroomId))
		.map((assignment) => assignment.childId);

	if (accessibleChildIds.length === 0) {
		notFound("Guardian not found");
	}

	return [...new Set(accessibleChildIds)];
}

// GET / — list all guardians with optional search
guardiansRoutes.get(
	"/",
	requireRole("owner", "director"),
	zValidator("query", paginationSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const search = c.req.query("search");
		const { limit, offset } = resolvePagination(c.req.valid("query"));

		const conditions = [eq(guardians.centerId, centerId)];

		if (search) {
			const searchClause = or(
				ilike(guardians.firstName, `%${search}%`),
				ilike(guardians.lastName, `%${search}%`),
				ilike(guardians.email, `%${search}%`),
				ilike(guardians.phone, `%${search}%`),
			);
			if (searchClause) conditions.push(searchClause);
		}

		const results = await db
			.select()
			.from(guardians)
			.where(and(...conditions))
			.limit(limit)
			.offset(offset);

		const guardianIds = results.map((guardian) => guardian.id);
		if (guardianIds.length === 0) {
			return c.json({ guardians: [] });
		}

		const childRows = await db
			.select({
				guardianId: childGuardians.guardianId,
				id: children.id,
				firstName: children.firstName,
				lastName: children.lastName,
				authorizedPickup: childGuardians.authorizedPickup,
			})
			.from(childGuardians)
			.leftJoin(
				children,
				and(eq(childGuardians.childId, children.id), eq(children.centerId, centerId)),
			)
			.where(
				and(eq(childGuardians.centerId, centerId), inArray(childGuardians.guardianId, guardianIds)),
			);

		const childrenByGuardianId = new Map<string, GuardianDirectoryEntry["children"]>();
		for (const row of childRows) {
			if (!row.id || !row.firstName || !row.lastName) continue;

			const childSummary = {
				id: row.id,
				firstName: row.firstName,
				lastName: row.lastName,
				authorizedPickup: row.authorizedPickup,
			};
			const existing = childrenByGuardianId.get(row.guardianId);
			if (existing) {
				existing.push(childSummary);
			} else {
				childrenByGuardianId.set(row.guardianId, [childSummary]);
			}
		}

		const directoryGuardians = results.map((guardian) => ({
			...guardian,
			children: childrenByGuardianId.get(guardian.id) ?? [],
		}));

		return c.json({ guardians: directoryGuardians });
	},
);

// GET /:id — get guardian with linked children
guardiansRoutes.get("/:id", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;
	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const [centerRow] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	const tz = centerRow?.timezone ?? DEFAULT_CENTER_TIMEZONE;
	const today = toLocalDay(new Date(), tz);

	const [guardian] = await db
		.select()
		.from(guardians)
		.where(and(eq(guardians.id, id), eq(guardians.centerId, centerId)))
		.limit(1);

	if (!guardian) notFound("Guardian not found");

	if (!membershipId) throw new Response(null, { status: 500 });
	const accessibleChildIds = await assertStaffGuardianAccess(
		db,
		centerId,
		role,
		membershipId,
		id,
		today,
	);

	const linkedChildren = await db
		.select({
			id: children.id,
			firstName: children.firstName,
			lastName: children.lastName,
			enrollmentStatus: children.enrollmentStatus,
			classroomName: classrooms.name,
			isPrimary: childGuardians.isPrimary,
			authorizedPickup: childGuardians.authorizedPickup,
			relationship: childGuardians.relationship,
		})
		.from(childGuardians)
		.leftJoin(
			children,
			and(eq(childGuardians.childId, children.id), eq(children.centerId, centerId)),
		)
		.leftJoin(
			classroomAssignments,
			and(
				eq(children.id, classroomAssignments.childId),
				eq(classroomAssignments.centerId, centerId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		)
		.leftJoin(
			classrooms,
			and(eq(classroomAssignments.classroomId, classrooms.id), eq(classrooms.centerId, centerId)),
		)
		.where(
			and(
				eq(childGuardians.centerId, centerId),
				eq(childGuardians.guardianId, id),
				...(accessibleChildIds
					? [or(...accessibleChildIds.map((childId) => eq(childGuardians.childId, childId)))]
					: []),
			),
		);

	return c.json({ guardian, children: linkedChildren });
});

// POST / — create guardian
guardiansRoutes.post(
	"/",
	requireRole("owner", "director"),
	zValidator("json", createGuardianSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");

		let guardian: Awaited<ReturnType<typeof createGuardian>>;
		try {
			guardian = await createGuardian(db, centerId, data);
		} catch (error) {
			if (error instanceof Error && error.message === DUPLICATE_GUARDIAN_EMAIL_MESSAGE) {
				throw new HTTPException(409, { message: "guardian_duplicate" });
			}
			throw error;
		}

		return c.json({ guardian }, 201);
	},
);

// PATCH /:id — update guardian
guardiansRoutes.patch(
	"/:id",
	requireRole("owner", "director"),
	zValidator("json", updateGuardianSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const parseResult = idSchema.safeParse(c.req.param("id"));
		if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const id = parseResult.data;
		const db = c.get("db");
		const data = c.req.valid("json");

		// Only run the duplicate lookup for a real new email. A null/empty email means
		// "clear it", which can never collide — and would otherwise crash on .toLowerCase().
		if (data.email) {
			const emailNorm = data.email.toLowerCase().trim();
			const [duplicateGuardian] = await db
				.select({ id: guardians.id })
				.from(guardians)
				.where(
					and(
						eq(guardians.centerId, centerId),
						ne(guardians.id, id),
						sql`lower(trim(${guardians.email})) = ${emailNorm}`,
					),
				)
				.limit(1);

			if (duplicateGuardian) {
				throw new HTTPException(409, { message: "guardian_duplicate" });
			}
		}

		const updateData: Partial<typeof guardians.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (data.firstName !== undefined) updateData.firstName = data.firstName;
		if (data.lastName !== undefined) updateData.lastName = data.lastName;
		if (data.email !== undefined) updateData.email = data.email;
		if (data.phone !== undefined) updateData.phone = data.phone;

		const [updated] = await db
			.update(guardians)
			.set(updateData)
			.where(and(eq(guardians.id, id), eq(guardians.centerId, centerId)))
			.returning();

		if (!updated) notFound("Guardian not found");

		return c.json({ guardian: updated });
	},
);

// DELETE /:id — delete guardian and cascade child-guardian links
guardiansRoutes.delete("/:id", requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;
	const db = c.get("db");

	const [guardian] = await db
		.select({ id: guardians.id })
		.from(guardians)
		.where(and(eq(guardians.id, id), eq(guardians.centerId, centerId)))
		.limit(1);

	if (!guardian) notFound("Guardian not found");

	const [invoice] = await db
		.select({ id: invoices.id })
		.from(invoices)
		.where(and(eq(invoices.centerId, centerId), eq(invoices.guardianId, id)))
		.limit(1);

	if (invoice) {
		throw new HTTPException(409, { message: "guardian_has_invoices" });
	}

	const linkedChildren = await db
		.select({ childId: childGuardians.childId })
		.from(childGuardians)
		.where(and(eq(childGuardians.centerId, centerId), eq(childGuardians.guardianId, id)))
		.limit(1000);

	for (const linkedChild of linkedChildren) {
		const [remainingGuardian] = await db
			.select({ guardianId: childGuardians.guardianId })
			.from(childGuardians)
			.where(
				and(
					eq(childGuardians.centerId, centerId),
					eq(childGuardians.childId, linkedChild.childId),
					ne(childGuardians.guardianId, id),
				),
			)
			.limit(1);

		if (!remainingGuardian) {
			throw new HTTPException(409, { message: "child_requires_guardian" });
		}
	}

	await db.transaction(async (tx) => {
		await tx
			.delete(childGuardians)
			.where(and(eq(childGuardians.centerId, centerId), eq(childGuardians.guardianId, id)));
		await tx.delete(guardians).where(and(eq(guardians.id, id), eq(guardians.centerId, centerId)));
	});

	return c.json({ ok: true });
});

// GET /:id/children — list children linked to this guardian
guardiansRoutes.get("/:id/children", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;
	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const [centerRowChildren] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	const childrenHandlerTz = centerRowChildren?.timezone ?? DEFAULT_CENTER_TIMEZONE;
	const childrenHandlerToday = toLocalDay(new Date(), childrenHandlerTz);

	// Verify guardian belongs to center
	const [guardian] = await db
		.select({ id: guardians.id })
		.from(guardians)
		.where(and(eq(guardians.id, id), eq(guardians.centerId, centerId)))
		.limit(1);

	if (!guardian) notFound("Guardian not found");

	if (!membershipId) throw new Response(null, { status: 500 });
	const accessibleChildIds = await assertStaffGuardianAccess(
		db,
		centerId,
		role,
		membershipId,
		id,
		childrenHandlerToday,
	);

	const results = await db
		.select({
			childId: children.id,
			firstName: children.firstName,
			lastName: children.lastName,
			dateOfBirth: children.dateOfBirth,
			ageGroup: children.ageGroup,
			isPrimary: childGuardians.isPrimary,
			authorizedPickup: childGuardians.authorizedPickup,
			relationship: childGuardians.relationship,
		})
		.from(childGuardians)
		.leftJoin(
			children,
			and(eq(childGuardians.childId, children.id), eq(children.centerId, centerId)),
		)
		.where(
			and(
				eq(childGuardians.centerId, centerId),
				eq(childGuardians.guardianId, id),
				...(accessibleChildIds
					? [or(...accessibleChildIds.map((childId) => eq(childGuardians.childId, childId)))]
					: []),
			),
		);

	return c.json({ children: results });
});

export { guardiansRoutes };
