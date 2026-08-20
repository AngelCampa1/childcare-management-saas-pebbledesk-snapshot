import {
	centers,
	checkIns,
	classrooms,
	type Database,
	ratioSnapshots,
	ratioViolations,
	staffCheckIns,
} from "@pebbledesk/db";
import { type AgeGroup, resolveEffectiveRatioRule } from "@pebbledesk/shared";
import { and, count, eq, isNull } from "drizzle-orm";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface RatioResult {
	childrenCount: number;
	staffCount: number;
	ratioRequired: number;
	ratioActual: number;
	inCompliance: boolean;
}

export async function evaluateRoomRatio(
	classroomId: string,
	centerId: string,
	tx: Transaction,
): Promise<RatioResult> {
	// 1. Count children currently checked in
	const childRows = await tx
		.select({ count: count() })
		.from(checkIns)
		.where(
			and(
				eq(checkIns.classroomId, classroomId),
				eq(checkIns.centerId, centerId),
				isNull(checkIns.checkedOutAt),
			),
		);
	const childrenCount = childRows[0]?.count ?? 0;

	// 2. Count staff currently clocked in
	const staffRows = await tx
		.select({ count: count() })
		.from(staffCheckIns)
		.where(
			and(
				eq(staffCheckIns.classroomId, classroomId),
				eq(staffCheckIns.centerId, centerId),
				isNull(staffCheckIns.clockedOutAt),
			),
		);
	const staffCount = staffRows[0]?.count ?? 0;

	// 3. Read classroom ratio config
	const classroomRows = await tx
		.select()
		.from(classrooms)
		.where(and(eq(classrooms.id, classroomId), eq(classrooms.centerId, centerId)));
	const classroom = (
		classroomRows as {
			ageGroup: AgeGroup;
			minRatioStaff: number;
			minRatioChildren: number;
		}[]
	)[0];
	if (!classroom) {
		throw new Error("Classroom not found");
	}
	const centerRows = await tx
		.select({ state: centers.state })
		.from(centers)
		.where(eq(centers.id, centerId));
	const centerState = (centerRows as { state?: string | null }[])[0]?.state ?? "";
	const { ratioRequired } = resolveEffectiveRatioRule({
		centerState,
		ageGroup: classroom.ageGroup,
		minRatioStaff: classroom.minRatioStaff,
		minRatioChildren: classroom.minRatioChildren,
	});

	// 4. Empty room — resolve any open violation and return compliant, no snapshot
	if (childrenCount === 0 && staffCount === 0) {
		const openViolationRows = await tx
			.select()
			.from(ratioViolations)
			.where(
				and(
					eq(ratioViolations.classroomId, classroomId),
					eq(ratioViolations.centerId, centerId),
					isNull(ratioViolations.resolvedAt),
				),
			);
		const openViolation = (openViolationRows as { id: string }[])[0] ?? null;
		if (openViolation) {
			await tx
				.update(ratioViolations)
				.set({ resolvedAt: new Date() })
				.where(
					and(
						eq(ratioViolations.id, openViolation.id),
						eq(ratioViolations.centerId, centerId),
						eq(ratioViolations.classroomId, classroomId),
					),
				);
		}
		return {
			childrenCount: 0,
			staffCount: 0,
			ratioRequired,
			ratioActual: Number.POSITIVE_INFINITY,
			inCompliance: true,
		};
	}

	// 5. Compute actual ratio
	const ratioActual = childrenCount === 0 ? Number.POSITIVE_INFINITY : staffCount / childrenCount;

	// 6. Determine compliance
	const inCompliance = childrenCount === 0 || ratioActual >= ratioRequired;

	// 7. Insert snapshot (store Infinity as 999)
	await tx.insert(ratioSnapshots).values({
		centerId,
		classroomId,
		staffCount,
		childrenCount,
		ratioRequired,
		ratioActual: ratioActual === Number.POSITIVE_INFINITY ? 999 : ratioActual,
		inCompliance,
	});

	// 8. Check for existing open violation
	const openViolationRows = await tx
		.select()
		.from(ratioViolations)
		.where(
			and(
				eq(ratioViolations.classroomId, classroomId),
				eq(ratioViolations.centerId, centerId),
				isNull(ratioViolations.resolvedAt),
			),
		);
	const openViolation = (openViolationRows as { id: string }[])[0] ?? null;

	if (!inCompliance && !openViolation) {
		// 8a. Out of compliance and no open violation — create one
		await tx.insert(ratioViolations).values({
			centerId,
			classroomId,
			staffCount,
			childrenCount,
			ratioRequired,
			ratioActual,
		});
	} else if (inCompliance && openViolation) {
		// 9. In compliance and open violation exists — resolve it
		await tx
			.update(ratioViolations)
			.set({ resolvedAt: new Date() })
			.where(
				and(
					eq(ratioViolations.id, openViolation.id),
					eq(ratioViolations.centerId, centerId),
					eq(ratioViolations.classroomId, classroomId),
				),
			);
	}

	return {
		childrenCount,
		staffCount,
		ratioRequired,
		ratioActual,
		inCompliance,
	};
}
