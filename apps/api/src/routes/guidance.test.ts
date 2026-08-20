import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv, Variables } from "../lib/context.js";
import { createMockDb, createTestApp, patchBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException: HE } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(
			async (c: { get: (key: string) => string }, next: () => Promise<void>) => {
				if (!c.get("userId")) {
					throw new HE(401, { message: "Unauthorized" });
				}
				await next();
			},
		),
		requireCenter: createMiddleware(
			async (c: { get: (key: string) => string | undefined }, next: () => Promise<void>) => {
				if (c.get("centerId") === undefined) {
					throw new HE(403, { message: "Center required" });
				}
				await next();
			},
		),
	};
});

const { guidanceRoutes } = await import("./guidance.js");

function mountGuidance(app: Hono<AppEnv>) {
	app.route("/api/guidance", guidanceRoutes);
}

function createContextApp(
	db: ReturnType<typeof createMockDb>,
	ctx: { userId?: string; centerId?: string; membershipId?: string },
) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.set("db", db as unknown as Variables["db"]);
		if (ctx.userId !== undefined) c.set("userId", ctx.userId);
		if (ctx.centerId !== undefined) c.set("centerId", ctx.centerId);
		if (ctx.membershipId !== undefined) c.set("membershipId", ctx.membershipId);
		await next();
	});
	mountGuidance(app);
	app.onError((err, c) => {
		const maybe = err as { status?: number; message?: string };
		if (err instanceof HTTPException || typeof maybe.status === "number") {
			const status = (maybe.status ?? 500) as 400 | 401 | 403 | 404 | 500;
			return c.json({ error: maybe.message ?? "Error" }, status);
		}
		return c.json({ error: "Internal server error" }, 500);
	});
	return app;
}

function progressRow(
	overrides: Partial<{
		id: string;
		centerId: string;
		membershipId: string;
		completedStepIds: string[];
		dismissedGuideIds: string[];
		lastOpenedGuideId: string | null;
		createdAt: Date;
		updatedAt: Date;
	}> = {},
) {
	return {
		id: "progress-1",
		centerId: "center-1",
		membershipId: "membership-1",
		completedStepIds: [],
		dismissedGuideIds: [],
		lastOpenedGuideId: null,
		createdAt: new Date("2026-04-20T10:00:00.000Z"),
		updatedAt: new Date("2026-04-21T10:00:00.000Z"),
		...overrides,
	};
}

function createUpsertDb(row: ReturnType<typeof progressRow>) {
	const returning = vi.fn().mockResolvedValue([row]);
	const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
	const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
	const insert = vi.fn().mockReturnValue({ values });
	const db = createMockDb({ insert });
	return { db, values, onConflictDoUpdate, returning };
}

