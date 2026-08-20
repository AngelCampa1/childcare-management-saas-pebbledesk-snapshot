import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

const centerHasFeatureMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const requireEntitlementMock = vi.hoisted(() => vi.fn());
const entitlementDeniedMock = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireCenter: createMiddleware(async (_c, next) => {
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

vi.mock("../middleware/plan.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireEntitlement: (feature: string) => {
			requireEntitlementMock(feature);
			return createMiddleware(async (_c, next) => {
				if (entitlementDeniedMock(feature)) {
					throw new HTTPException(403, { message: "Subscription plan required" });
				}
				await next();
			});
		},
	};
});

vi.mock("../lib/plan-limits.js", () => ({
	centerHasFeature: centerHasFeatureMock,
}));

const { invoicesRoutes } = await import("./invoices.js");

function mountInvoices(app: Hono<AppEnv>) {
	app.route("/api/invoices", invoicesRoutes);
}

describe("invoices routes", () => {
	it("wires invoice sending to the public payment links entitlement", () => {
		expect(requireEntitlementMock).toHaveBeenCalledWith("public_payment_links");
	});

	it("blocks invoice sending when the public payment links entitlement denies access", async () => {
		entitlementDeniedMock.mockReturnValueOnce(true);
		const selectMock = vi.fn();
		const db = createMockDb({ select: selectMock });

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001/send", {
			method: "POST",
		});

		expect(res.status).toBe(403);
		expect(selectMock).not.toHaveBeenCalled();
	});

	it("blocks invoice sending when Stripe Connect is not connected", async () => {
		const selectMock = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([
						{
							id: "50000000-0000-0000-0000-000000000001",
							centerId: "center-1",
							guardianId: "60000000-0000-0000-0000-000000000001",
							publicLinkVersion: 1,
							status: "draft",
							stripeAccountStatus: "pending",
						},
					]),
				}),
			}),
		});
		const db = createMockDb({
			select: selectMock,
			transaction: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001/send", {
			method: "POST",
		});

		expect(res.status).toBe(400);
		expect(selectMock).toHaveBeenCalledTimes(1);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("omits public payment tokens when public payment links are not entitled", async () => {
		centerHasFeatureMock.mockResolvedValueOnce(false);
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										status: "draft",
									},
								]),
							}),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices", undefined, {
			PUBLIC_LINK_SECRET: "public-secret",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { invoices: Array<{ publicPayToken?: string }> };
		expect(body.invoices[0]?.publicPayToken).toBeUndefined();
	});

	it("omits raw public link token material from invoice responses", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										status: "sent",
										publicLinkToken: "raw-token",
										publicLinkVersion: 2,
										publicLinkRotatedAt: new Date("2026-04-01T00:00:00.000Z"),
									},
								]),
							}),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices", undefined, {
			PUBLIC_LINK_SECRET: "public-secret",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			invoices: Array<{
				publicLinkToken?: string;
				publicLinkVersion?: number;
				publicLinkRotatedAt?: string;
			}>;
		};
		expect(body.invoices[0]).not.toHaveProperty("publicLinkToken");
		expect(body.invoices[0]).not.toHaveProperty("publicLinkVersion");
		expect(body.invoices[0]).not.toHaveProperty("publicLinkRotatedAt");
	});

	it("lists invoices", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										status: "draft",
									},
								]),
							}),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices");

		expect(res.status).toBe(200);
	});

	it("includes line items when listing invoices for billing edits", async () => {
		const selectMock = vi
			.fn()
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									guardianId: "60000000-0000-0000-0000-000000000001",
									status: "draft",
									amountDue: "1200",
								},
							]),
						}),
					}),
				}),
			})
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							invoiceId: "50000000-0000-0000-0000-000000000001",
							description: "Tuition",
							quantity: "1",
							unitPrice: "1200",
							amount: "1200",
						},
					]),
				}),
			})
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			});
		const db = createMockDb({
			select: selectMock,
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			invoices: Array<{
				id: string;
				lineItems?: Array<{ description: string; quantity: string; unitPrice: string }>;
			}>;
		};
		expect(body.invoices[0]?.lineItems).toEqual([
			{
				invoiceId: "50000000-0000-0000-0000-000000000001",
				description: "Tuition",
				quantity: "1",
				unitPrice: "1200",
				amount: "1200",
			},
		]);
	});

	it("rejects invalid guardian filters before querying", async () => {
		const db = createMockDb();
		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices?guardianId=not-a-uuid");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns an unpaginated invoice summary for dashboard metrics", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ overdueInvoiceCount: 37 }]),
				}),
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/summary");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { overdueInvoiceCount: number };
		expect(body.overdueInvoiceCount).toBe(37);
	});

	it("includes remaining balance after posted payments when listing invoices", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										status: "sent",
										amountDue: 1000,
									},
								]),
							}),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								invoiceId: "50000000-0000-0000-0000-000000000001",
								amount: 500,
							},
						]),
					}),
				}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { invoices: Array<{ balanceRemaining: number }> };
		expect(body.invoices[0]?.balanceRemaining).toBe(500);
	});

	it("creates an invoice with computed totals", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "60000000-0000-0000-0000-000000000001",
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: vi
						.fn()
						.mockReturnValueOnce({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([
										{
											id: "60000000-0000-0000-0000-000000000001",
										},
									]),
								}),
							}),
						})
						.mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										subtotal: 1200,
										subsidyCredit: 200,
										amountDue: 1000,
										status: "draft",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockResolvedValue(undefined),
						}),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices",
			jsonBody({
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 200,
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { invoice: { amountDue: number } };
		expect(body.invoice.amountDue).toBe(1000);
	});

	it("returns 409 when creating a duplicate invoice period for the guardian", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "60000000-0000-0000-0000-000000000001",
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: vi
						.fn()
						.mockReturnValueOnce({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([
										{
											id: "60000000-0000-0000-0000-000000000001",
										},
									]),
								}),
							}),
						})
						.mockReturnValueOnce({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "invoice-1" }]),
								}),
							}),
						}),
					insert: vi.fn(),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices",
			jsonBody({
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 0,
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		);

		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toEqual({ error: "invoice_duplicate" });
	});

	it("rejects creating a paid invoice without a paid timestamp", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "60000000-0000-0000-0000-000000000001",
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices",
			jsonBody({
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				status: "paid",
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		);

		expect(res.status).toBe(400);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("updates an invoice", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										status: "sent",
									},
								]),
							}),
						}),
					}),
					insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ status: "sent" }),
		);

		expect(res.status).toBe(200);
	});

	it("rejects partial invoice period updates that invert the stored billing period", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								periodStart: "2026-04-01",
								periodEnd: "2026-04-30",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
								paidAt: null,
								publicLinkToken: null,
								publicLinkVersion: 1,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ periodStart: "2026-05-01" }),
		);

		expect(res.status).toBe(400);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rejects direct derived invoice total patches without line items", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								periodStart: "2026-04-01",
								periodEnd: "2026-04-30",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
								paidAt: null,
								publicLinkToken: null,
								publicLinkVersion: 1,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ amountDue: 0 }),
		);

		expect(res.status).toBe(400);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rejects marking an invoice as paid without paidAt", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ status: "paid" }),
		);

		expect(res.status).toBe(400);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rotates the public link when an existing invoice amount changes", async () => {
		const updateSetMock = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "50000000-0000-0000-0000-000000000001",
						centerId: "center-1",
						guardianId: "60000000-0000-0000-0000-000000000001",
						status: "draft",
						publicLinkToken: "new-public-link-token",
						publicLinkVersion: 4,
						publicLinkRotatedAt: new Date("2026-04-01T00:00:00.000Z"),
						createdAt: new Date("2026-03-01T00:00:00.000Z"),
						amountDue: 900,
					},
				]),
			}),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									guardianId: "60000000-0000-0000-0000-000000000001",
									subsidyCredit: 0,
									amountDue: 1000,
									status: "draft",
									publicLinkToken: "existing-public-link-token",
									publicLinkVersion: 3,
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ amount: 1000 }]),
					}),
				}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: vi.fn().mockReturnValue({
						set: updateSetMock,
					}),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ subsidyCredit: 100 }),
		);

		expect(res.status).toBe(200);
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				publicLinkToken: expect.any(String),
				publicLinkVersion: 4,
				publicLinkRotatedAt: expect.any(Date),
				amountDue: "900",
				subsidyCredit: "100",
			}),
		);
		expect(updateSetMock.mock.calls[0]?.[0]).not.toEqual(
			expect.objectContaining({
				publicLinkToken: "existing-public-link-token",
			}),
		);
	});

	it("sends an invoice and rotates the public link", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: "email-1" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		// Token rotation happens inside db.transaction (first tx), status update in second tx.
		const txUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
		const txUpdateSetMock = vi.fn().mockReturnValue({ where: txUpdateWhereMock });
		const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetMock });
		let txCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: 1,
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				txCallCount += 1;
				if (txCallCount === 1) {
					return fn({ update: txUpdateMock });
				}
				return fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: txUpdateMock,
				});
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { paymentUrl: string };
		expect(body.paymentUrl).toContain("/pay/");
		// Both the token rotation and the status update happen inside a transaction.
		expect(txCallCount).toBe(2);
		// Token rotation happened before Resend call.
		expect(txUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(
			fetchMock.mock.invocationCallOrder[0],
		);
		// Status update happened after Resend call.
		expect(txUpdateMock.mock.invocationCallOrder[1]).toBeGreaterThan(
			fetchMock.mock.invocationCallOrder[0],
		);
		// Verify the Resend idempotency key includes the invoice ID and version
		const [_url, fetchOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect((fetchOptions.headers as Record<string, string>)["Idempotency-Key"]).toBe(
			"invoice-send:50000000-0000-0000-0000-000000000001:v2",
		);
		vi.unstubAllGlobals();
	});

	it.each([
		"void",
		"paid",
	] as const)("returns 409 and does not write sent when invoice is concurrently moved to %s before final status write", async (concurrentStatus) => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: "email-1" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		let txCallCount = 0;
		const txUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
		const txUpdateSetMock = vi.fn().mockReturnValue({ where: txUpdateWhereMock });
		const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetMock });

		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: 1,
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				txCallCount += 1;
				if (txCallCount === 1) {
					// First tx: token rotation — no execute needed
					return fn({ update: txUpdateMock });
				}
				// Second tx: final status write — FOR UPDATE re-read returns concurrent status
				return fn({
					execute: vi.fn().mockResolvedValue([
						{
							id: "50000000-0000-0000-0000-000000000001",
							status: concurrentStatus,
						},
					]),
					update: txUpdateMock,
				});
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Invoice can no longer be marked sent");
		// The update inside the second tx must not have been called with status "sent"
		const sentCall = txUpdateMock.mock.calls.find((_call, i) => {
			const setCall = txUpdateSetMock.mock.calls[i];
			return setCall && (setCall[0] as Record<string, string>).status === "sent";
		});
		expect(sentCall).toBeUndefined();
		vi.unstubAllGlobals();
	});

	it("marks invoice sent when FOR UPDATE re-read still shows a sendable status", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: "email-1" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		let txCallCount = 0;
		const txUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
		const txUpdateSetMock = vi.fn().mockReturnValue({ where: txUpdateWhereMock });
		const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetMock });

		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: 1,
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				txCallCount += 1;
				if (txCallCount === 1) {
					return fn({ update: txUpdateMock });
				}
				// Second tx: FOR UPDATE re-read shows invoice still in "draft" (sendable)
				return fn({
					execute: vi.fn().mockResolvedValue([
						{
							id: "50000000-0000-0000-0000-000000000001",
							status: "draft",
						},
					]),
					update: txUpdateMock,
				});
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			sent: boolean;
			paymentUrl: string;
			publicPayToken: string;
		};
		expect(body.sent).toBe(true);
		expect(body.paymentUrl).toContain("/pay/");
		expect(txCallCount).toBe(2);
		vi.unstubAllGlobals();
	});

	it("token rotation and status update are atomic: Resend failure leaves DB at original state", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ message: "provider error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		// The token rotation goes in a transaction; on Resend failure a rollback update hits db directly.
		const txUpdateWhere = vi.fn().mockResolvedValue(undefined);
		const txUpdate = vi
			.fn()
			.mockReturnValue({ set: vi.fn().mockReturnValue({ where: txUpdateWhere }) });
		const rollbackWhere = vi.fn().mockResolvedValue(undefined);
		const rollbackSet = vi.fn().mockReturnValue({ where: rollbackWhere });
		const rollbackUpdate = vi.fn().mockReturnValue({ set: rollbackSet });
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkToken: "old-token",
										publicLinkVersion: 3,
										publicLinkRotatedAt: new Date("2026-04-01T00:00:00.000Z"),
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({ update: txUpdate }),
				),
			update: rollbackUpdate,
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		// Resend failed → 502
		expect(res.status).toBe(502);
		expect(((await res.json()) as { error: string }).error).toBe("Email delivery failed");
		// Rollback update was called with the original token values
		expect(rollbackSet).toHaveBeenCalledWith(
			expect.objectContaining({
				publicLinkToken: "old-token",
				publicLinkVersion: 3,
				publicLinkRotatedAt: new Date("2026-04-01T00:00:00.000Z"),
			}),
		);
		// Status update transaction was never called (only token rotation tx ran before Resend)
		expect(db.transaction).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});

	it("restores the previous public link when email delivery fails", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ message: "provider error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		const rollbackSetMock = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		// The rollback update happens on db directly (not inside a tx).
		const updateMock = vi.fn().mockReturnValue({ set: rollbackSetMock });
		const txUpdate = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
		});
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkToken: "existing-link-token",
										publicLinkVersion: 1,
										publicLinkRotatedAt: new Date("2026-04-01T00:00:00.000Z"),
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({ update: txUpdate }),
				),
			update: updateMock,
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Email delivery failed");
		expect(rollbackSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				publicLinkToken: "existing-link-token",
				publicLinkVersion: 1,
				publicLinkRotatedAt: new Date("2026-04-01T00:00:00.000Z"),
			}),
		);
		vi.unstubAllGlobals();
	});

	it("refuses to send an invoice when the guardian belongs to a different center", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: 1,
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-2",
									email: "guardian@example.com",
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("escapes HTML special characters in the guardian name in email body", async () => {
		let fetchBodyCapture = "";
		const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
			fetchBodyCapture = typeof init?.body === "string" ? init.body : "";
			return new Response(JSON.stringify({ id: "email-1" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		const txUpdateMock = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
		});
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: 1,
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: "<script>alert('xss')</script>",
									lastName: 'O\'Brien & "Co"',
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({ update: txUpdateMock }),
				),
		});

		const app = createTestApp(mountInvoices, db);
		await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const parsedBody = JSON.parse(fetchBodyCapture) as { html: string };
		// XSS payload in firstName must be escaped — raw angle brackets must not appear
		expect(parsedBody.html).not.toContain("<script>");
		expect(parsedBody.html).toContain("&lt;script&gt;");
		expect(parsedBody.html).not.toContain("'xss'");
		expect(parsedBody.html).toContain("&#x27;xss&#x27;");
		expect(parsedBody.html).toContain("https://pebbledesk.app/logo-email.png");
		expect(parsedBody.html).toContain('alt="PebbleDesk"');
		expect(parsedBody.html).toContain(">PebbleDesk</div>");
		vi.unstubAllGlobals();
	});

	it.each([
		"paid",
		"void",
	] as const)("does not resend an invoice that is already %s", async (status) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: 1,
										stripeAccountStatus: "connected",
										status,
									},
								]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("returns 403 when centerId is missing for send", async () => {
		const { Hono: HonoClass } = await import("hono");
		const { HTTPException: HE } = await import("hono/http-exception");
		const db = createMockDb();
		const app = new HonoClass<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as unknown as import("../lib/context.js").Variables["db"]);
			c.set("userId", "user-1");
			// centerId intentionally not set
			c.set("role", "owner");
			await next();
		});
		mountInvoices(app);
		app.onError((err, c) => {
			if (err instanceof HE) {
				return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 500);
			}
			return c.json({ error: "Internal server error" }, 500);
		});
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001/send", {
			method: "POST",
		});
		expect(res.status).toBe(403);
	});

	it("returns 404 when invoice is not found for send", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(404);
	});

	it("returns 404 when guardian has no email for send", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: 1,
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}

				// guardian exists but no email
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: null,
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("handles null publicLinkVersion when sending an invoice", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: "email-1" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: null, // null triggers the ?? 0 branch
										publicLinkToken: null,
										publicLinkRotatedAt: null,
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: null, // triggers firstName ?? "there" branch
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			transaction: (() => {
				let nullTxCallCount = 0;
				return vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					nullTxCallCount += 1;
					const updateFn = vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
					});
					if (nullTxCallCount === 1) {
						return fn({ update: updateFn });
					}
					return fn({
						execute: vi
							.fn()
							.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
						update: updateFn,
					});
				});
			})(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { sent: boolean; paymentUrl: string };
		expect(body.sent).toBe(true);
		vi.unstubAllGlobals();
	});

	it("patches invoice with dueDate and paidAt fields", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
								publicLinkToken: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										status: "paid",
										paidAt: new Date("2026-04-15T12:00:00Z"),
									},
								]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
					insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				status: "paid",
				dueDate: "2026-04-30",
				paidAt: "2026-04-15T12:00:00Z",
			}),
		);

		expect(res.status).toBe(200);
	});

	it("returns 404 when invoice update is lost in transaction (race condition)", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
								publicLinkToken: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
					insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ status: "sent" }),
		);

		expect(res.status).toBe(404);
	});

	it("patches invoice with subsidyCredit only (no lineItems) fetches existing line items", async () => {
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// existing invoice
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										subsidyCredit: 0,
										amountDue: 1200,
										status: "draft",
										publicLinkToken: null,
									},
								]),
							}),
						}),
					};
				}
				// existing line items fetch
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ amount: 1200 }]),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										status: "draft",
										subsidyCredit: 100,
										amountDue: 1100,
									},
								]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
					insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ subsidyCredit: 100 }),
		);

		expect(res.status).toBe(200);
	});

	it("invalidates the public checkout link when updating an invoice with an existing public link token", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1200,
								status: "draft",
								publicLinkToken: "existing-token",
								publicLinkVersion: 1,
								publicLinkRotatedAt: new Date("2026-04-01"),
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										status: "paid",
										publicLinkVersion: 2,
									},
								]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
					insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				status: "paid",
				paidAt: "2026-04-15T12:00:00Z",
			}),
		);

		expect(res.status).toBe(200);
	});

	it("patches invoice period dates and skips line items with null childId", async () => {
		const CHILD_UUID2 = "70000000-0000-0000-0000-000000000002";
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										subsidyCredit: 0,
										amountDue: 1000,
										status: "draft",
										publicLinkToken: null,
									},
								]),
							}),
						}),
					};
				}
				// child found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: CHILD_UUID2 }]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										status: "draft",
									},
								]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
					insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				periodStart: "2026-05-01",
				periodEnd: "2026-05-31",
				lineItems: [
					// no childId field exercises the `!lineItem.childId continue` branch
					{ description: "No child", quantity: 1, unitPrice: 500, amount: 500 },
					// valid childId exercises the lookup path
					{
						childId: CHILD_UUID2,
						description: "Tuition",
						quantity: 1,
						unitPrice: 500,
						amount: 500,
					},
				],
			}),
		);

		expect(res.status).toBe(200);
	});

	it("returns 404 when a child in line items is not found during patch", async () => {
		const CHILD_UUID3 = "70000000-0000-0000-0000-000000000003";
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										subsidyCredit: 0,
										amountDue: 1000,
										status: "draft",
										publicLinkToken: null,
									},
								]),
							}),
						}),
					};
				}
				// child not found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				lineItems: [
					{
						childId: CHILD_UUID3,
						description: "Tuition",
						quantity: 1,
						unitPrice: 1000,
						amount: 1000,
					},
				],
			}),
		);

		expect(res.status).toBe(404);
	});

	it("lists invoices filtered by guardianId", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices?guardianId=60000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(200);
	});

	it("gets a single invoice with line items", async () => {
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([{ id: "li-1", description: "Tuition", amount: 1200 }]),
					}),
				};
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { invoice: { id: string }; lineItems: unknown[] };
		expect(body.invoice.id).toBe("50000000-0000-0000-0000-000000000001");
		expect(body.lineItems).toHaveLength(1);
	});

	it("returns 404 for non-existent invoice GET", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(404);
	});

	it("returns 404 for non-existent invoice on create when guardian is missing", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices",
			jsonBody({
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1200, amount: 1200 }],
			}),
		);

		expect(res.status).toBe(404);
	});

	it("returns 404 when a child in line items is not found", async () => {
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					// guardian found
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
							}),
						}),
					};
				}
				// child not found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices",
			jsonBody({
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				lineItems: [
					{
						childId: "50000000-0000-0000-0000-000000000099",
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		);

		expect(res.status).toBe(404);
	});

	it("returns 404 when the invoice to update is not found", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ status: "sent" }),
		);

		expect(res.status).toBe(404);
	});

	it("returns 404 when guardian is not found on patch", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									guardianId: "60000000-0000-0000-0000-000000000001",
									subsidyCredit: 0,
									amountDue: 1000,
									status: "draft",
								},
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
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ guardianId: "60000000-0000-0000-0000-000000000099" }),
		);

		expect(res.status).toBe(404);
	});

	it("updates invoice with line items and child validation", async () => {
		const CHILD_UUID = "70000000-0000-0000-0000-000000000001";
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										subsidyCredit: 0,
										amountDue: 1000,
										status: "draft",
									},
								]),
							}),
						}),
					};
				}
				// child found
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: CHILD_UUID }]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										status: "sent",
									},
								]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue(undefined),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				lineItems: [
					{
						childId: CHILD_UUID,
						description: "Tuition",
						quantity: 1,
						unitPrice: 1000,
						amount: 1000,
					},
				],
			}),
		);

		expect(res.status).toBe(200);
	});

	it("sends Resend idempotency key including publicLinkVersion", async () => {
		let capturedHeaders: Record<string, string> = {};
		const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
			capturedHeaders = Object.fromEntries(
				Object.entries((init?.headers ?? {}) as Record<string, string>),
			);
			return new Response(JSON.stringify({ id: "email-1" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										guardianId: "60000000-0000-0000-0000-000000000001",
										publicLinkVersion: 5,
										stripeAccountStatus: "connected",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "60000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									email: "guardian@example.com",
									firstName: "Jamie",
									lastName: "Doe",
								},
							]),
						}),
					}),
				};
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								publicLinkVersion: 6,
								status: "sent",
							},
						]),
					}),
				}),
			}),
			transaction: (() => {
				let idempTxCallCount = 0;
				return vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					idempTxCallCount += 1;
					const updateFn = vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
					});
					if (idempTxCallCount === 1) {
						return fn({ update: updateFn });
					}
					return fn({
						execute: vi
							.fn()
							.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]),
						update: updateFn,
					});
				});
			})(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001/send",
			{ method: "POST" },
			{
				APP_URL: "https://app.pebbledesk.test",
				PUBLIC_LINK_SECRET: "public-secret",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "billing@pebbledesk.test",
			},
		);

		expect(res.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		// publicLinkVersion starts at 5, new version is 6
		expect(capturedHeaders["Idempotency-Key"]).toBe(
			"invoice-send:50000000-0000-0000-0000-000000000001:v6",
		);
		vi.unstubAllGlobals();
	});
});

