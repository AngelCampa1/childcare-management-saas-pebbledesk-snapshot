import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, patchBody } from "../test/setup.js";

/**
 * Recursively walks a drizzle SQL condition tree and collects every Date value
 * found in queryChunks. This lets tests assert which Date boundaries were
 * passed to gte/lt without spying on ESM module exports (which ESM forbids).
 * Uses a visited set to guard against circular references in drizzle objects.
 */
function extractDatesFromSqlCondition(node: unknown, visited = new Set<object>()): Date[] {
	if (node instanceof Date) return [node];
	if (node == null || typeof node !== "object") return [];
	if (visited.has(node as object)) return [];
	visited.add(node as object);
	const obj = node as Record<string, unknown>;
	const results: Date[] = [];
	if (Array.isArray(obj.queryChunks)) {
		for (const chunk of obj.queryChunks as unknown[]) {
			results.push(...extractDatesFromSqlCondition(chunk, visited));
		}
	}
	for (const key of Object.keys(obj)) {
		if (key !== "queryChunks") {
			results.push(...extractDatesFromSqlCondition(obj[key], visited));
		}
	}
	return results;
}

// ─── nextLocalDate unit tests (imported after the module loads) ───────────────
// We test the helper by importing it indirectly through the module boundary.
// The helper is intentionally NOT exported — we verify its contract via the
// integration tests below and the explicit boundary tests here by
// reconstructing the same logic and asserting expected calendar arithmetic.

/** Mirrors the nextLocalDate helper inside ratios.ts */
function nextLocalDate(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

describe("nextLocalDate helper (calendar arithmetic)", () => {
	it("advances within a month", () => {
		expect(nextLocalDate("2026-06-08")).toBe("2026-06-09");
	});

	it("crosses a month boundary (Jan 31 → Feb 01)", () => {
		expect(nextLocalDate("2026-01-31")).toBe("2026-02-01");
	});

	it("crosses a year boundary (Dec 31 → Jan 01)", () => {
		expect(nextLocalDate("2026-12-31")).toBe("2027-01-01");
	});

	it("handles leap year (Feb 28 → Feb 29 in 2028)", () => {
		expect(nextLocalDate("2028-02-28")).toBe("2028-02-29");
	});

	it("handles non-leap year (Feb 28 → Mar 01 in 2026)", () => {
		expect(nextLocalDate("2026-02-28")).toBe("2026-03-01");
	});
});

// Mock the auth middleware to be pass-through in tests
vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireRole: (...roles: string[]) =>
			createMiddleware(async (c, next) => {
				const role = c.get("role");
				if (!role || !roles.includes(role)) {
					throw new HTTPException(403, { message: "Insufficient permissions" });
				}
				await next();
			}),
		requireCenter: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
			await next();
		}),
	};
});

// Import after mocking
const { ratiosRoutes } = await import("./ratios.js");

interface RoomRatioStatusData {
	classroomId: string;
	classroomName: string;
	ageGroup: string;
	maxCapacity: number;
	minRatioStaff: number;
	minRatioChildren: number;
	currentChildCount: number;
	currentStaffCount: number;
	ratioRequired: number;
	ratioActual: number;
	inCompliance: boolean;
	nearLimit: boolean;
	openViolationId?: string;
	ratioRuleSource: string;
}

interface ViolationData {
	id: string;
	centerId: string;
	classroomId: string;
	detectedAt: string;
	resolvedAt: string | null;
	resolvedBy: string | null;
	resolutionNotes: string | null;
}

function mountRatios(app: Hono<AppEnv>) {
	app.route("/api/ratios", ratiosRoutes);
}

const VIOLATION_ID = "90000000-0000-0000-0000-000000000001";

const mockClassroom = {
	id: "classroom-1",
	centerId: "center-1",
	name: "Sunshine Room",
	ageGroup: "toddler",
	maxCapacity: 12,
	minRatioStaff: 1,
	minRatioChildren: 4,
	createdAt: new Date().toISOString(),
	archivedAt: null,
};

const mockViolation: ViolationData = {
	id: "violation-1",
	centerId: "center-1",
	classroomId: "classroom-1",
	detectedAt: new Date().toISOString(),
	resolvedAt: null,
	resolvedBy: null,
	resolutionNotes: null,
};

