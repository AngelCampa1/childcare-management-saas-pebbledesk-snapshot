import { describe, expect, it, vi } from "vitest";
import { createMockDb } from "../test/setup.js";

const { createInvoice, DUPLICATE_INVOICE_MESSAGE } = await import("./invoices.js");

function createOwnershipSelect() {
	return vi
		.fn()
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ id: "owned-record" }]),
				}),
			}),
		})
		.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				}),
			}),
		});
}

describe("createInvoice", () => {
	it("rejects invoices for guardians outside the current center", async () => {
		const insert = vi.fn();
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
					insert,
				}),
			),
		});

		await expect(
			createInvoice(db as never, "center-1", {
				guardianId: "60000000-0000-0000-0000-000000000099",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 0,
				subtotal: 0,
				amountDue: 0,
				status: "draft",
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 800,
						amount: 800,
					},
				],
			}),
		).rejects.toThrow("Guardian not found");
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects invoice line items for children outside the current center", async () => {
		const insert = vi.fn();
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: vi
						.fn()
						.mockReturnValueOnce({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
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
					insert,
				}),
			),
		});

		await expect(
			createInvoice(db as never, "center-1", {
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 0,
				subtotal: 0,
				amountDue: 0,
				status: "draft",
				lineItems: [
					{
						childId: "50000000-0000-0000-0000-000000000099",
						description: "Tuition",
						quantity: 1,
						unitPrice: 800,
						amount: 800,
					},
				],
			}),
		).rejects.toThrow("Child not found");
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects duplicate invoices for the same guardian and billing period", async () => {
		const insert = vi.fn();
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: vi
						.fn()
						.mockReturnValueOnce({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
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
					insert,
				}),
			),
		});

		await expect(
			createInvoice(db as never, "center-1", {
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 0,
				subtotal: 0,
				amountDue: 0,
				status: "draft",
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 800,
						amount: 800,
					},
				],
			}),
		).rejects.toThrow(DUPLICATE_INVOICE_MESSAGE);
		expect(insert).not.toHaveBeenCalled();
	});

	it("creates an invoice with computed totals and inserts line items", async () => {
		const newInvoice = {
			id: "invoice-1",
			centerId: "center-1",
			guardianId: "60000000-0000-0000-0000-000000000001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			subtotal: 1200,
			subsidyCredit: 200,
			amountDue: 1000,
			status: "draft",
			dueDate: null,
			paidAt: null,
			publicLinkToken: null,
			publicLinkVersion: 1,
			publicLinkRotatedAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: createOwnershipSelect(),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([newInvoice]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockResolvedValue(undefined),
						}),
				}),
			),
		});

		const result = await createInvoice(db as never, "center-1", {
			guardianId: "60000000-0000-0000-0000-000000000001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			subsidyCredit: 200,
			subtotal: 0,
			amountDue: 0,
			status: "draft",
			lineItems: [
				{
					description: "Tuition",
					quantity: 1,
					unitPrice: 1200,
					amount: 1200,
				},
			],
		});

		expect(db.transaction).toHaveBeenCalled();
		expect(result.amountDue).toBe(1000);
		expect(result.subtotal).toBe(1200);
		expect(result.subsidyCredit).toBe(200);
	});

	it("rejects subsidy credits that exceed the computed subtotal", async () => {
		const insert = vi.fn();
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: createOwnershipSelect(),
					insert,
				}),
			),
		});

		await expect(
			createInvoice(db as never, "center-1", {
				guardianId: "60000000-0000-0000-0000-000000000002",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 600,
				subtotal: 0,
				amountDue: 0,
				status: "draft",
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 500,
						amount: 500,
					},
				],
			}),
		).rejects.toThrow("subsidyCredit must not exceed subtotal");

		expect(insert).not.toHaveBeenCalled();
	});

	it("creates an invoice with a paidAt timestamp when provided", async () => {
		const paidAt = "2026-04-10T12:00:00.000Z";
		const newInvoice = {
			id: "invoice-paid",
			centerId: "center-1",
			guardianId: "60000000-0000-0000-0000-000000000001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			subtotal: 800,
			subsidyCredit: 0,
			amountDue: 800,
			status: "paid",
			dueDate: null,
			paidAt: new Date(paidAt),
			publicLinkToken: null,
			publicLinkVersion: 1,
			publicLinkRotatedAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: createOwnershipSelect(),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([newInvoice]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockResolvedValue(undefined),
						}),
				}),
			),
		});

		const result = await createInvoice(db as never, "center-1", {
			guardianId: "60000000-0000-0000-0000-000000000001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			subsidyCredit: 0,
			subtotal: 0,
			amountDue: 0,
			status: "paid",
			paidAt,
			lineItems: [
				{
					description: "Tuition",
					quantity: 1,
					unitPrice: 800,
					amount: 800,
				},
			],
		});

		expect(result.status).toBe("paid");
		expect(result.paidAt).toBeTruthy();
	});

	it("ignores client-supplied line item amount and computes from quantity × unitPrice", async () => {
		// Client sends amount: 1, but quantity=2, unitPrice=100 → server must compute 200
		const newInvoice = {
			id: "invoice-compute",
			centerId: "center-1",
			guardianId: "60000000-0000-0000-0000-000000000001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			subtotal: 200,
			subsidyCredit: 0,
			amountDue: 200,
			status: "draft",
			dueDate: null,
			paidAt: null,
			publicLinkToken: null,
			publicLinkVersion: 1,
			publicLinkRotatedAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const lineItemValuesCapture = vi.fn().mockResolvedValue(undefined);
		const lineItemInsertBuilder = { values: lineItemValuesCapture };

		const invoiceInsertBuilder = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([newInvoice]),
			}),
		};

		const txInsert = vi
			.fn()
			.mockReturnValueOnce(invoiceInsertBuilder)
			.mockReturnValueOnce(lineItemInsertBuilder);

		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({ select: createOwnershipSelect(), insert: txInsert }),
				),
		});

		await createInvoice(db as never, "center-1", {
			guardianId: "60000000-0000-0000-0000-000000000001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			subsidyCredit: 0,
			subtotal: 0,
			amountDue: 0,
			status: "draft",
			lineItems: [
				{
					description: "Tuition",
					quantity: 2,
					unitPrice: 100,
					amount: 1, // deliberately wrong — server must ignore this
				},
			],
		});

		// Verify the line item insert received amount="200" (quantity×unitPrice coerced to string), not 1
		const lineItemsArg = lineItemValuesCapture.mock.calls[0]?.[0] as Array<{
			amount: string;
			centerId: string;
		}>;
		expect(lineItemsArg[0]?.amount).toBe("200");
		expect(lineItemsArg[0]?.centerId).toBe("center-1");
	});

	it("throws when the invoice insert returns no row", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: createOwnershipSelect(),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			),
		});

		await expect(
			createInvoice(db as never, "center-1", {
				guardianId: "60000000-0000-0000-0000-000000000003",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 0,
				subtotal: 0,
				amountDue: 0,
				status: "draft",
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 800,
						amount: 800,
					},
				],
			}),
		).rejects.toThrow("Failed to create invoice");
	});

	it("uses an existing transaction object without opening a nested transaction", async () => {
		const newInvoice = {
			id: "invoice-direct-tx",
			centerId: "center-1",
			guardianId: "60000000-0000-0000-0000-000000000001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			subtotal: 300,
			subsidyCredit: 0,
			amountDue: 300,
			status: "draft",
			dueDate: null,
			paidAt: null,
			publicLinkToken: null,
			publicLinkVersion: 1,
			publicLinkRotatedAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const insert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([newInvoice]),
				}),
			})
			.mockReturnValueOnce({
				values: vi.fn().mockResolvedValue(undefined),
			});

		const result = await createInvoice(
			{ select: createOwnershipSelect(), insert } as never,
			"center-1",
			{
				guardianId: "60000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				subsidyCredit: 0,
				subtotal: 0,
				amountDue: 0,
				status: "draft",
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 300,
						amount: 999,
					},
				],
			},
		);

		expect(result.id).toBe("invoice-direct-tx");
		expect(insert).toHaveBeenCalledTimes(2);
	});
});
