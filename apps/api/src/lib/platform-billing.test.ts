import { describe, expect, it, vi } from "vitest";
import {
	createBillingPortalSession,
	createOrGetPlatformCustomer,
	createSubscriptionCheckoutSession,
	mapStripeSubscriptionStatus,
	parseStripeJsonResponse,
	resolvePromotionCode,
	verifyPlatformWebhookSignature,
} from "./platform-billing.js";
import { createStripeWebhookSignature } from "./public-billing.js";

type UpdateChain = {
	update: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

function buildUpdateMock(
	updatedRows: Array<Record<string, unknown>> = [{ id: "c_1" }],
): UpdateChain {
	const returning = vi.fn().mockResolvedValue(updatedRows);
	const where = vi.fn().mockReturnValue({ returning });
	const set = vi.fn().mockReturnValue({ where });
	const update = vi.fn().mockReturnValue({ set });
	return { update, set, where, returning };
}

describe("mapStripeSubscriptionStatus", () => {
	it.each([
		["trialing", "trialing"],
		["active", "active"],
		["past_due", "past_due"],
		["paused", "canceled"],
		["canceled", "canceled"],
		["unpaid", "unpaid"],
		["incomplete", "incomplete"],
		["incomplete_expired", "incomplete_expired"],
		["totally_unknown", "incomplete"],
		["", "incomplete"],
	])("maps %s -> %s", (stripe, expected) => {
		expect(mapStripeSubscriptionStatus(stripe)).toBe(expected);
	});
});

describe("verifyPlatformWebhookSignature", () => {
	it("accepts a valid signature", () => {
		const payload = JSON.stringify({ type: "customer.subscription.updated" });
		const signature = createStripeWebhookSignature(payload, "whsec_platform");
		expect(verifyPlatformWebhookSignature(payload, signature, "whsec_platform")).toBe(true);
	});

	it("rejects a null signature header", () => {
		expect(verifyPlatformWebhookSignature("{}", null, "whsec_platform")).toBe(false);
	});

	it("rejects a signature signed with the wrong secret", () => {
		const payload = JSON.stringify({ type: "customer.subscription.updated" });
		const signature = createStripeWebhookSignature(payload, "whsec_other");
		expect(verifyPlatformWebhookSignature(payload, signature, "whsec_platform")).toBe(false);
	});
});

describe("parseStripeJsonResponse", () => {
	it("parses ok JSON responses with nested fields", async () => {
		const res = new Response(
			JSON.stringify({ id: "acct_123", url: "https://test", nested: { a: 1 } }),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
		await expect(
			parseStripeJsonResponse<{ id: string; url: string; nested: { a: number } }>(res),
		).resolves.toEqual({
			id: "acct_123",
			url: "https://test",
			nested: { a: 1 },
		});
	});

	it("throws on non-ok responses with body text", async () => {
		const res = new Response("boom", { status: 400 });
		await expect(parseStripeJsonResponse(res)).rejects.toThrow("Stripe request failed: boom");
	});
});

describe("createOrGetPlatformCustomer", () => {
	it("returns existing id without calling Stripe", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const mock = buildUpdateMock();

		const id = await createOrGetPlatformCustomer({
			env: { STRIPE_SECRET_KEY: "sk_test_1" },
			db: { update: mock.update } as never,
			center: { id: "c_1", stripeCustomerId: "cus_exist" },
			ownerEmail: "a@b.co",
			ownerName: "A",
		});

		expect(id).toBe("cus_exist");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mock.update).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("creates a new Stripe customer and persists the id", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ id: "cus_new" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const mock = buildUpdateMock();

		const id = await createOrGetPlatformCustomer({
			env: { STRIPE_SECRET_KEY: "sk_test_1" },
			db: { update: mock.update } as never,
			center: { id: "c_1", stripeCustomerId: null },
			ownerEmail: "a@b.co",
			ownerName: "Angel",
		});

		expect(id).toBe("cus_new");
		expect(fetchMock).toHaveBeenCalledOnce();
		const call = fetchMock.mock.calls[0];
		expect(call[0]).toBe("https://api.stripe.com/v1/customers");
		const body = (call[1].body as URLSearchParams).toString();
		expect(body).toContain("email=a%40b.co");
		expect(body).toContain("metadata%5BcenterId%5D=c_1");
		expect(mock.set).toHaveBeenCalledWith(expect.objectContaining({ stripeCustomerId: "cus_new" }));
		expect(mock.returning).toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("returns a concurrently persisted customer id when the guarded update loses the race", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cus_orphan" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		const mock = buildUpdateMock([]);
		const db = {
			update: mock.update,
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ stripeCustomerId: "cus_winner" }]),
					}),
				}),
			}),
		};

		const id = await createOrGetPlatformCustomer({
			env: { STRIPE_SECRET_KEY: "sk_test_1" },
			db: db as never,
			center: { id: "c_1", stripeCustomerId: null },
			ownerEmail: "a@b.co",
			ownerName: "A",
		});

		expect(id).toBe("cus_winner");
		vi.unstubAllGlobals();
	});

	it("throws when the guarded update loses the race and no customer id exists", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cus_orphan" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		const mock = buildUpdateMock([]);
		const db = {
			update: mock.update,
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ stripeCustomerId: null }]),
					}),
				}),
			}),
		};

		await expect(
			createOrGetPlatformCustomer({
				env: { STRIPE_SECRET_KEY: "sk_test_1" },
				db: db as never,
				center: { id: "c_1", stripeCustomerId: null },
				ownerEmail: "a@b.co",
				ownerName: "A",
			}),
		).rejects.toThrow("Center customer state changed before Stripe customer could be saved");
		vi.unstubAllGlobals();
	});

	it("throws if Stripe response omits an id", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ something: "else" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		const mock = buildUpdateMock();
		await expect(
			createOrGetPlatformCustomer({
				env: { STRIPE_SECRET_KEY: "sk_test_1" },
				db: { update: mock.update } as never,
				center: { id: "c_1", stripeCustomerId: null },
				ownerEmail: "a@b.co",
				ownerName: "A",
			}),
		).rejects.toThrow("Failed to create Stripe customer");
		vi.unstubAllGlobals();
	});
});

