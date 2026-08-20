import * as shared from "@pebbledesk/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody } from "../test/setup.js";

vi.mock("@pebbledesk/shared", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@pebbledesk/shared")>();
	return { ...actual, getStripePriceEnvKey: vi.fn(actual.getStripePriceEnvKey) };
});

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

const { subscriptionRoutes } = await import("./subscriptions.js");

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function mountSubscriptions(app: Hono<AppEnv>) {
	app.route("/api/subscriptions", subscriptionRoutes);
}

const BASE_ENV = {
	APP_URL: "https://app.example.com",
	STRIPE_SECRET_KEY: "sk_test_123",
	STRIPE_PRICE_HOME_MONTHLY: "price_home_monthly",
	STRIPE_PRICE_HOME_ANNUAL: "price_home_annual",
	STRIPE_PRICE_CENTER_STARTER_MONTHLY: "price_center_starter_monthly",
	STRIPE_PRICE_CENTER_STARTER_ANNUAL: "price_center_starter_annual",
	STRIPE_PRICE_CENTER_PRO_MONTHLY: "price_center_pro_monthly",
	STRIPE_PRICE_CENTER_PRO_ANNUAL: "price_center_pro_annual",
	STRIPE_PRICE_GROUP_MONTHLY: "price_group_monthly",
	STRIPE_PRICE_GROUP_ANNUAL: "price_group_annual",
	STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: "whsec_sub",
};

function centerSelect(value: Record<string, unknown> | null) {
	return vi.fn().mockReturnValueOnce({
		from: vi.fn().mockReturnValueOnce({
			where: vi.fn().mockReturnValueOnce({
				limit: vi.fn().mockResolvedValueOnce(value ? [value] : []),
			}),
		}),
	});
}

function successfulCenterCustomerUpdate() {
	return vi.fn().mockReturnValue({
		set: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: "center-1" }]),
			}),
		}),
	});
}

describe("subscriptions.checkout", () => {
	it("creates a checkout session for a new customer", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cus_1" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.test/s" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		let selectCall = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCall += 1;
				if (selectCall === 1) {
					return centerSelect({ id: "center-1", stripeCustomerId: null })();
				}
				return centerSelect({ id: "user-1", email: "a@b.co", name: "Angel" })();
			}),
			update: successfulCenterCustomerUpdate(),
		});

		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "home" }),
			BASE_ENV,
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ url: "https://checkout.test/s" });
		vi.unstubAllGlobals();
	});

	it("captures checkout start analytics with promo presence after session creation", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cus_1" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_test" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.test/s" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		let selectCall = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCall += 1;
				if (selectCall === 1) {
					return centerSelect({
						id: "center-1",
						stripeCustomerId: null,
						subscriptionStatus: "trialing",
					})();
				}
				return centerSelect({ id: "user-1", email: "a@b.co", name: "Angel" })();
			}),
			update: successfulCenterCustomerUpdate(),
		});

		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "center_starter", cadence: "annual", promoCode: "Y80OFF" }),
			{
				...BASE_ENV,
				POSTHOG_PROJECT_API_KEY: "phc_test",
				POSTHOG_HOST: "https://us.i.posthog.com",
			},
		);

		expect(res.status).toBe(200);
		const posthogBodies = fetchMock.mock.calls
			.filter(([url]) => String(url) === "https://us.i.posthog.com/capture/")
			.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
		expect(posthogBodies).toEqual([
			expect.objectContaining({
				event: "billing_checkout_started",
				distinct_id: expect.stringMatching(/^center:[a-f0-9]{64}$/),
				properties: expect.objectContaining({
					plan: "center_starter",
					cadence: "annual",
					subscription_status: "trialing",
					promo_present: true,
				}),
			}),
			expect.objectContaining({
				event: "checkout_started",
				distinct_id: expect.stringMatching(/^center:[a-f0-9]{64}$/),
				properties: expect.objectContaining({
					promo_present: true,
				}),
			}),
		]);
		expect(JSON.stringify(posthogBodies)).not.toContain("center-1");
		expect(JSON.stringify(posthogBodies)).not.toContain("user-1");
	});

	it("rejects non-owner callers", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubscriptions, db, { role: "director" });
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "home" }),
			BASE_ENV,
		);
		expect(res.status).toBe(403);
	});

	it("rejects missing plan (validation)", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/checkout", jsonBody({}), BASE_ENV);
		expect(res.status).toBe(400);
	});

	it("rejects enterprise plan", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "enterprise" }),
			BASE_ENV,
		);
		expect(res.status).toBe(400);
	});

	it("creates a checkout session for center_starter plan", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cus_2" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_2", url: "https://checkout.test/s" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		let selectCall = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCall += 1;
				if (selectCall === 1) {
					return centerSelect({ id: "center-1", stripeCustomerId: null })();
				}
				return centerSelect({ id: "user-1", email: "a@b.co", name: "Angel" })();
			}),
			update: successfulCenterCustomerUpdate(),
		});

		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "center_starter" }),
			BASE_ENV,
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ url: "https://checkout.test/s" });
		vi.unstubAllGlobals();
	});

	it("creates a checkout session for center_pro plan", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cus_3" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_3", url: "https://checkout.test/pro" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		let selectCall = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCall += 1;
				if (selectCall === 1) {
					return centerSelect({ id: "center-1", stripeCustomerId: null })();
				}
				return centerSelect({ id: "user-1", email: "a@b.co", name: "Angel" })();
			}),
			update: successfulCenterCustomerUpdate(),
		});

		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "center_pro" }),
			BASE_ENV,
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ url: "https://checkout.test/pro" });

		// Verify the correct Stripe price ID was sent for center_pro (Stripe uses form-encoded)
		const checkoutBody = new URLSearchParams(fetchMock.mock.calls[2][1].body as string);
		expect(checkoutBody.get("line_items[0][price]")).toBe(BASE_ENV.STRIPE_PRICE_CENTER_PRO_ANNUAL);

		vi.unstubAllGlobals();
	});

	it("creates a checkout session for group plan", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cus_group" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_group", url: "https://checkout.test/group" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		let selectCall = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCall += 1;
				if (selectCall === 1) {
					return centerSelect({ id: "center-1", stripeCustomerId: null })();
				}
				return centerSelect({ id: "user-1", email: "a@b.co", name: "Angel" })();
			}),
			update: successfulCenterCustomerUpdate(),
		});
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "group" }),
			BASE_ENV,
		);
		expect(res.status).toBe(200);
		const checkoutBody = new URLSearchParams(fetchMock.mock.calls[2][1].body as string);
		expect(checkoutBody.get("line_items[0][price]")).toBe(BASE_ENV.STRIPE_PRICE_GROUP_ANNUAL);
		vi.unstubAllGlobals();
	});

	it("404s when center is missing", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "home" }),
			BASE_ENV,
		);
		expect(res.status).toBe(404);
	});

	it("404s when owner user is missing", async () => {
		let selectCall = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCall += 1;
				if (selectCall === 1) {
					return centerSelect({ id: "center-1", stripeCustomerId: "cus_existing" })();
				}
				return centerSelect(null)();
			}),
		});
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "home" }),
			BASE_ENV,
		);
		expect(res.status).toBe(404);
	});

	it("400s when stripe price env is missing", async () => {
		let selectCall = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCall += 1;
				if (selectCall === 1) {
					return centerSelect({ id: "center-1", stripeCustomerId: "cus_existing" })();
				}
				return centerSelect({ id: "user-1", email: "a@b.co", name: "Angel" })();
			}),
		});
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/checkout", jsonBody({ plan: "home" }), {
			...BASE_ENV,
			STRIPE_PRICE_HOME_ANNUAL: "",
		});
		expect(res.status).toBe(400);
	});

	it("400s when plan is not available for self-serve checkout", async () => {
		vi.mocked(shared.getStripePriceEnvKey).mockReturnValueOnce(null);
		const app = createTestApp(mountSubscriptions, createMockDb());
		const res = await app.request(
			"/api/subscriptions/checkout",
			jsonBody({ plan: "home" }),
			BASE_ENV,
		);
		expect(res.status).toBe(400);
	});
});

