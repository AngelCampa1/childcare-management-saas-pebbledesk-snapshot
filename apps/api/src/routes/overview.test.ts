import type { AgeGroup } from "@pebbledesk/shared";
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp } from "../test/setup.js";

// Mock requireAuth and requirePlan so we control gating in tests
vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
	};
});

vi.mock("../middleware/plan.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	let shouldAllow = true;

	return {
		__setShouldAllow: (value: boolean) => {
			shouldAllow = value;
		},
		requirePlan: (..._plans: string[]) =>
			createMiddleware(async (_c, next) => {
				if (!shouldAllow) {
					throw new HTTPException(403, { message: "Subscription plan required" });
				}
				await next();
			}),
	};
});

const planModule = await import("../middleware/plan.js");
const setShouldAllow = (planModule as unknown as { __setShouldAllow: (v: boolean) => void })
	.__setShouldAllow;

const { overviewRoutes } = await import("./overview.js");

function mountOverview(app: Hono<AppEnv>) {
	app.route("/api/overview", overviewRoutes);
}

/**
 * Build a mock DB for the new grouped-query overview endpoint.
 *
 * Query order (after refactor):
 *   call 1 — memberships (with innerJoin + orderBy)
 *   call 2 — active child counts grouped by centerId (inArray + groupBy)
 *   call 3 — active classrooms per center (inArray, no groupBy — all rooms)
 *   call 4 — open child check-ins grouped by (centerId, classroomId)
 *   call 5 — open staff check-ins grouped by (centerId, classroomId)
 *   call 6 — open violation counts grouped by centerId
 *
 * The mock proxy handles arbitrary chain methods (groupBy, inArray, etc.)
 * because the setup.ts createMockChain Proxy returns itself for any call.
 */
function makeBatchedOverviewMockDb(opts: {
	membershipRows?: Array<{
		membershipId: string;
		centerId: string;
		centerName: string;
		centerState?: string;
		subscriptionPlan?: string | null;
		role: string;
	}>;
	childCountRows?: Array<{ centerId: string; count: number }>;
	classroomRows?: Array<{
		id: string;
		centerId: string;
		ageGroup?: AgeGroup;
		minRatioStaff: number;
		minRatioChildren: number;
	}>;
	childCheckInRows?: Array<{ centerId: string; classroomId: string; count: number }>;
	staffCheckInRows?: Array<{ centerId: string; classroomId: string; count: number }>;
	violationCountRows?: Array<{ centerId: string; count: number }>;
}) {
	const {
		membershipRows = [],
		childCountRows = [],
		classroomRows = [],
		childCheckInRows = [],
		staffCheckInRows = [],
		violationCountRows = [],
	} = opts;

	let callCount = 0;
	return createMockDb({
		select: vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				// Memberships query — needs innerJoin + orderBy
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockResolvedValue(
									membershipRows.map((membership) => ({
										subscriptionPlan: "enterprise",
										...membership,
									})),
								),
							}),
						}),
					}),
				};
			}
			if (callCount === 2) {
				// Active child counts — grouped, resolves directly from where/groupBy chain
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue(childCountRows),
						}),
					}),
				};
			}
			if (callCount === 3) {
				// Active classrooms — inArray + where + orderBy(id) for deterministic 200-cap
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(classroomRows),
							}),
						}),
					}),
				};
			}
			if (callCount === 4) {
				// Child check-ins grouped by (centerId, classroomId)
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue(childCheckInRows),
						}),
					}),
				};
			}
			if (callCount === 5) {
				// Staff check-ins grouped by (centerId, classroomId)
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue(staffCheckInRows),
						}),
					}),
				};
			}
			// call 6: violation counts grouped by centerId
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						groupBy: vi.fn().mockResolvedValue(violationCountRows),
					}),
				}),
			};
		}),
	});
}

function makeOverviewLimitMockDb() {
	const classroomLimit = vi.fn().mockResolvedValue([]);
	let callCount = 0;
	const db = createMockDb({
		select: vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockResolvedValue([
									{
										membershipId: "mem-1",
										centerId: "center-1",
										centerName: "Sunny Meadow",
										centerState: "TX",
										subscriptionPlan: "enterprise",
										role: "owner",
									},
									{
										membershipId: "mem-2",
										centerId: "center-2",
										centerName: "River School",
										centerState: "CA",
										subscriptionPlan: "enterprise",
										role: "director",
									},
								]),
							}),
						}),
					}),
				};
			}
			if (callCount === 2) {
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}
			if (callCount === 3) {
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: classroomLimit,
							}),
						}),
					}),
				};
			}
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						groupBy: vi.fn().mockResolvedValue([]),
					}),
				}),
			};
		}),
	});

	return { db, classroomLimit };
}

