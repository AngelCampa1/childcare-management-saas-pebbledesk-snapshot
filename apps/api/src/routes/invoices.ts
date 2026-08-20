import { zValidator } from "@hono/zod-validator";
import {
	auditLog,
	centers,
	children,
	guardians,
	invoiceLineItems,
	invoices,
	payments,
} from "@pebbledesk/db";
import {
	createInvoiceSchema,
	editableInvoiceFieldsForStatus,
	escapeHtml,
	updateInvoiceSchema,
} from "@pebbledesk/shared";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { computeInvoiceTotals } from "../lib/billing-subsidy.js";
import { buildBrandHeaderHtml } from "../lib/brand-email.js";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { paginationSchema, resolvePagination } from "../lib/pagination.js";
import { centerHasFeature } from "../lib/plan-limits.js";
import {
	createPublicLinkNonce,
	createSignedInvoiceAccessToken,
	signPublicInvoiceToken,
} from "../lib/public-billing.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/plan.js";
import { createInvoice, DUPLICATE_INVOICE_MESSAGE } from "../services/invoices.js";

const invoicesRoutes = new Hono<AppEnv>();

invoicesRoutes.use("*", requireAuth, requireCenter);

function assertPaidInvoiceState(
	input: { status?: string; paidAt?: string },
	currentPaidAt?: Date | null,
) {
	if (input.status === "paid" && !input.paidAt && !currentPaidAt) {
		badRequest("Paid invoices require a paidAt timestamp");
	}
}

/**
 * Enforces edit restrictions based on invoice status.
 * - draft: no restriction
 * - sent / overdue: only dueDate may be changed; locked fields → 409
 * - paid / void: no edits at all → 409
 *
 * Throws an HTTPException(409) with code "invoice_locked" when the body
 * contains a field that is not permitted for the current status.
 */
function assertInvoiceEditable(invoice: { status: string }, body: Record<string, unknown>): void {
	const allowed = editableInvoiceFieldsForStatus(
		invoice.status as Parameters<typeof editableInvoiceFieldsForStatus>[0],
	);
	if (allowed === null) return; // draft — no restriction

	// paid / void: any change is rejected
	if (allowed.size === 0) {
		const hasAnyChange = Object.keys(body).length > 0;
		if (hasAnyChange) {
			throw new HTTPException(409, { message: "invoice_locked" });
		}
		return;
	}

	// sent / overdue: only allowed keys may appear
	for (const key of Object.keys(body)) {
		if (!allowed.has(key)) {
			throw new HTTPException(409, { message: "invoice_locked" });
		}
	}
}

function toCents(amount: number | string) {
	return Math.round(Number(amount) * 100);
}

function fromCents(amount: number) {
	return amount / 100;
}

function readRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) {
		return result as T[];
	}
	if (
		typeof result === "object" &&
		result !== null &&
		"rows" in result &&
		Array.isArray((result as { rows?: unknown }).rows)
	) {
		return (result as { rows: T[] }).rows;
	}
	return [];
}

function calculateBalanceRemaining(
	invoice: typeof invoices.$inferSelect,
	postedPayments: Array<{ amount: number | string }>,
) {
	const paidCents = postedPayments.reduce((total, payment) => total + toCents(payment.amount), 0);
	return fromCents(Math.max(0, toCents(invoice.amountDue) - paidCents));
}

function serializeInvoice(
	invoice: typeof invoices.$inferSelect,
	secret?: string,
	balanceRemaining?: number,
) {
	const { publicLinkToken, publicLinkVersion, publicLinkRotatedAt, ...safeInvoice } = invoice;

	return {
		...safeInvoice,
		balanceRemaining,
		publicPayToken: secret ? createSignedInvoiceAccessToken(invoice, secret) : undefined,
	};
}

function parseOptionalGuardianFilter(guardianId?: string) {
	if (!guardianId) return undefined;
	const parsed = idSchema.safeParse(guardianId);
	if (!parsed.success) {
		badRequest("Invalid guardian ID");
	}
	return parsed.data;
}