describe("subscriptions.portal", () => {
	it("creates a portal session when customer exists", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ url: "https://portal.test/s" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([{ id: "center-1", stripeCustomerId: "cus_1" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/portal", { method: "POST" }, BASE_ENV);
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ url: "https://portal.test/s" });
		vi.unstubAllGlobals();
	});

	it("400s when there is no Stripe customer on file", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([{ id: "center-1", stripeCustomerId: null }]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/portal", { method: "POST" }, BASE_ENV);
		expect(res.status).toBe(400);
	});

	it("404s when the center is missing", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/portal", { method: "POST" }, BASE_ENV);
		expect(res.status).toBe(404);
	});

	it("rejects non-owners", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubscriptions, db, { role: "staff" });
		const res = await app.request("/api/subscriptions/portal", { method: "POST" }, BASE_ENV);
		expect(res.status).toBe(403);
	});
});

describe("subscriptions.status", () => {
	it("returns subscription fields from the centers row", async () => {
		const trialEnds = new Date("2026-05-01T00:00:00.000Z");
		const periodEnd = new Date("2026-06-01T00:00:00.000Z");
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([
							{
								id: "center-1",
								stripeCustomerId: "cus_1",
								subscriptionStatus: "trialing",
								subscriptionPlan: "home",
								trialEndsAt: trialEnds,
								currentPeriodEnd: periodEnd,
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/status", { method: "GET" }, BASE_ENV);
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			subscriptionStatus: "trialing",
			subscriptionPlan: "home",
			trialEndsAt: trialEnds.toISOString(),
			currentPeriodEnd: periodEnd.toISOString(),
			stripeCustomerId: true,
		});
	});

	it("404s when the center is missing", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockReturnValueOnce({
						limit: vi.fn().mockResolvedValueOnce([]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/status", { method: "GET" }, BASE_ENV);
		expect(res.status).toBe(404);
	});
});

describe("GET /subscriptions/trial-usage", () => {
	it("returns used features for the center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi
						.fn()
						.mockResolvedValueOnce([{ feature: "subsidies" }, { feature: "quickbooks" }]),
				}),
			}),
		});

		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/trial-usage", { method: "GET" }, BASE_ENV);
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			usedFeatures: ["subsidies", "quickbooks"],
		});
	});

	it("returns empty array when no features have been used", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValueOnce({
					where: vi.fn().mockResolvedValueOnce([]),
				}),
			}),
		});

		const app = createTestApp(mountSubscriptions, db);
		const res = await app.request("/api/subscriptions/trial-usage", { method: "GET" }, BASE_ENV);
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ usedFeatures: [] });
	});
});
