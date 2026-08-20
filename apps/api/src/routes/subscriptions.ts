import { zValidator } from "@hono/zod-validator";
import { centers, trialFeatureUsage, users } from "@pebbledesk/db";
import {
	BILLING_CADENCES,
	DEFAULT_BILLING_CADENCE,
	getStripePriceEnvKey,
	PAYABLE_PLANS,
	type PlanFeature,
	SUBSCRIPTION_PLAN_CONFIG,
} from "@pebbledesk/shared";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared/constants";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { badRequest, notFound } from "../lib/errors.js";
import {
	createBillingPortalSession,
	createOrGetPlatformCustomer,
	createSubscriptionCheckoutSession,
} from "../lib/platform-billing.js";
import { analyticsDistinctId, getExecutionContext, schedulePostHogEvent } from "../lib/posthog.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

const subscriptionRoutes = new Hono<AppEnv>();

subscriptionRoutes.use("*", requireAuth, requireCenter);

const checkoutSchema = z.object({
	plan: z.enum(PAYABLE_PLANS),
	cadence: z.enum(BILLING_CADENCES).default(DEFAULT_BILLING_CADENCE),
	promoCode: z.string().trim().min(1).max(64).optional(),
});

subscriptionRoutes.post(
	"/checkout",
	requireAuth,
	requireRole("owner"),
	zValidator("json", checkoutSchema),
	async (c) => {
		// centerId is guaranteed by requireCenter middleware applied to all subscriptionRoutes
		const centerId = c.get("centerId");
		/* v8 ignore next -- centerId always set by requireCenter middleware */
		if (!centerId) throw new Response(null, { status: 500 });
		const userId = c.get("userId");
		const db = c.get("db");
		const { plan, cadence, promoCode } = c.req.valid("json");

		const config = SUBSCRIPTION_PLAN_CONFIG[plan];
		const priceEnvKey = getStripePriceEnvKey(plan, cadence);
		if (!config.selfServeCheckout || !priceEnvKey) {
			badRequest("Plan not available for self-serve checkout");
		}

		const [center] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
		if (!center) notFound("Center not found");

		const [owner] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
		if (!owner) notFound("Owner user not found");

		const priceId = c.env[priceEnvKey];
		if (!priceId || typeof priceId !== "string") {
			badRequest("Stripe price not configured");
		}

		const customerId = await createOrGetPlatformCustomer({
			env: c.env,
			db,
			center: { id: center.id, stripeCustomerId: center.stripeCustomerId ?? null },
			ownerEmail: owner.email,
			ownerName: owner.name,
		});

		const session = await createSubscriptionCheckoutSession({
			env: c.env,
			customerId,
			priceId: priceId as string,
			plan,
			cadence,
			centerId,
			promoCode,
		});
		schedulePostHogEvent(c.env, getExecutionContext(c), {
			event: ANALYTICS_EVENTS.billingCheckoutStarted,
			distinctId: await analyticsDistinctId("center", centerId),
			properties: {
				plan,
				cadence,
				subscription_status: center.subscriptionStatus,
				promo_present: Boolean(promoCode),
			},
		});
		schedulePostHogEvent(c.env, getExecutionContext(c), {
			event: ANALYTICS_EVENTS.checkoutStarted,
			distinctId: await analyticsDistinctId("center", centerId),
			properties: {
				plan,
				cadence,
				subscription_status: center.subscriptionStatus,
				promo_present: Boolean(promoCode),
			},
		});

		return c.json({ url: session.url });
	},
);

subscriptionRoutes.post("/portal", requireAuth, requireRole("owner"), async (c) => {
	// centerId is guaranteed by requireCenter middleware applied to all subscriptionRoutes
	const centerId = c.get("centerId");
	/* v8 ignore next -- centerId always set by requireCenter middleware */
	if (!centerId) throw new Response(null, { status: 500 });
	const db = c.get("db");

	const [center] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
	if (!center) notFound("Center not found");

	if (!center.stripeCustomerId) {
		badRequest("No Stripe customer on file");
	}

	const session = await createBillingPortalSession({
		env: c.env,
		customerId: center.stripeCustomerId as string,
		returnUrl: `${c.env.APP_URL}/billing`,
	});

	return c.json({ url: session.url });
});

subscriptionRoutes.get("/status", requireAuth, async (c) => {
	// centerId is guaranteed by requireCenter middleware applied to all subscriptionRoutes
	const centerId = c.get("centerId");
	/* v8 ignore next -- centerId always set by requireCenter middleware */
	if (!centerId) throw new Response(null, { status: 500 });
	const db = c.get("db");

	const [center] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
	if (!center) notFound("Center not found");

	return c.json({
		subscriptionStatus: center.subscriptionStatus,
		subscriptionPlan: center.subscriptionPlan,
		trialEndsAt: center.trialEndsAt,
		currentPeriodEnd: center.currentPeriodEnd,
		stripeCustomerId: Boolean(center.stripeCustomerId),
	});
});

subscriptionRoutes.get("/trial-usage", requireAuth, async (c) => {
	const centerId = c.get("centerId");
	/* v8 ignore next -- centerId always set by requireCenter middleware */
	if (!centerId) throw new Response(null, { status: 500 });
	const db = c.get("db");

	const rows = await db
		.select({ feature: trialFeatureUsage.feature })
		.from(trialFeatureUsage)
		.where(eq(trialFeatureUsage.centerId, centerId));

	const usedFeatures = rows.map((r) => r.feature) as PlanFeature[];
	return c.json({ usedFeatures });
});

export { subscriptionRoutes };