async function resolvePublicLinkSecret(c: Context<AppEnv>) {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const hasPublicPaymentLinks = await centerHasFeature(
		c.get("db"),
		centerId,
		"public_payment_links",
	);
	return hasPublicPaymentLinks ? c.env.PUBLIC_LINK_SECRET : undefined;
}

invoicesRoutes.get(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", paginationSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const guardianId = parseOptionalGuardianFilter(c.req.query("guardianId"));
		const conditions = [eq(invoices.centerId, centerId)];
		const { limit, offset } = resolvePagination(c.req.valid("query"));
		const publicLinkSecret = await resolvePublicLinkSecret(c);

		if (guardianId) {
			conditions.push(eq(invoices.guardianId, guardianId));
		}

		const results = await db
			.select()
			.from(invoices)
			.where(and(...conditions))
			.limit(limit)
			.offset(offset);
		const allInvoiceIds = results.map((invoice) => invoice.id);
		const invoiceIds = results
			.filter((invoice) => invoice.amountDue !== null && invoice.amountDue !== undefined)
			.map((invoice) => invoice.id);
		const lineItems =
			allInvoiceIds.length > 0
				? await db
						.select()
						.from(invoiceLineItems)
						.where(
							and(
								eq(invoiceLineItems.centerId, centerId),
								inArray(invoiceLineItems.invoiceId, allInvoiceIds),
							),
						)
				: [];
		const lineItemsByInvoiceId = new Map<string, typeof lineItems>();
		for (const lineItem of lineItems) {
			const invoiceLineItemsForId = lineItemsByInvoiceId.get(lineItem.invoiceId) ?? [];
			invoiceLineItemsForId.push(lineItem);
			lineItemsByInvoiceId.set(lineItem.invoiceId, invoiceLineItemsForId);
		}
		const postedPayments =
			invoiceIds.length > 0
				? await db
						.select({ invoiceId: payments.invoiceId, amount: payments.amount })
						.from(payments)
						.where(
							and(
								eq(payments.centerId, centerId),
								eq(payments.status, "posted"),
								inArray(payments.invoiceId, invoiceIds),
							),
						)
				: [];
		const paymentsByInvoiceId = new Map<string, Array<{ amount: number | string }>>();
		for (const payment of postedPayments) {
			const invoicePayments = paymentsByInvoiceId.get(payment.invoiceId) ?? [];
			invoicePayments.push(payment);
			paymentsByInvoiceId.set(payment.invoiceId, invoicePayments);
		}

		return c.json({
			invoices: results.map((invoice) => ({
				...serializeInvoice(
					invoice,
					publicLinkSecret,
					calculateBalanceRemaining(invoice, paymentsByInvoiceId.get(invoice.id) ?? []),
				),
				lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
			})),
		});
	},
);

invoicesRoutes.get("/summary", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const [summary] = await db
		.select({ overdueInvoiceCount: count() })
		.from(invoices)
		.where(and(eq(invoices.centerId, centerId), eq(invoices.status, "overdue")));

	return c.json({ overdueInvoiceCount: Number(summary?.overdueInvoiceCount ?? 0) });
});

invoicesRoutes.get("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;

	const db = c.get("db");
	const publicLinkSecret = await resolvePublicLinkSecret(c);
	const [invoice] = await db
		.select()
		.from(invoices)
		.where(and(eq(invoices.id, id), eq(invoices.centerId, centerId)))
		.limit(1);

	if (!invoice) notFound("Invoice not found");

	const lineItems = await db
		.select()
		.from(invoiceLineItems)
		.where(
			and(eq(invoiceLineItems.invoiceId, invoice.id), eq(invoiceLineItems.centerId, centerId)),
		);
	const postedPayments = await db
		.select({ amount: payments.amount })
		.from(payments)
		.where(
			and(
				eq(payments.invoiceId, invoice.id),
				eq(payments.centerId, centerId),
				eq(payments.status, "posted"),
			),
		);

	return c.json({
		invoice: serializeInvoice(
			invoice,
			publicLinkSecret,
			calculateBalanceRemaining(invoice, postedPayments),
		),
		lineItems,
	});
});

invoicesRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createInvoiceSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");
		const publicLinkSecret = await resolvePublicLinkSecret(c);
		assertPaidInvoiceState(data);

		const [guardian] = await db
			.select({ id: guardians.id })
			.from(guardians)
			.where(and(eq(guardians.id, data.guardianId), eq(guardians.centerId, centerId)))
			.limit(1);

		if (!guardian) notFound("Guardian not found");

		for (const lineItem of data.lineItems) {
			if (!lineItem.childId) continue;
			const [child] = await db
				.select({ id: children.id })
				.from(children)
				.where(and(eq(children.id, lineItem.childId), eq(children.centerId, centerId)))
				.limit(1);

			if (!child) notFound("Child not found");
		}

		let result: Awaited<ReturnType<typeof createInvoice>>;
		try {
			result = await createInvoice(db, centerId, data);
		} catch (error) {
			if (error instanceof Error && error.message === DUPLICATE_INVOICE_MESSAGE) {
				throw new HTTPException(409, { message: "invoice_duplicate" });
			}
			throw error;
		}

		return c.json({ invoice: serializeInvoice(result, publicLinkSecret) }, 201);
	},
);

invoicesRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateInvoiceSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const parseResult = idSchema.safeParse(c.req.param("id"));
		if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const id = parseResult.data;

		const db = c.get("db");
		const userId = c.get("userId");
		const ipAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
		const data = c.req.valid("json");
		const publicLinkSecret = await resolvePublicLinkSecret(c);
		const [existingInvoice] = await db
			.select()
			.from(invoices)
			.where(and(eq(invoices.id, id), eq(invoices.centerId, centerId)))
			.limit(1);

		if (!existingInvoice) notFound("Invoice not found");
		assertInvoiceEditable(existingInvoice, data as Record<string, unknown>);
		assertPaidInvoiceState(data, existingInvoice.paidAt);
		if (data.periodStart !== undefined || data.periodEnd !== undefined) {
			const mergedPeriod = updateInvoiceSchema.safeParse({
				periodStart: data.periodStart ?? existingInvoice.periodStart,
				periodEnd: data.periodEnd ?? existingInvoice.periodEnd,
			});
			if (!mergedPeriod.success) {
				badRequest(mergedPeriod.error.issues[0]?.message ?? "Invalid invoice period");
			}
		}
		if (
			data.lineItems === undefined &&
			(data.subtotal !== undefined || data.amountDue !== undefined)
		) {
			badRequest("Invoice totals are derived from line items and subsidy credit");
		}

		if (data.guardianId !== undefined) {
			const [guardian] = await db
				.select({ id: guardians.id })
				.from(guardians)
				.where(and(eq(guardians.id, data.guardianId), eq(guardians.centerId, centerId)))
				.limit(1);

			if (!guardian) notFound("Guardian not found");
		}

		if (data.lineItems !== undefined) {
			for (const lineItem of data.lineItems) {
				if (!lineItem.childId) continue;
				const [child] = await db
					.select({ id: children.id })
					.from(children)
					.where(and(eq(children.id, lineItem.childId), eq(children.centerId, centerId)))
					.limit(1);

				if (!child) notFound("Child not found");
			}
		}

		const updateData: Partial<typeof invoices.$inferInsert> = {
			updatedAt: new Date(),
		};

		if (data.guardianId !== undefined) updateData.guardianId = data.guardianId;
		if (data.periodStart !== undefined) updateData.periodStart = data.periodStart;
		if (data.periodEnd !== undefined) updateData.periodEnd = data.periodEnd;
		if (data.status !== undefined) updateData.status = data.status;
		if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
		if (data.paidAt !== undefined) updateData.paidAt = new Date(data.paidAt);
		// Normalize client-supplied line items to server-recomputed amounts so the
		// stored amount always equals quantity * unitPrice regardless of what the
		// client sent (mirrors the CREATE path in services/invoices.ts).
		const normalizedLineItems = data.lineItems?.map((li) => ({
			...li,
			amount: li.quantity * li.unitPrice,
		}));

		const invoiceAmountsChanged =
			normalizedLineItems !== undefined || data.subsidyCredit !== undefined;
		if (invoiceAmountsChanged) {
			const existingLineItems =
				normalizedLineItems ??
				(await db
					.select({ amount: invoiceLineItems.amount })
					.from(invoiceLineItems)
					.where(
						and(
							eq(invoiceLineItems.invoiceId, existingInvoice.id),
							eq(invoiceLineItems.centerId, centerId),
						),
					));
			const subtotal = existingLineItems.reduce((sum, item) => sum + Number(item.amount), 0);
			const subsidyCredit = data.subsidyCredit ?? existingInvoice.subsidyCredit;
			if (Number(subsidyCredit) > subtotal) {
				badRequest("subsidyCredit must not exceed subtotal");
			}
			const totals = computeInvoiceTotals(existingLineItems, subsidyCredit);
			updateData.subtotal = String(totals.subtotal);
			updateData.subsidyCredit = String(subsidyCredit);
			updateData.amountDue = String(totals.amountDue);
		}
		const invalidatesPublicCheckout =
			existingInvoice.publicLinkToken &&
			(data.status !== undefined ||
				data.periodStart !== undefined ||
				data.periodEnd !== undefined ||
				data.dueDate !== undefined ||
				data.guardianId !== undefined ||
				invoiceAmountsChanged);

		if (invalidatesPublicCheckout) {
			updateData.publicLinkToken = createPublicLinkNonce();
			updateData.publicLinkVersion = existingInvoice.publicLinkVersion + 1;
			updateData.publicLinkRotatedAt = new Date();
		}

		// If no fields other than updatedAt are being changed, this is a no-op PATCH.
		// Return the existing invoice without touching the DB so updatedAt is not
		// bumped on an otherwise immutable record (e.g. paid / void).
		const hasEffectiveChange = Object.keys(updateData).filter((k) => k !== "updatedAt").length > 0;
		if (!hasEffectiveChange) {
			return c.json({ invoice: serializeInvoice(existingInvoice, publicLinkSecret) });
		}

		const invoice = await db.transaction(async (tx) => {
			// Re-read the invoice with FOR UPDATE to detect concurrent status changes
			// (e.g. a payment or void that flipped the row between the outer read above
			// and now). This is the authoritative transactional guard; the outer
			// assertInvoiceEditable call above is a cheap fast-path only.
			const [lockedInvoice] = readRows<{ id: string; status: string }>(
				await tx.execute(sql`
					select ${invoices.id} as "id", ${invoices.status} as "status"
					from ${invoices}
					where ${invoices.id} = ${id} and ${invoices.centerId} = ${centerId}
					for update
				`),
			);

			if (!lockedInvoice) notFound("Invoice not found");
			assertInvoiceEditable({ status: lockedInvoice.status }, data as Record<string, unknown>);

			const [updatedInvoice] = await tx
				.update(invoices)
				.set(updateData)
				.where(and(eq(invoices.id, id), eq(invoices.centerId, centerId)))
				.returning();

			if (!updatedInvoice) notFound("Invoice not found");

			if (normalizedLineItems !== undefined) {
				await tx
					.delete(invoiceLineItems)
					.where(
						and(
							eq(invoiceLineItems.invoiceId, existingInvoice.id),
							eq(invoiceLineItems.centerId, centerId),
						),
					);
				await tx.insert(invoiceLineItems).values(
					normalizedLineItems.map((lineItem) => ({
						centerId,
						invoiceId: existingInvoice.id,
						childId: lineItem.childId,
						description: lineItem.description,
						quantity: lineItem.quantity,
						unitPrice: String(lineItem.unitPrice),
						amount: String(lineItem.quantity * lineItem.unitPrice),
					})),
				);
			}

			if (data.status !== undefined && data.status !== existingInvoice.status) {
				await tx.insert(auditLog).values({
					centerId,
					userId: userId ?? null,
					action: "update",
					entityType: "invoices",
					entityId: id,
					changes: {
						before: { status: existingInvoice.status },
						after: { status: data.status },
					},
					ipAddress,
				});
			}

			return updatedInvoice;
		});

		return c.json({ invoice: serializeInvoice(invoice, publicLinkSecret) });
	},
);