describe("GET /api/overview/multi-center", () => {
	it("bounds the batched classroom query before applying the per-center cap", async () => {
		const { db, classroomLimit } = makeOverviewLimitMockDb();
		const app = createTestApp(mountOverview, db);

		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		expect(classroomLimit).toHaveBeenCalledWith(400);
	});

	it("returns aggregated data for all memberships of an enterprise user (batched queries)", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Sunny Meadow",
					role: "owner",
				},
				{
					membershipId: "mem-2",
					centerId: "center-2",
					centerName: "Little Stars",
					role: "director",
				},
			],
			childCountRows: [
				{ centerId: "center-1", count: 5 },
				{ centerId: "center-2", count: 3 },
			],
			classroomRows: [
				{ id: "classroom-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 6 },
			],
			childCheckInRows: [],
			staffCheckInRows: [],
			violationCountRows: [],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			centers: Array<{
				centerId: string;
				centerName: string;
				role: string;
				activeChildCount: number;
				ratioStatus: string;
				openViolationCount: number;
				unreadAlertCount: number;
			}>;
		};
		expect(body.centers).toHaveLength(2);
		expect(body.centers[0]).toMatchObject({
			centerId: "center-1",
			centerName: "Sunny Meadow",
			role: "owner",
			activeChildCount: 5,
			ratioStatus: "ok",
			openViolationCount: 0,
			unreadAlertCount: 0,
		});
		expect(body.centers[1]).toMatchObject({
			centerId: "center-2",
			centerName: "Little Stars",
			role: "director",
			activeChildCount: 3,
			ratioStatus: "unknown",
			openViolationCount: 0,
			unreadAlertCount: 0,
		});
	});

	it("returns violation status when a classroom has out-of-ratio check-ins", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Sunny Meadow",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 4 }],
			classroomRows: [
				{ id: "classroom-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 4 },
			],
			childCheckInRows: [{ centerId: "center-1", classroomId: "classroom-1", count: 4 }],
			staffCheckInRows: [], // 0 staff — violation
			violationCountRows: [{ centerId: "center-1", count: 2 }],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			centers: Array<{ ratioStatus: string; openViolationCount: number }>;
		};
		expect(body.centers[0]?.ratioStatus).toBe("violation");
		expect(body.centers[0]?.openViolationCount).toBe(2);
	});

	it("sets unreadAlertCount equal to openViolationCount", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Sunny Meadow",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 4 }],
			classroomRows: [
				{ id: "classroom-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 4 },
			],
			childCheckInRows: [{ centerId: "center-1", classroomId: "classroom-1", count: 4 }],
			staffCheckInRows: [],
			violationCountRows: [{ centerId: "center-1", count: 3 }],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			centers: Array<{ openViolationCount: number; unreadAlertCount: number }>;
		};
		expect(body.centers[0]?.openViolationCount).toBe(3);
		expect(body.centers[0]?.unreadAlertCount).toBe(3);
	});

	it("returns unreadAlertCount of 1 when exactly one open ratio_violation exists", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Sunny Meadow",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 4 }],
			classroomRows: [
				{ id: "classroom-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 4 },
			],
			childCheckInRows: [{ centerId: "center-1", classroomId: "classroom-1", count: 4 }],
			staffCheckInRows: [],
			violationCountRows: [{ centerId: "center-1", count: 1 }],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			centers: Array<{ openViolationCount: number; unreadAlertCount: number }>;
		};
		expect(body.centers[0]?.openViolationCount).toBe(1);
		expect(body.centers[0]?.unreadAlertCount).toBe(1);
	});

	it("returns warning status when a classroom is near ratio limit", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Sunny Meadow",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 6 }],
			classroomRows: [
				{ id: "classroom-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 6 },
			],
			childCheckInRows: [{ centerId: "center-1", classroomId: "classroom-1", count: 6 }],
			staffCheckInRows: [{ centerId: "center-1", classroomId: "classroom-1", count: 1 }],
			violationCountRows: [],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			centers: Array<{ ratioStatus: string }>;
		};
		// 6 children / 1 staff = 1/6 ratio, adding 1 more child (7/1) breaches it
		expect(body.centers[0]?.ratioStatus).toBe("warning");
	});

	it("applies stricter state ratios when summarizing multi-center ratio status", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "California Center",
					centerState: "CA",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 4 }],
			classroomRows: [
				{
					id: "classroom-1",
					centerId: "center-1",
					ageGroup: "infant",
					minRatioStaff: 1,
					minRatioChildren: 5,
				},
			],
			childCheckInRows: [{ centerId: "center-1", classroomId: "classroom-1", count: 4 }],
			staffCheckInRows: [{ centerId: "center-1", classroomId: "classroom-1", count: 1 }],
			violationCountRows: [],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { centers: Array<{ ratioStatus: string }> };
		expect(body.centers[0]?.ratioStatus).toBe("violation");
	});

	it("returns empty centers array when user has no accepted memberships", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					innerJoin: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			}),
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { centers: unknown[] };
		expect(body.centers).toEqual([]);
	});

	it("does not require an active center plan before listing memberships", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					innerJoin: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			}),
		});

		setShouldAllow(false);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
	});

	it("does not return multi-center overview for non-enterprise centers", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Sunny Meadow",
					subscriptionPlan: "center_pro",
					role: "owner",
				},
			],
		});

		setShouldAllow(false);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { centers: unknown[] };
		expect(body.centers).toEqual([]);
	});

	it("returns 401 when userId is missing from context", async () => {
		const db = createMockDb();

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db, { userId: "" });
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(401);
	});

	it("returns ok status when all classrooms are empty (no children checked in)", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Sunny Meadow",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 2 }],
			classroomRows: [
				{ id: "classroom-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 4 },
			],
			childCheckInRows: [], // 0 children checked in — empty room
			staffCheckInRows: [],
			violationCountRows: [],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { centers: Array<{ ratioStatus: string }> };
		// Empty room → skipped → ratioStatus stays "ok" (there IS a classroom)
		expect(body.centers[0]?.ratioStatus).toBe("ok");
	});

	it("keeps warning status when a second classroom is also near limit", async () => {
		// This covers the ratioStatus === "ok" being false (already "warning")
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Multi Room",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 12 }],
			classroomRows: [
				{ id: "room-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 6 },
				{ id: "room-2", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 6 },
			],
			// Both rooms: 6 children exactly at limit → nearLimit = true for both
			childCheckInRows: [
				{ centerId: "center-1", classroomId: "room-1", count: 6 },
				{ centerId: "center-1", classroomId: "room-2", count: 6 },
			],
			staffCheckInRows: [
				{ centerId: "center-1", classroomId: "room-1", count: 1 },
				{ centerId: "center-1", classroomId: "room-2", count: 1 },
			],
			violationCountRows: [],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { centers: Array<{ ratioStatus: string }> };
		expect(body.centers[0]?.ratioStatus).toBe("warning");
	});

	it("returns ok status when a room is compliant and not near the limit", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Well Staffed",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 4 }],
			classroomRows: [
				{ id: "room-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 4 },
			],
			// 4 children, 2 staff → ratio 2/4 = 0.5, required 0.25; hypothetical 2/5 = 0.4 > 0.25 → not nearLimit
			childCheckInRows: [{ centerId: "center-1", classroomId: "room-1", count: 4 }],
			staffCheckInRows: [{ centerId: "center-1", classroomId: "room-1", count: 2 }],
			violationCountRows: [],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { centers: Array<{ ratioStatus: string }> };
		expect(body.centers[0]?.ratioStatus).toBe("ok");
	});

	it("handles missing count rows gracefully (returns 0 defaults)", async () => {
		// Covers the ?? 0 fallback when grouped queries return no rows for a center
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "Fallback Center",
					role: "owner",
				},
			],
			childCountRows: [], // no rows → activeChildCount = 0
			classroomRows: [
				{ id: "room-1", centerId: "center-1", minRatioStaff: 1, minRatioChildren: 4 },
			],
			childCheckInRows: [], // no children checked in
			staffCheckInRows: [],
			violationCountRows: [],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			centers: Array<{ activeChildCount: number; ratioStatus: string }>;
		};
		expect(body.centers[0]?.activeChildCount).toBe(0);
		// 0 children checked in → empty room → ratioStatus stays "ok" (has classrooms)
		expect(body.centers[0]?.ratioStatus).toBe("ok");
	});

	it("returns unknown status when a center has no classrooms at all", async () => {
		const db = makeBatchedOverviewMockDb({
			membershipRows: [
				{
					membershipId: "mem-1",
					centerId: "center-1",
					centerName: "New Center",
					role: "owner",
				},
			],
			childCountRows: [{ centerId: "center-1", count: 0 }],
			classroomRows: [], // no classrooms
			childCheckInRows: [],
			staffCheckInRows: [],
			violationCountRows: [],
		});

		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { centers: Array<{ ratioStatus: string }> };
		expect(body.centers[0]?.ratioStatus).toBe("unknown");
	});

	it("handles 2 centers with 3 classrooms each (M=2, N=3) and uses ≤6 total DB calls", async () => {
		let callCount = 0;
		const mockSelect = vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockResolvedValue([
									{
										membershipId: "m1",
										centerId: "c1",
										centerName: "Center One",
										subscriptionPlan: "enterprise",
										role: "owner",
									},
									{
										membershipId: "m2",
										centerId: "c2",
										centerName: "Center Two",
										subscriptionPlan: "enterprise",
										role: "director",
									},
								]),
							}),
						}),
					}),
				};
			}
			if (callCount === 2) {
				// child counts
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue([
								{ centerId: "c1", count: 9 },
								{ centerId: "c2", count: 7 },
							]),
						}),
					}),
				};
			}
			if (callCount === 3) {
				// classrooms — orderBy(id) for deterministic 200-cap
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{ id: "r1", centerId: "c1", minRatioStaff: 1, minRatioChildren: 4 },
									{ id: "r2", centerId: "c1", minRatioStaff: 1, minRatioChildren: 4 },
									{ id: "r3", centerId: "c1", minRatioStaff: 1, minRatioChildren: 4 },
									{ id: "r4", centerId: "c2", minRatioStaff: 1, minRatioChildren: 6 },
									{ id: "r5", centerId: "c2", minRatioStaff: 1, minRatioChildren: 6 },
									{ id: "r6", centerId: "c2", minRatioStaff: 1, minRatioChildren: 6 },
								]),
							}),
						}),
					}),
				};
			}
			if (callCount === 4) {
				// child check-ins
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue([
								{ centerId: "c1", classroomId: "r1", count: 3 },
								{ centerId: "c1", classroomId: "r2", count: 3 },
								{ centerId: "c1", classroomId: "r3", count: 3 },
								{ centerId: "c2", classroomId: "r4", count: 2 },
								{ centerId: "c2", classroomId: "r5", count: 2 },
								{ centerId: "c2", classroomId: "r6", count: 3 },
							]),
						}),
					}),
				};
			}
			if (callCount === 5) {
				// staff check-ins
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue([
								{ centerId: "c1", classroomId: "r1", count: 1 },
								{ centerId: "c1", classroomId: "r2", count: 1 },
								{ centerId: "c1", classroomId: "r3", count: 1 },
								{ centerId: "c2", classroomId: "r4", count: 1 },
								{ centerId: "c2", classroomId: "r5", count: 1 },
								{ centerId: "c2", classroomId: "r6", count: 1 },
							]),
						}),
					}),
				};
			}
			// violations
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						groupBy: vi.fn().mockResolvedValue([]),
					}),
				}),
			};
		});

		const db = createMockDb({ select: mockSelect });
		setShouldAllow(true);
		const app = createTestApp(mountOverview, db);
		const res = await app.request("/api/overview/multi-center");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			centers: Array<{
				centerId: string;
				centerName: string;
				role: string;
				activeChildCount: number;
				ratioStatus: string;
				openViolationCount: number;
				unreadAlertCount: number;
			}>;
		};

		expect(body.centers).toHaveLength(2);
		expect(body.centers[0]).toMatchObject({
			centerId: "c1",
			centerName: "Center One",
			role: "owner",
			activeChildCount: 9,
			openViolationCount: 0,
			unreadAlertCount: 0,
		});
		expect(body.centers[1]).toMatchObject({
			centerId: "c2",
			centerName: "Center Two",
			role: "director",
			activeChildCount: 7,
			openViolationCount: 0,
			unreadAlertCount: 0,
		});

		// Verify ≤6 total DB select calls (batched, not M×(3+2N))
		expect(callCount).toBeLessThanOrEqual(6);
	});
});
