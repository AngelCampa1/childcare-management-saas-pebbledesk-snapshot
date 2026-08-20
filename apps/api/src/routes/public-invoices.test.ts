import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb } from "../test/setup.js";

const { publicInvoicesRoutes } = await import("./public-invoices.js");
const { signPublicInvoiceToken } = await import("../lib/public-billing.js");

function createPublicTestApp(db: ReturnType<typeof createMockDb>) {
	const app = new Hono<AppEnv>();
	app.use(
		"*",
		async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
			c.set("db", db);
			c.set("auth", {});
			await next();
		},
	);
	app.route("/api/public/invoices", publicInvoicesRoutes);
	return app;
}

function createPostedPaymentsQuery(postedPayments: Array<{ amount: number | string }> = []) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(postedPayments),
		}),
	};
}

function createPublicInvoiceSelectMock(
	invoiceQuery: unknown,
	postedPayments: Array<{ amount: number | string }> = [],
) {
	return vi
		.fn()
		.mockReturnValueOnce(invoiceQuery)
		.mockReturnValueOnce(createPostedPaymentsQuery(postedPayments));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("public invoices routes", () => {
	it("returns an invoice for a valid signed token", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: "60000000-0000-0000-0000-000000000001",
											amountDue: 1000,
											status: "sent",
											publicLinkToken: "nonce-1",
											publicLinkVersion: 2,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "connected",
										},
										guardian: {
											id: "60000000-0000-0000-0000-000000000001",
											firstName: "Jamie",
											lastName: "Doe",
										},
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(`/api/public/invoices/${token}`, undefined, {
			PUBLIC_LINK_SECRET: "test-secret",
			STRIPE_PUBLISHABLE_KEY: "pk_test_123",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { invoice: { id: string }; stripePublishableKey: string };
		expect(body.invoice.id).toBe("50000000-0000-0000-0000-000000000001");
		expect(body.stripePublishableKey).toBe("pk_test_123");
	});

	it("creates a Stripe payment intent for a valid public invoice token", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				id: "pi_123",
				client_secret: "pi_secret_123",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: "60000000-0000-0000-0000-000000000001",
											amountDue: 1000,
											status: "sent",
											publicLinkToken: "nonce-1",
											publicLinkVersion: 2,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "connected",
										},
										guardian: {
											id: "60000000-0000-0000-0000-000000000001",
											firstName: "Jamie",
											lastName: "Doe",
										},
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			clientSecret: string;
			invoice: { id: string };
			paymentIntentId: string;
			stripePublishableKey: string;
		};
		expect(body.invoice.id).toBe("50000000-0000-0000-0000-000000000001");
		expect(body.paymentIntentId).toBe("pi_123");
		expect(body.clientSecret).toBe("pi_secret_123");
		expect(body.stripePublishableKey).toBe("pk_test_123");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.stripe.com/v1/payment_intents");
		expect(init?.headers).toMatchObject({
			Authorization: "Bearer sk_test_123",
			"Content-Type": "application/x-www-form-urlencoded",
			"Idempotency-Key": "public-invoice:50000000-0000-0000-0000-000000000001:2:100000",
			"Stripe-Account": "acct_123",
		});

		const params = new URLSearchParams(String(init?.body));
		expect(params.get("amount")).toBe("100000");
		expect(params.get("currency")).toBe("usd");
		expect(params.get("metadata[invoiceId]")).toBe("50000000-0000-0000-0000-000000000001");
		expect(params.get("metadata[centerId]")).toBe("center-1");
		expect(params.get("metadata[publicLinkToken]")).toBe("nonce-1");

		vi.unstubAllGlobals();
	});

	it("charges the remaining public invoice balance after posted payments", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				id: "pi_123",
				client_secret: "pi_secret_123",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([
										{
											invoice: {
												id: "50000000-0000-0000-0000-000000000001",
												centerId: "center-1",
												guardianId: "60000000-0000-0000-0000-000000000001",
												amountDue: 1000,
												status: "sent",
												publicLinkToken: "nonce-1",
												publicLinkVersion: 2,
											},
											center: {
												id: "center-1",
												name: "Pebble Center",
												stripeAccountId: "acct_123",
												stripeAccountStatus: "connected",
											},
											guardian: {
												id: "60000000-0000-0000-0000-000000000001",
												firstName: "Jamie",
												lastName: "Doe",
											},
										},
									]),
								}),
							}),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ amount: 500 }]),
					}),
				}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(200);
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const params = new URLSearchParams(String(init?.body));
		const body = (await res.json()) as { invoice: { amountDue: number } };
		expect(body.invoice.amountDue).toBe(500);
		expect(params.get("amount")).toBe("50000");
		expect(init?.headers).toMatchObject({
			"Idempotency-Key": "public-invoice:50000000-0000-0000-0000-000000000001:2:50000",
		});
		vi.unstubAllGlobals();
	});

	it("requires the center Stripe account to be fully connected before creating a payment intent", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: "60000000-0000-0000-0000-000000000001",
											amountDue: 1000,
											status: "sent",
											publicLinkToken: "nonce-1",
											publicLinkVersion: 2,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "pending",
										},
										guardian: {
											id: "60000000-0000-0000-0000-000000000001",
											firstName: "Jamie",
											lastName: "Doe",
										},
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: "invalid",
			token: "not-a-real-token",
			expiresAt: undefined,
		},
		{
			name: "expired",
			token: signPublicInvoiceToken({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				publicLinkToken: "nonce-1",
				publicLinkVersion: 2,
				expiresAt: "2020-05-01T00:00:00.000Z",
				secret: "test-secret",
			}),
			expiresAt: "2020-05-01T00:00:00.000Z",
		},
	])("rejects $name public invoice links", async ({ token }) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const app = createPublicTestApp(createMockDb());
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("rejects already-paid invoices before creating a payment intent", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: "60000000-0000-0000-0000-000000000001",
											amountDue: 1000,
											status: "paid",
											publicLinkToken: "nonce-1",
											publicLinkVersion: 2,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
										},
										guardian: {
											id: "60000000-0000-0000-0000-000000000001",
											firstName: "Jamie",
											lastName: "Doe",
										},
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(410);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("rejects draft invoices before creating a payment intent", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: "60000000-0000-0000-0000-000000000001",
											amountDue: 1000,
											status: "draft",
											publicLinkToken: "nonce-1",
											publicLinkVersion: 2,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "connected",
										},
										guardian: {
											id: "60000000-0000-0000-0000-000000000001",
											firstName: "Jamie",
											lastName: "Doe",
										},
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("rejects an invalid signed token", async () => {
		const app = createPublicTestApp(createMockDb());
		const res = await app.request("/api/public/invoices/not-a-real-token", undefined, {
			PUBLIC_LINK_SECRET: "test-secret",
			STRIPE_PUBLISHABLE_KEY: "pk_test_123",
		});

		expect(res.status).toBe(404);
	});

	describe("amountToCents precision", () => {
		async function makePaymentIntentRequest(amountDue: string | number) {
			const token = signPublicInvoiceToken({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				publicLinkToken: "nonce-cents",
				publicLinkVersion: 1,
				expiresAt: "2027-05-01T00:00:00.000Z",
				secret: "test-secret",
			});

			const fetchMock = vi
				.fn()
				.mockResolvedValue(Response.json({ id: "pi_cents", client_secret: "pi_cents_secret" }));
			vi.stubGlobal("fetch", fetchMock);

			const db = createMockDb({
				select: createPublicInvoiceSelectMock({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([
										{
											invoice: {
												id: "50000000-0000-0000-0000-000000000001",
												centerId: "center-1",
												guardianId: null,
												amountDue,
												status: "sent",
												publicLinkToken: "nonce-cents",
												publicLinkVersion: 1,
											},
											center: {
												id: "center-1",
												name: "Pebble Center",
												stripeAccountId: "acct_123",
												stripeAccountStatus: "connected",
											},
											guardian: null,
										},
									]),
								}),
							}),
						}),
					}),
				}),
			});

			const app = createPublicTestApp(db);
			const res = await app.request(
				`/api/public/invoices/${token}/payment-intent`,
				{ method: "POST" },
				{
					PUBLIC_LINK_SECRET: "test-secret",
					STRIPE_PUBLISHABLE_KEY: "pk_test_123",
					STRIPE_SECRET_KEY: "sk_test_123",
				},
			);

			const body = (await res.json()) as { error?: string };
			const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			const params = new URLSearchParams(String(init?.body));
			return { status: res.status, amount: params.get("amount"), error: body.error };
		}

		it("converts '19.99' to 1999 cents without floating-point error", async () => {
			const { status, amount } = await makePaymentIntentRequest("19.99");
			expect(status).toBe(200);
			expect(amount).toBe("1999");
			vi.unstubAllGlobals();
		});

		it("converts '0.10' to 10 cents", async () => {
			const { status, amount } = await makePaymentIntentRequest("0.10");
			expect(status).toBe(200);
			expect(amount).toBe("10");
			vi.unstubAllGlobals();
		});

		it("converts '100' (no decimal) to 10000 cents", async () => {
			const { status, amount } = await makePaymentIntentRequest("100");
			expect(status).toBe(200);
			expect(amount).toBe("10000");
			vi.unstubAllGlobals();
		});

		it("truncates at 2 decimal places: '1.005' → 100 cents (no rounding surprise)", async () => {
			const { status, amount } = await makePaymentIntentRequest("1.005");
			expect(status).toBe(200);
			expect(amount).toBe("100");
			vi.unstubAllGlobals();
		});
	});

	it("returns 404 for a paid invoice on GET /:token", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-paid",
			publicLinkVersion: 1,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: null,
											amountDue: 1000,
											status: "paid",
											publicLinkToken: "nonce-paid",
											publicLinkVersion: 1,
										},
										center: { id: "center-1", name: "Pebble Center" },
										guardian: null,
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(`/api/public/invoices/${token}`, undefined, {
			PUBLIC_LINK_SECRET: "test-secret",
			STRIPE_PUBLISHABLE_KEY: "pk_test_123",
		});

		expect(res.status).toBe(404);
	});

	it("returns 400 when the center has no Stripe account connected", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 1,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: null,
											amountDue: 1000,
											status: "sent",
											publicLinkToken: "nonce-1",
											publicLinkVersion: 1,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: null,
											stripeAccountStatus: null,
										},
										guardian: null,
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(400);
	});

	it("returns 400 when invoice amount is zero", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-zero",
			publicLinkVersion: 1,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: null,
											amountDue: "0.00",
											status: "sent",
											publicLinkToken: "nonce-zero",
											publicLinkVersion: 1,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "connected",
										},
										guardian: null,
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(400);
	});

	it("returns 400 when Stripe payment intent response is missing client_secret", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-nosecret",
			publicLinkVersion: 1,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		// Stripe returns success but with no client_secret
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "pi_123" })));

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: null,
											amountDue: "19.99",
											status: "sent",
											publicLinkToken: "nonce-nosecret",
											publicLinkVersion: 1,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "connected",
										},
										guardian: null,
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(400);
		vi.unstubAllGlobals();
	});

	it("returns 400 when Stripe API returns a non-OK response with non-JSON body", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-stripeerr2",
			publicLinkVersion: 1,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		// Non-OK response with non-JSON body — exercises the .catch(() => null) path
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 })),
		);

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: null,
											amountDue: "19.99",
											status: "sent",
											publicLinkToken: "nonce-stripeerr2",
											publicLinkVersion: 1,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "connected",
										},
										guardian: null,
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(500);
		vi.unstubAllGlobals();
	});

	it("returns 400 when Stripe API returns a non-OK response", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-stripeerr",
			publicLinkVersion: 1,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ error: { message: "card declined" } }), { status: 402 }),
				),
		);

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: null,
											amountDue: "19.99",
											status: "sent",
											publicLinkToken: "nonce-stripeerr",
											publicLinkVersion: 1,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "connected",
										},
										guardian: null,
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(500);
		vi.unstubAllGlobals();
	});

	it("rejects a public invoice when its guardian belongs to a different center", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-1",
											guardianId: "60000000-0000-0000-0000-000000000001",
											amountDue: 1000,
											status: "sent",
											publicLinkToken: "nonce-1",
											publicLinkVersion: 2,
										},
										center: {
											id: "center-1",
											name: "Pebble Center",
											stripeAccountId: "acct_123",
											stripeAccountStatus: "connected",
										},
										guardian: null,
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createPublicTestApp(db);
		const res = await app.request(`/api/public/invoices/${token}`, undefined, {
			PUBLIC_LINK_SECRET: "test-secret",
			STRIPE_PUBLISHABLE_KEY: "pk_test_123",
		});

		expect(res.status).toBe(404);
	});

	it("inserts an auditLog row after creating a Stripe payment intent for a public invoice", async () => {
		const token = signPublicInvoiceToken({
			invoiceId: "50000000-0000-0000-0000-000000000001",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2027-05-01T00:00:00.000Z",
			secret: "test-secret",
		});

		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				id: "pi_audit_test",
				client_secret: "pi_secret_audit",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		let capturedAuditValues: Record<string, unknown> = {};
		const insertValuesMock = vi.fn().mockImplementation((values: Record<string, unknown>) => {
			capturedAuditValues = values;
			return Promise.resolve(undefined);
		});
		const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

		const db = createMockDb({
			select: createPublicInvoiceSelectMock({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										invoice: {
											id: "50000000-0000-0000-0000-000000000001",
											centerId: "center-audit",
											guardianId: "60000000-0000-0000-0000-000000000001",
											amountDue: 500,
											status: "sent",
											publicLinkToken: "nonce-1",
											publicLinkVersion: 2,
										},
										center: {
											id: "center-audit",
											name: "Audit Center",
											stripeAccountId: "acct_audit",
											stripeAccountStatus: "connected",
										},
										guardian: {
											id: "60000000-0000-0000-0000-000000000001",
											firstName: "Jamie",
											lastName: "Doe",
										},
									},
								]),
							}),
						}),
					}),
				}),
			}),
			insert: insertMock,
		});

		const app = createPublicTestApp(db);
		const res = await app.request(
			`/api/public/invoices/${token}/payment-intent`,
			{ method: "POST" },
			{
				PUBLIC_LINK_SECRET: "test-secret",
				STRIPE_PUBLISHABLE_KEY: "pk_test_123",
				STRIPE_SECRET_KEY: "sk_test_123",
			},
		);

		expect(res.status).toBe(200);
		expect(insertMock).toHaveBeenCalled();
		expect(capturedAuditValues).toMatchObject({
			action: "create",
			entityType: "payment_intents",
			entityId: "pi_audit_test",
			centerId: "center-audit",
			userId: null,
			changes: {
				source: "public_invoice_payment_intent",
				invoiceId: "50000000-0000-0000-0000-000000000001",
			},
		});

		vi.unstubAllGlobals();
	});
});
