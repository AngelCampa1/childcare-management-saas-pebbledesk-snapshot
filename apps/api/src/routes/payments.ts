import { zValidator } from "@hono/zod-validator";
import { auditLog, invoices, payments } from "@pebbledesk/db";
import {
	createPaymentSchema,
	type InvoiceStatus,
	type PaymentMethod,
	type PaymentStatus,
	paymentsQuerySchema,
	reversePaymentSchema,
} from "@pebbledesk/shared";
import { and, eq, gte, ilike, lte, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { PAGE_DEFAULT, PAGE_MAX } from "../lib/pagination.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

const paymentsRoutes = new Hono<AppEnv>();

paymentsRoutes.use("*", requireAuth, requireCenter);

function toCents(amount: number | string) {
	return Math.round(Number(amount) * 100);
}

function readRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) {
		return result as T[];
	}
	const rows = (result as { rows?: unknown }).rows;
	return Array.isArray(rows) ? (rows as T[]) : [];
}

function latestPaidAt(rows: Array<{ paidAt: Date | string | null }>) {
	return rows.reduce<Date | null>((latest, row) => {
		if (!row.paidAt) return latest;
		const paidAt = row.paidAt instanceof Date ? row.paidAt : new Date(row.paidAt);
		if (!latest || paidAt.getTime() > latest.getTime()) return paidAt;
		return latest;
	}, null);
}

paymentsRoutes.get(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", paymentsQuerySchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const query = c.req.valid("query");
		const conditions = [eq(payments.centerId, centerId)];

		if (query.invoiceId) {
			conditions.push(eq(payments.invoiceId, query.invoiceId));
		}

		if (query.method && query.method !== "all") {
			conditions.push(eq(payments.method, query.method as PaymentMethod));
		}

		if (query.status && query.status !== "all") {
			conditions.push(eq(payments.status, query.status as PaymentStatus));
		}

		if (query.dateFrom) {
			conditions.push(gte(payments.paidAt, new Date(`${query.dateFrom}T00:00:00.000Z`)));
		}

		if (query.dateTo) {
			conditions.push(lte(payments.paidAt, new Date(`${query.dateTo}T23:59:59.999Z`)));
		}

		if (query.search) {
			const pattern = `%${query.search}%`;
			conditions.push(
				or(
					ilike(sql`${payments.invoiceId}::text`, pattern),
					ilike(payments.reference, pattern),
				) as SQL,
			);
		}

		const limit = Math.min(query.limit ?? PAGE_DEFAULT, PAGE_MAX);
		const offset = query.cursor ?? 0;

		const results = await db
			.select()
			.from(payments)
			.where(and(...conditions))
			.limit(limit)
			.offset(offset);

		return c.json({ payments: results });
	},
);

