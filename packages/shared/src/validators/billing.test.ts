import { describe, expect, it } from "vitest";
import {
	createInvoiceSchema,
	createInvoiceTemplateSchema,
	editableInvoiceFieldsForStatus,
	paymentsQuerySchema,
	reversePaymentSchema,
	updateInvoiceSchema,
} from "./billing.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

const validInvoice = {
	guardianId: UUID,
	periodStart: "2026-04-01",
	periodEnd: "2026-04-30",
	status: "draft",
	lineItems: [
		{
			description: "Weekly tuition",
			quantity: 2,
			unitPrice: 150,
			amount: 300,
		},
	],
	subtotal: 300,
	subsidyCredit: 50,
	amountDue: 250,
};

describe("createInvoiceSchema", () => {
	it("rejects a line item when amount does not equal quantity times unitPrice", () => {
		expect(
			createInvoiceSchema.safeParse({
				...validInvoice,
				lineItems: [{ ...validInvoice.lineItems[0], amount: 301 }],
			}).success,
		).toBe(false);
	});

	it("rejects invoice subtotal that does not equal the sum of line item amounts", () => {
		expect(createInvoiceSchema.safeParse({ ...validInvoice, subtotal: 299 }).success).toBe(false);
	});

	it("rejects subsidy credit greater than subtotal", () => {
		expect(
			createInvoiceSchema.safeParse({
				...validInvoice,
				subsidyCredit: 301,
				amountDue: 0,
			}).success,
		).toBe(false);
	});

	it("rejects amountDue that does not equal subtotal minus subsidyCredit", () => {
		expect(createInvoiceSchema.safeParse({ ...validInvoice, amountDue: 249 }).success).toBe(false);
	});

	it("allows create requests to omit server-computed invoice totals", () => {
		const { subtotal, amountDue, ...invoiceWithoutComputedTotals } = validInvoice;

		expect(createInvoiceSchema.safeParse(invoiceWithoutComputedTotals).success).toBe(true);
	});

	it("rejects excessive subsidy credit when server-computed totals are omitted", () => {
		const { subtotal, amountDue, ...invoiceWithoutComputedTotals } = validInvoice;

		expect(
			createInvoiceSchema.safeParse({
				...invoiceWithoutComputedTotals,
				subsidyCredit: 301,
			}).success,
		).toBe(false);
	});

	it("rejects fractional line item quantities because invoices store integer quantities", () => {
		expect(
			createInvoiceSchema.safeParse({
				...validInvoice,
				lineItems: [
					{
						description: "Partial week",
						quantity: 1.25,
						unitPrice: 1200,
						amount: 1500,
					},
				],
				subtotal: 1500,
				amountDue: 1450,
			}).success,
		).toBe(false);
	});

	it("rejects an invoice with more than 200 line items (DoS cap)", () => {
		const lineItem = { description: "Item", quantity: 1, unitPrice: 10, amount: 10 };
		const tooManyItems = Array.from({ length: 201 }, () => lineItem);
		expect(
			createInvoiceSchema.safeParse({
				...validInvoice,
				lineItems: tooManyItems,
				subtotal: 2010,
				subsidyCredit: 0,
				amountDue: 2010,
			}).success,
		).toBe(false);
	});

	it("accepts an invoice with exactly 200 line items", () => {
		const lineItem = { description: "Item", quantity: 1, unitPrice: 10, amount: 10 };
		const maxItems = Array.from({ length: 200 }, () => lineItem);
		expect(
			createInvoiceSchema.safeParse({
				...validInvoice,
				lineItems: maxItems,
				subtotal: 2000,
				subsidyCredit: 0,
				amountDue: 2000,
			}).success,
		).toBe(true);
	});
});

describe("updateInvoiceSchema", () => {
	it("rejects invoice math mismatches when all dependent fields are present", () => {
		expect(updateInvoiceSchema.safeParse({ ...validInvoice, amountDue: 251 }).success).toBe(false);
	});
});

describe("createInvoiceTemplateSchema", () => {
	it("rejects fractional template quantities because the database stores integers", () => {
		expect(
			createInvoiceTemplateSchema.safeParse({
				name: "Monthly tuition",
				dueDays: 14,
				lineItems: [
					{
						description: "Tuition",
						quantity: 1.25,
						unitPrice: 1200,
						amount: 1500,
					},
				],
			}).success,
		).toBe(false);
	});
});

describe("reversePaymentSchema", () => {
	it("accepts a reason and optional reversal timestamp", () => {
		const result = reversePaymentSchema.safeParse({
			reason: "Guardian check was entered twice.",
			reversedAt: "2026-05-01T15:30:00.000Z",
		});

		expect(result.success).toBe(true);
	});

	it("rejects missing, empty, and overly long reasons", () => {
		expect(reversePaymentSchema.safeParse({}).success).toBe(false);
		expect(reversePaymentSchema.safeParse({ reason: "" }).success).toBe(false);
		expect(reversePaymentSchema.safeParse({ reason: " ".repeat(3) }).success).toBe(false);
		expect(reversePaymentSchema.safeParse({ reason: "a".repeat(501) }).success).toBe(false);
	});

	it("rejects invalid reversal timestamps", () => {
		expect(
			reversePaymentSchema.safeParse({
				reason: "Wrong invoice.",
				reversedAt: "2026-05-01",
			}).success,
		).toBe(false);
	});
});

describe("paymentsQuerySchema", () => {
	it("rejects invalid invoice IDs before they reach database UUID predicates", () => {
		expect(paymentsQuerySchema.safeParse({ invoiceId: "not-a-uuid" }).success).toBe(false);
		expect(paymentsQuerySchema.safeParse({ invoiceId: UUID }).success).toBe(true);
	});
});

describe("editableInvoiceFieldsForStatus", () => {
	it("returns null (no restriction) for draft invoices", () => {
		expect(editableInvoiceFieldsForStatus("draft")).toBeNull();
	});

	it("allows only dueDate for sent and overdue invoices", () => {
		for (const status of ["sent", "overdue"] as const) {
			const allowed = editableInvoiceFieldsForStatus(status);
			expect(allowed).toEqual(new Set(["dueDate"]));
			// notes/memo are not invoice columns and are stripped by the strict
			// schema, so they must not appear in the editable allowlist.
			expect(allowed?.has("notes")).toBe(false);
			expect(allowed?.has("memo")).toBe(false);
		}
	});

	it("allows no edits for paid and void invoices", () => {
		expect(editableInvoiceFieldsForStatus("paid")?.size).toBe(0);
		expect(editableInvoiceFieldsForStatus("void")?.size).toBe(0);
	});
});
