import type { PlanFeature, SubscriptionPlan } from "@pebbledesk/shared";
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp } from "../test/setup.js";
import { requireEntitlement, requirePlan } from "./plan.js";

function buildTrialDb(insertMock = vi.fn()) {
	return createMockDb({
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi
						.fn()
						.mockResolvedValue([{ subscriptionPlan: "trial", subscriptionStatus: "trialing" }]),
				}),
			}),
		}),
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockReturnValue({
				onConflictDoNothing: insertMock.mockReturnValue(Promise.resolve()),
			}),
		}),
	});
}

function mountPlanMiddleware(plans: SubscriptionPlan[]) {
	return (app: Hono<AppEnv>) => {
		app.get("/protected", requirePlan(...plans), (c) => c.json({ ok: true }));
	};
}

function mountEntitlementMiddleware(feature: PlanFeature) {
	return (app: Hono<AppEnv>) => {
		app.get("/protected", requireEntitlement(feature), (c) => c.json({ ok: true }));
	};
}

describe("requirePlan", () => {
	it("allows request when center is on an allowed plan", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ subscriptionPlan: "center_starter", subscriptionStatus: "active" },
							]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountPlanMiddleware(["center_starter", "enterprise"]), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("returns 403 when center is on a disallowed plan", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ subscriptionPlan: "home", subscriptionStatus: "active" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountPlanMiddleware(["center_starter", "enterprise"]), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("returns 403 when centerId is missing from context", async () => {
		const db = createMockDb();

		// Override centerId to empty string to simulate missing context
		const app = createTestApp(mountPlanMiddleware(["home"]), db, {
			centerId: "",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("returns 403 when subscriptionPlan is null", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ subscriptionPlan: null, subscriptionStatus: "active" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountPlanMiddleware(["home", "center_starter", "enterprise"]), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("returns 403 when center is not found in the database", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountPlanMiddleware(["home"]), db, {
			centerId: "center-missing",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("allows request for each of multiple allowed plans individually", async () => {
		for (const plan of ["home", "center_starter", "enterprise"] as const) {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ subscriptionPlan: plan, subscriptionStatus: "active" }]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountPlanMiddleware(["home", "center_starter", "enterprise"]), db, {
				centerId: "center-1",
			});

			const res = await app.request("/protected");
			expect(res.status).toBe(200);
		}
	});

	it("blocks plans not in the allowed list when multiple plans are specified", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ subscriptionPlan: "home", subscriptionStatus: "active" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountPlanMiddleware(["center_starter", "enterprise"]), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("blocks selected paid-plan trials from explicit plan gates above their plan", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ subscriptionPlan: "home", subscriptionStatus: "trialing" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountPlanMiddleware(["center_starter", "enterprise"]), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("allows legacy full-access trial plan through explicit paid-plan gates", async () => {
		const db = buildTrialDb();
		const app = createTestApp(mountPlanMiddleware(["center_starter", "enterprise"]), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(200);
	});

	it("blocks a matching plan when the subscription status is not service-allowed", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ subscriptionPlan: "center_starter", subscriptionStatus: "incomplete" },
							]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountPlanMiddleware(["center_starter"]), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("allows entitlement access when the plan includes the feature and status is past_due", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ subscriptionPlan: "center_starter", subscriptionStatus: "past_due" },
							]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountEntitlementMiddleware("subsidies"), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(200);
	});

	it("blocks entitlement access when the plan does not include the feature", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ subscriptionPlan: "home", subscriptionStatus: "active" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountEntitlementMiddleware("quickbooks"), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("blocks selected paid-plan trials from feature gates their plan lacks", async () => {
		const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ subscriptionPlan: "home", subscriptionStatus: "trialing" }]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing,
				}),
			}),
		});

		const app = createTestApp(mountEntitlementMiddleware("quickbooks"), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("allows selected paid-plan trials through feature gates their plan includes", async () => {
		const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ subscriptionPlan: "center_starter", subscriptionStatus: "trialing" },
							]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing,
				}),
			}),
		});

		const app = createTestApp(mountEntitlementMiddleware("subsidies"), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(200);
		expect(db.insert).toHaveBeenCalled();
	});

	it("blocks public payment links on the Home plan", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ subscriptionPlan: "home", subscriptionStatus: "active" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountEntitlementMiddleware("public_payment_links"), db, {
			centerId: "center-1",
		});

		const res = await app.request("/protected");
		expect(res.status).toBe(403);
	});

	it("allows all features on the trial plan", async () => {
		const db = buildTrialDb();
		const app = createTestApp(mountEntitlementMiddleware("quickbooks"), db, {
			centerId: "center-1",
		});
		const res = await app.request("/protected");
		expect(res.status).toBe(200);
	});

	it("records feature usage when on trial plan", async () => {
		const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
		const db = buildTrialDb(onConflictDoNothing);
		const app = createTestApp(mountEntitlementMiddleware("subsidies"), db, {
			centerId: "center-1",
		});
		await app.request("/protected");
		expect(db.insert).toHaveBeenCalled();
	});

	it("does not record feature usage for non-trial plans", async () => {
		const insertMock = vi.fn();
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ subscriptionPlan: "center_pro", subscriptionStatus: "active" },
							]),
					}),
				}),
			}),
			insert: insertMock,
		});

		const app = createTestApp(mountEntitlementMiddleware("quickbooks"), db, {
			centerId: "center-1",
		});
		await app.request("/protected");
		expect(insertMock).not.toHaveBeenCalled();
	});
});
