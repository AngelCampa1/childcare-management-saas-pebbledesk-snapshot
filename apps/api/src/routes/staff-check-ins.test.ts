import type { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

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

// Mock ratio service
vi.mock("../services/ratio.js", () => ({
	evaluateRoomRatio: vi.fn().mockResolvedValue({
		childrenCount: 0,
		staffCount: 1,
		ratioRequired: 0.25,
		ratioActual: Number.POSITIVE_INFINITY,
		inCompliance: true,
	}),
}));

// Import after mocking
const { staffCheckInsRoutes } = await import("./staff-check-ins.js");

interface StaffCheckInData {
	id: string;
	centerId: string;
	membershipId: string;
	classroomId: string;
	clockedInAt: string;
	clockedOutAt: string | null;
}

function mountStaffCheckIns(app: Hono<AppEnv>) {
	app.route("/api/staff-check-ins", staffCheckInsRoutes);
}

const noCenterMembership = { centerId: undefined as never };
const STAFF_CHECK_IN_ID = "10000000-0000-0000-0000-000000000001";

const mockStaffCheckIn: StaffCheckInData = {
	id: STAFF_CHECK_IN_ID,
	centerId: "center-1",
	membershipId: "membership-1",
	classroomId: "00000000-0000-0000-0000-000000000010",
	clockedInAt: new Date().toISOString(),
	clockedOutAt: null,
};

function selectCenterTimezoneResolved(timezone = "America/Los_Angeles") {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue([{ timezone }]),
			}),
		}),
	};
}

function selectInnerJoinResolved<T>(value: T) {
	return {
		from: vi.fn().mockReturnValue({
			innerJoin: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(value),
			}),
		}),
	};
}

function collectStringValues(value: unknown, seen = new Set<object>()): string[] {
	if (typeof value === "string") return [value];
	if (!value || typeof value !== "object") return [];
	if (seen.has(value)) return [];
	seen.add(value);

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectStringValues(item, seen));
	}

	return Object.values(value).flatMap((item) => collectStringValues(item, seen));
}