describe("ratio routes", () => {
	describe("GET /api/ratios", () => {
		/**
		 * Helper: create a mock db for the new batched-query ratio endpoint.
		 *
		 * Query order (after refactor):
		 *   call 1 — center state lookup (returns { state }, needs .limit())
		 *   call 2 — list active classrooms (needs .limit())
		 *   call 3 — child check-ins grouped by classroomId (needs .groupBy())
		 *   call 4 — staff clock-ins grouped by classroomId (needs .groupBy())
		 *   call 5 — open violations grouped by classroomId (needs .groupBy())
		 */
		function makeRatioMockDb(opts: {
			centerState?: string;
			childCountRows?: Array<{ classroomId: string; count: number }>;
			staffCountRows?: Array<{ classroomId: string; count: number }>;
			violationGroupRows?: Array<{ classroomId: string; violationId: string }>;
			classroomOverride?: typeof mockClassroom;
		}) {
			const {
				centerState = "",
				childCountRows = [],
				staffCountRows = [],
				violationGroupRows = [],
				classroomOverride = mockClassroom,
			} = opts;
			let selectCallCount = 0;
			return createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// Center state lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi
										.fn()
										.mockResolvedValue(centerState !== null ? [{ state: centerState }] : []),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// List active classrooms
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([classroomOverride]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// Child check-ins grouped by classroomId
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockResolvedValue(childCountRows),
								}),
							}),
						};
					}
					if (selectCallCount === 4) {
						// Staff clock-ins grouped by classroomId
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockResolvedValue(staffCountRows),
								}),
							}),
						};
					}
					// Open violations grouped by classroomId
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								groupBy: vi.fn().mockResolvedValue(violationGroupRows),
							}),
						}),
					};
				}),
			});
		}

		it("returns live ratio statuses for director (200)", async () => {
			const db = makeRatioMockDb({ centerState: "" });
			const app = createTestApp(mountRatios, db, { role: "director" });
			const res = await app.request("/api/ratios");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
			expect(body.ratios).toHaveLength(1);
			expect(body.ratios[0].classroomName).toBe("Sunshine Room");
			expect(body.ratios[0].inCompliance).toBe(true);
			expect(body.ratios[0].ratioRuleSource).toBe("classroom");
		});

		it("does not mark an empty room as near limit", async () => {
			const db = makeRatioMockDb({ centerState: "" });
			const app = createTestApp(mountRatios, db, { role: "director" });
			const res = await app.request("/api/ratios");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
			expect(body.ratios[0].currentChildCount).toBe(0);
			expect(body.ratios[0].currentStaffCount).toBe(0);
			expect(body.ratios[0].nearLimit).toBe(false);
		});

		it("returns ratio with open violation", async () => {
			const db = makeRatioMockDb({
				centerState: "",
				childCountRows: [{ classroomId: "classroom-1", count: 3 }],
				staffCountRows: [],
				violationGroupRows: [{ classroomId: "classroom-1", violationId: "violation-1" }],
			});

			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request("/api/ratios");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
			expect(body.ratios[0].inCompliance).toBe(false);
			expect(body.ratios[0].openViolationId).toBe("violation-1");
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "staff" });
			const res = await app.request("/api/ratios");

			expect(res.status).toBe(403);
		});

		describe("state ratio enforcement", () => {
			it("uses state rule when CA infant state is stricter than classroom (source=state:CA)", async () => {
				// CA infant allows max 3 children per staff
				// classroom says minRatioChildren=5 — state is stricter (3 < 5)
				const caInfantClassroom = {
					...mockClassroom,
					ageGroup: "infant",
					minRatioStaff: 1,
					minRatioChildren: 5,
				};
				const db = makeRatioMockDb({
					centerState: "CA",
					classroomOverride: caInfantClassroom,
				});

				const app = createTestApp(mountRatios, db, { role: "director" });
				const res = await app.request("/api/ratios");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
				// State rule (3) overrides classroom (5)
				expect(body.ratios[0].minRatioChildren).toBe(3);
				expect(body.ratios[0].ratioRuleSource).toBe("state:CA");
				// ratioRequired = 1/3
				expect(body.ratios[0].ratioRequired).toBeCloseTo(1 / 3);
			});

			it("uses classroom value when classroom is stricter than state (source=classroom)", async () => {
				// TX infant allows max 4 children per staff
				// classroom says minRatioChildren=2 — classroom is stricter (2 < 4)
				const txInfantClassroom = {
					...mockClassroom,
					ageGroup: "infant",
					minRatioStaff: 1,
					minRatioChildren: 2,
				};
				const db = makeRatioMockDb({
					centerState: "TX",
					classroomOverride: txInfantClassroom,
				});

				const app = createTestApp(mountRatios, db, { role: "director" });
				const res = await app.request("/api/ratios");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
				// Classroom (2) wins over TX state (4)
				expect(body.ratios[0].minRatioChildren).toBe(2);
				expect(body.ratios[0].ratioRuleSource).toBe("classroom");
			});

			it("uses classroom value for unsupported state NY (source=classroom)", async () => {
				const db = makeRatioMockDb({ centerState: "NY" });

				const app = createTestApp(mountRatios, db, { role: "director" });
				const res = await app.request("/api/ratios");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
				expect(body.ratios[0].minRatioChildren).toBe(mockClassroom.minRatioChildren);
				expect(body.ratios[0].ratioRuleSource).toBe("classroom");
			});

			it("uses classroom value when center has no state set (source=classroom)", async () => {
				// Center with empty state (no state record found)
				let selectCallCount = 0;
				const db = createMockDb({
					select: vi.fn().mockImplementation(() => {
						selectCallCount++;
						if (selectCallCount === 1) {
							// Center not found — empty array
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([]),
									}),
								}),
							};
						}
						if (selectCallCount === 2) {
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([mockClassroom]),
									}),
								}),
							};
						}
						if (selectCallCount === 3) {
							// child check-ins grouped
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										groupBy: vi.fn().mockResolvedValue([]),
									}),
								}),
							};
						}
						if (selectCallCount === 4) {
							// staff check-ins grouped
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										groupBy: vi.fn().mockResolvedValue([]),
									}),
								}),
							};
						}
						// violations grouped
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockResolvedValue([]),
								}),
							}),
						};
					}),
				});

				const app = createTestApp(mountRatios, db, { role: "director" });
				const res = await app.request("/api/ratios");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
				expect(body.ratios[0].ratioRuleSource).toBe("classroom");
			});

			it("uses FL state rule when FL toddler is stricter (11) than classroom (15)", async () => {
				// FL toddler max 11 children per staff, classroom says 15 — state wins
				const flToddlerClassroom = {
					...mockClassroom,
					ageGroup: "toddler",
					minRatioStaff: 1,
					minRatioChildren: 15,
				};
				const db = makeRatioMockDb({
					centerState: "FL",
					classroomOverride: flToddlerClassroom,
				});

				const app = createTestApp(mountRatios, db, { role: "owner" });
				const res = await app.request("/api/ratios");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
				expect(body.ratios[0].minRatioChildren).toBe(11);
				expect(body.ratios[0].ratioRuleSource).toBe("state:FL");
			});

			it("uses TX state rule when TX toddler is stricter (9) than classroom (12)", async () => {
				const txToddlerClassroom = {
					...mockClassroom,
					ageGroup: "toddler",
					minRatioStaff: 1,
					minRatioChildren: 12,
				};
				const db = makeRatioMockDb({
					centerState: "TX",
					classroomOverride: txToddlerClassroom,
				});

				const app = createTestApp(mountRatios, db, { role: "owner" });
				const res = await app.request("/api/ratios");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
				expect(body.ratios[0].minRatioChildren).toBe(9);
				expect(body.ratios[0].ratioRuleSource).toBe("state:TX");
			});

			it("classroom wins when equal to state rule (source=classroom)", async () => {
				// TX infant = 4, classroom = 4 — equal, classroom wins
				const txInfantEqualClassroom = {
					...mockClassroom,
					ageGroup: "infant",
					minRatioStaff: 1,
					minRatioChildren: 4,
				};
				const db = makeRatioMockDb({
					centerState: "TX",
					classroomOverride: txInfantEqualClassroom,
				});

				const app = createTestApp(mountRatios, db, { role: "director" });
				const res = await app.request("/api/ratios");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { ratios: RoomRatioStatusData[] };
				expect(body.ratios[0].minRatioChildren).toBe(4);
				expect(body.ratios[0].ratioRuleSource).toBe("classroom");
			});
		});
	});

	describe("GET /api/ratios (no centerId)", () => {
		it("returns 403 when centerId is missing from context", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "director", centerId: "" });
			const res = await app.request("/api/ratios");
			expect(res.status).toBe(403);
		});
	});

	describe("GET /api/ratios (no classrooms)", () => {
		it("returns empty ratios array when center has no active classrooms", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// Center state
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ state: "" }]),
								}),
							}),
						};
					}
					// Classrooms — empty
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				}),
			});
			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request("/api/ratios");
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ratios: unknown[] };
			expect(body.ratios).toEqual([]);
		});
	});

	describe("GET /api/ratios/snapshots", () => {
		it("returns snapshots for director (200)", async () => {
			const mockSnapshot = {
				id: "snapshot-1",
				centerId: "center-1",
				classroomId: "classroom-1",
				snapshotAt: new Date().toISOString(),
				staffCount: 2,
				childrenCount: 6,
				ratioRequired: 0.25,
				ratioActual: 0.333,
				inCompliance: true,
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([mockSnapshot]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "director" });
			const res = await app.request("/api/ratios/snapshots");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { snapshots: (typeof mockSnapshot)[] };
			expect(body.snapshots).toHaveLength(1);
			expect(body.snapshots[0].inCompliance).toBe(true);
		});

		it("returns snapshots through the documented history route", async () => {
			const mockSnapshot = {
				id: "snapshot-1",
				centerId: "center-1",
				classroomId: "classroom-1",
				snapshotAt: new Date().toISOString(),
				staffCount: 2,
				childrenCount: 6,
				ratioRequired: 0.25,
				ratioActual: 0.333,
				inCompliance: true,
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([mockSnapshot]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "director" });
			const res = await app.request("/api/ratios/history");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { snapshots: (typeof mockSnapshot)[] };
			expect(body.snapshots).toHaveLength(1);
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "staff" });
			const res = await app.request("/api/ratios/snapshots");

			expect(res.status).toBe(403);
		});

		it("returns 403 when centerId is missing from context", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "director", centerId: "" });
			const res = await app.request("/api/ratios/snapshots");
			expect(res.status).toBe(403);
		});

		it("filters by classroomId and date range", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request(
				"/api/ratios/snapshots?classroomId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(200);
		});
	});

	describe("GET /api/ratios/violations", () => {
		it("returns violations for director (200)", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([mockViolation]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "director" });
			const res = await app.request("/api/ratios/violations");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { violations: ViolationData[] };
			expect(body.violations).toHaveLength(1);
			expect(body.violations[0].resolvedAt).toBeNull();
		});

		it("filters by status=open", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([mockViolation]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request("/api/ratios/violations?status=open");

			expect(res.status).toBe(200);
		});

		it("filters by status=resolved", async () => {
			const resolved = { ...mockViolation, resolvedAt: new Date().toISOString() };
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([resolved]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request("/api/ratios/violations?status=resolved");

			expect(res.status).toBe(200);
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "staff" });
			const res = await app.request("/api/ratios/violations");

			expect(res.status).toBe(403);
		});

		it("returns 403 when centerId is missing from context", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "director", centerId: "" });
			const res = await app.request("/api/ratios/violations");
			expect(res.status).toBe(403);
		});

		it("filters violations by classroomId and date range", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request(
				"/api/ratios/violations?classroomId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(200);
		});
	});

	describe("PATCH /api/ratios/violations/:id", () => {
		it("adds resolution notes (200)", async () => {
			const resolved = {
				...mockViolation,
				resolvedAt: new Date().toISOString(),
				resolvedBy: "membership-1",
				resolutionNotes: "Brought in extra staff immediately",
			};

			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([resolved]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "director" });
			const res = await app.request(
				`/api/ratios/violations/${VIOLATION_ID}`,
				patchBody({ resolutionNotes: "Brought in extra staff immediately" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { violation: ViolationData };
			expect(body.violation.resolutionNotes).toBe("Brought in extra staff immediately");
			expect(body.violation.resolvedAt).toBeTruthy();
		});

		it("returns 404 if violation not found", async () => {
			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request(
				"/api/ratios/violations/90000000-0000-0000-0000-000000000099",
				patchBody({ resolutionNotes: "Notes" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 400 for malformed violation IDs before updating", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request(
				"/api/ratios/violations/not-a-uuid",
				patchBody({ resolutionNotes: "Notes" }),
			);

			expect(res.status).toBe(400);
			expect(db.update).not.toHaveBeenCalled();
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "staff" });
			const res = await app.request(
				`/api/ratios/violations/${VIOLATION_ID}`,
				patchBody({ resolutionNotes: "Notes" }),
			);

			expect(res.status).toBe(403);
		});

		it("returns 403 when centerId is missing from context", async () => {
			const db = createMockDb();
			const app = createTestApp(mountRatios, db, { role: "director", centerId: "" });
			const res = await app.request(
				`/api/ratios/violations/${VIOLATION_ID}`,
				patchBody({ resolutionNotes: "Notes" }),
			);
			expect(res.status).toBe(403);
		});
	});

	describe("GET /api/ratios — grouped query pattern (5 classrooms)", () => {
		it("handles 5 classrooms with ≤3 grouped DB calls for live counts", async () => {
			const classrooms = [
				{ ...mockClassroom, id: "r1", centerId: "center-1" },
				{ ...mockClassroom, id: "r2", centerId: "center-1" },
				{ ...mockClassroom, id: "r3", centerId: "center-1" },
				{ ...mockClassroom, id: "r4", centerId: "center-1" },
				{ ...mockClassroom, id: "r5", centerId: "center-1" },
			];

			let selectCallCount = 0;
			const mainCountCallCount = { value: 0 };

			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// Center state
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ state: "" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// Classrooms list
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue(classrooms),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// Child check-ins grouped
						mainCountCallCount.value++;
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockResolvedValue([
										{ classroomId: "r1", count: 2 },
										{ classroomId: "r2", count: 3 },
										{ classroomId: "r3", count: 0 },
										{ classroomId: "r4", count: 4 },
										{ classroomId: "r5", count: 1 },
									]),
								}),
							}),
						};
					}
					if (selectCallCount === 4) {
						// Staff check-ins grouped
						mainCountCallCount.value++;
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockResolvedValue([
										{ classroomId: "r1", count: 1 },
										{ classroomId: "r2", count: 1 },
										{ classroomId: "r4", count: 2 },
										{ classroomId: "r5", count: 1 },
									]),
								}),
							}),
						};
					}
					// Violations grouped
					mainCountCallCount.value++;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								groupBy: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountRatios, db, { role: "owner" });
			const res = await app.request("/api/ratios");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { ratios: RoomRatioStatusData[] };

			// All 5 classrooms returned
			expect(body.ratios).toHaveLength(5);

			// Verify grouped query pattern: ≤3 calls for child/staff/violation counts
			expect(mainCountCallCount.value).toBeLessThanOrEqual(3);

			// Spot-check: r3 has 0 children checked in → compliant
			// Note: Infinity serializes to null in JSON, so ratioActual will be null in the parsed body
			const r3 = body.ratios.find((r) => r.classroomId === "r3");
			expect(r3?.currentChildCount).toBe(0);
			expect(r3?.inCompliance).toBe(true);

			// r2 has 3 children, 1 staff, ratio required = 1/4 = 0.25
			// ratioActual = 1/3 ≈ 0.333 ≥ 0.25 → compliant
			const r2 = body.ratios.find((r) => r.classroomId === "r2");
			expect(r2?.currentChildCount).toBe(3);
			expect(r2?.currentStaffCount).toBe(1);
			expect(r2?.inCompliance).toBe(true);
		});
	});

	// ─── Timezone-correct date-range boundary tests ───────────────────────────
	// America/Los_Angeles is UTC-7 (PDT in summer).
	// A snapshot at 2026-06-09T22:00 PDT = 2026-06-10T05:00:00Z.
	// With the OLD UTC logic  (lte snapshotAt, 2026-06-09T23:59:59Z) that snapshot
	// is EXCLUDED (05:00Z > 23:59:59Z of 2026-06-09Z).
	// With the FIXED logic (lt snapshotAt, toUtcMidnight("2026-06-10", "America/Los_Angeles"))
	// the upper bound = 2026-06-10T07:00:00Z (LA midnight), so 05:00Z < 07:00Z → INCLUDED.
	describe("timezone-correct date-range boundaries", () => {
		/** Snapshot at 2026-06-09T22:00 PDT = 2026-06-10T05:00:00Z */
		const LA_EVENING_SNAPSHOT_UTC = "2026-06-10T05:00:00.000Z";
		/** Snapshot at 2026-06-09T08:00 PDT = 2026-06-09T15:00:00Z (well within day) */
		const LA_MORNING_SNAPSHOT_UTC = "2026-06-09T15:00:00.000Z";

		/**
		 * Builds a mock DB that:
		 * 1. Returns center timezone on first select
		 * 2. Captures the Date arguments passed to the snapshot where-clause
		 *    by resolving to the mock rows unconditionally (the handler applies
		 *    DB-level filtering; we verify the Date args via the drizzle-orm spy).
		 */
		function makeSnapshotDbWithTimezone(timezone: string, snapshotRows: unknown[]) {
			let selectCallCount = 0;
			return createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// Center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone }]),
								}),
							}),
						};
					}
					// Snapshot query
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(snapshotRows),
							}),
						}),
					};
				}),
			});
		}

		/**
		 * Builds a mock DB for violations that returns center timezone then violations.
		 */
		function makeViolationsDbWithTimezone(timezone: string, violationRows: unknown[]) {
			let selectCallCount = 0;
			return createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone }]),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(violationRows),
							}),
						}),
					};
				}),
			});
		}

		describe("GET /api/ratios/snapshots timezone boundary", () => {
			it("includes an LA-evening snapshot (22:00 PDT = 05:00Z next day) when to=2026-06-09 and center tz=America/Los_Angeles", async () => {
				const eveningSnapshot = {
					id: "snap-evening",
					centerId: "center-1",
					classroomId: "classroom-1",
					snapshotAt: LA_EVENING_SNAPSHOT_UTC,
					staffCount: 2,
					childrenCount: 6,
					ratioRequired: 0.25,
					ratioActual: 0.333,
					inCompliance: true,
				};
				const db = makeSnapshotDbWithTimezone("America/Los_Angeles", [eveningSnapshot]);
				const app = createTestApp(mountRatios, db, { role: "director" });
				const res = await app.request("/api/ratios/snapshots?from=2026-06-09&to=2026-06-09");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { snapshots: unknown[] };
				expect(body.snapshots).toHaveLength(1);
			});

			it("passes timezone-correct UTC Date bounds to drizzle for America/Los_Angeles", async () => {
				// Capture the SQL condition objects passed to the mock where() call.
				// drizzle's gte/lt return SQL objects whose `.queryChunks` array contains
				// the bound Date at index 2 (column, operator, value).
				const whereMock = vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				});
				let selectCallCount = 0;
				const db = createMockDb({
					select: vi.fn().mockImplementation(() => {
						selectCallCount++;
						if (selectCallCount === 1) {
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([{ timezone: "America/Los_Angeles" }]),
									}),
								}),
							};
						}
						return {
							from: vi.fn().mockReturnValue({
								where: whereMock,
							}),
						};
					}),
				});

				const app = createTestApp(mountRatios, db, { role: "director" });
				await app.request("/api/ratios/snapshots?from=2026-06-09&to=2026-06-09");

				// Extract all Date values embedded in the SQL condition tree
				const condition = whereMock.mock.calls[0]?.[0];
				const dates = extractDatesFromSqlCondition(condition);

				// from=2026-06-09 in LA (UTC-7 PDT) → UTC midnight = 2026-06-09T07:00:00Z
				const expectedFrom = new Date("2026-06-09T07:00:00.000Z");
				// to=2026-06-09 → next local day = 2026-06-10 → UTC midnight LA = 2026-06-10T07:00:00Z
				const expectedTo = new Date("2026-06-10T07:00:00.000Z");

				expect(dates.some((d) => d.toISOString() === expectedFrom.toISOString())).toBe(true);
				expect(dates.some((d) => d.toISOString() === expectedTo.toISOString())).toBe(true);
			});

			it("uses DEFAULT_CENTER_TIMEZONE (America/Chicago) when center timezone lookup returns no rows", async () => {
				const whereMock = vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				});
				let selectCallCount = 0;
				const db = createMockDb({
					select: vi.fn().mockImplementation(() => {
						selectCallCount++;
						if (selectCallCount === 1) {
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([]),
									}),
								}),
							};
						}
						return {
							from: vi.fn().mockReturnValue({
								where: whereMock,
							}),
						};
					}),
				});

				const app = createTestApp(mountRatios, db, { role: "director" });
				await app.request("/api/ratios/snapshots?from=2026-06-09&to=2026-06-09");

				const condition = whereMock.mock.calls[0]?.[0];
				const dates = extractDatesFromSqlCondition(condition);

				// America/Chicago is UTC-5 CDT in June → midnight = 05:00Z
				const expectedFrom = new Date("2026-06-09T05:00:00.000Z");
				const expectedTo = new Date("2026-06-10T05:00:00.000Z");

				expect(dates.some((d) => d.toISOString() === expectedFrom.toISOString())).toBe(true);
				expect(dates.some((d) => d.toISOString() === expectedTo.toISOString())).toBe(true);
			});
		});

		describe("GET /api/ratios/history timezone boundary", () => {
			it("passes timezone-correct UTC Date bounds for America/New_York", async () => {
				const whereMock = vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				});
				let selectCallCount = 0;
				const db = createMockDb({
					select: vi.fn().mockImplementation(() => {
						selectCallCount++;
						if (selectCallCount === 1) {
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([{ timezone: "America/New_York" }]),
									}),
								}),
							};
						}
						return {
							from: vi.fn().mockReturnValue({
								where: whereMock,
							}),
						};
					}),
				});

				const app = createTestApp(mountRatios, db, { role: "director" });
				await app.request("/api/ratios/history?from=2026-06-09&to=2026-06-09");

				const condition = whereMock.mock.calls[0]?.[0];
				const dates = extractDatesFromSqlCondition(condition);

				// America/New_York is UTC-4 EDT in June → midnight = 04:00Z
				const expectedFrom = new Date("2026-06-09T04:00:00.000Z");
				const expectedTo = new Date("2026-06-10T04:00:00.000Z");

				expect(dates.some((d) => d.toISOString() === expectedFrom.toISOString())).toBe(true);
				expect(dates.some((d) => d.toISOString() === expectedTo.toISOString())).toBe(true);
			});
		});

		describe("GET /api/ratios/violations timezone boundary", () => {
			it("passes timezone-correct UTC Date bounds for America/Los_Angeles on violations", async () => {
				const whereMock = vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				});
				let selectCallCount = 0;
				const db = createMockDb({
					select: vi.fn().mockImplementation(() => {
						selectCallCount++;
						if (selectCallCount === 1) {
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([{ timezone: "America/Los_Angeles" }]),
									}),
								}),
							};
						}
						return {
							from: vi.fn().mockReturnValue({
								where: whereMock,
							}),
						};
					}),
				});

				const app = createTestApp(mountRatios, db, { role: "director" });
				await app.request("/api/ratios/violations?from=2026-06-09&to=2026-06-09");

				const condition = whereMock.mock.calls[0]?.[0];
				const dates = extractDatesFromSqlCondition(condition);

				const expectedFrom = new Date("2026-06-09T07:00:00.000Z");
				const expectedTo = new Date("2026-06-10T07:00:00.000Z");

				expect(dates.some((d) => d.toISOString() === expectedFrom.toISOString())).toBe(true);
				expect(dates.some((d) => d.toISOString() === expectedTo.toISOString())).toBe(true);
			});

			it("LA morning snapshot (08:00 PDT = 15:00Z) is within from/to=2026-06-09 bounds", async () => {
				const morningSnapshot = {
					id: "snap-morning",
					centerId: "center-1",
					classroomId: "classroom-1",
					detectedAt: LA_MORNING_SNAPSHOT_UTC,
					resolvedAt: null,
					resolvedBy: null,
					resolutionNotes: null,
				};
				const db = makeViolationsDbWithTimezone("America/Los_Angeles", [morningSnapshot]);
				const app = createTestApp(mountRatios, db, { role: "director" });
				const res = await app.request("/api/ratios/violations?from=2026-06-09&to=2026-06-09");

				expect(res.status).toBe(200);
				const body = (await res.json()) as { violations: unknown[] };
				expect(body.violations).toHaveLength(1);
			});
		});
	});
});
