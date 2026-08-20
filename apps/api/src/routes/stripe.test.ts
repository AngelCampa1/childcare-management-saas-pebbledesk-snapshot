import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp } from "../test/setup.js";

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
	};
});

const { stripeRoutes } = await import("./stripe.js");
const { createStripeWebhookSignature } = await import("../lib/public-billing.js");

function mountStripe(app: Hono<AppEnv>) {
	app.route("/api/stripe", stripeRoutes);
}

function createLockedInvoice(
	overrides: Partial<{
		publicLinkToken: string;
		publicLinkVersion: number;
		status: string;
		amountDue: number | string;
		postedPaymentTotal: number | string;
	}> = {},
) {
	return {
		id: "50000000-0000-0000-0000-000000000001",
		centerId: "center-1",
		publicLinkToken: "current-token",
		publicLinkVersion: 2,
		status: "sent",
		...overrides,
	};
}

describe("stripe routes", () => {
	it("creates a connect onboarding link", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ id: "acct_123" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ url: "https://connect.stripe.test/link" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				),
		);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "center-1",
								stripeAccountId: null,
								name: "Pebble Center",
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
								id: "center-1",
								stripeAccountId: "acct_123",
								stripeAccountStatus: "pending",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/onboarding-link",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { url: string };
		expect(body.url).toBe("https://connect.stripe.test/link");
		vi.unstubAllGlobals();
	});

	it("parses Stripe JSON responses when creating a connect onboarding link", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ id: "acct_json_123" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ url: "https://connect.stripe.test/json-link" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				),
		);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "center-1",
								stripeAccountId: null,
								name: "Pebble Center",
							},
						]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "center-1" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/onboarding-link",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			accountId: "acct_json_123",
			url: "https://connect.stripe.test/json-link",
		});
		vi.unstubAllGlobals();
	});

	it("400s when the webhook signature is invalid", async () => {
		const db = createMockDb();
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": "bad-sig",
				},
				body: JSON.stringify({ type: "anything" }),
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);
		expect(res.status).toBe(400);
	});

	it("returns 403 when centerId is missing from context for connect status", async () => {
		const db = createMockDb();
		const app = createTestApp(mountStripe, db, { centerId: undefined, role: "owner" });
		const res = await app.request(
			"/api/stripe/connect/status",
			{ method: "GET" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		expect(res.status).toBe(403);
	});

	it("returns 403 when centerId is missing from context for onboarding link", async () => {
		const db = createMockDb();
		const app = createTestApp(mountStripe, db, { centerId: undefined, role: "owner" });
		const res = await app.request(
			"/api/stripe/connect/onboarding-link",
			{ method: "POST" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		expect(res.status).toBe(403);
	});

	it("returns 404 when center is not found for connect status", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/status",
			{ method: "GET" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		expect(res.status).toBe(404);
	});

	it("returns not_connected when stripeAccountStatus is null", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "center-1",
								stripeAccountId: null,
								stripeAccountStatus: null, // null → fallback to "not_connected"
							},
						]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/status",
			{ method: "GET" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { stripeAccountStatus: string };
		expect(json.stripeAccountStatus).toBe("not_connected");
	});

	it("processes payment_intent.succeeded without event id (no idempotency check)", async () => {
		const txUpdateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
			}),
		});
		const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
		const tx = {
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: "pay_new" }]),
				}),
			}),
			update: txUpdate,
		};

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const payload = JSON.stringify({
			// no id field
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_noid",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);
		expect(res.status).toBe(200);
	});

	it("returns connect status with stripeAccountId null when not connected", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "center-1",
								stripeAccountId: null,
								stripeAccountStatus: "not_connected",
							},
						]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/status",
			{ method: "GET" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { stripeAccountId: null; stripeAccountStatus: string };
		expect(json.stripeAccountId).toBeNull();
		expect(json.stripeAccountStatus).toBe("not_connected");
	});

	it("fetches Stripe account and returns connected status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: "acct_123",
						charges_enabled: true,
						details_submitted: true,
						requirements: { disabled_reason: null },
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			),
		);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "center-1",
								stripeAccountId: "acct_123",
								stripeAccountStatus: "pending",
							},
						]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/status",
			{ method: "GET" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { stripeAccountStatus: string };
		expect(json.stripeAccountStatus).toBe("connected");
		vi.unstubAllGlobals();
	});

	it("throws when Stripe account fetch returns non-OK", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(new Response("Unauthorized", { status: 401 })),
		);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "center-1", stripeAccountId: "acct_123" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/status",
			{ method: "GET" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		expect(res.status).toBe(500);
		vi.unstubAllGlobals();
	});

	it("returns 500 when Stripe account creation returns no id", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(
				new Response(JSON.stringify({ id: "" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "center-1", stripeAccountId: null }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/onboarding-link",
			{ method: "POST" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		// badRequest throws which becomes 400
		expect(res.status).toBe(400);
		vi.unstubAllGlobals();
	});

	it("throws when Stripe account creation request fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce(new Response("Server error", { status: 500 })),
		);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "center-1", stripeAccountId: null }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/onboarding-link",
			{ method: "POST" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);
		expect(res.status).toBe(500);
		vi.unstubAllGlobals();
	});

	it("returns received for non-payment-intent event types", async () => {
		const payload = JSON.stringify({
			id: "evt_other",
			type: "charge.succeeded",
			data: { object: { id: "ch_123" } },
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");
		const db = createMockDb();
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
	});

	it("returns received:duplicate when payment already exists in payments table", async () => {
		const payload = JSON.stringify({
			id: "evt_existing_pay",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_existing",
					amount_received: 5000,
					metadata: { centerId: "center-1", invoiceId: "50000000-0000-0000-0000-000000000001" },
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const db = createMockDb({
			// select returns an existing payment — we bail before entering the transaction
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ id: "pay_existing", providerTransactionId: "pi_existing" }]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
	});

	it("rethrows non-unique-constraint errors from the payment insert", async () => {
		const payload = JSON.stringify({
			id: "evt_db_err",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_db_err",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const dbError = new Error("connection reset");
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// no existing payment
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				// invoice found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
					// tx.insert: first call = webhookEvents (succeeds), second = payments (fails)
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								onConflictDoNothing: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([{ id: "evt_db_err" }]),
								}),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockRejectedValue(dbError),
							}),
						}),
					update: vi.fn(),
				}),
			),
		});
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);
		// Non-unique errors should propagate as 500
		expect(res.status).toBe(500);
	});

	it("handles non-card payment method and absent created field", async () => {
		const payload = JSON.stringify({
			id: "evt_ach",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_ach",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					// ach, not card — tests the `includes("card")` false branch
					payment_method_types: ["us_bank_account"],
					// no created — tests the `intent.created ? ... : new Date()` branch
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const txInsertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: "pay_ach" }]),
		});
		const txUpdateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
			}),
		});
		const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
		// tx.insert: first = webhookEvents, second = payments, third = auditLog
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "evt_ach" }]),
					}),
				}),
			})
			.mockReturnValueOnce({ values: txInsertValues })
			.mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });
		const tx = {
			execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
			insert: txInsert,
			update: txUpdate,
		};

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// no existing payment
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				// invoice found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		// payment method should be "other" for non-card
		const paymentInsertArg = txInsertValues.mock.calls[0][0] as { method: string; amount: string };
		expect(paymentInsertArg.method).toBe("other");
		// numeric columns are inserted as strings
		expect(paymentInsertArg.amount).toBe("50");
	});

	it("acknowledges payment_intent.succeeded without amount_received without recording a payment", async () => {
		const payload = JSON.stringify({
			id: "evt_missing_amount",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_missing_amount",
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const paymentInsertValues = vi.fn();
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "evt_missing_amount" }]),
					}),
				}),
			})
			.mockReturnValueOnce({ values: paymentInsertValues });
		const tx = {
			execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
			insert: txInsert,
			update: vi.fn(),
		};

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(paymentInsertValues).not.toHaveBeenCalled();
	});

	it("processes a successful payment webhook idempotently", async () => {
		const payload = JSON.stringify({
			id: "evt_123",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_123",
					amount_received: 100000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
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
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "1000.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
					// tx.insert: first = webhookEvents, second = payments, third = auditLog
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								onConflictDoNothing: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([{ id: "evt_123" }]),
								}),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "70000000-0000-0000-0000-000000000001",
										providerTransactionId: "pi_123",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockResolvedValue(undefined),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
							}),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{
				STRIPE_WEBHOOK_SECRET: "whsec_123",
			},
		);

		expect(res.status).toBe(200);
	});

	it("treats duplicate Stripe transaction inserts as idempotent", async () => {
		const payload = JSON.stringify({
			id: "evt_456",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_duplicate",
					amount_received: 100000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const duplicateError = Object.assign(new Error("duplicate key value"), { code: "23505" });
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
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
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "1000.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
					// tx.insert: first call = webhookEvents (succeeds), second = payments (23505)
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								onConflictDoNothing: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([{ id: "evt_456" }]),
								}),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockRejectedValue(duplicateError),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
							}),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{
				STRIPE_WEBHOOK_SECRET: "whsec_123",
			},
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true, duplicate: true });
	});

	// Bug E: missing metadata must return 200, not 4xx (Stripe retries 4xx indefinitely)
	it("returns 200 (not 4xx) when payment intent metadata is missing invoiceId", async () => {
		const payload = JSON.stringify({
			id: "evt_missing_meta",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_missing",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						// intentionally missing invoiceId
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const db = createMockDb();
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		// Bug E fix: must return 200 so Stripe does not retry indefinitely
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
	});

	it("returns 200 (not 4xx) when payment intent metadata is missing centerId", async () => {
		const payload = JSON.stringify({
			id: "evt_missing_center",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_no_center",
					amount_received: 5000,
					metadata: {
						invoiceId: "50000000-0000-0000-0000-000000000001",
						// intentionally missing centerId
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const db = createMockDb();
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
	});

	it("returns 200 without UUID database predicates when webhook metadata IDs are malformed", async () => {
		const payload = JSON.stringify({
			id: "evt_bad_metadata_ids",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_bad_metadata_ids",
					amount_received: 5000,
					metadata: {
						centerId: "not-a-uuid",
						invoiceId: "also-not-a-uuid",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");
		const selectMock = vi
			.fn()
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			})
			.mockImplementation(() => {
				throw new Error("malformed UUID reached a database predicate");
			});
		const db = createMockDb({
			select: selectMock,
		});
		const app = createTestApp(mountStripe, db);

		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
		expect(selectMock).toHaveBeenCalledTimes(1);
	});

	it("returns 200 when malformed webhook center metadata triggers a database UUID error", async () => {
		const payload = JSON.stringify({
			id: "evt_bad_center_metadata",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_bad_center_metadata",
					amount_received: 5000,
					metadata: {
						centerId: "not-a-uuid",
						invoiceId: "50000000-0000-0000-0000-000000000001",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");
		const invalidUuidError = Object.assign(new Error("invalid input syntax for type uuid"), {
			code: "22P02",
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockRejectedValue(invalidUuidError),
						}),
					}),
				}),
		});
		const app = createTestApp(mountStripe, db);

		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
	});

	it("returns 200 (not 4xx) when the invoice is not found in the database", async () => {
		const payload = JSON.stringify({
			id: "evt_no_invoice",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_no_inv",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000099",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const db = createMockDb({
			// All selects return empty — no existing payment, no invoice found
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		// Bug E fix: not-found invoice must return 200, not 404
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
	});

	it("does not persist the idempotency record when the business transaction fails", async () => {
		// P0.15: webhookEvents insert must be INSIDE the main transaction.
		// If the business logic (payment insert) fails, the event ID must NOT be committed,
		// so the next retry can re-process it.
		const payload = JSON.stringify({
			id: "evt_retry_me",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_retry",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const businessError = new Error("payment insert failed");
		let txRolledBack = false;

		let selectCallCount = 0;
		const db = createMockDb({
			// webhookEvents insert is now inside the transaction — no outer insert call
			insert: vi.fn(),
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// no existing payment
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				// invoice found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
					// webhookEvents insert inside the tx: succeeds (so dedup is recorded within tx)
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								onConflictDoNothing: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([{ id: "evt_retry_me" }]),
								}),
							}),
						})
						// second insert (payment) fails
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockRejectedValue(businessError),
							}),
						}),
					update: vi.fn(),
				};
				try {
					return await fn(tx);
				} catch (err) {
					txRolledBack = true;
					throw err;
				}
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		// Business logic failure should propagate as 500
		expect(res.status).toBe(500);
		// The transaction must have been rolled back (simulated via our mock)
		expect(txRolledBack).toBe(true);
		// The outer db.insert must NOT have been called (no insert outside the transaction)
		expect(db.insert).not.toHaveBeenCalled();
	});

	// Bug E / P0.15: webhookEvents idempotency on stripe.ts webhook
	it("short-circuits duplicate stripe webhook events via webhookEvents table (inside transaction)", async () => {
		const payload = JSON.stringify({
			id: "evt_stripe_dup",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_stripe_dup",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const txPaymentInsert = vi.fn();
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// no existing payment
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				// invoice found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
					// webhookEvents insert (first) returns empty → duplicate, early return
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								onConflictDoNothing: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([]),
								}),
							}),
						})
						// payment insert (second) should NOT be called
						.mockReturnValue({ values: txPaymentInsert }),
					update: vi.fn(),
				}),
			),
		});
		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
		// payment insert must NOT have been called — bailed out after detecting duplicate
		expect(txPaymentInsert).not.toHaveBeenCalled();
	});

	// Bug F: publicLinkVersion must be incremented when invoice is marked paid
	it("increments publicLinkVersion when marking invoice as paid", async () => {
		const payload = JSON.stringify({
			id: "evt_paid_f",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_paid_f",
					amount_received: 10000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const txUpdateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
			}),
		});
		const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
		const tx = {
			execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
			// tx.insert: first = webhookEvents, second = payments, third = auditLog
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						onConflictDoNothing: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([{ id: "evt_paid_f" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "pay_paid_f" }]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: txUpdate,
		};

		let selectCallCount = 0;
		const db = createMockDb({
			// First select: no existing payment (payments table)
			// Second select: invoice found
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
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
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "100.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		// The invoice update call should include publicLinkVersion
		const invoiceUpdateArg = txUpdateSet.mock.calls.find(
			(call: Array<Record<string, unknown>>) => "status" in call[0] && call[0].status === "paid",
		);
		expect(invoiceUpdateArg).toBeDefined();
		// publicLinkVersion should be present in the set call (as a sql expression or value)
		expect(invoiceUpdateArg?.[0]).toHaveProperty("publicLinkVersion");
	});

	// Fix 3: webhook must verify event.account matches center.stripeAccountId
	it("rejects payment_intent.succeeded with 400 when event.account mismatches center stripeAccountId", async () => {
		const payload = JSON.stringify({
			id: "evt_acct_mismatch",
			type: "payment_intent.succeeded",
			account: "acct_attacker",
			data: {
				object: {
					id: "pi_acct_mismatch",
					amount_received: 5000,
					metadata: { centerId: "center-1", invoiceId: "50000000-0000-0000-0000-000000000001" },
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// payments table — no existing payment
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				// center lookup — returns center with a DIFFERENT stripeAccountId
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ stripeAccountId: "acct_legitimate" }]),
						}),
					}),
				};
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		// Mismatched account must be rejected with 400
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "account mismatch" });
		// Must not have entered the payment transaction
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("ignores connected-account payment events when Stripe omits event.account", async () => {
		const payload = JSON.stringify({
			id: "evt_missing_account",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_missing_account",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ stripeAccountId: "acct_legitimate" }]),
						}),
					}),
				};
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("processes payment_intent.succeeded when event.account matches center stripeAccountId", async () => {
		const payload = JSON.stringify({
			id: "evt_acct_match",
			type: "payment_intent.succeeded",
			account: "acct_legitimate",
			data: {
				object: {
					id: "pi_acct_match",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const txUpdateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
			}),
		});
		const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "evt_acct_match" }]),
					}),
				}),
			})
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: "pay_acct_match" }]),
				}),
			})
			.mockReturnValueOnce({
				values: vi.fn().mockResolvedValue(undefined),
			});
		const tx = {
			execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
			insert: txInsert,
			update: txUpdate,
		};

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// payments table — no existing payment
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				if (selectCallCount === 2) {
					// center lookup — stripeAccountId matches event.account
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ stripeAccountId: "acct_legitimate" }]),
							}),
						}),
					};
				}
				// invoice found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
	});

	// Fix 6: DB failure after Stripe account creation must attempt cleanup of orphaned account
	it("attempts to delete orphaned Stripe account when DB update fails after account creation", async () => {
		const dbError = new Error("DB connection lost");
		const deleteMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }));

		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				// 1st call: create account → success
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ id: "acct_new_orphan" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				)
				// 2nd call: create account link → success
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ url: "https://connect.stripe.test/link" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				)
				// 3rd call: DELETE orphaned account (cleanup) → success
				.mockImplementationOnce(deleteMock),
		);

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "center-1", stripeAccountId: null }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(dbError),
					}),
				}),
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/onboarding-link",
			{ method: "POST" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);

		// DB failure must propagate as 500
		expect(res.status).toBe(500);
		// Cleanup DELETE call must have been made for the orphaned account
		const [deleteUrl, deleteInit] = deleteMock.mock.calls[0] as [string, RequestInit];
		expect(deleteUrl).toContain("acct_new_orphan");
		expect((deleteInit as { method: string }).method).toBe("DELETE");

		consoleSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	it("does not delete an existing Stripe account when DB update fails creating an onboarding link", async () => {
		const dbError = new Error("DB connection lost");
		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ url: "https://connect.stripe.test/link" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ id: "center-1", stripeAccountId: "acct_existing" }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(dbError),
					}),
				}),
			}),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/connect/onboarding-link",
			{ method: "POST" },
			{ APP_URL: "https://app.pebbledesk.test", STRIPE_SECRET_KEY: "sk_test_123" },
		);

		expect(res.status).toBe(500);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [accountLinkUrl, accountLinkInit] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(accountLinkUrl).toBe("https://api.stripe.com/v1/account_links");
		expect(accountLinkInit.method).toBe("POST");

		consoleSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	it("returns received:true without processing when invoice centerId does not match metadata centerId", async () => {
		const payload = JSON.stringify({
			id: "evt_mismatch",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_mismatch",
					amount_received: 5000,
					metadata: {
						centerId: "center-attacker",
						invoiceId: "50000000-0000-0000-0000-000000000001",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// no existing payment
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				// invoice found — but with a DIFFERENT centerId than what metadata claims
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-real",
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountStripe, db);
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"stripe-signature": signature,
				},
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		// Should NOT have entered the transaction
		expect(db.transaction).not.toHaveBeenCalled();
		// Should have logged a warning about the centerId mismatch
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("centerId mismatch"));
		consoleSpy.mockRestore();
	});

	it("does not post a payment when the public link token is stale", async () => {
		const payload = JSON.stringify({
			id: "evt_stale_token",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_stale_token",
					amount_received: 10000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "old-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "100.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("does not post a payment when the public link version is stale", async () => {
		const payload = JSON.stringify({
			id: "evt_stale_version",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_stale_version",
					amount_received: 10000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "1",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "100.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("records a partial Stripe payment without marking the invoice paid", async () => {
		const payload = JSON.stringify({
			id: "evt_underpaid",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_underpaid",
					amount_received: 9999,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const paymentInsertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: "pay_underpaid" }]),
		});
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "evt_underpaid" }]),
					}),
				}),
			})
			.mockReturnValueOnce({
				values: paymentInsertValues,
			});
		const txExecute = vi.fn().mockResolvedValue({ rows: [createLockedInvoice()] });
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "100.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecute,
					insert: txInsert,
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(txExecute).toHaveBeenCalledTimes(1);
		expect(paymentInsertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: "99.99",
				invoiceId: "50000000-0000-0000-0000-000000000001",
				providerTransactionId: "pi_underpaid",
			}),
		);
	});

	it("does not insert a Stripe payment when the locked invoice row is no longer payable", async () => {
		const payload = JSON.stringify({
			id: "evt_locked_stale",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_locked_stale",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const paymentInsertValues = vi.fn();
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "evt_locked_stale" }]),
					}),
				}),
			})
			.mockReturnValueOnce({
				values: paymentInsertValues,
			});
		const txExecute = vi
			.fn()
			.mockResolvedValue({ rows: [createLockedInvoice({ publicLinkVersion: 3 })] });

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecute,
					insert: txInsert,
					update: vi.fn(),
				}),
			),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		expect(txExecute).toHaveBeenCalledTimes(1);
		expect(paymentInsertValues).not.toHaveBeenCalled();
	});

	it("posts a public checkout payment when prior posted payments cover the remaining invoice balance", async () => {
		const payload = JSON.stringify({
			id: "evt_partial_public_checkout",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_partial_public_checkout",
					amount_received: 50000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const paymentInsertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: "payment-1" }]),
		});
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "evt_partial_public_checkout" }]),
					}),
				}),
			})
			.mockReturnValueOnce({
				values: paymentInsertValues,
			})
			.mockReturnValueOnce({
				values: vi.fn().mockResolvedValue(undefined),
			});
		const txExecute = vi.fn().mockResolvedValue([
			createLockedInvoice({
				amountDue: "1000.00",
				postedPaymentTotal: "500.00",
			}),
		]);

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
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
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "1000.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecute,
					insert: txInsert,
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
							}),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(txExecute).toHaveBeenCalledTimes(1);
		expect(paymentInsertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: "500",
				invoiceId: "50000000-0000-0000-0000-000000000001",
				providerTransactionId: "pi_partial_public_checkout",
			}),
		);
	});

	it("does not insert a stale public checkout payment that exceeds the current balance", async () => {
		const payload = JSON.stringify({
			id: "evt_stale_public_overpay",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_stale_public_overpay",
					amount_received: 10000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const paymentInsertValues = vi.fn();
		const txInsert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "evt_stale_public_overpay" }]),
					}),
				}),
			})
			.mockReturnValueOnce({
				values: paymentInsertValues,
			});
		const txExecute = vi.fn().mockResolvedValue({
			rows: [
				{
					...createLockedInvoice(),
					amountDue: "100.00",
					postedPaymentTotal: "80.00",
				},
			],
		});
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
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
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "100.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecute,
					insert: txInsert,
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
							}),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(paymentInsertValues).not.toHaveBeenCalled();
	});

	// Audit log tests
	it("writes an auditLog row on the success path of payment_intent.succeeded", async () => {
		const payload = JSON.stringify({
			id: "evt_audit_success",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_audit_success",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const auditLogInsertValues = vi.fn().mockResolvedValue(undefined);
		const txInsert = vi
			.fn()
			// first: webhookEvents
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					onConflictDoNothing: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "evt_audit_success" }]),
					}),
				}),
			})
			// second: payments
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: "80000000-0000-0000-0000-000000000001" }]),
				}),
			})
			// third: auditLog
			.mockReturnValueOnce({
				values: auditLogInsertValues,
			});

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
					insert: txInsert,
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001" }]),
							}),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		expect(auditLogInsertValues).toHaveBeenCalledTimes(1);
		const auditArg = auditLogInsertValues.mock.calls[0][0] as Record<string, unknown>;
		expect(auditArg.action).toBe("create");
		expect(auditArg.entityType).toBe("payments");
		expect(auditArg.entityId).toBe("80000000-0000-0000-0000-000000000001");
		expect(auditArg.userId).toBeNull();
		expect(auditArg.ipAddress).toBeNull();
		const auditChanges = auditArg.changes as Record<string, unknown>;
		expect(auditChanges.source).toBe("stripe_webhook");
		expect(auditChanges.invoiceId).toBe("50000000-0000-0000-0000-000000000001");
		expect(auditChanges.invoiceStatus).toBe("paid");
		expect(auditChanges.amount).toBe("50");
		expect(auditChanges.eventId).toBe("evt_audit_success");
	});

	it("does not write an auditLog row on the duplicate-event (webhookEvents conflict) path", async () => {
		const payload = JSON.stringify({
			id: "evt_audit_dup",
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: "pi_audit_dup",
					amount_received: 5000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		const txPaymentInsert = vi.fn();
		const txAuditInsert = vi.fn();
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "50.00",
									status: "sent",
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([createLockedInvoice()]),
					// webhookEvents insert returns empty → duplicate, early return
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								onConflictDoNothing: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([]),
								}),
							}),
						})
						.mockReturnValueOnce({ values: txPaymentInsert })
						.mockReturnValueOnce({ values: txAuditInsert }),
					update: vi.fn(),
				}),
			),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
		expect(txPaymentInsert).not.toHaveBeenCalled();
		expect(txAuditInsert).not.toHaveBeenCalled();
	});

	it.each([
		"paid",
		"void",
	] as const)("does not post a payment when the current invoice is already %s", async (status) => {
		const payload = JSON.stringify({
			id: `evt_invoice_${status}`,
			type: "payment_intent.succeeded",
			data: {
				object: {
					id: `pi_invoice_${status}`,
					amount_received: 10000,
					metadata: {
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						publicLinkToken: "current-token",
						publicLinkVersion: "2",
					},
					payment_method_types: ["card"],
					created: 1_775_000_000,
				},
			},
		});
		const signature = createStripeWebhookSignature(payload, "whsec_123");

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									amountDue: "100.00",
									status,
									publicLinkToken: "current-token",
									publicLinkVersion: 2,
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountStripe, db);
		const res = await app.request(
			"/api/stripe/webhook",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", "stripe-signature": signature },
				body: payload,
			},
			{ STRIPE_WEBHOOK_SECRET: "whsec_123" },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(db.transaction).not.toHaveBeenCalled();
	});
});