invoicesRoutes.delete("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parseResult = idSchema.safeParse(c.req.param("id"));
	if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
	const id = parseResult.data;

	const db = c.get("db");
	const [invoice] = await db
		.select({ id: invoices.id, status: invoices.status })
		.from(invoices)
		.where(and(eq(invoices.id, id), eq(invoices.centerId, centerId)))
		.limit(1);

	if (!invoice) notFound("Invoice not found");
	if (invoice.status !== "draft") {
		throw new HTTPException(409, { message: "invoice_locked" });
	}

	const [payment] = await db
		.select({ id: payments.id })
		.from(payments)
		.where(and(eq(payments.invoiceId, id), eq(payments.centerId, centerId)))
		.limit(1);

	if (payment) {
		throw new HTTPException(409, { message: "invoice_locked" });
	}

	const deletedInvoice = await db.transaction(async (tx) => {
		const [lockedInvoice] = readRows<{ id: string; status: string }>(
			await tx.execute(sql`
				select ${invoices.id} as "id", ${invoices.status} as "status"
				from ${invoices}
				where ${invoices.id} = ${id} and ${invoices.centerId} = ${centerId}
				for update
			`),
		);

		if (!lockedInvoice) notFound("Invoice not found");
		if (lockedInvoice.status !== "draft") {
			throw new HTTPException(409, { message: "invoice_locked" });
		}

		const [transactionPayment] = await tx
			.select({ id: payments.id })
			.from(payments)
			.where(and(eq(payments.invoiceId, id), eq(payments.centerId, centerId)))
			.limit(1);

		if (transactionPayment) {
			throw new HTTPException(409, { message: "invoice_locked" });
		}

		await tx
			.delete(invoiceLineItems)
			.where(and(eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.centerId, centerId)));
		const [deleted] = await tx
			.delete(invoices)
			.where(and(eq(invoices.id, id), eq(invoices.centerId, centerId)))
			.returning();

		if (!deleted) notFound("Invoice not found");
		return deleted;
	});

	return c.json({ deleted: true, id: deletedInvoice.id });
});

