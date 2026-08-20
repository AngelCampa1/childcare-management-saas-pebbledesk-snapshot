import { zValidator } from "@hono/zod-validator";
import {
	centers,
	checkIns,
	classrooms,
	ratioSnapshots,
	ratioViolations,
	staffCheckIns,
} from "@pebbledesk/db";
import {
	DEFAULT_CENTER_TIMEZONE,
	type RoomRatioStatus,
	resolveEffectiveRatioRule,
	snapshotQuerySchema,
	toUtcMidnightForLocalDate,
	violationNotesSchema,
	violationQuerySchema,
} from "@pebbledesk/shared";
import { and, count, eq, gte, isNull, lt, not, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

const ratiosRoutes = new Hono<AppEnv>();

ratiosRoutes.use("*", requireAuth, requireCenter);

/** Returns the next calendar date string (YYYY-MM-DD) after the given one. */
function nextLocalDate(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

async function listRatioSnapshots(c: Context<AppEnv>, query: z.infer<typeof snapshotQuerySchema>) {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const { classroomId, from, to } = query;

	const [centerRow] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	const tz = centerRow?.timezone ?? DEFAULT_CENTER_TIMEZONE;

	const conditions = [eq(ratioSnapshots.centerId, centerId)];

	if (classroomId) {
		conditions.push(eq(ratioSnapshots.classroomId, classroomId));
	}

	if (from) {
		conditions.push(gte(ratioSnapshots.snapshotAt, toUtcMidnightForLocalDate(from, tz)));
	}

	if (to) {
		conditions.push(
			lt(ratioSnapshots.snapshotAt, toUtcMidnightForLocalDate(nextLocalDate(to), tz)),
		);
	}

	const snapshots = await db
		.select()
		.from(ratioSnapshots)
		.where(and(...conditions))
		.limit(200);

	return c.json({ snapshots });
}

// GET / — live ratio status for all rooms
ratiosRoutes.get("/", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");

	// Fetch center to get state for state-mandated ratio enforcement
	const [center] = await db
		.select({ state: centers.state })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	const centerState = center?.state ?? "";

	// Get all active (non-archived) classrooms (capped at 200)
	const activeClassrooms = await db
		.select()
		.from(classrooms)
		.where(and(eq(classrooms.centerId, centerId), isNull(classrooms.archivedAt)))
		.limit(200);

	if (activeClassrooms.length === 0) {
		return c.json({ ratios: [] });
	}

	// Query 1 (grouped): open child check-ins by classroomId
	const childCheckInRows = await db
		.select({ classroomId: checkIns.classroomId, count: count() })
		.from(checkIns)
		.where(and(eq(checkIns.centerId, centerId), isNull(checkIns.checkedOutAt)))
		.groupBy(checkIns.classroomId);

	// Query 2 (grouped): open staff check-ins by classroomId
	const staffCheckInRows = await db
		.select({ classroomId: staffCheckIns.classroomId, count: count() })
		.from(staffCheckIns)
		.where(and(eq(staffCheckIns.centerId, centerId), isNull(staffCheckIns.clockedOutAt)))
		.groupBy(staffCheckIns.classroomId);

	// Query 3 (grouped): open violations by classroomId — MIN(id::text) picks a stable representative
	// UUID does not have a built-in aggregate min() in Postgres, so cast to text first.
	const violationGroupRows = await db
		.select({
			classroomId: ratioViolations.classroomId,
			violationId: sql<string | null>`min(${ratioViolations.id}::text)`,
		})
		.from(ratioViolations)
		.where(and(eq(ratioViolations.centerId, centerId), isNull(ratioViolations.resolvedAt)))
		.groupBy(ratioViolations.classroomId);

	// Build lookup maps for O(1) access during JS composition
	const childCountMap = new Map<string, number>(
		childCheckInRows.map((r) => [r.classroomId, r.count]),
	);
	const staffCountMap = new Map<string, number>(
		staffCheckInRows.map((r) => [r.classroomId, r.count]),
	);
	const violationMap = new Map<string, string>(
		violationGroupRows
			.filter((r): r is typeof r & { violationId: string } => r.violationId !== null)
			.map((r) => [r.classroomId, r.violationId]),
	);

	const ratioStatuses: RoomRatioStatus[] = activeClassrooms.map((classroom) => {
		const currentChildCount = childCountMap.get(classroom.id) ?? 0;
		const currentStaffCount = staffCountMap.get(classroom.id) ?? 0;

		// Apply state-mandated ratio if stricter than classroom setting
		const effectiveRatio = resolveEffectiveRatioRule({
			centerState,
			ageGroup: classroom.ageGroup,
			minRatioStaff: classroom.minRatioStaff,
			minRatioChildren: classroom.minRatioChildren,
		});

		const ratioRequired = effectiveRatio.ratioRequired;
		const ratioActual =
			currentChildCount === 0 ? Number.POSITIVE_INFINITY : currentStaffCount / currentChildCount;
		const inCompliance = currentChildCount === 0 || ratioActual >= ratioRequired;

		const openViolationId = violationMap.get(classroom.id);

		// nearLimit: would 1 more child breach ratio?
		// hypotheticalChildCount is always >= 1 (currentChildCount + 1), so no need to guard for zero
		const hypotheticalChildCount = currentChildCount + 1;
		const hypotheticalRatio = currentStaffCount / hypotheticalChildCount;
		const nearLimit = currentChildCount > 0 && inCompliance && hypotheticalRatio < ratioRequired;

		return {
			classroomId: classroom.id,
			classroomName: classroom.name,
			ageGroup: classroom.ageGroup,
			maxCapacity: classroom.maxCapacity,
			minRatioStaff: classroom.minRatioStaff,
			minRatioChildren: effectiveRatio.minRatioChildren,
			currentChildCount,
			currentStaffCount,
			ratioRequired,
			ratioActual,
			inCompliance,
			nearLimit,
			openViolationId,
			ratioRuleSource: effectiveRatio.ratioRuleSource,
		};
	});

	return c.json({ ratios: ratioStatuses });
});

// GET /snapshots — historical ratio snapshots
ratiosRoutes.get(
	"/snapshots",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", snapshotQuerySchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const { classroomId, from, to } = c.req.valid("query");

		const [centerRow] = await db
			.select({ timezone: centers.timezone })
			.from(centers)
			.where(eq(centers.id, centerId))
			.limit(1);
		const tz = centerRow?.timezone ?? DEFAULT_CENTER_TIMEZONE;

		const conditions = [eq(ratioSnapshots.centerId, centerId)];

		if (classroomId) {
			conditions.push(eq(ratioSnapshots.classroomId, classroomId));
		}

		if (from) {
			conditions.push(gte(ratioSnapshots.snapshotAt, toUtcMidnightForLocalDate(from, tz)));
		}

		if (to) {
			conditions.push(
				lt(ratioSnapshots.snapshotAt, toUtcMidnightForLocalDate(nextLocalDate(to), tz)),
			);
		}

		const snapshots = await db
			.select()
			.from(ratioSnapshots)
			.where(and(...conditions))
			.limit(200);

		return c.json({ snapshots });
	},
);