paymentsRoutes.patch(
	"/:id/reverse",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", reversePaymentSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const paymentId = c.req.param("id");
		const idResult = idSchema.safeParse(paymentId);
		if (!idResult.success) {
			badRequest("Invalid ID format");
		}
		const parsedPaymentId = idResult.data;

		const db = c.get("db");
		const userId = c.get("userId");
		const data = c.req.valid("json");
		const [existingPayment] = await db
			.select()
			.from(payments)
			.where(and(eq(payments.id, parsedPaymentId), eq(payments.centerId, centerId)))
			.limit(1);

		if (!existingPayment) notFound("Payment not found");
		if (existingPayment.status === "reversed") {
			return c.json({ error: "PAYMENT_ALREADY_REVERSED" }, 409);
		}
		if (existingPayment.provider !== "manual") {
			badRequest("Only manual payments can be reversed in PebbleDesk");
		}

		const reversedAt = data.reversedAt ? new Date(data.reversedAt) : new Date();
		const ipAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
		const payment = await db.transaction(async (tx) => {
			const [lockedPayment] = readRows<{
				id: string;
				invoiceId: string;
				provider: string;
				status: string;
			}>(
				await tx.execute(sql`
				select ${payments.id} as "id", ${payments.invoiceId} as "invoiceId",
					${payments.provider} as "provider", ${payments.status} as "status"
				from ${payments}
				where ${payments.id} = ${parsedPaymentId} and ${payments.centerId} = ${centerId}
				for update
			`),
			);
			if (!lockedPayment) notFound("Payment not found");
			if (lockedPayment.status === "reversed") {
				throw new HTTPException(409, { message: "PAYMENT_ALREADY_REVERSED" });
			}
			if (lockedPayment.provider !== "manual") {
				badRequest("Only manual payments can be reversed in PebbleDesk");
			}

			const [lockedInvoice] = readRows<{
				id: string;
				amountDue: number | string;
				status: InvoiceStatus;
				paidAt: Date | string | null;
				publicLinkVersion: number | null;
			}>(
				await tx.execute(sql`
				select ${invoices.id} as "id", ${invoices.amountDue} as "amountDue",
					${invoices.status} as "status", ${invoices.paidAt} as "paidAt",
					${invoices.publicLinkVersion} as "publicLinkVersion"
				from ${invoices}
				where ${invoices.id} = ${lockedPayment.invoiceId}
					and ${invoices.centerId} = ${centerId}
				for update
			`),
			);
			if (!lockedInvoice) notFound("Invoice not found");

			const [updatedPayment] = await tx
				.update(payments)
				.set({
					status: "reversed",
					reversedAt,
					updatedAt: new Date(),
				})
				.where(and(eq(payments.id, parsedPaymentId), eq(payments.centerId, centerId)))
				.returning();

			const remainingPayments = await tx
				.select({
					amount: payments.amount,
					paidAt: payments.paidAt,
				})
				.from(payments)
				.where(
					and(
						eq(payments.invoiceId, lockedPayment.invoiceId),
						eq(payments.centerId, centerId),
						eq(payments.status, "posted"),
					),
				);

			const paidCents = remainingPayments.reduce((total, row) => total + toCents(row.amount), 0);
			const amountDueCents = toCents(lockedInvoice.amountDue);
			const nextStatus =
				lockedInvoice.status === "void"
					? "void"
					: paidCents >= amountDueCents
						? "paid"
						: lockedInvoice.status === "overdue"
							? "overdue"
							: "sent";
			const invoiceUpdate: {
				status: InvoiceStatus;
				paidAt: Date | null;
				updatedAt: Date;
				publicLinkVersion?: number | SQL<unknown>;
				publicLinkRotatedAt?: Date;
			} = {
				status: nextStatus,
				paidAt:
					nextStatus === "paid"
						? latestPaidAt(remainingPayments)
						: nextStatus === "void" && lockedInvoice.paidAt
							? new Date(lockedInvoice.paidAt)
							: null,
				updatedAt: new Date(),
			};

			if (lockedInvoice.status === "paid" && nextStatus !== "paid") {
				invoiceUpdate.publicLinkVersion = sql`${invoices.publicLinkVersion} + 1`;
				invoiceUpdate.publicLinkRotatedAt = new Date();
			}

			await tx
				.update(invoices)
				.set(invoiceUpdate)
				.where(and(eq(invoices.id, lockedPayment.invoiceId), eq(invoices.centerId, centerId)));

			await tx.insert(auditLog).values({
				centerId,
				userId: userId ?? null,
				action: "update",
				entityType: "payments",
				entityId: paymentId,
				changes: {
					before: {
						status: existingPayment.status,
						reversedAt: existingPayment.reversedAt,
						invoiceStatus: lockedInvoice.status,
						invoicePaidAt: lockedInvoice.paidAt,
					},
					after: {
						status: "reversed",
						reversedAt: reversedAt.toISOString(),
						invoiceStatus: nextStatus,
						invoicePaidAt: invoiceUpdate.paidAt?.toISOString() ?? null,
						reason: data.reason,
					},
					changedFields: ["status", "reversedAt", "invoiceStatus", "invoicePaidAt", "reason"],
				},
				ipAddress,
			});

			if (!updatedPayment) {
				throw new Error("Failed to reverse payment");
			}

			return updatedPayment;
		});

		return c.json({ payment });
	},
);

paymentsRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createPaymentSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");
		if (data.provider !== "manual") {
			badRequest("Manual payments cannot set an external provider");
		}
		if (data.providerReferenceId || data.providerTransactionId) {
			badRequest("Manual payments cannot include provider-owned identifiers");
		}
		const [invoice] = await db
			.select()
			.from(invoices)
			.where(and(eq(invoices.id, data.invoiceId), eq(invoices.centerId, centerId)))
			.limit(1);

		if (!invoice) notFound("Invoice not found");
		if (invoice.status === "paid") {
			return c.json({ error: "INVOICE_ALREADY_PAID" }, 409);
		}
		if (invoice.status === "void") {
			badRequest("Cannot record payments for void invoices");
		}

		const payment = await db.transaction(async (tx) => {
			const [lockedInvoice] = readRows<{
				id: string;
				amountDue: number | string;
				status: InvoiceStatus;
				paidAt: Date | string | null;
			}>(
				await tx.execute(sql`
				select ${invoices.id} as "id", ${invoices.amountDue} as "amountDue",
					${invoices.status} as "status", ${invoices.paidAt} as "paidAt"
				from ${invoices}
				where ${invoices.id} = ${data.invoiceId} and ${invoices.centerId} = ${centerId}
				for update
			`),
			);
			if (!lockedInvoice) notFound("Invoice not found");
			if (lockedInvoice.status === "paid") {
				throw new HTTPException(409, { message: "INVOICE_ALREADY_PAID" });
			}
			if (lockedInvoice.status === "void") {
				badRequest("Cannot record payments for void invoices");
			}
			const existingPayments = await tx
				.select({ amount: payments.amount })
				.from(payments)
				.where(
					and(
						eq(payments.invoiceId, data.invoiceId),
						eq(payments.centerId, centerId),
						eq(payments.status, "posted"),
					),
				);
			const cumulativePaidCents =
				existingPayments.reduce((total, paymentRow) => total + toCents(paymentRow.amount), 0) +
				toCents(data.amount);
			const invoiceAmountDueCents = toCents(lockedInvoice.amountDue);
			if (cumulativePaidCents > invoiceAmountDueCents) {
				badRequest("Payment exceeds invoice balance");
			}
			const remainingBalanceCents = invoiceAmountDueCents - cumulativePaidCents;
			const nextStatus =
				remainingBalanceCents <= 0
					? "paid"
					: lockedInvoice.status === "draft"
						? "sent"
						: lockedInvoice.status;
			const existingPaidAt =
				lockedInvoice.paidAt instanceof Date
					? lockedInvoice.paidAt
					: lockedInvoice.paidAt
						? new Date(lockedInvoice.paidAt)
						: null;

			const [created] = await tx
				.insert(payments)
				.values({
					centerId,
					invoiceId: data.invoiceId,
					amount: String(data.amount),
					method: data.method,
					provider: data.provider,
					status: "posted",
					providerReferenceId: data.providerReferenceId,
					providerTransactionId: data.providerTransactionId,
					reference: data.reference,
					paidAt: new Date(data.paidAt),
					updatedAt: new Date(),
				})
				.returning();

			await tx
				.update(invoices)
				.set({
					status: nextStatus,
					paidAt: nextStatus === "paid" ? new Date(data.paidAt) : existingPaidAt,
					updatedAt: new Date(),
				})
				.where(and(eq(invoices.id, data.invoiceId), eq(invoices.centerId, centerId)));

			if (!created) {
				throw new Error("Failed to create payment");
			}

			return created;
		});

		return c.json({ payment }, 201);
	},
);

export { paymentsRoutes };