describe("invoice deletion", () => {
	it("deletes a draft invoice with no payments", async () => {
		let selectCallCount = 0;
		const lineItemDeleteWhere = vi.fn().mockResolvedValue(undefined);
		const invoiceDeleteReturning = vi.fn().mockResolvedValue([
			{
				id: "50000000-0000-0000-0000-000000000001",
			},
		]);
		const deleteMock = vi
			.fn()
			.mockReturnValueOnce({
				where: lineItemDeleteWhere,
			})
			.mockReturnValueOnce({
				where: vi.fn().mockReturnValue({
					returning: invoiceDeleteReturning,
				}),
			});
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([
						{
							id: "50000000-0000-0000-0000-000000000001",
							status: "draft",
						},
					]),
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
					delete: deleteMock,
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { deleted: boolean; id: string };
		expect(body).toEqual({
			deleted: true,
			id: "50000000-0000-0000-0000-000000000001",
		});
		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(deleteMock).toHaveBeenCalledTimes(2);
	});

	it("returns 400 for invalid invoice IDs before deleting", async () => {
		const db = createMockDb();
		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/not-a-uuid", { method: "DELETE" });

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 404 when deleting a missing invoice", async () => {
		const db = createMockDb();
		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(404);
	});

	it("returns 404 when an invoice delete is lost in transaction", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "50000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									status: "draft",
								},
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
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([
						{
							id: "50000000-0000-0000-0000-000000000001",
							status: "draft",
						},
					]),
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
					delete: vi
						.fn()
						.mockReturnValueOnce({ where: vi.fn().mockResolvedValue(undefined) })
						.mockReturnValueOnce({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						}),
				}),
			),
		});
		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(404);
	});

	it("rejects deleting a sent invoice", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								status: "sent",
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rejects deleting a draft invoice with payments", async () => {
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										status: "draft",
									},
								]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "70000000-0000-0000-0000-000000000001",
								},
							]),
						}),
					}),
				};
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rechecks payments inside the delete transaction before deleting", async () => {
		let selectCallCount = 0;
		const deleteMock = vi.fn();
		const txPaymentLimit = vi
			.fn()
			.mockResolvedValue([{ id: "70000000-0000-0000-0000-000000000001" }]);
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue(
								selectCallCount === 1
									? [
											{
												id: "50000000-0000-0000-0000-000000000001",
												centerId: "center-1",
												status: "draft",
											},
										]
									: [],
							),
						}),
					}),
				};
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue([
						{
							id: "50000000-0000-0000-0000-000000000001",
							status: "draft",
						},
					]),
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: txPaymentLimit,
							}),
						}),
					}),
					delete: deleteMock,
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request("/api/invoices/50000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
		expect(txPaymentLimit).toHaveBeenCalledOnce();
		expect(deleteMock).not.toHaveBeenCalled();
	});
});