describe("resolvePromotionCode", () => {
	it("returns the promotion code id when Stripe finds a matching promotion", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_1", coupon: { id: "coup_1" } }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		await expect(
			resolvePromotionCode({ env: { STRIPE_SECRET_KEY: "sk_test_1" }, code: "Y80OFF" }),
		).resolves.toBe("promo_1");
		vi.unstubAllGlobals();
	});

	it("returns null when no promotion matches", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		await expect(
			resolvePromotionCode({ env: { STRIPE_SECRET_KEY: "sk_test_1" }, code: "NADA" }),
		).resolves.toBeNull();
		vi.unstubAllGlobals();
	});

	it("returns null when Stripe omits promotion data", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ object: "list" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		await expect(
			resolvePromotionCode({ env: { STRIPE_SECRET_KEY: "sk_test_1" }, code: "EMPTY" }),
		).resolves.toBeNull();
		vi.unstubAllGlobals();
	});

	it("throws on non-OK responses", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("bad", { status: 400 })));
		await expect(
			resolvePromotionCode({ env: { STRIPE_SECRET_KEY: "sk_test_1" }, code: "BAD" }),
		).rejects.toThrow("Stripe promotion lookup failed: bad");
		vi.unstubAllGlobals();
	});
});

describe("createSubscriptionCheckoutSession", () => {
	const baseEnv = {
		STRIPE_SECRET_KEY: "sk_test_1",
		APP_URL: "https://app.example.com",
		STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: "whsec_sub",
	};

	it("creates an annual checkout session with Y80OFF applied when no manual promo is provided", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.test/session" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const result = await createSubscriptionCheckoutSession({
			env: baseEnv,
			customerId: "cus_1",
			priceId: "price_home",
			plan: "home",
			cadence: "annual",
			centerId: "center-1",
		});

		expect(result).toEqual({ id: "cs_1", url: "https://checkout.test/session" });
		expect(fetchMock.mock.calls[0][0]).toContain("code=Y80OFF");
		const body = (fetchMock.mock.calls[1][1].body as URLSearchParams).toString();
		expect(body).toContain("mode=subscription");
		expect(body).toContain("customer=cus_1");
		expect(body).toContain("line_items%5B0%5D%5Bprice%5D=price_home");
		expect(body).toContain("subscription_data%5Btrial_period_days%5D=30");
		expect(body).toContain("payment_method_collection=if_required");
		expect(body).toContain("metadata%5Bcadence%5D=annual");
		expect(body).toContain("discounts%5B0%5D%5Bpromotion_code%5D=promo_y80off");
		expect(body).toContain("client_reference_id=center-1");
		expect(body).toContain("metadata%5Bplan%5D=home");
		expect(body).not.toContain("allow_promotion_codes=true");
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("auto-applies M80OFF for monthly checkout while the limited offer is active", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-31T12:00:00.000Z"));
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_m80off" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_launch", url: "https://checkout.test/launch" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const result = await createSubscriptionCheckoutSession({
			env: baseEnv,
			customerId: "cus_1",
			priceId: "price_home",
			plan: "home",
			cadence: "monthly",
			centerId: "center-1",
		});

		expect(result.url).toBe("https://checkout.test/launch");
		expect(fetchMock.mock.calls[0][0]).toContain("code=M80OFF");
		const body = (fetchMock.mock.calls[1][1].body as URLSearchParams).toString();
		expect(body).toContain("metadata%5Bcadence%5D=monthly");
		expect(body).toContain("discounts%5B0%5D%5Bpromotion_code%5D=promo_m80off");
		expect(body).not.toContain("allow_promotion_codes=true");
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("attaches a resolved promotion code when promoCode is provided and omits allow_promotion_codes", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_x" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_2", url: "https://checkout.test/promo" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const result = await createSubscriptionCheckoutSession({
			env: baseEnv,
			customerId: "cus_1",
			priceId: "price_center",
			plan: "center_starter",
			cadence: "monthly",
			centerId: "center-1",
			promoCode: "PARTNER30",
		});

		expect(result.url).toBe("https://checkout.test/promo");
		const body = (fetchMock.mock.calls[1][1].body as URLSearchParams).toString();
		expect(body).toContain("discounts%5B0%5D%5Bpromotion_code%5D=promo_x");
		expect(body).not.toContain("allow_promotion_codes=true");
		vi.unstubAllGlobals();
	});

	it("normalizes annual limited offer code to the monthly code for monthly checkout", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_m80off" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_monthly", url: "https://checkout.test/monthly" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await createSubscriptionCheckoutSession({
			env: baseEnv,
			customerId: "cus_1",
			priceId: "price_center",
			plan: "center_starter",
			cadence: "monthly",
			centerId: "center-1",
			promoCode: "Y80OFF",
		});

		expect(fetchMock.mock.calls[0][0]).toContain("code=M80OFF");
		expect(fetchMock.mock.calls[0][0]).not.toContain("code=Y80OFF");
		const body = (fetchMock.mock.calls[1][1].body as URLSearchParams).toString();
		expect(body).toContain("discounts%5B0%5D%5Bpromotion_code%5D=promo_m80off");
		vi.unstubAllGlobals();
	});

	it("normalizes monthly limited offer code to the annual code for annual checkout", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "cs_annual", url: "https://checkout.test/annual" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await createSubscriptionCheckoutSession({
			env: baseEnv,
			customerId: "cus_1",
			priceId: "price_center",
			plan: "center_starter",
			cadence: "annual",
			centerId: "center-1",
			promoCode: "M80OFF",
		});

		expect(fetchMock.mock.calls[0][0]).toContain("code=Y80OFF");
		expect(fetchMock.mock.calls[0][0]).not.toContain("code=M80OFF");
		const body = (fetchMock.mock.calls[1][1].body as URLSearchParams).toString();
		expect(body).toContain("discounts%5B0%5D%5Bpromotion_code%5D=promo_y80off");
		vi.unstubAllGlobals();
	});

	it("throws when the promo code does not resolve", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createSubscriptionCheckoutSession({
				env: baseEnv,
				customerId: "cus_1",
				priceId: "price_center",
				plan: "center_starter",
				cadence: "annual",
				centerId: "center-1",
				promoCode: "NOPE",
			}),
		).rejects.toThrow("Promotion code not found: NOPE");
		vi.unstubAllGlobals();
	});

	it("throws if Stripe returns no url/id", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ other: 1 }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				),
		);
		await expect(
			createSubscriptionCheckoutSession({
				env: baseEnv,
				customerId: "cus_1",
				priceId: "price_home",
				plan: "home",
				cadence: "annual",
				centerId: "center-1",
			}),
		).rejects.toThrow("Stripe did not return a checkout session URL");
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("throws with Stripe body text when checkout session creation fails", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ data: [{ id: "promo_y80off" }] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				)
				.mockResolvedValueOnce(new Response("bad checkout", { status: 402 })),
		);

		await expect(
			createSubscriptionCheckoutSession({
				env: baseEnv,
				customerId: "cus_1",
				priceId: "price_home",
				plan: "home",
				cadence: "annual",
				centerId: "center-1",
			}),
		).rejects.toThrow("Stripe request failed: bad checkout");
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
});

