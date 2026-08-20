import {
	centers,
	memberships,
	subscriptionNotifications,
	users,
	webhookEvents,
} from "@pebbledesk/db";
import {
	BILLING_CADENCES,
	getStripePriceEnvKey,
	PAYABLE_PLANS,
	SUBSCRIPTION_PLANS_LIST,
	type SubscriptionPlan,
	TRIAL_DAYS,
	TRIAL_END_REMINDER_DAYS,
} from "@pebbledesk/shared";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared/constants";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import {
	mapStripeSubscriptionStatus,
	verifyPlatformWebhookSignature,
} from "../lib/platform-billing.js";
import { analyticsDistinctId, getExecutionContext, schedulePostHogEvent } from "../lib/posthog.js";

const subscriptionWebhookRoutes = new Hono<AppEnv>();

type StripeSubscriptionObject = {
	id?: string;
	status?: string;
	customer?: string;
	current_period_end?: number;
	trial_end?: number | null;
	cancel_at_period_end?: boolean;
	metadata?: { centerId?: string; plan?: string };
	items?: {
		data?: Array<{ price?: { id?: string } }>;
	};
};

type StripeCheckoutSessionObject = {
	id?: string;
	subscription?: string;
	customer?: string;
	client_reference_id?: string;
	metadata?: { centerId?: string; plan?: string };
	trial_end?: number | null;
};

type StripeInvoiceObject = {
	id?: string;
	customer?: string;
	subscription?: string;
};

type StripeEvent = {
	id?: string;
	type: string;
	created?: number;
	data?: { object?: Record<string, unknown> };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS_MS = TRIAL_DAYS * DAY_MS;
const TRIAL_REMINDER_OFFSET_MS = TRIAL_END_REMINDER_DAYS * DAY_MS;

type SubscriptionNotificationDb = Pick<AppEnv["Variables"]["db"], "select" | "insert">;
type OwnerLookupDb = Pick<AppEnv["Variables"]["db"], "select">;

function isInvalidUuidPredicate(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "22P02"
	);
}

async function findCenterForWebhookMetadata(db: AppEnv["Variables"]["db"], centerId: string) {
	try {
		const [center] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
		return center;
	} catch (error) {
		if (isInvalidUuidPredicate(error)) {
			return undefined;
		}
		throw error;
	}
}

async function captureBillingLifecycle(
	c: { env: AppEnv["Bindings"] },
	input: {
		event: string;
		centerId: string;
		plan?: SubscriptionPlan | null;
		subscriptionStatus?: string;
	},
) {
	schedulePostHogEvent(c.env, getExecutionContext(c), {
		event: input.event,
		distinctId: await analyticsDistinctId("center", input.centerId),
		properties: {
			plan: input.plan ?? undefined,
			subscription_status: input.subscriptionStatus,
		},
	});
}

function toDate(value: number | null | undefined): Date | null {
	if (!value) return null;
	return new Date(value * 1000);
}

function isValidPlan(plan: string | undefined): plan is SubscriptionPlan {
	return typeof plan === "string" && SUBSCRIPTION_PLANS_LIST.includes(plan as SubscriptionPlan);
}

function resolvePlanFromPriceId(
	env: AppEnv["Bindings"],
	priceId: string | undefined,
): SubscriptionPlan | null {
	if (!priceId) return null;
	for (const plan of PAYABLE_PLANS) {
		for (const cadence of BILLING_CADENCES) {
			const envKey = getStripePriceEnvKey(plan, cadence);
			if (envKey && priceId === env[envKey]) {
				return plan;
			}
		}
	}
	return null;
}

