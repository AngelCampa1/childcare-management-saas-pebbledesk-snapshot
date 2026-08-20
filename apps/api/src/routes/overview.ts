import {
	centers,
	checkIns,
	children,
	classrooms,
	memberships,
	ratioViolations,
	staffCheckIns,
} from "@pebbledesk/db";
import {
	type AgeGroup,
	isServiceAllowedSubscriptionStatus,
	planHasFeature,
	resolveEffectiveRatioRule,
} from "@pebbledesk/shared";
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { unauthorized } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";

type RatioStatus = "ok" | "warning" | "violation" | "unknown";

interface CenterOverviewItem {
	centerId: string;
	centerName: string;
	role: string;
	activeChildCount: number;
	ratioStatus: RatioStatus;
	openViolationCount: number;
	unreadAlertCount: number;
}

const overviewRoutes = new Hono<AppEnv>();

// requireCenter is intentionally omitted — this endpoint aggregates across ALL of
// the user's accepted memberships and is used to recover when no single center
// is active in session.
overviewRoutes.get("/multi-center", requireAuth, async (c) => {
	const userId = c.get("userId");
	if (!userId) unauthorized();

	const db = c.get("db");

	// Fetch all accepted memberships for the user (across all centers)
	const membershipRows = await db
		.select({
			membershipId: memberships.id,
			centerId: memberships.centerId,
			centerName: centers.name,
			centerState: centers.state,
			subscriptionPlan: centers.subscriptionPlan,
			subscriptionStatus: centers.subscriptionStatus,
			role: memberships.role,
		})
		.from(memberships)
		.innerJoin(centers, eq(memberships.centerId, centers.id))
		.where(
			and(
				eq(memberships.userId, userId),
				isNotNull(memberships.acceptedAt),
				isNull(memberships.deactivatedAt),
			),
		)
		.orderBy(desc(memberships.acceptedAt));

	if (membershipRows.length === 0) {
		// Nothing to aggregate — also prevents inArray(..., []) which some drivers reject.
		return c.json({ centers: [] });
	}

	const enterpriseMembershipRows = membershipRows.filter(
		(membership) =>
			membership.subscriptionPlan !== null &&
			(!("subscriptionStatus" in membership) ||
				isServiceAllowedSubscriptionStatus(membership.subscriptionStatus)) &&
			planHasFeature(membership.subscriptionPlan, "multi_center"),
	);
	if (enterpriseMembershipRows.length === 0) {
		return c.json({ centers: [] });
	}

	const membershipCenterIds = enterpriseMembershipRows.map((m) => m.centerId);

	// Query 1 (grouped): active child counts per center
	const childCountRows = await db
		.select({ centerId: children.centerId, count: count() })
		.from(children)
		.where(
			and(inArray(children.centerId, membershipCenterIds), eq(children.enrollmentStatus, "active")),
		)
		.groupBy(children.centerId);

	// Query 2 (batched): all active classrooms for all centers (cap at 200 per center handled in JS)
	const allClassroomRows = await db
		.select({
			id: classrooms.id,
			centerId: classrooms.centerId,
			ageGroup: classrooms.ageGroup,
			minRatioStaff: classrooms.minRatioStaff,
			minRatioChildren: classrooms.minRatioChildren,
		})
		.from(classrooms)
		.where(and(inArray(classrooms.centerId, membershipCenterIds), isNull(classrooms.archivedAt)))
		.orderBy(classrooms.id)
		.limit(200 * membershipCenterIds.length);

	// Query 3 (grouped): open child check-ins by (centerId, classroomId)
	const childCheckInRows = await db
		.select({ centerId: checkIns.centerId, classroomId: checkIns.classroomId, count: count() })
		.from(checkIns)
		.where(and(inArray(checkIns.centerId, membershipCenterIds), isNull(checkIns.checkedOutAt)))
		.groupBy(checkIns.centerId, checkIns.classroomId);

	// Query 4 (grouped): open staff check-ins by (centerId, classroomId)
	const staffCheckInRows = await db
		.select({
			centerId: staffCheckIns.centerId,
			classroomId: staffCheckIns.classroomId,
			count: count(),
		})
		.from(staffCheckIns)
		.where(
			and(inArray(staffCheckIns.centerId, membershipCenterIds), isNull(staffCheckIns.clockedOutAt)),
		)
		.groupBy(staffCheckIns.centerId, staffCheckIns.classroomId);

	// Query 5 (grouped): open violation counts per center
	const violationCountRows = await db
		.select({ centerId: ratioViolations.centerId, count: count() })
		.from(ratioViolations)
		.where(
			and(
				inArray(ratioViolations.centerId, membershipCenterIds),
				isNull(ratioViolations.resolvedAt),
			),
		)
		.groupBy(ratioViolations.centerId);

	// Build lookup maps for O(1) access during JS composition
	const childCountMap = new Map<string, number>(childCountRows.map((r) => [r.centerId, r.count]));

	const classroomsByCenterId = new Map<
		string,
		Array<{
			id: string;
			ageGroup: AgeGroup;
			minRatioStaff: number;
			minRatioChildren: number;
		}>
	>();
	for (const room of allClassroomRows) {
		const existing = classroomsByCenterId.get(room.centerId) ?? [];
		// Cap at 200 per center
		if (existing.length < 200) {
			existing.push({
				id: room.id,
				ageGroup: room.ageGroup,
				minRatioStaff: room.minRatioStaff,
				minRatioChildren: room.minRatioChildren,
			});
		}
		classroomsByCenterId.set(room.centerId, existing);
	}

	// childCheckIn lookup: `${centerId}:${classroomId}` → count
	const childCheckInMap = new Map<string, number>(
		childCheckInRows.map((r) => [`${r.centerId}:${r.classroomId}`, r.count]),
	);

	// staffCheckIn lookup: `${centerId}:${classroomId}` → count
	const staffCheckInMap = new Map<string, number>(
		staffCheckInRows.map((r) => [`${r.centerId}:${r.classroomId}`, r.count]),
	);

	const violationCountMap = new Map<string, number>(
		violationCountRows.map((r) => [r.centerId, r.count]),
	);

	// Compose results in JS — same ratio logic as before
	const centerResults: CenterOverviewItem[] = enterpriseMembershipRows.map((membership) => {
		const cid = membership.centerId;
		const activeChildCount = childCountMap.get(cid) ?? 0;
		const activeClassrooms = classroomsByCenterId.get(cid) ?? [];

		// Start with "unknown" — only becomes "ok" if there are rooms to evaluate
		let ratioStatus: RatioStatus = activeClassrooms.length > 0 ? "ok" : "unknown";

		// Note: evaluateRoomRatio from services/ratio.ts is intentionally not used here.
		// That function writes ratioSnapshot records to the DB and requires a transaction
		// context — inappropriate for this read-only aggregation endpoint.
		for (const classroom of activeClassrooms) {
			const childrenCount = childCheckInMap.get(`${cid}:${classroom.id}`) ?? 0;
			const staffCount = staffCheckInMap.get(`${cid}:${classroom.id}`) ?? 0;

			if (childrenCount === 0) {
				// Empty room — no impact on ratio status
				continue;
			}

			const { ratioRequired } = resolveEffectiveRatioRule({
				centerState: membership.centerState ?? "",
				ageGroup: classroom.ageGroup,
				minRatioStaff: classroom.minRatioStaff,
				minRatioChildren: classroom.minRatioChildren,
			});
			const ratioActual = staffCount / childrenCount;
			const inCompliance = ratioActual >= ratioRequired;

			if (!inCompliance) {
				ratioStatus = "violation";
				break;
			}

			// nearLimit: adding one more child would breach ratio
			// (inCompliance is true here, so ratioStatus is not "violation")
			const hypotheticalRatio = staffCount / (childrenCount + 1);
			if (hypotheticalRatio < ratioRequired && ratioStatus === "ok") {
				ratioStatus = "warning";
			}
		}

		const openViolationCount = violationCountMap.get(cid) ?? 0;

		return {
			centerId: cid,
			centerName: membership.centerName,
			role: membership.role,
			activeChildCount,
			ratioStatus,
			openViolationCount,
			// Proxies open violations as alert count until a dedicated alerts table lands.
			unreadAlertCount: openViolationCount,
		};
	});

	return c.json({ centers: centerResults });
});

export { overviewRoutes };
