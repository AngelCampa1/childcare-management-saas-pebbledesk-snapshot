import type { Database } from "@pebbledesk/db";
import { children, classroomAssignments, classrooms, guardians } from "@pebbledesk/db";
import type { CreateChildInput, EnrollChildInput } from "@pebbledesk/shared";
import { and, eq } from "drizzle-orm";
import { badRequest, notFound } from "../lib/errors.js";
import { assertCanAddActiveChildren } from "../lib/plan-limits.js";
import { createGuardian, linkGuardianToChild } from "./guardians.js";

type Child = typeof children.$inferSelect;
type ClassroomAssignment = typeof classroomAssignments.$inferSelect;

type EnrollResult = {
	child: Child;
	guardians: Array<{ guardianId: string; isPrimary: boolean }>;
	classroomAssignment: ClassroomAssignment | null;
};

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function createChild(
	db: Database | Tx,
	centerId: string,
	input: CreateChildInput,
): Promise<Child> {
	await assertCanAddActiveChildren(db, centerId, input.enrollmentStatus === "active" ? 1 : 0);

	const [child] = await db
		.insert(children)
		.values({
			centerId,
			firstName: input.firstName,
			lastName: input.lastName,
			dateOfBirth: input.dateOfBirth,
			ageGroup: input.ageGroup,
			enrollmentStatus: input.enrollmentStatus,
			subsidyEligible: input.subsidyEligible,
			allergies: input.allergies,
			immunizations: input.immunizations,
			notes: input.notes,
			enrolledAt: new Date(),
		})
		.returning();

	if (!child) {
		throw new Error("Failed to create child");
	}

	return child;
}

async function runEnroll(tx: Tx, centerId: string, input: EnrollChildInput): Promise<EnrollResult> {
	await assertCanAddActiveChildren(tx, centerId, input.child.enrollmentStatus === "active" ? 1 : 0);

	// 1. Insert child
	const [child] = await tx
		.insert(children)
		.values({
			centerId,
			firstName: input.child.firstName,
			lastName: input.child.lastName,
			dateOfBirth: input.child.dateOfBirth,
			ageGroup: input.child.ageGroup,
			enrollmentStatus: input.child.enrollmentStatus,
			subsidyEligible: input.child.subsidyEligible,
			enrolledAt: new Date(),
		})
		.returning();

	if (!child) {
		throw new Error("Failed to create child");
	}

	// 2. Process guardians
	const guardianResults: Array<{ guardianId: string; isPrimary: boolean }> = [];
	for (const g of input.guardians) {
		let guardianId: string;

		if (g.type === "new") {
			const newGuardian = await createGuardian(tx, centerId, {
				firstName: g.firstName,
				lastName: g.lastName,
				email: g.email,
				phone: g.phone,
			});
			guardianId = newGuardian.id;
		} else {
			const [existing] = await tx
				.select({ id: guardians.id })
				.from(guardians)
				.where(and(eq(guardians.id, g.guardianId), eq(guardians.centerId, centerId)))
				.limit(1);

			if (!existing) notFound("Guardian not found in center");
			guardianId = existing.id;
		}

		await linkGuardianToChild(tx, centerId, child.id, {
			guardianId,
			isPrimary: g.isPrimary,
			authorizedPickup: g.authorizedPickup,
			relationship: g.relationship,
		});

		guardianResults.push({ guardianId, isPrimary: g.isPrimary });
	}

	// 3. Optional classroom assignment
	let classroomAssignment: ClassroomAssignment | null = null;
	if (input.classroom) {
		const [room] = await tx
			.select({ id: classrooms.id, archivedAt: classrooms.archivedAt })
			.from(classrooms)
			.where(and(eq(classrooms.id, input.classroom.classroomId), eq(classrooms.centerId, centerId)))
			.limit(1);

		if (!room) badRequest("Classroom not found in this center");
		if (room.archivedAt) {
			badRequest("Classroom is no longer available for enrollment");
		}

		const [assignment] = await tx
			.insert(classroomAssignments)
			.values({
				centerId,
				childId: child.id,
				classroomId: room.id,
				effectiveDate: input.classroom.effectiveDate,
			})
			.returning();

		if (!assignment) {
			throw new Error("Failed to create classroom assignment");
		}

		classroomAssignment = assignment;
	}

	return { child, guardians: guardianResults, classroomAssignment };
}

export async function enrollChild(
	db: Database,
	centerId: string,
	input: EnrollChildInput,
	tx?: Tx,
): Promise<EnrollResult> {
	if (tx) {
		return runEnroll(tx, centerId, input);
	}
	return db.transaction((newTx) => runEnroll(newTx, centerId, input));
}