describe("createBillingPortalSession", () => {
	it("calls Stripe and returns the url", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ url: "https://portal.test/s" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createBillingPortalSession({
				env: { STRIPE_SECRET_KEY: "sk_test_1" },
				customerId: "cus_1",
				returnUrl: "https://app.example.com/billing",
			}),
		).resolves.toEqual({ url: "https://portal.test/s" });

		const body = (fetchMock.mock.calls[0][1].body as URLSearchParams).toString();
		expect(body).toContain("customer=cus_1");
		expect(body).toContain("return_url=https%3A%2F%2Fapp.example.com%2Fbilling");
		vi.unstubAllGlobals();
	});

	it("throws if Stripe does not return a url", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ other: 1 }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		await expect(
			createBillingPortalSession({
				env: { STRIPE_SECRET_KEY: "sk_test_1" },
				customerId: "cus_1",
				returnUrl: "https://app.example.com/billing",
			}),
		).rejects.toThrow("Stripe did not return a billing portal URL");
		vi.unstubAllGlobals();
	});

	it("throws with Stripe body text when portal session creation fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(new Response("bad portal", { status: 400 })),
		);

		await expect(
			createBillingPortalSession({
				env: { STRIPE_SECRET_KEY: "sk_test_1" },
				customerId: "cus_1",
				returnUrl: "https://app.example.com/billing",
			}),
		).rejects.toThrow("Stripe request failed: bad portal");
		vi.unstubAllGlobals();
	});
});
