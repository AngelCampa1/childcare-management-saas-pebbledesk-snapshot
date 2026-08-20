import { z } from "zod";

/**
 * Response shapes for finance query/mutation endpoints (invoices, payments,
 * subsidy cases/claims, invoice templates, reports, audit log). All record
 * schemas use `passthrough()` so unknown fields from the API are preserved —
 * only the minimal discriminating fields the web app branches on are required.
 */
const idRecordSchema = z.object({ id: z.string() }).passthrough();

export const invoicesListResponseSchema = z
	.object({ invoices: z.array(idRecordSchema) })
	.passthrough();

export const invoiceSummaryResponseSchema = z
	.object({ overdueInvoiceCount: z.number().int().nonnegative() })
	.passthrough();

export const paymentsListResponseSchema = z
	.object({ payments: z.array(idRecordSchema) })
	.passthrough();

export const subsidyCasesListResponseSchema = z
	.object({ subsidyCases: z.array(idRecordSchema) })
	.passthrough();

export const subsidyClaimsListResponseSchema = z
	.object({ subsidyClaims: z.array(idRecordSchema) })
	.passthrough();

export const invoiceTemplatesListResponseSchema = z
	.object({ invoiceTemplates: z.array(idRecordSchema) })
	.passthrough();

export const invoiceTemplateDetailResponseSchema = z
	.object({
		invoiceTemplate: idRecordSchema,
		lineItems: z.array(idRecordSchema),
	})
	.passthrough();

export const reportsListResponseSchema = z
	.object({ reports: z.array(idRecordSchema) })
	.passthrough();

export const auditLogListResponseSchema = z.object({
	entries: z.array(idRecordSchema),
	nextCursor: z.number().int().nullable().optional(),
});