// GET /violations — violation records
ratiosRoutes.get(
	"/history",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", snapshotQuerySchema),
	async (c) => listRatioSnapshots(c, c.req.valid("query")),
);

ratiosRoutes.get(
	"/violations",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", violationQuerySchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const { classroomId, status, from, to } = c.req.valid("query");

		const [centerRow] = await db
			.select({ timezone: centers.timezone })
			.from(centers)
			.where(eq(centers.id, centerId))
			.limit(1);
		const tz = centerRow?.timezone ?? DEFAULT_CENTER_TIMEZONE;

		const conditions = [eq(ratioViolations.centerId, centerId)];

		if (classroomId) {
			conditions.push(eq(ratioViolations.classroomId, classroomId));
		}

		if (status === "open") {
			conditions.push(isNull(ratioViolations.resolvedAt));
		} else if (status === "resolved") {
			conditions.push(not(isNull(ratioViolations.resolvedAt)));
		}

		if (from) {
			conditions.push(gte(ratioViolations.detectedAt, toUtcMidnightForLocalDate(from, tz)));
		}

		if (to) {
			conditions.push(
				lt(ratioViolations.detectedAt, toUtcMidnightForLocalDate(nextLocalDate(to), tz)),
			);
		}

		const violations = await db
			.select()
			.from(ratioViolations)
			.where(and(...conditions))
			.limit(200);

		return c.json({ violations });
	},
);

// PATCH /violations/:id — add resolution notes
ratiosRoutes.patch(
	"/violations/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", violationNotesSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const idValidation = idSchema.safeParse(c.req.param("id"));
		if (!idValidation.success) return c.json({ error: "Invalid ID format" }, 400);
		const id = idValidation.data;
		const db = c.get("db");
		const data = c.req.valid("json");

		const [updated] = await db
			.update(ratioViolations)
			.set({
				resolutionNotes: data.resolutionNotes,
			})
			.where(and(eq(ratioViolations.id, id), eq(ratioViolations.centerId, centerId)))
			.returning();

		if (!updated) notFound("Violation not found");

		return c.json({ violation: updated });
	},
);

export { ratiosRoutes };