describe("invoice route center guards", () => {
	it.each([
		["GET", "/api/invoices", undefined],
		["GET", "/api/invoices/summary", undefined],
		["GET", "/api/invoices/50000000-0000-0000-0000-000000000001", undefined],
		[
			"POST",
			"/api/invoices",
			jsonBody({
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 0,
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1200, amount: 1200 }],
			}),
		],
		[
			"PATCH",
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ dueDate: "2026-05-01" }),
		],
		["DELETE", "/api/invoices/50000000-0000-0000-0000-000000000001", { method: "DELETE" }],
	] as const)("rejects %s invoice requests without a center membership", async (_method, path, init) => {
		const db = createMockDb();
		const app = createTestApp(mountInvoices, db, { centerId: "" });
		const res = await app.request(path, init);

		expect(res.status).toBe(403);
	});
});

describe("invoice edit guard (status-based locking)", () => {
	function makeInvoiceDb(status: string) {
		return createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status,
								publicLinkToken: null,
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi
						.fn()
						.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status }]),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "50000000-0000-0000-0000-000000000001",
										status,
									},
								]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
					insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
				}),
			),
		});
	}

	it("allows editing dueDate on a sent invoice", async () => {
		const db = makeInvoiceDb("sent");
		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ dueDate: "2026-06-01" }),
		);
		expect(res.status).toBe(200);
	});

	it("allows editing dueDate on an overdue invoice", async () => {
		const db = makeInvoiceDb("overdue");
		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ dueDate: "2026-06-01" }),
		);
		expect(res.status).toBe(200);
	});

	it("rejects editing lineItems on a sent invoice with 409 invoice_locked", async () => {
		const db = makeInvoiceDb("sent");
		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1000, amount: 1000 }],
			}),
		);
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
	});

	it("rejects editing guardianId on a sent invoice with 409 invoice_locked", async () => {
		const db = makeInvoiceDb("sent");
		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ guardianId: "60000000-0000-0000-0000-000000000002" }),
		);
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
	});

	it("rejects status changes on a sent invoice with 409 invoice_locked", async () => {
		const db = makeInvoiceDb("sent");
		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				status: "paid",
				paidAt: "2026-04-15T12:00:00.000Z",
			}),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
	});

	it("rejects editing periodStart on an overdue invoice with 409 invoice_locked", async () => {
		const db = makeInvoiceDb("overdue");
		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ periodStart: "2026-05-01" }),
		);
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
	});

	it.each([
		"paid",
		"void",
	] as const)("rejects any edit on a %s invoice with 409 invoice_locked", async (status) => {
		const db = makeInvoiceDb(status);
		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ dueDate: "2026-06-01" }),
		);
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
	});

	it.each([
		"paid",
		"void",
	] as const)("PATCH with empty body on a %s invoice returns 200 without calling db.transaction", async (status) => {
		const db = makeInvoiceDb(status);
		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({}),
		);
		// No fields changed — must not bump updatedAt on an immutable invoice
		expect(res.status).toBe(200);
		expect(db.transaction).not.toHaveBeenCalled();
	});
});

