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

const { paymentsRoutes } = await import("./payments.js");

function mountPayments(app: Hono<AppEnv>) {
	app.route("/api/payments", paymentsRoutes);
}

const PAYMENT_ID = "70000000-0000-0000-0000-000000000001";
const INVOICE_ID = "50000000-0000-0000-0000-000000000001";

function createPaymentRow(overrides: Record<string, unknown> = {}) {
	return {
		id: PAYMENT_ID,
		centerId: "center-1",
		invoiceId: INVOICE_ID,
		amount: 1000,
		method: "ach",
		provider: "manual",
		status: "posted",
		paidAt: new Date("2026-04-20T12:00:00.000Z"),
		reversedAt: null,
		updatedAt: new Date("2026-04-20T12:00:00.000Z"),
		...overrides,
	};
}

function createInvoiceRow(overrides: Record<string, unknown> = {}) {
	return {
		id: INVOICE_ID,
		centerId: "center-1",
		amountDue: 1000,
		status: "paid",
		paidAt: new Date("2026-04-20T12:00:00.000Z"),
		publicLinkVersion: 2,
		publicLinkRotatedAt: new Date("2026-04-01T00:00:00.000Z"),
		...overrides,
	};
}

function createLockedInvoiceResult(overrides: Record<string, unknown> = {}) {
	return { rows: [createInvoiceRow({ status: "sent", paidAt: null, ...overrides })] };
}

function createReversePaymentDb({
	payment = createPaymentRow(),
	invoice = createInvoiceRow(),
	remainingPayments = [],
	executeRowsAsArray = false,
}: {
	payment?: Record<string, unknown> | null;
	invoice?: Record<string, unknown> | null;
	remainingPayments?: Record<string, unknown>[];
	executeRowsAsArray?: boolean;
}) {
	const setPaymentSpy = vi.fn().mockReturnValue({
		where: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([payment].filter(Boolean)),
		}),
	});
	const setInvoiceSpy = vi.fn().mockReturnValue({
		where: vi.fn().mockResolvedValue(undefined),
	});
	const updateSpy = vi
		.fn()
		.mockReturnValueOnce({ set: setPaymentSpy })
		.mockReturnValueOnce({ set: setInvoiceSpy });
	const paymentRows = [payment].filter(Boolean);
	const invoiceRows = [invoice].filter(Boolean);
	const lockPaymentSpy = vi
		.fn()
		.mockResolvedValue(executeRowsAsArray ? paymentRows : { rows: paymentRows });
	const lockInvoiceSpy = vi
		.fn()
		.mockResolvedValue(executeRowsAsArray ? invoiceRows : { rows: invoiceRows });
	const selectRemainingPaymentsSpy = vi.fn().mockReturnValue({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(remainingPayments),
		}),
	});
	const insertAuditValuesSpy = vi.fn().mockResolvedValue([]);
	const insertSpy = vi.fn().mockReturnValue({ values: insertAuditValuesSpy });
	const db = createMockDb({
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([payment].filter(Boolean)),
				}),
			}),
		}),
		transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				execute: vi
					.fn()
					.mockImplementationOnce(lockPaymentSpy)
					.mockImplementationOnce(lockInvoiceSpy),
				select: selectRemainingPaymentsSpy,
				update: updateSpy,
				insert: insertSpy,
			}),
		),
	});

	return {
		db,
		lockPaymentSpy,
		lockInvoiceSpy,
		selectRemainingPaymentsSpy,
		setPaymentSpy,
		setInvoiceSpy,
		insertAuditValuesSpy,
		updateSpy,
	};
}

