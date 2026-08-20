import { describe, expect, it } from "vitest";
import {
	auditLogListResponseSchema,
	invoiceSummaryResponseSchema,
	invoicesListResponseSchema,
	invoiceTemplateDetailResponseSchema,
	invoiceTemplatesListResponseSchema,
	paymentsListResponseSchema,
	reportsListResponseSchema,
	subsidyCasesListResponseSchema,
	subsidyClaimsListResponseSchema,
} from "./finance-responses.js";

describe("finance response validators", () => {
	it("parses an invoices list and preserves unknown fields", () => {
		const parsed = invoicesListResponseSchema.parse({
			invoices: [{ id: "inv-1", status: "draft", amountDue: 1200 }],
		});
		expect(parsed.invoices[0]).toMatchObject({ id: "inv-1", amountDue: 1200 });
	});

	it("rejects an invoices list missing the wrapper key", () => {
		expect(() => invoicesListResponseSchema.parse({ items: [] })).toThrow();
	});

	it("rejects an invoice record without an id", () => {
		expect(() => invoicesListResponseSchema.parse({ invoices: [{ status: "draft" }] })).toThrow();
	});

	it("parses the invoice summary response", () => {
		const parsed = invoiceSummaryResponseSchema.parse({ overdueInvoiceCount: 3, extra: "ok" });
		expect(parsed.overdueInvoiceCount).toBe(3);
	});

	it("rejects a negative overdue invoice count", () => {
		expect(() => invoiceSummaryResponseSchema.parse({ overdueInvoiceCount: -1 })).toThrow();
	});

	it("parses a payments list", () => {
		const parsed = paymentsListResponseSchema.parse({ payments: [{ id: "pay-1" }] });
		expect(parsed.payments).toHaveLength(1);
	});

	it("parses subsidy cases and claims lists", () => {
		expect(subsidyCasesListResponseSchema.parse({ subsidyCases: [{ id: "case-1" }] })).toBeTruthy();
		expect(
			subsidyClaimsListResponseSchema.parse({ subsidyClaims: [{ id: "claim-1" }] }),
		).toBeTruthy();
	});

	it("parses an invoice templates list", () => {
		const parsed = invoiceTemplatesListResponseSchema.parse({
			invoiceTemplates: [{ id: "tpl-1", name: "Monthly" }],
		});
		expect(parsed.invoiceTemplates[0]).toMatchObject({ name: "Monthly" });
	});

	it("parses an invoice template detail", () => {
		const parsed = invoiceTemplateDetailResponseSchema.parse({
			invoiceTemplate: { id: "tpl-1" },
			lineItems: [{ id: "li-1", description: "Tuition" }],
		});
		expect(parsed.lineItems).toHaveLength(1);
	});

	it("rejects an invoice template detail missing lineItems", () => {
		expect(() =>
			invoiceTemplateDetailResponseSchema.parse({ invoiceTemplate: { id: "tpl-1" } }),
		).toThrow();
	});

	it("parses reports and audit log lists", () => {
		expect(
			reportsListResponseSchema.parse({ reports: [{ id: "r-1", reportType: "attendance" }] }),
		).toBeTruthy();
		expect(
			auditLogListResponseSchema.parse({ entries: [{ id: "log-1", action: "export" }] }),
		).toBeTruthy();
	});

	it("rejects an audit log list with a missing wrapper", () => {
		expect(() => auditLogListResponseSchema.parse({ reports: [] })).toThrow();
	});

	it("parses an audit log response with a numeric nextCursor", () => {
		const parsed = auditLogListResponseSchema.parse({
			entries: [{ id: "log-1", action: "export" }],
			nextCursor: 50,
		});
		expect(parsed.nextCursor).toBe(50);
	});

	it("parses an audit log response with nextCursor null", () => {
		const parsed = auditLogListResponseSchema.parse({
			entries: [{ id: "log-1", action: "export" }],
			nextCursor: null,
		});
		expect(parsed.nextCursor).toBeNull();
	});

	it("parses an audit log response without nextCursor (field absent)", () => {
		const parsed = auditLogListResponseSchema.parse({
			entries: [{ id: "log-1", action: "export" }],
		});
		expect(parsed.nextCursor).toBeUndefined();
	});

	it("rejects a non-integer nextCursor", () => {
		expect(() =>
			auditLogListResponseSchema.parse({
				entries: [{ id: "log-1" }],
				nextCursor: 1.5,
			}),
		).toThrow();
	});
});