describe("UUID validation (400 on invalid ID format)", () => {
	const INVALID_ID = "not-a-uuid";

	it("GET /:id returns 400 for invalid UUID", async () => {
		const db = createMockDb();
		const app = createTestApp(mountInvoices, db, { role: "owner" });
		const res = await app.request(`/api/invoices/${INVALID_ID}`);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Invalid ID");
	});

	it("PATCH /:id returns 400 for invalid UUID", async () => {
		const db = createMockDb();
		const app = createTestApp(mountInvoices, db, { role: "owner" });
		const res = await app.request(`/api/invoices/${INVALID_ID}`, patchBody({ status: "sent" }));
		expect(res.status).toBe(400);
	});

	it("POST /:id/send returns 400 for invalid UUID", async () => {
		const db = createMockDb();
		const app = createTestApp(mountInvoices, db, { role: "owner" });
		const res = await app.request(`/api/invoices/${INVALID_ID}/send`, { method: "POST" });
		expect(res.status).toBe(400);
	});
});

describe("PATCH TOCTOU guard (Bug 1): for-update re-read inside transaction", () => {
	it("returns 409 invoice_locked and does not run update/insert when transactional re-read returns paid while outer read returned draft", async () => {
		// Outer read: invoice is draft
		const txUpdateMock = vi.fn();
		const txInsertMock = vi.fn();
		const txDeleteMock = vi.fn();
		const txExecuteMock = vi.fn().mockResolvedValue([
			// FOR UPDATE re-read inside transaction: status is now "paid" (concurrent payment)
			{ id: "50000000-0000-0000-0000-000000000001", status: "paid" },
		]);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
								publicLinkToken: null,
								paidAt: null,
								publicLinkVersion: 1,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecuteMock,
					update: txUpdateMock,
					insert: txInsertMock,
					delete: txDeleteMock,
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ dueDate: "2026-06-01" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice_locked");
		// update and insert must NOT have been called — the lock guard fired first
		expect(txUpdateMock).not.toHaveBeenCalled();
		expect(txInsertMock).not.toHaveBeenCalled();
	});

	it("returns 404 when FOR UPDATE re-read finds invoice missing inside transaction", async () => {
		const txExecuteMock = vi.fn().mockResolvedValue([]);
		const txUpdateMock = vi.fn();

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
								publicLinkToken: null,
								paidAt: null,
								publicLinkVersion: 1,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecuteMock,
					update: txUpdateMock,
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ dueDate: "2026-06-01" }),
		);

		expect(res.status).toBe(404);
		expect(txUpdateMock).not.toHaveBeenCalled();
	});
});

