import { auditLog, centers, invoices, payments, webhookEvents } from "@pebbledesk/db";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import {
	deriveStripeAccountStatus,
	isPublicInvoicePayable,
	verifyStripeWebhookSignature,
} from "../lib/public-billing.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const stripeRoutes = new Hono<AppEnv>();

async function parseStripeJsonResponse(response: Response): Promise<Record<string, unknown>> {
	const body = await response.text();
	if (!response.ok) {
		throw new Error(`Stripe request failed: ${body}`);
	}
	if (!body.trim()) {
		return {};
	}
	const parsed = JSON.parse(body) as unknown;
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Stripe request returned an invalid JSON object");
	}
	return parsed as Record<string, unknown>;
}

function isUniqueViolation(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "23505"
	);
}

function isInvalidUuidPredicate(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "22P02"
	);
}

function readRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) {
		return result as T[];
	}
	if (typeof result === "object" && result !== null && "rows" in result) {
		const rows = (result as { rows?: unknown }).rows;
		return Array.isArray(rows) ? (rows as T[]) : [];
	}
	return [];
}

function toCents(amount: number | string) {
	return Math.round(Number(amount) * 100);
}

stripeRoutes.post(
	"/connect/onboarding-link",
	requireAuth,
	requireRole("owner", "director"),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const [center] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);

		if (!center) notFound("Center not found");

		let stripeAccountId = center.stripeAccountId;
		let createdStripeAccountInRequest = false;
		if (!stripeAccountId) {
			const accountResponse = await fetch("https://api.stripe.com/v1/accounts", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					type: "standard",
					"metadata[centerId]": centerId,
				}),
			});

			const account = await parseStripeJsonResponse(accountResponse);
			const createdAccountId = typeof account.id === "string" ? account.id : null;
			if (!createdAccountId) {
				badRequest("Failed to create Stripe account");
			}
			stripeAccountId = createdAccountId;
			createdStripeAccountInRequest = true;
		}

		const accountLinkResponse = await fetch("https://api.stripe.com/v1/account_links", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				account: stripeAccountId,
				type: "account_onboarding",
				refresh_url: `${c.env.APP_URL}/settings/billing`,
				return_url: `${c.env.APP_URL}/settings/billing`,
			}),
		});

		const accountLink = await parseStripeJsonResponse(accountLinkResponse);
		if (typeof accountLink.url !== "string") {
			badRequest("Failed to create Stripe account link");
		}

		try {
			await db
				.update(centers)
				.set({
					stripeAccountId,
					stripeAccountStatus: "pending",
					stripeAccountLinkedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(centers.id, centerId))
				.returning();
		} catch (dbError) {
			if (createdStripeAccountInRequest) {
				// DB write failed — best-effort cleanup: delete the orphaned Stripe account
				// so it is not dangling unlinked in Stripe.
				try {
					await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
						method: "DELETE",
						headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` },
					});
				} catch (cleanupError) {
					console.error(
						`Failed to delete orphaned Stripe account ${stripeAccountId} after DB failure`,
						cleanupError,
					);
				}
			}
			console.error("Failed to persist stripeAccountId to DB", dbError);
			throw dbError;
		}

		return c.json({
			accountId: stripeAccountId,
			url: accountLink.url,
		});
	},
);

stripeRoutes.get("/connect/status", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const [center] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);

	if (!center) notFound("Center not found");
	if (!center.stripeAccountId) {
		return c.json({
			stripeAccountId: null,
			stripeAccountStatus: center.stripeAccountStatus ?? "not_connected",
		});
	}

	const response = await fetch(`https://api.stripe.com/v1/accounts/${center.stripeAccountId}`, {
		headers: {
			Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
		},
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	const account = (await response.json()) as {
		id: string;
		charges_enabled?: boolean;
		details_submitted?: boolean;
		requirements?: { disabled_reason?: string | null };
	};
	const stripeAccountStatus = deriveStripeAccountStatus(account);

	await db
		.update(centers)
		.set({
			stripeAccountStatus,
			stripeAccountDisabledReason: account.requirements?.disabled_reason ?? null,
			updatedAt: new Date(),
		})
		.where(eq(centers.id, centerId));

	return c.json({
		stripeAccountId: center.stripeAccountId,
		stripeAccountStatus,
		stripeAccountDisabledReason: account.requirements?.disabled_reason ?? null,
	});
});

stripeRoutes.post("/webhook", async (c) => {
	const payload = await c.req.text();
	const signatureHeader = c.req.header("stripe-signature");

	if (
		!verifyStripeWebhookSignature(payload, signatureHeader ?? null, c.env.STRIPE_WEBHOOK_SECRET)
	) {
		return c.json({ error: "Invalid webhook signature" }, 400);
	}

	const event = JSON.parse(payload) as {
		id?: string;
		type: string;
		account?: string;
		data?: {
			object?: {
				id?: string;
				amount_received?: number;
				metadata?: {
					centerId?: string;
					invoiceId?: string;
					publicLinkToken?: string;
					publicLinkVersion?: string;
				};
				payment_method_types?: string[];
				created?: number;
			};
		};
	};

	if (event.type !== "payment_intent.succeeded" || !event.data?.object?.id) {
		return c.json({ received: true });
	}

	const intent = event.data.object;
	const transactionId = intent.id;
	const invoiceId = intent.metadata?.invoiceId;
	const centerId = intent.metadata?.centerId;
	const publicLinkToken = intent.metadata?.publicLinkToken;
	const publicLinkVersion = Number(intent.metadata?.publicLinkVersion);
	const amountReceived = intent.amount_received;

	// Bug E fix: return 200 instead of 4xx so Stripe does not retry indefinitely
	if (!transactionId || !invoiceId || !centerId) {
		console.warn("Webhook: payment_intent.succeeded missing invoice metadata", {
			transactionId,
			invoiceId,
			centerId,
		});
		return c.json({ received: true });
	}
	if (
		typeof amountReceived !== "number" ||
		!Number.isInteger(amountReceived) ||
		amountReceived <= 0
	) {
		console.warn("Webhook: payment_intent.succeeded ignored invalid amount_received", {
			transactionId,
			invoiceId,
			centerId,
			amountReceived,
		});
		return c.json({ received: true });
	}

	const db = c.get("db");

	const [existingPayment] = await db
		.select()
		.from(payments)
		.where(eq(payments.providerTransactionId, transactionId))
		.limit(1);

	if (existingPayment) {
		return c.json({ received: true, duplicate: true });
	}

	if (!idSchema.safeParse(invoiceId).success) {
		console.warn("Webhook: payment_intent.succeeded ignored invalid invoice metadata", {
			transactionId,
			invoiceId,
			centerId,
		});
		return c.json({ received: true });
	}

	// Verify the event's Stripe account matches the center's stripeAccountId.
	// A mismatched account means a malicious Stripe account is trying to credit
	// a different tenant's invoice — reject it hard.
	let centerForAccount: { stripeAccountId: string | null } | undefined;
	try {
		[centerForAccount] = await db
			.select({ stripeAccountId: centers.stripeAccountId })
			.from(centers)
			.where(eq(centers.id, centerId))
			.limit(1);
	} catch (error) {
		if (isInvalidUuidPredicate(error)) {
			console.warn("Webhook: payment_intent.succeeded ignored invalid center metadata", {
				transactionId,
				invoiceId,
				centerId,
			});
			return c.json({ received: true });
		}
		throw error;
	}
	if (event.account) {
		if (centerForAccount && centerForAccount.stripeAccountId !== event.account) {
			return c.json({ error: "account mismatch" }, 400);
		}
	} else if (centerForAccount?.stripeAccountId) {
		console.warn("Webhook: connected-account payment_intent.succeeded missing event.account", {
			invoiceId,
			centerId,
		});
		return c.json({ received: true });
	}

	// Load invoice by ID only first so we can produce a specific warning on centerId mismatch
	const [invoiceById] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);

	if (invoiceById && invoiceById.centerId !== centerId) {
		console.warn(
			`Webhook: payment_intent.succeeded centerId mismatch — metadata centerId=${centerId} but invoice.centerId=${invoiceById.centerId}. Possible spoofed metadata.`,
		);
		return c.json({ received: true });
	}

	const invoice = invoiceById;

	// Bug E fix: return 200 when invoice is not found so Stripe does not retry indefinitely
	if (!invoice) {
		console.warn(
			`Webhook: payment_intent.succeeded invoice ${invoiceId} not found for center ${centerId}`,
		);
		return c.json({ received: true });
	}

	if (
		!publicLinkToken ||
		!Number.isInteger(publicLinkVersion) ||
		invoice.publicLinkToken !== publicLinkToken ||
		invoice.publicLinkVersion !== publicLinkVersion ||
		!isPublicInvoicePayable(invoice.status)
	) {
		console.warn("Webhook: payment_intent.succeeded ignored for non-payable invoice state", {
			invoiceId,
			centerId,
			status: invoice.status,
			amountDue: invoice.amountDue,
		});
		return c.json({ received: true });
	}

	// Every real Stripe event has a stable `id`. An absent id means the payload
	// cannot be deduplicated — reject it now rather than skip idempotency silently.
	if (!event.id) {
		console.warn("Webhook: payment_intent.succeeded received without event.id — rejecting");
		return c.json({ received: true });
	}

	// P0.15: the idempotency record is now inserted INSIDE the main transaction.
	// If the business logic fails, the event ID is rolled back with it so retries
	// can re-process the event rather than being silently dropped.
	let duplicateByConstraint = false;
	try {
		await db.transaction(async (tx) => {
			// Idempotency guard — inside the transaction so it rolls back on failure
			if (event.id) {
				const [deduped] = await tx
					.insert(webhookEvents)
					.values({ id: event.id })
					.onConflictDoNothing()
					.returning();
				if (!deduped) {
					duplicateByConstraint = true;
					return;
				}
			}

			try {
				const lockedInvoiceRows = (await tx.execute(sql`
					select
						${invoices.publicLinkToken} as "publicLinkToken",
						${invoices.publicLinkVersion} as "publicLinkVersion",
						${invoices.status} as "status",
						${invoices.amountDue} as "amountDue",
						coalesce((
							select sum(${payments.amount})
							from ${payments}
							where ${payments.invoiceId} = ${invoices.id}
								and ${payments.centerId} = ${invoices.centerId}
								and ${payments.status} = 'posted'
						), 0) as "postedPaymentTotal"
					from ${invoices}
					where ${invoices.id} = ${invoiceId} and ${invoices.centerId} = ${centerId}
					for update
				`)) as unknown;
				const [lockedInvoice] = readRows<{
					publicLinkToken: string | null;
					publicLinkVersion: number | null;
					status: string;
					amountDue?: number | string;
					postedPaymentTotal?: number | string | null;
				}>(lockedInvoiceRows);
				if (
					!lockedInvoice ||
					lockedInvoice.publicLinkToken !== publicLinkToken ||
					lockedInvoice.publicLinkVersion !== publicLinkVersion ||
					(lockedInvoice.status !== "sent" && lockedInvoice.status !== "overdue")
				) {
					return;
				}
				if (
					lockedInvoice.amountDue !== undefined &&
					lockedInvoice.postedPaymentTotal !== undefined
				) {
					const remainingBalanceCents = Math.max(
						0,
						toCents(lockedInvoice.amountDue) - toCents(lockedInvoice.postedPaymentTotal ?? 0),
					);
					if (amountReceived > remainingBalanceCents) {
						console.warn("Webhook: payment_intent.succeeded ignored because it exceeds balance", {
							invoiceId,
							centerId,
							amountReceived,
							remainingBalanceCents,
						});
						return;
					}
				}

				const [insertedPayment] = await tx
					.insert(payments)
					.values({
						centerId,
						invoiceId,
						amount: String(amountReceived / 100),
						method: intent.payment_method_types?.includes("card") ? "credit_card" : "other",
						provider: "stripe",
						providerReferenceId: event.type,
						providerTransactionId: transactionId,
						paidAt: intent.created ? new Date(intent.created * 1000) : new Date(),
					})
					.returning();

				const [updatedInvoice] = await tx
					.update(invoices)
					.set({
						status: "paid",
						paidAt: intent.created ? new Date(intent.created * 1000) : new Date(),
						publicLinkVersion: sql`${invoices.publicLinkVersion} + 1`,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(invoices.id, invoiceId),
							eq(invoices.centerId, centerId),
							eq(invoices.publicLinkToken, publicLinkToken),
							eq(invoices.publicLinkVersion, publicLinkVersion),
							sql`${invoices.status} IN ('sent', 'overdue')`,
							sql`${invoices.amountDue} <= COALESCE((SELECT SUM(${payments.amount}) FROM ${payments} WHERE ${payments.invoiceId} = ${invoices.id} AND ${payments.centerId} = ${invoices.centerId} AND ${payments.status} = 'posted'), 0)`,
						),
					)
					.returning();

				if (!updatedInvoice) {
					return;
				}

				await tx.insert(auditLog).values({
					centerId,
					userId: null,
					action: "create",
					entityType: "payments",
					entityId: insertedPayment.id,
					changes: {
						source: "stripe_webhook",
						invoiceId,
						amount: String(amountReceived / 100),
						invoiceStatus: "paid",
						providerTransactionId: transactionId,
						eventId: event.id ?? null,
					},
					ipAddress: null,
				});
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw error;
				}
				throw error;
			}
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			duplicateByConstraint = true;
		} else {
			throw error;
		}
	}

	return c.json({ received: true, duplicate: duplicateByConstraint || undefined });
});

export { stripeRoutes };
