import { auditLog, centers, guardians, invoices, payments } from "@pebbledesk/db";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { isPublicInvoicePayable, verifyPublicInvoiceToken } from "../lib/public-billing.js";
import { captureScheduledException } from "../lib/sentry.js";

const publicInvoicesRoutes = new Hono<AppEnv>();

type PublicInvoiceRecord = {
	invoice: typeof invoices.$inferSelect;
	center: typeof centers.$inferSelect | null;
	guardian: typeof guardians.$inferSelect | null;
};

function toCents(amount: number | string) {
	return Math.round(Number(amount) * 100);
}

async function loadPublicInvoiceRecord(c: Context<AppEnv>, token: string) {
	const verified = verifyPublicInvoiceToken(token, c.env.PUBLIC_LINK_SECRET);
	if (!verified) {
		notFound("Invoice link not found");
	}

	const db = c.get("db");
	const [result] = await db
		.select({
			invoice: invoices,
			center: centers,
			guardian: guardians,
		})
		.from(invoices)
		.leftJoin(centers, eq(invoices.centerId, centers.id))
		.leftJoin(
			guardians,
			and(eq(invoices.guardianId, guardians.id), eq(guardians.centerId, invoices.centerId)),
		)
		.where(
			and(
				eq(invoices.id, verified.invoiceId),
				eq(invoices.publicLinkVersion, verified.publicLinkVersion),
			),
		)
		.limit(1);

	if (
		!result?.invoice ||
		(result.invoice.guardianId && !result.guardian) ||
		result.invoice.publicLinkToken !== verified.publicLinkToken ||
		result.invoice.status === "void"
	) {
		notFound("Invoice link not found");
	}

	return {
		verified,
		result: result as PublicInvoiceRecord,
	};
}

/**
 * Convert a Postgres numeric/decimal string to integer cents without going
 * through IEEE 754 floating-point arithmetic, which can be lossy for values
 * like "19.99" (19.99 * 100 = 1998.9999... in some environments).
 * Truncates at 2 decimal places — no rounding.
 */
function amountToCents(amount: string): number {
	const [whole, frac = ""] = String(amount).split(".");
	const cents = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, "0").slice(0, 2), 10);
	return cents;
}

async function calculatePublicBalanceCents(
	c: Context<AppEnv>,
	invoice: typeof invoices.$inferSelect,
) {
	const postedPayments = await c
		.get("db")
		.select({ amount: payments.amount })
		.from(payments)
		.where(
			and(
				eq(payments.invoiceId, invoice.id),
				eq(payments.centerId, invoice.centerId),
				eq(payments.status, "posted"),
			),
		);
	const paidCents = postedPayments.reduce((total, payment) => total + toCents(payment.amount), 0);
	return Math.max(0, amountToCents(String(invoice.amountDue)) - paidCents);
}

async function parseStripePaymentIntentResponse(response: Response) {
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(`Stripe request failed: ${JSON.stringify(body)}`);
	}
	return body as {
		client_secret?: string;
		id?: string;
	};
}

publicInvoicesRoutes.get("/:token", async (c) => {
	const { result } = await loadPublicInvoiceRecord(c, c.req.param("token"));
	if (result.invoice.status === "paid") {
		notFound("Invoice link not found");
	}
	const balanceInCents = await calculatePublicBalanceCents(c, result.invoice);

	return c.json({
		invoice: {
			id: result.invoice.id,
			status: result.invoice.status,
			periodStart: result.invoice.periodStart,
			periodEnd: result.invoice.periodEnd,
			amountDue: balanceInCents / 100,
		},
		center: {
			name: result.center?.name,
		},
		guardian: {
			firstName: result.guardian?.firstName,
			lastName: result.guardian?.lastName,
		},
		stripePublishableKey: c.env.STRIPE_PUBLISHABLE_KEY,
	});
});

publicInvoicesRoutes.post("/:token/payment-intent", async (c) => {
	const { verified, result } = await loadPublicInvoiceRecord(c, c.req.param("token"));

	if (result.invoice.status === "paid") {
		return c.json({ error: "Invoice already paid" }, 410);
	}
	if (!isPublicInvoicePayable(result.invoice.status)) {
		badRequest("Invoice is not payable");
	}

	if (!result.center?.stripeAccountId) {
		badRequest("Center is not connected to Stripe");
	}
	if (result.center.stripeAccountStatus !== "connected") {
		badRequest("Center Stripe account is not ready to accept payments");
	}

	const balanceInCents = await calculatePublicBalanceCents(c, result.invoice);
	if (balanceInCents <= 0) {
		badRequest("Invoice has no balance due");
	}

	const paymentIntentResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
			"Content-Type": "application/x-www-form-urlencoded",
			"Idempotency-Key": `public-invoice:${result.invoice.id}:${verified.publicLinkVersion}:${balanceInCents}`,
			"Stripe-Account": result.center.stripeAccountId,
		},
		body: new URLSearchParams({
			amount: String(balanceInCents),
			currency: "usd",
			"automatic_payment_methods[enabled]": "true",
			description: `PebbleDesk invoice ${result.invoice.id}`,
			"metadata[centerId]": result.invoice.centerId,
			"metadata[invoiceId]": result.invoice.id,
			"metadata[publicLinkToken]": verified.publicLinkToken,
			"metadata[publicLinkVersion]": String(verified.publicLinkVersion),
		}),
	});

	const paymentIntent = await parseStripePaymentIntentResponse(paymentIntentResponse);

	if (!paymentIntent.client_secret || !paymentIntent.id) {
		badRequest("Failed to create Stripe payment intent");
	}

	const db = c.get("db");
	if (db) {
		// Best-effort audit — a logging failure must never turn a successful
		// PaymentIntent into a failed response (the PI already exists in Stripe).
		try {
			await db.insert(auditLog).values({
				centerId: result.invoice.centerId,
				userId: null,
				action: "create",
				entityType: "payment_intents",
				entityId: paymentIntent.id,
				changes: {
					source: "public_invoice_payment_intent",
					invoiceId: result.invoice.id,
					amount: String(balanceInCents),
				},
				ipAddress: null,
			});
		} catch (err) {
			captureScheduledException(err, "public-invoice-payment-intent-audit");
		}
	}

	return c.json({
		invoice: {
			id: result.invoice.id,
			status: result.invoice.status,
			periodStart: result.invoice.periodStart,
			periodEnd: result.invoice.periodEnd,
			amountDue: balanceInCents / 100,
		},
		center: {
			name: result.center?.name,
		},
		guardian: {
			firstName: result.guardian?.firstName,
			lastName: result.guardian?.lastName,
		},
		clientSecret: paymentIntent.client_secret,
		paymentIntentId: paymentIntent.id,
		stripePublishableKey: c.env.STRIPE_PUBLISHABLE_KEY,
	});
});

export { publicInvoicesRoutes };
