import { inspect } from "node:util";
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, patchBody } from "../test/setup.js";

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

const { timeEntriesRoutes } = await import("./time-entries.js");

function mountTimeEntries(app: Hono<AppEnv>) {
	app.route("/api/time-entries", timeEntriesRoutes);
}

const noCenterMembership = { centerId: undefined as never };

describe("time entries routes", () => {
	it("lists time entries for owner", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: vi
									.fn()
									.mockResolvedValue([{ id: "entry-1", membershipId: "membership-1" }]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountTimeEntries, db);
		const res = await app.request("/api/time-entries");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { timeEntries: Array<{ id: string }> };
		expect(body.timeEntries).toHaveLength(1);
	});

	it("returns filtered time entries for directors", async () => {
		const offset = vi.fn().mockResolvedValue([{ id: "entry-1", membershipId: "membership-2" }]);
		const limit = vi.fn().mockReturnValue({ offset });
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountTimeEntries, db, { role: "director" });
		const res = await app.request(
			"/api/time-entries?from=2026-04-01&to=2026-04-07&membershipId=00000000-0000-0000-0000-000000000002&status=approved",
		);

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledTimes(1);
	});

	it("applies the classroom filter through scheduled shifts when listing time entries", async () => {
		const offset = vi.fn().mockResolvedValue([{ id: "entry-1", membershipId: "membership-2" }]);
		const limit = vi.fn().mockReturnValue({ offset });
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountTimeEntries, db, { role: "director" });
		const res = await app.request(
			"/api/time-entries?classroomId=00000000-0000-0000-0000-000000000003",
		);

		expect(res.status).toBe(200);
		const serializedCondition = inspect(where.mock.calls[0]?.[0], { depth: 20 });
		expect(serializedCondition).toContain("classroom_id");
	});

	it("rejects list requests without center membership", async () => {
		const db = createMockDb();

		const app = createTestApp(mountTimeEntries, db, noCenterMembership);
		const res = await app.request("/api/time-entries");

		expect(res.status).toBe(403);
	});

	it("allows staff to list only their own time entries", async () => {
		const offset = vi.fn().mockResolvedValue([{ id: "entry-1", membershipId: "membership-1" }]);
		const limit = vi.fn().mockReturnValue({ offset });
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountTimeEntries, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request("/api/time-entries");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledTimes(1);
	});

	it("updates and approves a time entry for director", async () => {
		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "entry-1",
								hoursWorked: 8,
								hoursScheduled: 7.5,
								overtimeHours: 0.5,
								status: "approved",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountTimeEntries, db, { role: "director" });
		const res = await app.request(
			"/api/time-entries/00000000-0000-0000-0000-000000000001",
			patchBody({
				hoursWorked: 8,
				hoursScheduled: 7.5,
				overtimeHours: 0.5,
				status: "approved",
			}),
		);

		expect(res.status).toBe(200);
	});

	it("returns 400 for non-UUID time entry id on patch", async () => {
		const db = createMockDb();
		const app = createTestApp(mountTimeEntries, db, { role: "director" });
		const res = await app.request(
			"/api/time-entries/not-a-uuid",
			patchBody({
				hoursWorked: 8,
				hoursScheduled: 7.5,
				overtimeHours: 0.5,
				status: "approved",
			}),
		);
		expect(res.status).toBe(400);
	});

	it("returns 404 when a time entry adjustment cannot be found", async () => {
		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountTimeEntries, db, { role: "director" });
		const res = await app.request(
			"/api/time-entries/00000000-0000-0000-0000-000000000099",
			patchBody({
				hoursWorked: 8,
				hoursScheduled: 7.5,
				overtimeHours: 0.5,
				status: "approved",
			}),
		);

		expect(res.status).toBe(404);
	});

	it("rejects adjustments without center membership", async () => {
		const db = createMockDb();

		const app = createTestApp(mountTimeEntries, db, noCenterMembership);
		const res = await app.request(
			"/api/time-entries/00000000-0000-0000-0000-000000000001",
			patchBody({
				hoursWorked: 8,
				hoursScheduled: 7.5,
				overtimeHours: 0.5,
				status: "approved",
			}),
		);

		expect(res.status).toBe(403);
	});

	it("rejects PATCH with status 'auto' as a validation error", async () => {
		const db = createMockDb();
		const app = createTestApp(mountTimeEntries, db, { role: "director" });
		const res = await app.request(
			"/api/time-entries/00000000-0000-0000-0000-000000000001",
			patchBody({
				hoursWorked: 8,
				hoursScheduled: 7.5,
				overtimeHours: 0.5,
				status: "auto",
			}),
		);

		expect(res.status).toBe(400);
	});

	it("rejects staff adjustments", async () => {
		const db = createMockDb();
		const app = createTestApp(mountTimeEntries, db, { role: "staff" });
		const res = await app.request(
			"/api/time-entries/00000000-0000-0000-0000-000000000001",
			patchBody({
				hoursWorked: 8,
				hoursScheduled: 7.5,
				overtimeHours: 0.5,
				status: "approved",
			}),
		);

		expect(res.status).toBe(403);
	});
});