describe("guidance progress routes", () => {
	it("returns saved progress for the active center and membership", async () => {
		const row = {
			id: "progress-1",
			centerId: "center-1",
			membershipId: "membership-1",
			completedStepIds: ["dashboard.start"],
			dismissedGuideIds: ["reports-help"],
			lastOpenedGuideId: "attendance-basics",
			createdAt: new Date("2026-04-20T10:00:00.000Z"),
			updatedAt: new Date("2026-04-21T10:00:00.000Z"),
		};
		const where = vi.fn().mockReturnValue({
			limit: vi.fn().mockResolvedValue([row]),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountGuidance, db);
		const res = await app.request("/api/guidance/progress");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { progress: { completedStepIds: string[] } };
		expect(body.progress.completedStepIds).toEqual(["dashboard.start"]);
		expect(where).toHaveBeenCalledOnce();
	});

	it("returns empty progress when the user has not started a guide", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountGuidance, db);
		const res = await app.request("/api/guidance/progress");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			progress: { centerId: string; membershipId: string; completedStepIds: string[] };
		};
		expect(body.progress.centerId).toBe("center-1");
		expect(body.progress.membershipId).toBe("membership-1");
		expect(body.progress.completedStepIds).toEqual([]);
	});

	it("creates progress on first patch without touching other memberships", async () => {
		const { db, values, onConflictDoUpdate } = createUpsertDb({
			...progressRow(),
			completedStepIds: ["attendance.check-in"],
			lastOpenedGuideId: "attendance-basics",
		});

		const app = createTestApp(mountGuidance, db);
		const res = await app.request(
			"/api/guidance/progress",
			patchBody({
				completeStepId: "attendance.check-in",
				lastOpenedGuideId: "attendance-basics",
			}),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { progress: { lastOpenedGuideId: string } };
		expect(body.progress.lastOpenedGuideId).toBe("attendance-basics");
		expect(db.insert).toHaveBeenCalledOnce();
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-1",
				membershipId: "membership-1",
				completedStepIds: ["attendance.check-in"],
				dismissedGuideIds: [],
			}),
		);
		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				target: expect.anything(),
				set: expect.objectContaining({
					completedStepIds: expect.anything(),
					dismissedGuideIds: expect.anything(),
				}),
			}),
		);
	});

	it("creates default step and guide arrays when the first patch omits them", async () => {
		const { db, values } = createUpsertDb({
			...progressRow(),
			dismissedGuideIds: ["welcome"],
		});

		const app = createTestApp(mountGuidance, db);
		const res = await app.request(
			"/api/guidance/progress",
			patchBody({
				dismissedGuideIds: ["welcome"],
			}),
		);

		expect(res.status).toBe(200);
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				completedStepIds: [],
				dismissedGuideIds: ["welcome"],
				lastOpenedGuideId: null,
			}),
		);
	});

	it("upserts progress with atomic add and remove operations", async () => {
		const { db, values, onConflictDoUpdate } = createUpsertDb({
			...progressRow(),
			completedStepIds: ["reports.download-pdf"],
			dismissedGuideIds: ["dashboard-start"],
		});

		const app = createTestApp(mountGuidance, db);
		const res = await app.request(
			"/api/guidance/progress",
			patchBody({
				completedStepIds: ["reports.download-pdf"],
				dismissedGuideIds: ["dashboard-start"],
				uncompleteStepId: "old-step",
				lastOpenedGuideId: null,
			}),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { progress: { completedStepIds: string[] } };
		expect(body.progress.completedStepIds).toEqual(["reports.download-pdf"]);
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				completedStepIds: ["reports.download-pdf"],
				dismissedGuideIds: ["dashboard-start"],
			}),
		);
		expect(onConflictDoUpdate).toHaveBeenCalledOnce();
		expect(db.update).not.toHaveBeenCalled();
	});

	it("uses the current center and membership when upserting progress", async () => {
		const { db, values } = createUpsertDb({
			...progressRow({
				centerId: "center-2",
				membershipId: "membership-2",
				dismissedGuideIds: ["reports-help"],
			}),
		});

		const app = createTestApp(mountGuidance, db, {
			centerId: "center-2",
			membershipId: "membership-2",
		});
		const res = await app.request(
			"/api/guidance/progress",
			patchBody({
				dismissedGuideIds: ["reports-help"],
			}),
		);

		expect(res.status).toBe(200);
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-2",
				membershipId: "membership-2",
				completedStepIds: [],
				dismissedGuideIds: ["reports-help"],
			}),
		);
	});

	it("rejects unauthenticated requests", async () => {
		const app = createContextApp(createMockDb(), {
			userId: "",
			centerId: "center-1",
			membershipId: "membership-1",
		});

		const res = await app.request("/api/guidance/progress");

		expect(res.status).toBe(401);
	});

	it("rejects requests without an active center", async () => {
		const app = createContextApp(createMockDb(), {
			userId: "user-1",
			centerId: "",
			membershipId: "membership-1",
		});

		const res = await app.request("/api/guidance/progress");

		expect(res.status).toBe(403);
	});

	it("rejects requests without a membership id", async () => {
		const app = createContextApp(createMockDb(), {
			userId: "user-1",
			centerId: "center-1",
		});

		const res = await app.request("/api/guidance/progress");

		expect(res.status).toBe(401);
	});
});