async function enqueueTrialNotifications(
	db: SubscriptionNotificationDb,
	input: {
		centerId: string;
		stripeSubscriptionId: string | null | undefined;
		plan: SubscriptionPlan | null;
		trialEndsAt: Date | null;
	},
) {
	if (!input.stripeSubscriptionId || !input.plan || !input.trialEndsAt) {
		return;
	}

	const [owner] = await db
		.select({
			email: users.email,
			name: users.name,
		})
		.from(memberships)
		.innerJoin(users, eq(users.id, memberships.userId))
		.where(
			and(
				eq(memberships.centerId, input.centerId),
				eq(memberships.role, "owner"),
				isNotNull(memberships.acceptedAt),
				isNull(memberships.deactivatedAt),
			),
		)
		.limit(1);

	if (!owner || typeof owner.email !== "string" || owner.email.length === 0) {
		return;
	}

	const now = new Date();
	const reminderDueAt = new Date(input.trialEndsAt.getTime() - TRIAL_REMINDER_OFFSET_MS);

	await db
		.insert(subscriptionNotifications)
		.values([
			{
				centerId: input.centerId,
				stripeSubscriptionId: input.stripeSubscriptionId,
				kind: "trial_started",
				recipientEmail: owner.email,
				recipientName: owner.name,
				subscriptionPlan: input.plan,
				trialStartedAt: now,
				trialEndsAt: input.trialEndsAt,
				dueAt: now,
			},
			{
				centerId: input.centerId,
				stripeSubscriptionId: input.stripeSubscriptionId,
				kind: "trial_ending_soon",
				recipientEmail: owner.email,
				recipientName: owner.name,
				subscriptionPlan: input.plan,
				trialStartedAt: now,
				trialEndsAt: input.trialEndsAt,
				dueAt: reminderDueAt > now ? reminderDueAt : now,
			},
		])
		.onConflictDoNothing()
		.returning();
}

async function resolveAcceptedOwnerUserId(
	db: OwnerLookupDb,
	centerId: string,
): Promise<string | null> {
	const [owner] = await db
		.select({ userId: memberships.userId })
		.from(memberships)
		.where(
			and(
				eq(memberships.centerId, centerId),
				eq(memberships.role, "owner"),
				isNotNull(memberships.acceptedAt),
				isNull(memberships.deactivatedAt),
			),
		)
		.limit(1);

	return owner?.userId ?? null;
}

async function suppressAppSignupSequenceForActiveSubscriptionBestEffort(
	db: OwnerLookupDb,
	env: AppEnv["Bindings"],
	centerId: string,
) {
	try {
		const ownerUserId = await resolveAcceptedOwnerUserId(db, centerId);
		if (!ownerUserId) return;

		const now = new Date().toISOString();
		await env.MARKETING_DB.prepare(`
			UPDATE marketing_app_signup_subscribers
			SET
				suppressed_at = COALESCE(suppressed_at, ?),
				suppression_reason = 'active_subscription',
				updated_at = ?
			WHERE user_id = ?
				AND (
					suppression_reason IS NULL
					OR suppression_reason != 'unsubscribe_link'
				)
		`)
			.bind(now, now, ownerUserId)
			.run();
	} catch (error) {
		console.warn(
			"App signup D1 suppression mirror failed",
			error instanceof Error ? error.message : String(error),
		);
	}
}