describe("staff check-in routes", () => {
	describe("POST /api/staff-check-ins", () => {
		it("clocks in self (201)", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				}),
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockStaffCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({ classroomId: "00000000-0000-0000-0000-000000000010" }),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { staffCheckIn: StaffCheckInData };
			expect(body.staffCheckIn.membershipId).toBe("membership-1");
			expect(body.staffCheckIn.clockedOutAt).toBeNull();
		});

		it("clocks in self with an explicit membershipId (201)", async () => {
			const membershipId = "00000000-0000-0000-0000-000000000001";
			const staffCheckIn = { ...mockStaffCheckIn, membershipId };
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ id: membershipId, acceptedAt: new Date("2026-04-01") }]),
						}),
					}),
				}),
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([staffCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db, {
				role: "staff",
				membershipId,
			});
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({
					classroomId: "00000000-0000-0000-0000-000000000010",
					membershipId,
				}),
			);

			expect(res.status).toBe(201);
		});

		it("director clocks in another membership (201)", async () => {
			const otherMembership = { ...mockStaffCheckIn, membershipId: "membership-2" };
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ id: "membership-2", acceptedAt: new Date("2026-04-01") }]),
						}),
					}),
				}),
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([otherMembership]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({
					classroomId: "00000000-0000-0000-0000-000000000010",
					membershipId: "00000000-0000-0000-0000-000000000002",
				}),
			);

			expect(res.status).toBe(201);
		});

		it("rejects clocking in a membership from another center (404)", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
				transaction: vi.fn(),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({
					classroomId: "00000000-0000-0000-0000-000000000010",
					membershipId: "00000000-0000-0000-0000-000000000099",
				}),
			);

			expect(res.status).toBe(404);
		});

		it("rejects clocking in a membership that has not accepted the invitation", async () => {
			const select = vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "membership-2", acceptedAt: null }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1", archivedAt: null }]),
						}),
					}),
				});
			const db = createMockDb({
				select,
				transaction: vi.fn(),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({
					classroomId: "00000000-0000-0000-0000-000000000010",
					membershipId: "00000000-0000-0000-0000-000000000002",
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Staff member must accept the center invitation before clock-in",
			});
			expect(db.transaction).not.toHaveBeenCalled();
		});

		it("rejects clocking in a deactivated membership", async () => {
			const select = vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "membership-2",
									acceptedAt: new Date("2026-04-01T00:00:00.000Z"),
									deactivatedAt: new Date("2026-04-10T00:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1", archivedAt: null }]),
						}),
					}),
				});
			const db = createMockDb({
				select,
				transaction: vi.fn(),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({
					classroomId: "00000000-0000-0000-0000-000000000010",
					membershipId: "00000000-0000-0000-0000-000000000002",
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Staff member is no longer active in this center",
			});
			expect(db.transaction).not.toHaveBeenCalled();
		});

		it("rejects clocking into a classroom from another center (404)", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
						insert: vi.fn(),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({ classroomId: "00000000-0000-0000-0000-000000000099" }),
			);

			expect(res.status).toBe(404);
		});

		it("rejects clocking into an archived classroom", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ id: "classroom-1", archivedAt: new Date().toISOString() }]),
						}),
					}),
				}),
				transaction: vi.fn(),
			});

			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({ classroomId: "00000000-0000-0000-0000-000000000010" }),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Cannot clock staff into an archived classroom",
			});
			expect(db.transaction).not.toHaveBeenCalled();
		});

		it("rejects staff clocking into a classroom outside their active assignment scope (403)", async () => {
			const membershipId = "membership-1";
			const assignmentWhere = vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue([]),
			});
			const select = vi
				.fn()
				// call 1: classroom lookup
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				// call 2: center timezone lookup (new, for toLocalDay in staff assignment check)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
						}),
					}),
				})
				// call 3: staff assignment check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: assignmentWhere,
					}),
				});
			const db = createMockDb({
				select,
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockStaffCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db, {
				role: "staff",
				membershipId,
			});
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({ classroomId: "00000000-0000-0000-0000-000000000011" }),
			);

			expect(res.status).toBe(403);
			expect(collectStringValues(assignmentWhere.mock.calls[0]?.[0]).join("")).toContain(
				new Date().toISOString().split("T")[0],
			);
		});

		it("rejects clock-ins without center membership (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountStaffCheckIns, db, noCenterMembership);
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({ classroomId: "00000000-0000-0000-0000-000000000010" }),
			);

			expect(res.status).toBe(403);
		});

		it("staff cannot clock in another member (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountStaffCheckIns, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({
					classroomId: "00000000-0000-0000-0000-000000000010",
					membershipId: "00000000-0000-0000-0000-000000000099",
				}),
			);

			expect(res.status).toBe(403);
		});

		it("rejects duplicate clock-in (400)", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				}),
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "staff-checkin-existing" }]),
								}),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({ classroomId: "00000000-0000-0000-0000-000000000010" }),
			);

			expect(res.status).toBe(400);
		});

		it("returns 500 when a clock-in is not inserted", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				}),
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({ classroomId: "00000000-0000-0000-0000-000000000010" }),
			);

			expect(res.status).toBe(500);
		});
	});

	describe("PATCH /api/staff-check-ins/:id/clock-out", () => {
		it("clocks out staff (200)", async () => {
			const clockedOut = { ...mockStaffCheckIn, clockedOutAt: new Date().toISOString() };
			const insertValues = vi.fn().mockReturnValue({
				onConflictDoUpdate: vi.fn().mockResolvedValue([{ id: "entry-1" }]),
			});
			const updateWhere = vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([clockedOut]),
			});
			const select = vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([mockStaffCheckIn]),
						}),
					}),
				})
				.mockReturnValueOnce(selectCenterTimezoneResolved())
				.mockReturnValueOnce(selectInnerJoinResolved([]));

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select,
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: updateWhere,
							}),
						}),
						insert: vi.fn().mockReturnValue({
							values: insertValues,
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request(
				`/api/staff-check-ins/${STAFF_CHECK_IN_ID}/clock-out`,
				patchBody({}),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { staffCheckIn: StaffCheckInData };
			expect(body.staffCheckIn.clockedOutAt).toBeTruthy();
			expect(insertValues).toHaveBeenCalledTimes(1);
			expect(collectStringValues(updateWhere.mock.calls[0]?.[0])).toContain("center-1");
		});

		it("clocks out self with a missing returned clock-out timestamp (200)", async () => {
			const select = vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([mockStaffCheckIn]),
						}),
					}),
				})
				.mockReturnValueOnce(selectCenterTimezoneResolved())
				.mockReturnValueOnce(selectInnerJoinResolved([]));

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select,
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									returning: vi
										.fn()
										.mockResolvedValue([{ ...mockStaffCheckIn, clockedOutAt: null }]),
								}),
							}),
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								onConflictDoUpdate: vi.fn().mockResolvedValue([{ id: "entry-1" }]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request(
				`/api/staff-check-ins/${STAFF_CHECK_IN_ID}/clock-out`,
				patchBody({}),
			);

			expect(res.status).toBe(200);
		});

		it("rejects clock-outs without center membership (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountStaffCheckIns, db, noCenterMembership);
			const res = await app.request(
				`/api/staff-check-ins/${STAFF_CHECK_IN_ID}/clock-out`,
				patchBody({}),
			);

			expect(res.status).toBe(403);
		});

		it("returns 404 if clock-in not found", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request(
				"/api/staff-check-ins/10000000-0000-0000-0000-000000000099/clock-out",
				patchBody({}),
			);

			expect(res.status).toBe(404);
		});

		it("rejects malformed clock-in IDs before opening a transaction", async () => {
			const db = createMockDb();
			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request("/api/staff-check-ins/not-a-uuid/clock-out", patchBody({}));

			expect(res.status).toBe(400);
			expect(db.transaction).not.toHaveBeenCalled();
		});

		it("staff cannot clock out another member (403)", async () => {
			const otherMemberCheckIn = { ...mockStaffCheckIn, membershipId: "membership-other" };

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([otherMemberCheckIn]),
								}),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request(
				`/api/staff-check-ins/${STAFF_CHECK_IN_ID}/clock-out`,
				patchBody({}),
			);

			expect(res.status).toBe(403);
		});

		it("returns 500 when a clock-out update does not return a row", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi
							.fn()
							.mockReturnValueOnce({
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([mockStaffCheckIn]),
									}),
								}),
							})
							.mockReturnValueOnce(selectCenterTimezoneResolved())
							.mockReturnValueOnce(selectInnerJoinResolved([])),
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db);
			const res = await app.request(
				`/api/staff-check-ins/${STAFF_CHECK_IN_ID}/clock-out`,
				patchBody({}),
			);

			expect(res.status).toBe(500);
		});
	});

	describe("GET /api/staff-check-ins", () => {
		it("rejects attendance lookups without center membership (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountStaffCheckIns, db, noCenterMembership);
			const res = await app.request("/api/staff-check-ins");

			expect(res.status).toBe(403);
		});

		it("returns today's staff attendance for director (200)", async () => {
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(selectCenterTimezoneResolved())
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockStaffCheckIn]),
								}),
							}),
						}),
					}),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request("/api/staff-check-ins");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { staffCheckIns: StaffCheckInData[] };
			expect(body.staffCheckIns).toHaveLength(1);
			expect(body.staffCheckIns[0].id).toBe(STAFF_CHECK_IN_ID);
		});

		it("returns attendance for a specific date (200)", async () => {
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(selectCenterTimezoneResolved())
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockStaffCheckIn]),
								}),
							}),
						}),
					}),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "owner" });
			const res = await app.request("/api/staff-check-ins?date=2026-04-07");

			expect(res.status).toBe(200);
		});

		it("uses the center timezone when defaulting to today", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-04-09T06:45:00.000Z"));

			const localDayCheckIn = {
				...mockStaffCheckIn,
				clockedInAt: "2026-04-08T15:30:00.000Z",
			};
			const nextLocalDayCheckIn = {
				...mockStaffCheckIn,
				id: "staff-checkin-2",
				clockedInAt: "2026-04-09T08:30:00.000Z",
			};
			const where = vi.fn().mockImplementation((condition: unknown) => {
				const serialized = collectStringValues(condition).join(" ");
				const limit = vi
					.fn()
					.mockResolvedValue(
						serialized.includes("2026-04-08")
							? [localDayCheckIn]
							: [localDayCheckIn, nextLocalDayCheckIn],
					);
				return { orderBy: vi.fn().mockReturnValue({ limit }) };
			});
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(selectCenterTimezoneResolved("America/Los_Angeles"))
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where,
						}),
					}),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request("/api/staff-check-ins");

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toEqual({
				staffCheckIns: [localDayCheckIn],
			});
			expect(where).toHaveBeenCalledTimes(1);

			vi.useRealTimers();
		});

		it("returns assignment-scoped check-ins for staff role (200, sees coworkers in own room)", async () => {
			// A coworker clocked into the same room the requesting staff is assigned to.
			const coworkerCheckIn: StaffCheckInData = {
				...mockStaffCheckIn,
				id: "10000000-0000-0000-0000-000000000002",
				membershipId: "membership-2",
			};
			const where = vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([mockStaffCheckIn, coworkerCheckIn]),
				}),
			});
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(selectCenterTimezoneResolved())
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({ where }),
					}),
			});

			// Default test membership is "membership-1", matching mockStaffCheckIn.
			const app = createTestApp(mountStaffCheckIns, db, { role: "staff" });
			const res = await app.request(
				"/api/staff-check-ins?classroomId=00000000-0000-0000-0000-000000000010",
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { staffCheckIns: StaffCheckInData[] };
			// Staff see every clocked-in coworker in their assigned room (needed for the
			// room ratio badge), not just their own record.
			expect(body.staffCheckIns).toHaveLength(2);

			// Scoping is enforced via the caller's own assignments (membership-1).
			const serialized = collectStringValues(where.mock.calls[0][0]).join(" ");
			expect(serialized).toContain("membership-1");
		});

		it("returns filtered by classroomId", async () => {
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(selectCenterTimezoneResolved())
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockStaffCheckIn]),
								}),
							}),
						}),
					}),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "owner" });
			const res = await app.request(
				"/api/staff-check-ins?classroomId=00000000-0000-0000-0000-000000000010",
			);

			expect(res.status).toBe(200);
		});

		it("bounds the attendance query with orderBy+limit(2001) as an overflow guard", async () => {
			const limitFn = vi.fn().mockResolvedValue([mockStaffCheckIn]);
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(selectCenterTimezoneResolved())
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: limitFn,
								}),
							}),
						}),
					}),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request("/api/staff-check-ins");

			expect(res.status).toBe(200);
			expect(limitFn).toHaveBeenCalledWith(2001);
		});

		it("returns 400 when attendance result set overflows STAFF_ATTENDANCE_LIST_LIMIT", async () => {
			const overflowRecords = Array.from({ length: 2001 }, (_, i) => ({
				...mockStaffCheckIn,
				id: `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
			}));
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(selectCenterTimezoneResolved())
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue(overflowRecords),
								}),
							}),
						}),
					}),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request("/api/staff-check-ins");

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/too many staff check-in records for this day/i);
		});

		it("returns all rows when attendance result set is at or below STAFF_ATTENDANCE_LIST_LIMIT", async () => {
			const records = Array.from({ length: 4 }, (_, i) => ({
				...mockStaffCheckIn,
				id: `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
			}));
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(selectCenterTimezoneResolved())
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue(records),
								}),
							}),
						}),
					}),
			});

			const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
			const res = await app.request("/api/staff-check-ins");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { staffCheckIns: StaffCheckInData[] };
			expect(body.staffCheckIns).toHaveLength(4);
		});
	});

	describe("timezone-aware assignment validity (POST /api/staff-check-ins)", () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it("treats a staff assignment ending tomorrow (local) as still active when UTC is already on the next day", async () => {
			// At 03:00 UTC on 2026-06-10, America/Chicago (UTC-5 in June) is still
			// 2026-06-09 22:00. An assignment with endDate "2026-06-10" should be
			// valid locally. The bug would compute UTC "today" = "2026-06-10" and
			// reject with 403 ("Staff can only clock into their assigned classrooms").
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-06-10T03:00:00Z"));

			const select = vi
				.fn()
				// call 1: classroom lookup
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1", archivedAt: null }]),
						}),
					}),
				})
				// call 2: center timezone lookup
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
						}),
					}),
				})
				// call 3: staff assignment lookup — endDate "2026-06-10" > local "2026-06-09" → valid
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "assignment-1" }]),
						}),
					}),
				});

			const db = createMockDb({
				select,
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockStaffCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountStaffCheckIns, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request(
				"/api/staff-check-ins",
				jsonBody({ classroomId: "00000000-0000-0000-0000-000000000010" }),
			);

			// Assignment is still active in center-local time → should succeed (201)
			expect(res.status).toBe(201);
		});

		it("uses center-local date for GET staff attendance scoping when UTC is already next day", async () => {
			// Same scenario for the GET route's staff assignment filter (assignmentDay).
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-06-10T03:00:00Z"));

			const where = vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([mockStaffCheckIn]),
				}),
			});

			const db = createMockDb({
				select: vi
					.fn()
					// call 1: center timezone for getCenterTimezone in GET handler
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
							}),
						}),
					})
					// call 2: staff check-ins query
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({ where }),
					}),
			});

			const app = createTestApp(mountStaffCheckIns, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request("/api/staff-check-ins");

			expect(res.status).toBe(200);

			// The SQL condition injected for staff scoping must use the local date
			// "2026-06-09", not the UTC date "2026-06-10".
			const serialized = collectStringValues(where.mock.calls[0][0]).join(" ");
			expect(serialized).toContain("2026-06-09");
			expect(serialized).not.toContain("2026-06-10");
		});
	});
});