invoicesRoutes.post(
	"/:id/send",
	requireAuth,
	requireRole("owner", "director"),
	requireEntitlement("public_payment_links"),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const parseResult = idSchema.safeParse(c.req.param("id"));
		if (!parseResult.success) return c.json({ error: "Invalid ID" }, 400);
		const invoiceId = parseResult.data;

		const db = c.get("db");
		const [invoice] = await db
			.select()
			.from(invoices)
			.where(and(eq(invoices.id, invoiceId), eq(invoices.centerId, centerId)))
			.limit(1);

		if (!invoice) notFound("Invoice not found");
		if (invoice.status === "paid" || invoice.status === "void") {
			badRequest("Only unpaid invoices can be sent");
		}

		const invoiceCenterStatus = (invoice as typeof invoice & { stripeAccountStatus?: string })
			.stripeAccountStatus;
		const [center] =
			invoiceCenterStatus === undefined
				? await db
						.select({ stripeAccountStatus: centers.stripeAccountStatus })
						.from(centers)
						.where(eq(centers.id, centerId))
						.limit(1)
				: [{ stripeAccountStatus: invoiceCenterStatus }];

		if (center?.stripeAccountStatus !== "connected") {
			badRequest("Connect Stripe before sending invoices with online payment links");
		}

		const [guardian] = await db
			.select({
				id: guardians.id,
				centerId: guardians.centerId,
				email: guardians.email,
				firstName: guardians.firstName,
				lastName: guardians.lastName,
			})
			.from(guardians)
			.where(and(eq(guardians.id, invoice.guardianId), eq(guardians.centerId, centerId)))
			.limit(1);

		if (!guardian || guardian.centerId !== centerId || !guardian.email) {
			notFound("Guardian email not found");
		}

		const publicLinkToken = createPublicLinkNonce();
		const publicLinkVersion = (invoice.publicLinkVersion ?? 0) + 1;
		const publicLinkRotatedAt = new Date();
		const expiresAt = new Date(
			publicLinkRotatedAt.getTime() + 1000 * 60 * 60 * 24 * 30,
		).toISOString();
		const signedToken = signPublicInvoiceToken({
			invoiceId: invoice.id,
			publicLinkToken,
			publicLinkVersion,
			expiresAt,
			secret: c.env.PUBLIC_LINK_SECRET,
		});
		const paymentUrl = `${c.env.APP_URL}/pay/${signedToken}`;

		// Wrap token rotation in a transaction so the DB is consistent before we
		// attempt to deliver the email. The Resend call is outside the transaction
		// because emails cannot be rolled back.
		await db.transaction(async (tx) => {
			await tx
				.update(invoices)
				.set({
					publicLinkToken,
					publicLinkVersion,
					publicLinkRotatedAt,
					updatedAt: new Date(),
				})
				.where(and(eq(invoices.id, invoice.id), eq(invoices.centerId, centerId)));
		});

		try {
			const idempotencyKey = `invoice-send:${invoice.id}:v${publicLinkVersion}`;
			const resendResponse = await fetch("https://api.resend.com/emails", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
					"Content-Type": "application/json",
					"Idempotency-Key": idempotencyKey,
				},
				body: JSON.stringify({
					from: c.env.RESEND_FROM_EMAIL,
					to: guardian.email,
					subject: "Your PebbleDesk invoice is ready",
					html: `${buildBrandHeaderHtml()}<p>Hello ${escapeHtml(guardian.firstName ?? "there")},</p><p>Your invoice is ready. Pay online here: <a href="${escapeHtml(paymentUrl)}">${escapeHtml(paymentUrl)}</a></p>`,
				}),
			});
			if (!resendResponse.ok) {
				throw new Error(await resendResponse.text());
			}
		} catch (_error) {
			// Resend failed — roll back the DB to its previous state so the token
			// rotation and the status update are both undone atomically.
			await db
				.update(invoices)
				.set({
					publicLinkToken: invoice.publicLinkToken,
					publicLinkVersion: invoice.publicLinkVersion,
					publicLinkRotatedAt: invoice.publicLinkRotatedAt,
					updatedAt: new Date(),
				})
				.where(and(eq(invoices.id, invoice.id), eq(invoices.centerId, centerId)));
			throw new HTTPException(502, { message: "Email delivery failed" });
		}

		// Mark sent inside a transaction. Re-read the invoice FOR UPDATE first to
		// detect a concurrent PATCH that may have voided or paid it between the
		// initial read above and now. If the row was moved to a terminal state,
		// abort with 409 rather than silently resurrecting it.
		await db.transaction(async (tx) => {
			const [lockedInvoice] = readRows<{ id: string; status: string }>(
				await tx.execute(sql`
					select ${invoices.id} as "id", ${invoices.status} as "status"
					from ${invoices}
					where ${invoices.id} = ${invoice.id} and ${invoices.centerId} = ${centerId}
					for update
				`),
			);
			if (!lockedInvoice || lockedInvoice.status === "paid" || lockedInvoice.status === "void") {
				throw new HTTPException(409, { message: "Invoice can no longer be marked sent" });
			}
			await tx
				.update(invoices)
				.set({
					status: "sent",
					updatedAt: new Date(),
				})
				.where(and(eq(invoices.id, invoice.id), eq(invoices.centerId, centerId)));
		});

		return c.json({
			sent: true,
			paymentUrl,
			publicPayToken: signedToken,
		});
	},
);

export { invoicesRoutes };
