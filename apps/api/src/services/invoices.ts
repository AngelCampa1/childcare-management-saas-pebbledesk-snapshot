import type { Database } from "@pebbledesk/db";
import { children, guardians, invoiceLineItems, invoices } from "@pebbledesk/db";
import type { CreateInvoiceInput } from "@pebbledesk/shared";
import { and, eq } from "drizzle-orm";
import { computeInvoiceTotals } from "../lib/billing-subsidy.js";

type Invoice = typeof invoices.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const DUPLICATE_INVOICE_MESSAGE =
	"Invoice already exists for this guardian and billing period";

async function insertInvoice(
	tx: Tx,
	centerId: string,
	input: CreateInvoiceInput,
): Promise<Invoice> {
	const [guardian] = await tx
		.select({ id: guardians.id })
		.from(guardians)
		.where(and(eq(guardians.id, input.guardianId), eq(guardians.centerId, centerId)))
		.limit(1);

	if (!guardian) {
		throw new Error("Guardian not found");
	}

	for (const lineItem of input.lineItems) {
		if (!lineItem.childId) continue;
		const [child] = await tx
			.select({ id: children.id })
			.from(children)
			.where(and(eq(children.id, lineItem.childId), eq(children.centerId, centerId)))
			.limit(1);

		if (!child) {
			throw new Error("Child not found");
		}
	}

	const [existingInvoice] = await tx
		.select({ id: invoices.id })
		.from(invoices)
		.where(
			and(
				eq(invoices.centerId, centerId),
				eq(invoices.guardianId, input.guardianId),
				eq(invoices.periodStart, input.periodStart),
				eq(invoices.periodEnd, input.periodEnd),
			),
		)
		.limit(1);

	if (existingInvoice) {
		throw new Error(DUPLICATE_INVOICE_MESSAGE);
	}

	// Compute each line item's amount server-side; never trust the client-supplied value.
	const lineItemsWithAmount = input.lineItems.map((lineItem) => ({
		...lineItem,
		amount: lineItem.quantity * lineItem.unitPrice,
	}));
	const totals = computeInvoiceTotals(lineItemsWithAmount, input.subsidyCredit);
	if (Number(input.subsidyCredit) > totals.subtotal) {
		throw new Error("subsidyCredit must not exceed subtotal");
	}

	const [invoice] = await tx
		.insert(invoices)
		.values({
			centerId,
			guardianId: input.guardianId,
			periodStart: input.periodStart,
			periodEnd: input.periodEnd,
			status: input.status,
			dueDate: input.dueDate,
			paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
			subtotal: String(totals.subtotal),
			subsidyCredit: String(input.subsidyCredit),
			amountDue: String(totals.amountDue),
		})
		.returning();

	if (!invoice) {
		throw new Error("Failed to create invoice");
	}

	await tx.insert(invoiceLineItems).values(
		lineItemsWithAmount.map((lineItem) => ({
			centerId,
			invoiceId: invoice.id,
			childId: lineItem.childId,
			description: lineItem.description,
			quantity: lineItem.quantity,
			unitPrice: String(lineItem.unitPrice),
			amount: String(lineItem.amount),
		})),
	);

	return invoice;
}

export async function createInvoice(
	db: Database | Tx,
	centerId: string,
	input: CreateInvoiceInput,
): Promise<Invoice> {
	// When a transaction is passed (e.g. from the import handler), use it directly.
	// When a bare Database is passed, wrap in a new transaction for atomicity.
	if ("transaction" in db && typeof db.transaction === "function") {
		return (db as Database).transaction((tx) => insertInvoice(tx, centerId, input));
	}
	return insertInvoice(db as Tx, centerId, input);
}
