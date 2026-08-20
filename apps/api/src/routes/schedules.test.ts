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

const { schedulesRoutes } = await import("./schedules.js");

function mountSchedules(app: Hono<AppEnv>) {
	app.route("/api/schedules", schedulesRoutes);
}

const noCenterMembership = { centerId: undefined as never };
const SCHEDULE_ID = "a0000000-0000-0000-0000-000000000001";
const MISSING_SCHEDULE_ID = "a0000000-0000-0000-0000-000000000099";

describe("schedules routes", () => {
	it("lists schedules for director", async () => {
		const limit = vi.fn().mockResolvedValue([
			{
				id: SCHEDULE_ID,
				centerId: "center-1",
				name: "Spring",
				effectiveFrom: "2026-04-01",
			},
		]);
		const orderBy = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({ orderBy }),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request("/api/schedules");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { schedules: Array<{ id: string }> };
		expect(body.schedules).toHaveLength(1);
		expect(orderBy).toHaveBeenCalledTimes(1);
		expect(limit).toHaveBeenCalledTimes(1);
	});

	it("lists schedules filtered by active date", async () => {
		const limit = vi.fn().mockResolvedValue([{ id: SCHEDULE_ID }]);
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request("/api/schedules?activeOn=2026-04-07");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalled();
	});

	it("rejects list requests without center membership", async () => {
		const db = createMockDb();

		const app = createTestApp(mountSchedules, db, noCenterMembership);
		const res = await app.request("/api/schedules");

		expect(res.status).toBe(403);
	});

	it("returns one schedule by id", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: SCHEDULE_ID, name: "Spring" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request(`/api/schedules/${SCHEDULE_ID}`);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { schedule: { id: string } };
		expect(body.schedule.id).toBe(SCHEDULE_ID);
	});

	it("rejects schedule lookup without center membership", async () => {
		const db = createMockDb();

		const app = createTestApp(mountSchedules, db, noCenterMembership);
		const res = await app.request(`/api/schedules/${SCHEDULE_ID}`);

		expect(res.status).toBe(403);
	});

	it("returns 404 when the schedule does not exist", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request(`/api/schedules/${MISSING_SCHEDULE_ID}`);

		expect(res.status).toBe(404);
	});

	it("returns 400 for malformed schedule IDs before lookup", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request("/api/schedules/not-a-uuid");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("creates a schedule for owner", async () => {
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: SCHEDULE_ID,
							centerId: "center-1",
							name: "Spring",
							effectiveFrom: "2026-04-01",
							effectiveUntil: null,
						},
					]),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db);
		const res = await app.request(
			"/api/schedules",
			jsonBody({ name: "Spring", effectiveFrom: "2026-04-01" }),
		);

		expect(res.status).toBe(201);
	});

	it("rejects create requests without center membership", async () => {
		const db = createMockDb();

		const app = createTestApp(mountSchedules, db, noCenterMembership);
		const res = await app.request(
			"/api/schedules",
			jsonBody({ name: "Spring", effectiveFrom: "2026-04-01" }),
		);

		expect(res.status).toBe(403);
	});

	it("returns 500 when schedule creation does not return a row", async () => {
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db);
		const res = await app.request(
			"/api/schedules",
			jsonBody({ name: "Spring", effectiveFrom: "2026-04-01" }),
		);

		expect(res.status).toBe(500);
	});

	it("updates a schedule for director", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								effectiveFrom: "2026-04-01",
								effectiveUntil: "2026-04-30",
							},
						]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: SCHEDULE_ID,
								centerId: "center-1",
								name: "Summer",
								effectiveFrom: "2026-04-01",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request(`/api/schedules/${SCHEDULE_ID}`, patchBody({ name: "Summer" }));

		expect(res.status).toBe(200);
	});

	it("rejects partial updates that would make effectiveFrom after the stored effectiveUntil", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: SCHEDULE_ID,
								effectiveFrom: "2026-04-01",
								effectiveUntil: "2026-04-30",
							},
						]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request(
			`/api/schedules/${SCHEDULE_ID}`,
			patchBody({ effectiveFrom: "2026-05-01" }),
		);

		expect(res.status).toBe(400);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects partial updates that would make effectiveUntil before the stored effectiveFrom", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: SCHEDULE_ID,
								effectiveFrom: "2026-04-15",
								effectiveUntil: "2026-05-15",
							},
						]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request(
			`/api/schedules/${SCHEDULE_ID}`,
			patchBody({ effectiveUntil: "2026-04-01" }),
		);

		expect(res.status).toBe(400);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("returns 404 when updating a missing schedule", async () => {
		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db, { role: "director" });
		const res = await app.request(
			`/api/schedules/${MISSING_SCHEDULE_ID}`,
			patchBody({ name: "Summer" }),
		);

		expect(res.status).toBe(404);
	});

	it("returns 400 for malformed schedule IDs before update lookup", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSchedules, db);
		const res = await app.request("/api/schedules/not-a-uuid", patchBody({ name: "Summer" }));

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects updates without center membership", async () => {
		const db = createMockDb();

		const app = createTestApp(mountSchedules, db, noCenterMembership);
		const res = await app.request(`/api/schedules/${SCHEDULE_ID}`, patchBody({ name: "Summer" }));

		expect(res.status).toBe(403);
	});

	it("deletes a schedule for owner", async () => {
		const db = createMockDb({
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: SCHEDULE_ID }]),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db);
		const res = await app.request(`/api/schedules/${SCHEDULE_ID}`, { method: "DELETE" });

		expect(res.status).toBe(200);
	});

	it("returns 404 when deleting a missing schedule", async () => {
		const db = createMockDb({
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		const app = createTestApp(mountSchedules, db);
		const res = await app.request(`/api/schedules/${MISSING_SCHEDULE_ID}`, { method: "DELETE" });

		expect(res.status).toBe(404);
	});

	it("returns 400 for malformed schedule IDs before deleting", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSchedules, db);
		const res = await app.request("/api/schedules/not-a-uuid", { method: "DELETE" });

		expect(res.status).toBe(400);
		expect(db.delete).not.toHaveBeenCalled();
	});

	it("rejects deletes without center membership", async () => {
		const db = createMockDb();

		const app = createTestApp(mountSchedules, db, noCenterMembership);
		const res = await app.request(`/api/schedules/${SCHEDULE_ID}`, { method: "DELETE" });

		expect(res.status).toBe(403);
	});

	it("rejects staff mutations", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSchedules, db, { role: "staff" });
		const res = await app.request(
			"/api/schedules",
			jsonBody({ name: "Spring", effectiveFrom: "2026-04-01" }),
		);

		expect(res.status).toBe(403);
	});
});
