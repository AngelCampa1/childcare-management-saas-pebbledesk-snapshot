import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

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

const { shiftsRoutes } = await import("./shifts.js");

function mountShifts(app: Hono<AppEnv>) {
	app.route("/api/shifts", shiftsRoutes);
}

const SHIFT_ID = "b0000000-0000-0000-0000-000000000001";
const MISSING_SHIFT_ID = "b0000000-0000-0000-0000-000000000099";

describe("shifts routes", () => {
	it("lists shifts for director", async () => {
		const limit = vi.fn().mockResolvedValue([{ id: SHIFT_ID, membershipId: "membership-1" }]);
		const orderBy = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({ orderBy }),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request("/api/shifts");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { shifts: Array<{ id: string }> };
		expect(body.shifts).toHaveLength(1);
		expect(orderBy).toHaveBeenCalledTimes(1);
		expect(limit).toHaveBeenCalledTimes(1);
	});

	it("lists only own shifts for staff", async () => {
		const limit = vi.fn().mockResolvedValue([{ id: SHIFT_ID, membershipId: "membership-1" }]);
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "staff", membershipId: "membership-1" });
		const res = await app.request("/api/shifts");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledTimes(1);
	});

	it("applies schedule and classroom filters when listing shifts", async () => {
		const limit = vi.fn().mockResolvedValue([{ id: SHIFT_ID }]);
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(
			"/api/shifts?scheduleId=550e8400-e29b-41d4-a716-446655440001&classroomId=550e8400-e29b-41d4-a716-446655440003&dayOfWeek=1",
		);

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledTimes(1);
	});

	it("rejects listing shifts without a center membership", async () => {
		const app = createTestApp(mountShifts, createMockDb(), {
			centerId: "",
		});

		const res = await app.request("/api/shifts");

		expect(res.status).toBe(403);
	});

	it("applies director membership filters when provided", async () => {
		const limit = vi.fn().mockResolvedValue([{ id: SHIFT_ID, membershipId: "membership-2" }]);
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(
			"/api/shifts?membershipId=550e8400-e29b-41d4-a716-446655440002&dayOfWeek=1",
		);

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledTimes(1);
	});

	it("reads a shift by id for director", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: SHIFT_ID,
								centerId: "center-1",
								membershipId: "membership-2",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			shift: expect.objectContaining({ id: SHIFT_ID }),
		});
	});

	it("prevents staff from reading another member's shift by id", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "staff", membershipId: "membership-1" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`);

		expect(res.status).toBe(404);
	});

	it("creates a shift for owner", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				// overlap check — no existing overlapping shifts
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: SHIFT_ID }]),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(201);
	});

	it("rejects shift creation without a center membership", async () => {
		const app = createTestApp(mountShifts, createMockDb(), {
			centerId: "",
		});
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(403);
	});

	it("rejects shift creation when related records are outside the center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn(),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(404);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects shift creation when the membership is outside the center", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			insert: vi.fn(),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(404);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects shift creation for a deactivated membership", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "membership-1",
									acceptedAt: new Date("2026-04-01T00:00:00.000Z"),
									deactivatedAt: new Date("2026-04-10T00:00:00.000Z"),
								},
							]),
						}),
					}),
				}),
			insert: vi.fn(),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "Staff member is no longer active in this center",
		});
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects shift creation when the classroom is outside the center", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			insert: vi.fn(),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(404);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("returns 500 when shift creation fails after validation", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				// overlap check — no existing overlapping shifts
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(500);
	});

	it("maps the shifts_no_overlap exclusion violation (23P01) to a 409 on POST", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				// app-level overlap check passes (race: concurrent insert slipped in)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			// DB exclusion constraint rejects the concurrent write
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockRejectedValue(
						Object.assign(new Error("conflicting key value violates exclusion constraint"), {
							code: "23P01",
							constraint: "shifts_no_overlap",
						}),
					),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({
			error: "Shift overlaps an existing shift for this staff member on this day",
		});
	});

	it("unwraps a driver-nested cause chain to map 23P01 to 409 on POST", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			// Postgres driver wraps the original error under `cause`.
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockRejectedValue(
						Object.assign(new Error("query failed"), {
							cause: Object.assign(new Error("conflicting key value"), {
								code: "23P01",
								constraint: "shifts_no_overlap",
							}),
						}),
					),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(409);
	});

	it("re-throws a non-23P01 DB error from insert as a 500", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			// An unrelated DB failure (e.g. unique violation) must not be masked as 409.
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi
						.fn()
						.mockRejectedValue(Object.assign(new Error("some other failure"), { code: "23505" })),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(500);
	});

	it("rejects POST when new shift overlaps an existing shift for the same staff/day/schedule", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				// schedule check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				// membership check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				// classroom check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				// overlap check — returns an existing shift that overlaps 10:00-18:00
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([
								{ id: "existing-shift-1", startTime: "10:00", endTime: "18:00" },
							]),
					}),
				}),
			insert: vi.fn(),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "Shift overlaps an existing shift for this staff member on this day",
		});
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("allows POST for adjacent shifts (08:00-12:00 then 12:00-16:00) — no overlap", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				// schedule check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				// membership check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				// classroom check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				// overlap check — existing shift is 08:00-12:00, new shift starts at 12:00 (adjacent, not overlapping)
				// existingStart(08:00) < newEnd(16:00) is true, but newStart(12:00) < existingEnd(12:00) is false → no overlap
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([
								{ id: "existing-shift-1", startTime: "08:00", endTime: "12:00" },
							]),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: SHIFT_ID }]),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "12:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(201);
	});

	it("allows POST for non-overlapping shift on different dayOfWeek", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				// schedule check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "schedule-1" }]),
						}),
					}),
				})
				// membership check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-1", acceptedAt: new Date("2026-04-01T00:00:00.000Z") },
								]),
						}),
					}),
				})
				// classroom check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				})
				// overlap check — no rows because different dayOfWeek filtered at DB level
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: SHIFT_ID }]),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db);
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 2,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(201);
	});

	it("rejects PATCH when updated times create an overlap", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				// existing shift lookup
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									startTime: "08:00",
									endTime: "12:00",
									scheduleId: "550e8400-e29b-41d4-a716-446655440001",
									membershipId: "550e8400-e29b-41d4-a716-446655440002",
									dayOfWeek: 1,
								},
							]),
						}),
					}),
				})
				// overlap check — another shift from 10:00-18:00
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([{ id: "other-shift", startTime: "10:00", endTime: "18:00" }]),
					}),
				}),
			update: vi.fn(),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, patchBody({ endTime: "16:00" }));

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "Shift overlaps an existing shift for this staff member on this day",
		});
		expect(db.update).not.toHaveBeenCalled();
	});

	it("allows PATCH that does not create an overlap", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				// existing shift lookup
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									startTime: "08:00",
									endTime: "12:00",
									scheduleId: "550e8400-e29b-41d4-a716-446655440001",
									membershipId: "550e8400-e29b-41d4-a716-446655440002",
									dayOfWeek: 1,
								},
							]),
						}),
					}),
				})
				// overlap check — no overlaps
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: SHIFT_ID, endTime: "11:00" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, patchBody({ endTime: "11:00" }));

		expect(res.status).toBe(200);
	});

	it("maps the shifts_no_overlap exclusion violation (23P01) to a 409 on PATCH", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									startTime: "08:00",
									endTime: "12:00",
									scheduleId: "550e8400-e29b-41d4-a716-446655440001",
									membershipId: "550e8400-e29b-41d4-a716-446655440002",
									dayOfWeek: 1,
								},
							]),
						}),
					}),
				})
				// app-level overlap check passes (race: concurrent write slipped in)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(
							Object.assign(new Error("conflicting key value violates exclusion constraint"), {
								code: "23P01",
								constraint: "shifts_no_overlap",
							}),
						),
					}),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, patchBody({ endTime: "11:00" }));

		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({
			error: "Shift overlaps an existing shift for this staff member on this day",
		});
	});

	it("allows PATCH that does not touch times — self-overlap excluded via id", async () => {
		// Sending only startTime so no relation checks. The shift is being moved slightly
		// within the same window. The overlap check excludes the shift itself via ne(shifts.id).
		const db = createMockDb({
			select: vi
				.fn()
				// existing shift lookup
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									startTime: "08:00",
									endTime: "12:00",
									scheduleId: "550e8400-e29b-41d4-a716-446655440001",
									membershipId: "550e8400-e29b-41d4-a716-446655440002",
									dayOfWeek: 1,
								},
							]),
						}),
					}),
				})
				// overlap check — self excluded, no other shifts
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: SHIFT_ID, startTime: "08:30" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, patchBody({ startTime: "08:30" }));

		expect(res.status).toBe(200);
	});

	it("updates a shift for director", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									startTime: "08:00",
									endTime: "16:00",
									scheduleId: "550e8400-e29b-41d4-a716-446655440001",
									membershipId: "550e8400-e29b-41d4-a716-446655440002",
									dayOfWeek: 1,
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: SHIFT_ID, startTime: "09:00" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, patchBody({ startTime: "09:00" }));

		expect(res.status).toBe(200);
	});

	it("rejects partial updates that would make startTime after the stored endTime", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: SHIFT_ID,
								startTime: "08:00",
								endTime: "12:00",
							},
						]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, patchBody({ startTime: "13:00" }));

		expect(res.status).toBe(400);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects partial updates that would make endTime before the stored startTime", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: SHIFT_ID,
								startTime: "08:00",
								endTime: "12:00",
							},
						]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, patchBody({ endTime: "07:30" }));

		expect(res.status).toBe(400);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects shift updates without a center membership", async () => {
		const app = createTestApp(mountShifts, createMockDb(), {
			role: "director",
			centerId: "",
		});
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, patchBody({ startTime: "09:00" }));

		expect(res.status).toBe(403);
	});

	it("returns 404 when a shift update target is missing", async () => {
		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(
			`/api/shifts/${MISSING_SHIFT_ID}`,
			patchBody({ startTime: "09:00" }),
		);

		expect(res.status).toBe(404);
	});

	it("returns 400 for malformed shift IDs before update lookup", async () => {
		const db = createMockDb();
		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request("/api/shifts/not-a-uuid", patchBody({ startTime: "09:00" }));

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects shift updates with foreign-center relations", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(
			`/api/shifts/${SHIFT_ID}`,
			patchBody({ classroomId: "550e8400-e29b-41d4-a716-446655440003" }),
		);

		expect(res.status).toBe(404);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects shift updates when membership is outside the center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(
			`/api/shifts/${SHIFT_ID}`,
			patchBody({ membershipId: "550e8400-e29b-41d4-a716-446655440002" }),
		);

		expect(res.status).toBe(404);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("deletes a shift for director", async () => {
		const returning = vi.fn().mockResolvedValue([{ id: SHIFT_ID }]);
		const where = vi.fn().mockReturnValue({ returning });
		const db = createMockDb({
			delete: vi.fn().mockReturnValue({
				where,
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, { method: "DELETE" });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(where).toHaveBeenCalledTimes(1);
		expect(returning).toHaveBeenCalledTimes(1);
	});

	it("returns 404 when deleting a missing shift", async () => {
		const db = createMockDb({
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request(`/api/shifts/${MISSING_SHIFT_ID}`, { method: "DELETE" });

		expect(res.status).toBe(404);
	});

	it("returns 400 for malformed shift IDs before deleting", async () => {
		const db = createMockDb();
		const app = createTestApp(mountShifts, db, { role: "director" });
		const res = await app.request("/api/shifts/not-a-uuid", { method: "DELETE" });

		expect(res.status).toBe(400);
		expect(db.delete).not.toHaveBeenCalled();
	});

	it("rejects shift deletion without a center membership", async () => {
		const app = createTestApp(mountShifts, createMockDb(), {
			role: "director",
			centerId: "",
		});
		const res = await app.request(`/api/shifts/${SHIFT_ID}`, { method: "DELETE" });

		expect(res.status).toBe(403);
	});

	it("rejects staff mutations", async () => {
		const db = createMockDb();
		const app = createTestApp(mountShifts, db, { role: "staff" });
		const res = await app.request(
			"/api/shifts",
			jsonBody({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "08:00",
				endTime: "16:00",
			}),
		);

		expect(res.status).toBe(403);
	});
});