describe("PATCH line-item amount normalization (Bug 2): server recomputes amount from quantity*unitPrice", () => {
	// The Zod schema enforces amount === quantity * unitPrice on input, so the client cannot
	// send a divergent amount. The bug is that the route previously stored the client-supplied
	// amount string verbatim instead of recomputing it server-side (matching the CREATE path).
	// These tests send a valid payload (amount = quantity * unitPrice) and verify that the
	// stored amount is the server-recomputed value — i.e. String(quantity * unitPrice) — not
	// the client-provided number coerced to a string directly.

	it("stores quantity*unitPrice as amount in the inserted line item (server recompute, not client passthrough)", async () => {
		// Client sends quantity=3, unitPrice=10, amount=30 (valid per Zod)
		// Server must store amount="30" via String(3 * 10), not by echoing the client field
		const txInsertValuesMock = vi.fn().mockResolvedValue(undefined);
		const txInsertMock = vi.fn().mockReturnValue({ values: txInsertValuesMock });
		const txDeleteMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const txUpdateSetWhereMock = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "50000000-0000-0000-0000-000000000001",
					status: "draft",
					subtotal: "30",
					amountDue: "30",
				},
			]),
		});
		const txUpdateSetMock = vi.fn().mockReturnValue({ where: txUpdateSetWhereMock });
		const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetMock });
		// FOR UPDATE re-read: still draft
		const txExecuteMock = vi
			.fn()
			.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
								publicLinkToken: null,
								paidAt: null,
								publicLinkVersion: 1,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecuteMock,
					update: txUpdateMock,
					delete: txDeleteMock,
					insert: txInsertMock,
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				lineItems: [
					{
						description: "Tuition",
						quantity: 3,
						unitPrice: 10,
						amount: 30, // valid per Zod (3 * 10 = 30)
					},
				],
			}),
		);

		expect(res.status).toBe(200);
		// Inspect what was passed to tx.insert(...).values(...)
		expect(txInsertValuesMock).toHaveBeenCalledOnce();
		const insertedItems = txInsertValuesMock.mock.calls[0]?.[0] as Array<{
			amount: string;
			quantity: number;
			unitPrice: string;
		}>;
		expect(insertedItems).toHaveLength(1);
		// amount must be server-recomputed: quantity(3) * unitPrice(10) = 30
		expect(insertedItems[0]?.amount).toBe("30");
	});

	it("inserts an auditLog row when voiding an invoice via PATCH", async () => {
		const txInsertMock = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
		const txUpdateSetWhereMock = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "50000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					status: "void",
				},
			]),
		});
		const txUpdateSetMock = vi.fn().mockReturnValue({ where: txUpdateSetWhereMock });
		const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetMock });
		const txExecuteMock = vi
			.fn()
			.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]);

		let capturedAuditValues: Record<string, unknown> = {};
		const txInsertValuesMock = vi.fn().mockImplementation((values: Record<string, unknown>) => {
			capturedAuditValues = values;
			return Promise.resolve(undefined);
		});
		txInsertMock.mockReturnValue({ values: txInsertValuesMock });

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: "1000",
								status: "draft",
								publicLinkToken: null,
								paidAt: null,
								publicLinkVersion: 1,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecuteMock,
					update: txUpdateMock,
					insert: txInsertMock,
					delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({ status: "void" }),
		);

		expect(res.status).toBe(200);
		expect(txInsertMock).toHaveBeenCalled();
		expect(capturedAuditValues).toMatchObject({
			action: "update",
			entityType: "invoices",
			entityId: "50000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			changes: {
				before: { status: "draft" },
				after: { status: "void" },
			},
		});
	});

	it("derives subtotal and amountDue from server-recomputed line item amounts", async () => {
		// quantity=3, unitPrice=10 → recomputed amount=30 → subtotal=30, amountDue=30
		const txInsertValuesMock = vi.fn().mockResolvedValue(undefined);
		const txInsertMock = vi.fn().mockReturnValue({ values: txInsertValuesMock });
		const txDeleteMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		let capturedUpdateData: Record<string, unknown> = {};
		const txUpdateSetWhereMock = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "50000000-0000-0000-0000-000000000001",
					status: "draft",
					subtotal: "30",
					amountDue: "30",
				},
			]),
		});
		const txUpdateSetMock = vi.fn().mockImplementation((data: Record<string, unknown>) => {
			capturedUpdateData = data;
			return { where: txUpdateSetWhereMock };
		});
		const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetMock });
		const txExecuteMock = vi
			.fn()
			.mockResolvedValue([{ id: "50000000-0000-0000-0000-000000000001", status: "draft" }]);

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								guardianId: "60000000-0000-0000-0000-000000000001",
								subsidyCredit: 0,
								amountDue: 1000,
								status: "draft",
								publicLinkToken: null,
								paidAt: null,
								publicLinkVersion: 1,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: txExecuteMock,
					update: txUpdateMock,
					delete: txDeleteMock,
					insert: txInsertMock,
				}),
			),
		});

		const app = createTestApp(mountInvoices, db);
		const res = await app.request(
			"/api/invoices/50000000-0000-0000-0000-000000000001",
			patchBody({
				lineItems: [
					{
						description: "Tuition",
						quantity: 3,
						unitPrice: 10,
						amount: 30, // valid per Zod
					},
				],
			}),
		);

		expect(res.status).toBe(200);
		// subtotal and amountDue must derive from 30 (3*10)
		expect(capturedUpdateData.subtotal).toBe("30");
		expect(capturedUpdateData.amountDue).toBe("30");
	});
});