describe("payments routes", () => {
	it("lists payments", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([
								{
									id: "70000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									invoiceId: "50000000-0000-0000-0000-000000000001",
									amount: 1000,
								},
							]),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments");

		expect(res.status).toBe(200);
	});

	it("rejects invalid invoice filters before querying payments", async () => {
		const select = vi.fn();
		const db = createMockDb({ select });
		const app = createTestApp(mountPayments, db);

		const res = await app.request("/api/payments?invoiceId=not-a-uuid");

		expect(res.status).toBe(400);
		expect(select).not.toHaveBeenCalled();
	});

	it("rejects payment requests without a center membership", async () => {
		const db = createMockDb();
		const app = createTestApp(mountPayments, db, { centerId: "" });

		const listRes = await app.request("/api/payments");
		const reverseRes = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Correction" }),
		);
		const createRes = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: INVOICE_ID,
				amount: 200,
				method: "check",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(listRes.status).toBe(403);
		expect(reverseRes.status).toBe(403);
		expect(createRes.status).toBe(403);
	});

	it("filters payments by invoice id", async () => {
		const limit = vi.fn().mockReturnValue({
			offset: vi.fn().mockResolvedValue([]),
		});
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?invoiceId=50000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("filters payments by method", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?method=cash");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("does not apply method condition when method=all", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?method=all");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("filters payments by status", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?status=posted");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("does not apply status condition when status=all", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?status=all");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("filters payments by dateFrom", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?dateFrom=2026-04-01");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("filters payments by dateTo", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?dateTo=2026-04-30");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("filters payments by date range", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?dateFrom=2026-04-01&dateTo=2026-04-30");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("filters payments by search term", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?search=INV-001");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("applies combined filters (method + status + date range + search)", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const where = vi.fn().mockReturnValue({ limit });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments?method=check&status=posted&dateFrom=2026-01-01&dateTo=2026-12-31&search=ref-123",
		);

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledOnce();
	});

	it("rejects invalid method values", async () => {
		const db = createMockDb({
			select: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?method=invalid");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects invalid status values", async () => {
		const db = createMockDb({
			select: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?status=invalid");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects invalid dateFrom values", async () => {
		const db = createMockDb({
			select: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request("/api/payments?dateFrom=not-a-date");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects payment lists without a center membership", async () => {
		const db = createMockDb({
			select: vi.fn(),
		});

		const app = createTestApp(mountPayments, db, { centerId: undefined });
		const res = await app.request("/api/payments");

		expect(res.status).toBe(403);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("creates a manual payment and marks invoice paid", async () => {
		const lockInvoiceSpy = vi.fn().mockResolvedValue(createLockedInvoiceResult());
		const selectExistingPaymentsSpy = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 1000,
								status: "sent",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: lockInvoiceSpy,
					select: selectExistingPaymentsSpy,
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "70000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									invoiceId: "50000000-0000-0000-0000-000000000001",
									amount: 1000,
									method: "ach",
									provider: "manual",
								},
							]),
						}),
					}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(undefined),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 1000,
				method: "ach",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { payment: { amount: number } };
		expect(body.payment.amount).toBe(1000);
		expect(db.select).toHaveBeenCalledTimes(1);
		expect(lockInvoiceSpy).toHaveBeenCalledTimes(1);
		expect(selectExistingPaymentsSpy).toHaveBeenCalledTimes(1);
	});

	it("rejects manual payments that spoof an external provider", async () => {
		const db = createMockDb({
			select: vi.fn(),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 1000,
				method: "ach",
				provider: "stripe",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rejects manual payments that include provider-owned identifiers", async () => {
		const db = createMockDb({
			select: vi.fn(),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 1000,
				method: "ach",
				providerTransactionId: "stripe-txn-1",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rejects manual payments that include provider reference identifiers", async () => {
		const db = createMockDb({
			select: vi.fn(),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 1000,
				method: "ach",
				providerReferenceId: "stripe-ref-1",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rejects manual payments without a center membership", async () => {
		const db = createMockDb({
			select: vi.fn(),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db, { centerId: undefined });
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 1000,
				method: "ach",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(403);
		expect(db.select).not.toHaveBeenCalled();
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("creates a partial payment and keeps the invoice unsettled", async () => {
		const lockInvoiceSpy = vi.fn().mockResolvedValue(createLockedInvoiceResult());
		const selectExistingPaymentsSpy = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([
					{
						amount: 300,
					},
				]),
			}),
		});
		const setInvoiceSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 1000,
								status: "sent",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: lockInvoiceSpy,
					select: selectExistingPaymentsSpy,
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "70000000-0000-0000-0000-000000000002",
									centerId: "center-1",
									invoiceId: "50000000-0000-0000-0000-000000000001",
									amount: 200,
									method: "check",
									provider: "manual",
									status: "posted",
								},
							]),
						}),
					}),
					update: vi.fn().mockReturnValue({
						set: setInvoiceSpy,
					}),
				}),
			),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 200,
				method: "check",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(201);
		expect(db.select).toHaveBeenCalledTimes(1);
		expect(lockInvoiceSpy).toHaveBeenCalledTimes(1);
		expect(selectExistingPaymentsSpy).toHaveBeenCalledTimes(1);
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "sent",
				paidAt: null,
			}),
		);
		expect(setInvoiceSpy.mock.calls[0]?.[0]).not.toHaveProperty("amountDue");
	});

	it("moves a draft invoice to sent when recording a partial payment", async () => {
		const lockInvoiceSpy = vi
			.fn()
			.mockResolvedValue(createLockedInvoiceResult({ status: "draft", paidAt: null }));
		const selectExistingPaymentsSpy = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});
		const setInvoiceSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 1000,
								status: "draft",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: lockInvoiceSpy,
					select: selectExistingPaymentsSpy,
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "70000000-0000-0000-0000-000000000004",
									centerId: "center-1",
									invoiceId: "50000000-0000-0000-0000-000000000001",
									amount: 200,
									method: "check",
									provider: "manual",
									status: "posted",
								},
							]),
						}),
					}),
					update: vi.fn().mockReturnValue({
						set: setInvoiceSpy,
					}),
				}),
			),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 200,
				method: "check",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(201);
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "sent",
				paidAt: null,
			}),
		);
	});

	it("rejects payments that exceed the invoice balance", async () => {
		const lockInvoiceSpy = vi.fn().mockResolvedValue(createLockedInvoiceResult());
		const selectExistingPaymentsSpy = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([
					{
						amount: 900,
					},
				]),
			}),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 1000,
								status: "sent",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: lockInvoiceSpy,
					select: selectExistingPaymentsSpy,
					insert: vi.fn(),
					update: vi.fn(),
				}),
			),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 200,
				method: "check",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(400);
		expect(db.select).toHaveBeenCalledTimes(1);
		expect(lockInvoiceSpy).toHaveBeenCalledTimes(1);
		expect(selectExistingPaymentsSpy).toHaveBeenCalledTimes(1);
	});

	it("rejects manual payments when the locked invoice was already paid by another request", async () => {
		const lockInvoiceSpy = vi.fn().mockResolvedValue({
			rows: [
				{
					id: "50000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					amountDue: 1000,
					status: "paid",
					paidAt: "2026-04-30T15:00:00.000Z",
				},
			],
		});
		const selectExistingPaymentsSpy = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});
		const insertSpy = vi.fn();
		const updateSpy = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});
		insertSpy.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "70000000-0000-0000-0000-000000000005",
						centerId: "center-1",
						invoiceId: "50000000-0000-0000-0000-000000000001",
						amount: 200,
						method: "check",
						provider: "manual",
						status: "posted",
					},
				]),
			}),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 1000,
								status: "sent",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: lockInvoiceSpy,
					select: selectExistingPaymentsSpy,
					insert: insertSpy,
					update: updateSpy,
				}),
			),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 200,
				method: "check",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("INVOICE_ALREADY_PAID");
		expect(lockInvoiceSpy).toHaveBeenCalledOnce();
		expect(selectExistingPaymentsSpy).not.toHaveBeenCalled();
		expect(insertSpy).not.toHaveBeenCalled();
		expect(updateSpy).not.toHaveBeenCalled();
	});

	it("accepts a payment that exactly matches the balance despite floating-point rounding", async () => {
		const lockInvoiceSpy = vi
			.fn()
			.mockResolvedValue(
				createLockedInvoiceResult({ amountDue: 0.3, status: "sent", paidAt: null }),
			);
		const selectExistingPaymentsSpy = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([
					{
						amount: 0.1,
					},
				]),
			}),
		});
		const setInvoiceSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 0.3,
								status: "sent",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: lockInvoiceSpy,
					select: selectExistingPaymentsSpy,
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "70000000-0000-0000-0000-000000000003",
									centerId: "center-1",
									invoiceId: "50000000-0000-0000-0000-000000000001",
									amount: 0.2,
									method: "credit_card",
									provider: "manual",
									status: "posted",
								},
							]),
						}),
					}),
					update: vi.fn().mockReturnValue({
						set: setInvoiceSpy,
					}),
				}),
			),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 0.2,
				method: "credit_card",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(201);
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "paid",
				paidAt: new Date("2026-04-30T15:00:00.000Z"),
			}),
		);
	});

	it("rejects payments for already-paid invoices with 409", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 1000,
								status: "paid",
								paidAt: "2026-04-01T00:00:00.000Z",
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 200,
				method: "check",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("INVOICE_ALREADY_PAID");
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("rejects payments for void invoices", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 1000,
								status: "void",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 200,
				method: "check",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(400);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("returns an internal error when payment creation returns no row", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "50000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								amountDue: 1000,
								status: "sent",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					execute: vi.fn().mockResolvedValue(createLockedInvoiceResult()),
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(undefined),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments",
			jsonBody({
				invoiceId: "50000000-0000-0000-0000-000000000001",
				amount: 200,
				method: "check",
				paidAt: "2026-04-30T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(500);
	});

	it("reverses a manual payment and reopens a paid invoice", async () => {
		const {
			db,
			lockPaymentSpy,
			lockInvoiceSpy,
			setPaymentSpy,
			setInvoiceSpy,
			insertAuditValuesSpy,
		} = createReversePaymentDb({
			remainingPayments: [],
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({
				reason: "Duplicate entry",
				reversedAt: "2026-05-01T15:30:00.000Z",
			}),
		);

		expect(res.status).toBe(200);
		expect(lockPaymentSpy).toHaveBeenCalledOnce();
		expect(lockInvoiceSpy).toHaveBeenCalledOnce();
		expect(setPaymentSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "reversed",
				reversedAt: new Date("2026-05-01T15:30:00.000Z"),
			}),
		);
		expect(setPaymentSpy.mock.calls[0]?.[0]).not.toHaveProperty("amount");
		expect(setPaymentSpy.mock.calls[0]?.[0]).not.toHaveProperty("provider");
		expect(setPaymentSpy.mock.calls[0]?.[0]).not.toHaveProperty("invoiceId");
		expect(setPaymentSpy.mock.calls[0]?.[0]).not.toHaveProperty("centerId");
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "sent",
				paidAt: null,
				publicLinkVersion: expect.anything(),
				publicLinkRotatedAt: expect.any(Date),
			}),
		);
		expect(setInvoiceSpy.mock.calls[0]?.[0]).not.toHaveProperty("amountDue");
		expect(insertAuditValuesSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-1",
				userId: "user-1",
				action: "update",
				entityType: "payments",
				entityId: PAYMENT_ID,
				changes: expect.objectContaining({
					after: expect.objectContaining({
						status: "reversed",
						reason: "Duplicate entry",
						invoiceStatus: "sent",
					}),
					changedFields: expect.arrayContaining(["reason", "status", "reversedAt"]),
				}),
			}),
		);
	});

	it("reads locked rows from execute array results", async () => {
		const { db, setInvoiceSpy } = createReversePaymentDb({
			executeRowsAsArray: true,
			remainingPayments: [{ amount: 1000, paidAt: new Date("2026-04-25T12:00:00.000Z") }],
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Correction" }),
		);

		expect(res.status).toBe(200);
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "paid",
				paidAt: new Date("2026-04-25T12:00:00.000Z"),
			}),
		);
	});

	it("returns 409 when payment is already reversed", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([createPaymentRow({ status: "reversed" })]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Duplicate entry" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("PAYMENT_ALREADY_REVERSED");
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("returns 409 when the locked payment was already reversed by another request", async () => {
		const { db, setPaymentSpy, setInvoiceSpy } = createReversePaymentDb({
			payment: createPaymentRow({ status: "reversed" }),
		});
		db.select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([createPaymentRow()]),
				}),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Concurrent correction" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("PAYMENT_ALREADY_REVERSED");
		expect(setPaymentSpy).not.toHaveBeenCalled();
		expect(setInvoiceSpy).not.toHaveBeenCalled();
	});

	it.each(["stripe", "quickbooks"] as const)("rejects %s payment reversals", async (provider) => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([createPaymentRow({ provider })]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Correction" }),
		);

		expect(res.status).toBe(400);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("returns 404 for missing or cross-center payments", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Wrong center" }),
		);

		expect(res.status).toBe(404);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("returns 400 for malformed payment reversal IDs", async () => {
		const db = createMockDb();
		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			"/api/payments/not-a-uuid/reverse",
			patchBody({ reason: "Bad id" }),
		);

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 404 when the locked payment disappears during reversal", async () => {
		const { db, setPaymentSpy, setInvoiceSpy } = createReversePaymentDb({
			payment: null,
		});
		db.select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([createPaymentRow()]),
				}),
			}),
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Concurrent delete" }),
		);

		expect(res.status).toBe(404);
		expect(setPaymentSpy).not.toHaveBeenCalled();
		expect(setInvoiceSpy).not.toHaveBeenCalled();
	});

	it("returns 404 when the locked invoice disappears during reversal", async () => {
		const { db, setPaymentSpy, setInvoiceSpy } = createReversePaymentDb({
			invoice: null,
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Concurrent invoice delete" }),
		);

		expect(res.status).toBe(404);
		expect(setPaymentSpy).not.toHaveBeenCalled();
		expect(setInvoiceSpy).not.toHaveBeenCalled();
	});

	it("returns 500 when reversal does not return an updated payment", async () => {
		const { db, setInvoiceSpy } = createReversePaymentDb({});
		db.transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({
				execute: vi
					.fn()
					.mockResolvedValueOnce({ rows: [createPaymentRow()] })
					.mockResolvedValueOnce({ rows: [createInvoiceRow()] }),
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
				update: vi
					.fn()
					.mockReturnValueOnce({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						}),
					})
					.mockReturnValueOnce({
						set: setInvoiceSpy,
					}),
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockResolvedValue([]),
				}),
			}),
		);

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "No returning row" }),
		);

		expect(res.status).toBe(500);
	});

	it("keeps a partially paid invoice sent after reversal", async () => {
		const { db, setInvoiceSpy } = createReversePaymentDb({
			invoice: createInvoiceRow({ status: "sent", paidAt: null }),
			remainingPayments: [{ amount: 300, paidAt: new Date("2026-04-15T12:00:00.000Z") }],
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Correction" }),
		);

		expect(res.status).toBe(200);
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "sent",
				paidAt: null,
			}),
		);
		expect(setInvoiceSpy.mock.calls[0]?.[0]).not.toHaveProperty("publicLinkVersion");
	});

	it("preserves void invoices when reversing a payment", async () => {
		const voidPaidAt = new Date("2026-04-10T12:00:00.000Z");
		const { db, setInvoiceSpy } = createReversePaymentDb({
			invoice: createInvoiceRow({ status: "void", paidAt: voidPaidAt }),
			remainingPayments: [],
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Correction" }),
		);

		expect(res.status).toBe(200);
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "void",
				paidAt: voidPaidAt,
			}),
		);
		expect(setInvoiceSpy.mock.calls[0]?.[0]).not.toHaveProperty("publicLinkVersion");
	});

	it("preserves overdue invoices when reversing a payment with remaining balance", async () => {
		const { db, setInvoiceSpy } = createReversePaymentDb({
			invoice: createInvoiceRow({ status: "overdue", paidAt: null }),
			remainingPayments: [{ amount: 300, paidAt: new Date("2026-04-15T12:00:00.000Z") }],
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Correction" }),
		);

		expect(res.status).toBe(200);
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "overdue",
				paidAt: null,
			}),
		);
	});

	it("recalculates paidAt from the latest remaining posted payment", async () => {
		const latestPaidAt = new Date("2026-04-25T12:00:00.000Z");
		const { db, setInvoiceSpy } = createReversePaymentDb({
			remainingPayments: [
				{ amount: 400, paidAt: new Date("2026-04-15T12:00:00.000Z") },
				{ amount: 600, paidAt: latestPaidAt },
			],
		});

		const app = createTestApp(mountPayments, db);
		const res = await app.request(
			`/api/payments/${PAYMENT_ID}/reverse`,
			patchBody({ reason: "Correction" }),
		);

		expect(res.status).toBe(200);
		expect(setInvoiceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "paid",
				paidAt: latestPaidAt,
			}),
		);
	});
});
