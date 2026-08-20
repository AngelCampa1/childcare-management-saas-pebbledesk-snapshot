import { zValidator } from "@hono/zod-validator";
import type { Database } from "@pebbledesk/db";
import { centers, children, guardians, invoiceLineItems, invoices } from "@pebbledesk/db";
import {
	createChildSchema,
	createGuardianSchema,
	createInvoiceSchema,
	enrollChildSchema,
} from "@pebbledesk/shared";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { computeInvoiceTotals } from "../lib/billing-subsidy.js";
import type { AppEnv } from "../lib/context.js";
import { createPublicLinkNonce } from "../lib/public-billing.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/plan.js";
import { createChild, enrollChild } from "../services/children.js";
import { createGuardian } from "../services/guardians.js";
import { createInvoice } from "../services/invoices.js";

type ImportResult = {
	inserted: number;
	updated: number;
	skipped: number;
	errors: Array<{ rowIndex: number; message: string }>;
};

const importChildrenSchema = z.object({
	rows: z.array(createChildSchema).min(1).max(500),
	dedupeStrategy: z.enum(["skip", "error"]),
});

const importGuardiansSchema = z.object({
	rows: z.array(createGuardianSchema).min(1).max(500),
	dedupeStrategy: z.enum(["skip", "error"]),
});

const importInvoicesSchema = z.object({
	rows: z.array(createInvoiceSchema).min(1).max(500),
	dedupeStrategy: z.enum(["skip", "error", "upsert"]),
});

type InvoiceImportRow = z.infer<typeof createInvoiceSchema>;
type ImportTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

function assertPaidInvoiceImportState(row: InvoiceImportRow) {
	if (row.status === "paid" && !row.paidAt) {
		throw new Error("Paid invoices require a paidAt timestamp");
	}
}