subscriptionWebhookRoutes.post("/", async (c) => {
	const payload = await c.req.text();
	const signatureHeader = c.req.header("stripe-signature");

	if (
		!verifyPlatformWebhookSignature(
			payload,
			signatureHeader ?? null,
			c.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET,
		)
	) {
		return c.json({ error: "Invalid webhook signature" }, 400);
	}

	const event = JSON.parse(payload) as StripeEvent;
	const db = c.get("db");

	if (event.type === "checkout.session.completed") {
		const session = (event.data?.object ?? {}) as StripeCheckoutSessionObject;

		// Bug B fix: fail closed when customer is absent and no client_reference_id.
		// client_reference_id is set server-side by Stripe so it can be trusted.
		// metadata.centerId alone cannot be trusted without a customer check.
		if (!session.customer && !session.client_reference_id) {
			console.warn(
				"Webhook: checkout.session.completed with no customer or client_reference_id — failing closed",
			);
			return c.json({ received: true });
		}

		const centerId = session.client_reference_id ?? session.metadata?.centerId;
		if (!centerId) return c.json({ received: true });

		// Always fetch the center to (a) verify it exists and (b) check customer tenancy.
		// This guards against manipulated metadata.centerId when no customer is present.
		const center = await findCenterForWebhookMetadata(db, centerId);
		if (!center) {
			console.warn(
				`Webhook: checkout.session.completed centerId ${centerId} not found in DB — rejecting`,
			);
			return c.json({ received: true });
		}

		if (
			session.customer &&
			center.stripeCustomerId &&
			center.stripeCustomerId !== session.customer
		) {
			console.warn(
				`Webhook tenancy mismatch: checkout.session.completed customer ${session.customer} for center ${centerId}`,
			);
			return c.json({ received: true, mismatch: true });
		}

		// Bug D fix: only include subscriptionPlan when plan is non-null
		const plan = isValidPlan(session.metadata?.plan) ? session.metadata.plan : null;
		const trialEndsAt = toDate(session.trial_end ?? null) ?? new Date(Date.now() + TRIAL_DAYS_MS);

		// checkout.session.completed intentionally does NOT advance
		// stripeSubscriptionEventCreatedAt. That marker tracks the ordering of
		// customer.subscription.* events; checkout completion seeds the initial
		// trialing state and must not gate (or be gated by) those subscription
		// events, which may arrive before or after this one.
		const checkoutSet: Record<string, unknown> = {
			stripeSubscriptionId: session.subscription ?? undefined,
			stripeCustomerId: session.customer ?? undefined,
			subscriptionStatus: "trialing",
			trialEndsAt,
			updatedAt: new Date(),
		};
		if (plan !== null) {
			checkoutSet.subscriptionPlan = plan;
		}

		// Bug A fix: wrap idempotency insert + state mutation in a single transaction
		if (event.id) {
			let isDuplicate = false;
			await db.transaction(async (tx) => {
				const inserted = await tx
					.insert(webhookEvents)
					.values({ id: event.id as string })
					.onConflictDoNothing()
					.returning();
				if (inserted.length === 0) {
					isDuplicate = true;
					return;
				}
				await tx
					.update(centers)
					.set(checkoutSet as Parameters<ReturnType<typeof tx.update>["set"]>[0])
					.where(eq(centers.id, centerId));
				await enqueueTrialNotifications(tx, {
					centerId,
					stripeSubscriptionId: session.subscription,
					plan,
					trialEndsAt,
				});
			});
			if (isDuplicate) {
				return c.json({ received: true, duplicate: true });
			}
		} else {
			await db
				.update(centers)
				.set(checkoutSet as Parameters<ReturnType<typeof db.update>["set"]>[0])
				.where(eq(centers.id, centerId));
		}

		await captureBillingLifecycle(c, {
			event: ANALYTICS_EVENTS.subscriptionCheckoutCompleted,
			centerId,
			plan,
			subscriptionStatus: "trialing",
		});
		await captureBillingLifecycle(c, {
			event: ANALYTICS_EVENTS.checkoutCompleted,
			centerId,
			plan,
			subscriptionStatus: "trialing",
		});

		return c.json({ received: true });
	}

	if (
		event.type === "customer.subscription.created" ||
		event.type === "customer.subscription.updated" ||
		event.type === "customer.subscription.deleted"
	) {
		const sub = (event.data?.object ?? {}) as StripeSubscriptionObject;
		const centerId = sub.metadata?.centerId;
		if (!centerId) return c.json({ received: true });

		const center = await findCenterForWebhookMetadata(db, centerId);
		if (!center) {
			console.warn(`Webhook: ${event.type} centerId ${centerId} not found in DB — rejecting`);
			return c.json({ received: true });
		}
		if (center?.stripeCustomerId && sub.customer && center.stripeCustomerId !== sub.customer) {
			console.warn(
				`Webhook tenancy mismatch: ${event.type} customer ${sub.customer} for center ${centerId}`,
			);
			return c.json({ received: true, mismatch: true });
		}

		const status =
			event.type === "customer.subscription.deleted"
				? "canceled"
				: mapStripeSubscriptionStatus(sub.status ?? "incomplete");

		const metadataPlan = isValidPlan(sub.metadata?.plan) ? sub.metadata.plan : null;
		const priceId = sub.items?.data?.[0]?.price?.id;
		// Bug D fix: only include subscriptionPlan when plan is non-null
		const plan = metadataPlan ?? resolvePlanFromPriceId(c.env, priceId);

		const eventCreatedAt = new Date((event.created ?? 0) * 1000);

		const subSet: Record<string, unknown> = {
			stripeSubscriptionId: sub.id ?? undefined,
			subscriptionStatus: status,
			trialEndsAt: toDate(sub.trial_end ?? null),
			currentPeriodEnd: toDate(sub.current_period_end ?? null),
			stripeSubscriptionEventCreatedAt: eventCreatedAt,
			updatedAt: new Date(),
		};
		if (plan !== null) {
			subSet.subscriptionPlan = plan;
		}

		// Bug A fix: wrap idempotency insert + state mutation in a single transaction
		if (event.id) {
			let isDuplicate = false;
			await db.transaction(async (tx) => {
				const inserted = await tx
					.insert(webhookEvents)
					.values({ id: event.id as string })
					.onConflictDoNothing()
					.returning();
				if (inserted.length === 0) {
					isDuplicate = true;
					return;
				}
				await tx
					.update(centers)
					.set(subSet as Parameters<ReturnType<typeof tx.update>["set"]>[0])
					.where(
						and(
							eq(centers.id, centerId),
							or(
								isNull(centers.stripeSubscriptionEventCreatedAt),
								lte(centers.stripeSubscriptionEventCreatedAt, eventCreatedAt),
							),
						),
					);
				if (status === "trialing") {
					await enqueueTrialNotifications(tx, {
						centerId,
						stripeSubscriptionId: sub.id,
						plan,
						trialEndsAt: toDate(sub.trial_end ?? null),
					});
				}
			});
			if (isDuplicate) {
				return c.json({ received: true, duplicate: true });
			}
		} else {
			await db
				.update(centers)
				.set(subSet as Parameters<ReturnType<typeof db.update>["set"]>[0])
				.where(
					and(
						eq(centers.id, centerId),
						or(
							isNull(centers.stripeSubscriptionEventCreatedAt),
							lte(centers.stripeSubscriptionEventCreatedAt, eventCreatedAt),
						),
					),
				);
			if (status === "trialing") {
				await enqueueTrialNotifications(db, {
					centerId,
					stripeSubscriptionId: sub.id,
					plan,
					trialEndsAt: toDate(sub.trial_end ?? null),
				});
			}
		}

		await captureBillingLifecycle(c, {
			event: ANALYTICS_EVENTS.subscriptionStatusChanged,
			centerId,
			plan,
			subscriptionStatus: status,
		});
		if (status === "trialing") {
			await captureBillingLifecycle(c, {
				event: ANALYTICS_EVENTS.trialStarted,
				centerId,
				plan,
				subscriptionStatus: status,
			});
		}

		if (status === "active") {
			await captureBillingLifecycle(c, {
				event: ANALYTICS_EVENTS.subscriptionStarted,
				centerId,
				plan,
				subscriptionStatus: status,
			});
			await suppressAppSignupSequenceForActiveSubscriptionBestEffort(db, c.env, centerId);
		}

		return c.json({ received: true });
	}

	if (event.type === "invoice.payment_failed") {
		const invoice = (event.data?.object ?? {}) as StripeInvoiceObject;

		// Bug C fix: require invoice.subscription — do not fall back to stripeCustomerId
		// stripeCustomerId is not unique so fallback would update the wrong center.
		if (!invoice.subscription) return c.json({ received: true });

		const [centerRow] = await db
			.select({ id: centers.id })
			.from(centers)
			.where(eq(centers.stripeSubscriptionId, invoice.subscription))
			.limit(1);

		if (!centerRow) return c.json({ received: true });

		// Bug A fix: wrap idempotency insert + state mutation in a single transaction
		if (event.id) {
			let isDuplicate = false;
			await db.transaction(async (tx) => {
				const inserted = await tx
					.insert(webhookEvents)
					.values({ id: event.id as string })
					.onConflictDoNothing()
					.returning();
				if (inserted.length === 0) {
					isDuplicate = true;
					return;
				}
				await tx
					.update(centers)
					.set({ subscriptionStatus: "past_due", updatedAt: new Date() })
					.where(eq(centers.id, centerRow.id));
			});
			if (isDuplicate) {
				return c.json({ received: true, duplicate: true });
			}
		} else {
			await db
				.update(centers)
				.set({ subscriptionStatus: "past_due", updatedAt: new Date() })
				.where(eq(centers.id, centerRow.id));
		}

		await captureBillingLifecycle(c, {
			event: ANALYTICS_EVENTS.paymentFailed,
			centerId: centerRow.id,
			subscriptionStatus: "past_due",
		});

		return c.json({ received: true });
	}

	return c.json({ received: true });
});

export { subscriptionWebhookRoutes };
