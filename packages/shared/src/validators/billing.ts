import { z } from "zod";
import {
	INVOICE_STATUSES,
	PAYMENT_METHODS,
	PAYMENT_PROVIDERS,
	PAYMENT_STATUSES,
} from "../constants/enums.js";
import { uuidLikeSchema } from "./id.js";

const invoiceLineItemSchema = z
	.object({
		childId: uuidLikeSchema.optional(),
		description: z.string().min(1).max(255),
		quantity: z.number().int().positive(),
		unitPrice: z.number().nonnegative(),
		amount: z.number().nonnegative(),
	})
	.strict()
	.refine((data) => toCents(data.amount) === toCents(data.quantity * data.unitPrice), {
		message: "amount must equal quantity times unitPrice",
		path: ["amount"],
	});

const invoiceTemplateLineItemSchema = z
	.object({
		description: z.string().min(1).max(255),
		quantity: z.number().int().positive(),
		unitPrice: z.number().nonnegative(),
		amount: z.number().nonnegative(),
	})
	.strict()
	.refine((data) => toCents(data.amount) === toCents(data.quantity * data.unitPrice), {
		message: "amount must equal quantity times unitPrice",
		path: ["amount"],
	});

function toCents(amount: number) {
	return Math.round(amount * 100);
}

function addInvoiceMathIssues(
	data: {
		lineItems?: Array<{ amount: number }>;
		subtotal?: number;
		subsidyCredit?: number;
		amountDue?: number;
	},
	ctx: z.RefinementCtx,
) {
	if (data.lineItems && data.subtotal !== undefined) {
		const lineItemTotal = data.lineItems.reduce((total, item) => total + toCents(item.amount), 0);
		if (toCents(data.subtotal) !== lineItemTotal) {
			ctx.addIssue({
				code: "custom",
				message: "subtotal must equal the sum of line item amounts",
				path: ["subtotal"],
			});
		}
	}

	if (data.subsidyCredit !== undefined) {
		const subtotalCents =
			data.subtotal !== undefined
				? toCents(data.subtotal)
				: data.lineItems?.reduce((total, item) => total + toCents(item.amount), 0);
		if (subtotalCents !== undefined && toCents(data.subsidyCredit) > subtotalCents) {
			ctx.addIssue({
				code: "custom",
				message: "subsidyCredit must not exceed subtotal",
				path: ["subsidyCredit"],
			});
		}
	}

	if (
		data.subtotal !== undefined &&
		data.subsidyCredit !== undefined &&
		data.amountDue !== undefined
	) {
		const expectedAmountDue = toCents(data.subtotal) - toCents(data.subsidyCredit);
		if (toCents(data.amountDue) !== expectedAmountDue) {
			ctx.addIssue({
				code: "custom",
				message: "amountDue must equal subtotal minus subsidyCredit",
				path: ["amountDue"],
			});
		}
	}
}

const invoicePeriodRefine = {
	check: (data: { periodStart?: string; periodEnd?: string }) =>
		!data.periodStart || !data.periodEnd || data.periodStart <= data.periodEnd,
	params: { message: "periodStart must be on or before periodEnd", path: ["periodStart"] },
};

const invoiceShape = {
	guardianId: uuidLikeSchema,
	periodStart: z.string().date(),
	periodEnd: z.string().date(),
	status: z.enum(INVOICE_STATUSES),
	dueDate: z.string().date().optional(),
	paidAt: z.string().datetime().optional(),
	lineItems: z.array(invoiceLineItemSchema).min(1).max(200),
	subtotal: z.number().nonnegative(),
	subsidyCredit: z.number().nonnegative(),
	amountDue: z.number().nonnegative(),
};

const createInvoiceBaseSchema = z
	.object({
		...invoiceShape,
		status: invoiceShape.status.default("draft"),
		subtotal: invoiceShape.subtotal.optional(),
		subsidyCredit: invoiceShape.subsidyCredit.default(0),
		amountDue: invoiceShape.amountDue.optional(),
	})
	.strict();

export const createInvoiceSchema = createInvoiceBaseSchema
	.refine(invoicePeriodRefine.check, invoicePeriodRefine.params)
	.superRefine(addInvoiceMathIssues);

export const updateInvoiceSchema = createInvoiceBaseSchema
	.extend(invoiceShape)
	.partial()
	.refine(invoicePeriodRefine.check, invoicePeriodRefine.params)
	.superRefine(addInvoiceMathIssues);

export const createInvoiceTemplateSchema = z
	.object({
		name: z.string().min(1).max(255),
		description: z.string().max(1000).optional(),
		dueDays: z.number().int().nonnegative().default(0),
		isDefault: z.boolean().default(false),
		lineItems: z.array(invoiceTemplateLineItemSchema).min(1),
	})
	.strict();

export const updateInvoiceTemplateSchema = createInvoiceTemplateSchema
	.extend({
		dueDays: z.number().int().nonnegative(),
		isDefault: z.boolean(),
	})
	.partial();

export const createPaymentSchema = z
	.object({
		invoiceId: uuidLikeSchema,
		amount: z.number().positive(),
		method: z.enum(PAYMENT_METHODS),
		provider: z.enum(PAYMENT_PROVIDERS).default("manual"),
		providerReferenceId: z.string().min(1).max(255).optional(),
		providerTransactionId: z.string().min(1).max(255).optional(),
		reference: z.string().max(100).optional(),
		paidAt: z.string().datetime(),
	})
	.strict();

export const reversePaymentSchema = z
	.object({
		reason: z.string().trim().min(1).max(500),
		reversedAt: z.string().datetime().optional(),
	})
	.strict();

export const paymentsQuerySchema = z
	.object({
		method: z.enum([...PAYMENT_METHODS, "all"] as [string, ...string[]]).optional(),
		status: z.enum([...PAYMENT_STATUSES, "all"] as [string, ...string[]]).optional(),
		dateFrom: z.string().date().optional(),
		dateTo: z.string().date().optional(),
		search: z.string().max(200).optional(),
		invoiceId: uuidLikeSchema.optional(),
		limit: z.coerce.number().int().min(1).max(200).optional(),
		cursor: z.coerce.number().int().min(0).optional(),
	})
	.strict();

export type PaymentsQuery = z.infer<typeof paymentsQuerySchema>;

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreateInvoiceTemplateInput = z.infer<typeof createInvoiceTemplateSchema>;
export type UpdateInvoiceTemplateInput = z.infer<typeof updateInvoiceTemplateSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;

/**
 * Returns the set of invoice field keys that are permitted to be edited for
 * a given status. Draft invoices allow all fields; sent/overdue allow only
 * dueDate; paid/void allow no edits.
 */
export function editableInvoiceFieldsForStatus(
	status: (typeof INVOICE_STATUSES)[number],
): Set<string> | null {
	if (status === "draft") return null; // null = no restriction
	if (status === "sent" || status === "overdue") {
		return new Set(["dueDate"]);
	}
	// paid / void
	return new Set();
}