async function assertInvoiceImportOwnership(tx: ImportTx, centerId: string, row: InvoiceImportRow) {
	const [guardian] = await tx
		.select({ id: guardians.id })
		.from(guardians)
		.where(and(eq(guardians.id, row.guardianId), eq(guardians.centerId, centerId)))
		.limit(1);

	if (!guardian) {
		throw new Error("Guardian not found");
	}

	for (const lineItem of row.lineItems) {
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
}

const importEnrollSchema = z.object({
	rows: z.array(enrollChildSchema).min(1).max(500),
	dedupeStrategy: z.enum(["skip", "error"]),
});

const importsRouter = new Hono<AppEnv>();

importsRouter.use(
	"*",
	requireAuth,
	requireRole("owner", "director"),
	requireCenter,
	requireEntitlement("imports"),
);

importsRouter.post("/children", zValidator("json", importChildrenSchema), async (c) => {
	const { rows, dedupeStrategy } = c.req.valid("json");
	const db = c.get("db");
	// centerId is guaranteed by requireCenter middleware used on all importsRouter routes
	const centerId = c.get("centerId");
	if (!centerId) throw new Response(null, { status: 500 });

	const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

	await db.transaction(async (tx) => {
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const firstNameNorm = row.firstName.toLowerCase().trim();
			const lastNameNorm = row.lastName.toLowerCase().trim();
			const existing = await tx
				.select({ id: children.id })
				.from(children)
				.where(
					and(
						eq(children.centerId, centerId),
						sql`lower(trim(${children.firstName})) = ${firstNameNorm}`,
						sql`lower(trim(${children.lastName})) = ${lastNameNorm}`,
						eq(children.dateOfBirth, row.dateOfBirth),
					),
				)
				.limit(1);

			if (existing.length > 0) {
				if (dedupeStrategy === "error") {
					throw new HTTPException(422, {
						message: `Row ${i}: duplicate child ${row.firstName} ${row.lastName} (${row.dateOfBirth})`,
					});
				}
				result.skipped++;
				continue;
			}

			try {
				await createChild(tx, centerId, row);
				result.inserted++;
			} catch (err) {
				if (dedupeStrategy === "error") {
					throw err;
				}
				result.errors.push({
					rowIndex: i,
					message: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}
	});

	return c.json(result, 200);
});

importsRouter.post("/guardians", zValidator("json", importGuardiansSchema), async (c) => {
	const { rows, dedupeStrategy } = c.req.valid("json");
	const db = c.get("db");
	// centerId is guaranteed by requireCenter middleware used on all importsRouter routes
	const centerId = c.get("centerId");
	if (!centerId) throw new Response(null, { status: 500 });

	const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

	await db.transaction(async (tx) => {
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];

			let isDuplicate = false;

			if (row.email) {
				// Strong key: email
				const emailNorm = row.email.toLowerCase().trim();
				const existing = await tx
					.select({ id: guardians.id })
					.from(guardians)
					.where(
						and(
							eq(guardians.centerId, centerId),
							sql`lower(trim(${guardians.email})) = ${emailNorm}`,
						),
					)
					.limit(1);
				isDuplicate = existing.length > 0;
			} else if (row.phone) {
				// Strong key: name + phone (no email)
				const existing = await tx
					.select({ id: guardians.id })
					.from(guardians)
					.where(
						and(
							eq(guardians.centerId, centerId),
							eq(guardians.firstName, row.firstName),
							eq(guardians.lastName, row.lastName),
							eq(guardians.phone, row.phone),
						),
					)
					.limit(1);
				isDuplicate = existing.length > 0;
			}
			// else: no email and no phone — no strong identifier, never treat as duplicate

			if (isDuplicate) {
				if (dedupeStrategy === "error") {
					throw new HTTPException(422, {
						message: `Row ${i}: duplicate guardian ${row.firstName} ${row.lastName}`,
					});
				}
				result.skipped++;
				continue;
			}

			try {
				await createGuardian(tx, centerId, row);
				result.inserted++;
			} catch (err) {
				if (dedupeStrategy === "error") {
					throw err;
				}
				result.errors.push({
					rowIndex: i,
					message: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}
	});

	return c.json(result, 200);
});

importsRouter.post("/invoices", zValidator("json", importInvoicesSchema), async (c) => {
	const { rows, dedupeStrategy } = c.req.valid("json");
	const db = c.get("db");
	// centerId is guaranteed by requireCenter middleware used on all importsRouter routes
	const centerId = c.get("centerId");
	if (!centerId) throw new Response(null, { status: 500 });

	const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

	await db.transaction(async (tx) => {
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];

			// Dedup check: find existing invoice with same (centerId, guardianId, periodStart, periodEnd)
			const existing = await tx
				.select({
					id: invoices.id,
					status: invoices.status,
					paidAt: invoices.paidAt,
					publicLinkToken: invoices.publicLinkToken,
					publicLinkVersion: invoices.publicLinkVersion,
				})
				.from(invoices)
				.where(
					and(
						eq(invoices.centerId, centerId),
						eq(invoices.guardianId, row.guardianId),
						eq(invoices.periodStart, row.periodStart),
						eq(invoices.periodEnd, row.periodEnd),
					),
				)
				.limit(1);

			if (existing.length > 0) {
				if (dedupeStrategy === "error") {
					throw new HTTPException(422, {
						message: `Row ${i}: duplicate invoice for guardian ${row.guardianId} period ${row.periodStart}–${row.periodEnd}`,
					});
				}
				if (dedupeStrategy === "upsert") {
					await assertInvoiceImportOwnership(tx, centerId, row);
					assertPaidInvoiceImportState(row);
					const lineItemsWithAmount = row.lineItems.map((lineItem) => ({
						...lineItem,
						amount: lineItem.quantity * lineItem.unitPrice,
					}));
					const totals = computeInvoiceTotals(lineItemsWithAmount, row.subsidyCredit);
					const existingInvoice = existing[0];
					if (existingInvoice.status !== "draft") {
						throw new HTTPException(409, { message: "invoice_locked" });
					}
					// Update the existing invoice in place
					await tx
						.update(invoices)
						.set({
							status: row.status,
							dueDate: row.dueDate,
							paidAt: row.paidAt ? new Date(row.paidAt) : null,
							subtotal: String(totals.subtotal),
							subsidyCredit: String(row.subsidyCredit),
							amountDue: String(totals.amountDue),
							...(existingInvoice.publicLinkToken
								? {
										publicLinkToken: createPublicLinkNonce(),
										publicLinkVersion: existingInvoice.publicLinkVersion + 1,
										publicLinkRotatedAt: new Date(),
									}
								: {}),
							updatedAt: new Date(),
						})
						.where(and(eq(invoices.centerId, centerId), eq(invoices.id, existingInvoice.id)));
					await tx
						.delete(invoiceLineItems)
						.where(
							and(
								eq(invoiceLineItems.invoiceId, existingInvoice.id),
								eq(invoiceLineItems.centerId, centerId),
							),
						);
					await tx.insert(invoiceLineItems).values(
						lineItemsWithAmount.map((lineItem) => ({
							centerId,
							invoiceId: existingInvoice.id,
							childId: lineItem.childId,
							description: lineItem.description,
							quantity: lineItem.quantity,
							unitPrice: String(lineItem.unitPrice),
							amount: String(lineItem.amount),
						})),
					);
					result.updated++;
					continue;
				}
				// Default: "skip"
				result.skipped++;
				continue;
			}

			try {
				assertPaidInvoiceImportState(row);
				await createInvoice(tx, centerId, row);
				result.inserted++;
			} catch (err) {
				if (dedupeStrategy === "error") {
					throw err;
				}
				result.errors.push({
					rowIndex: i,
					message: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}
	});

	return c.json(result, 200);
});

importsRouter.post("/enroll", zValidator("json", importEnrollSchema), async (c) => {
	const { rows, dedupeStrategy } = c.req.valid("json");
	const db = c.get("db");
	// centerId is guaranteed by requireCenter middleware used on all importsRouter routes
	const centerId = c.get("centerId");
	if (!centerId) throw new Response(null, { status: 500 });

	const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

	await db.transaction(async (tx) => {
		// Serialize the whole batch against concurrent enroll/import on the same center.
		// enrollChild enforces the plan cap by counting active children then inserting; without
		// this center-row lock two concurrent transactions could both read the same baseline
		// count and each insert, exceeding the cap (TOCTOU). Mirrors children.ts POST /enroll.
		await tx.execute(sql`select 1 from ${centers} where ${centers.id} = ${centerId} for update`);
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const childFirstNorm = row.child.firstName.toLowerCase().trim();
			const childLastNorm = row.child.lastName.toLowerCase().trim();
			const existing = await tx
				.select({ id: children.id })
				.from(children)
				.where(
					and(
						eq(children.centerId, centerId),
						sql`lower(trim(${children.firstName})) = ${childFirstNorm}`,
						sql`lower(trim(${children.lastName})) = ${childLastNorm}`,
						eq(children.dateOfBirth, row.child.dateOfBirth),
					),
				)
				.limit(1);

			if (existing.length > 0) {
				if (dedupeStrategy === "error") {
					throw new Error(
						`Row ${i}: duplicate child ${row.child.firstName} ${row.child.lastName} (${row.child.dateOfBirth})`,
					);
				}
				result.skipped++;
				continue;
			}

			try {
				await enrollChild(tx as unknown as Database, centerId, row, tx);
				result.inserted++;
			} catch (err) {
				if (dedupeStrategy === "error") {
					throw err;
				}
				result.errors.push({
					rowIndex: i,
					message: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}
	});

	return c.json(result, 200);
});

export { importsRouter };
