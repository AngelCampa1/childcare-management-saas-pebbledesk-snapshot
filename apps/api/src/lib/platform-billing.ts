import { centers, type Database } from "@pebbledesk/db";
import {
	type BillingCadence,
	getSubscriptionPromotionForCadence,
	isPromotionActive,
	SUBSCRIPTION_PROMOTIONS,
	type SubscriptionPlan,
	type SubscriptionStatus,
	TRIAL_DAYS,
} from "@pebbledesk/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Bindings } from "./context.js";
import { verifyStripeWebhookSignature } from "./public-billing.js";

type PlatformEnv = Pick<
	Bindings,
	"STRIPE_SECRET_KEY" | "APP_URL" | "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET"
>;

export async function parseStripeJsonResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Stripe request failed: ${body}`);
	}
	return (await response.json()) as T;
}

export type CreateOrGetPlatformCustomerInput = {
	env: Pick<Bindings, "STRIPE_SECRET_KEY">;
	db: Database;
	center: { id: string; stripeCustomerId: string | null };
	ownerEmail: string;
	ownerName: string;
};

export async function createOrGetPlatformCustomer({
	env,
	db,
	center,
	ownerEmail,
	ownerName,
}: CreateOrGetPlatformCustomerInput): Promise<string> {
	if (center.stripeCustomerId) {
		return center.stripeCustomerId;
	}

	const response = await fetch("https://api.stripe.com/v1/customers", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			email: ownerEmail,
			name: ownerName,
			"metadata[centerId]": center.id,
		}),
	});

	const customer = await parseStripeJsonResponse<{ id?: string }>(response);
	const customerId = customer.id;
	if (!customerId) {
		throw new Error("Failed to create Stripe customer");
	}

	const [updated] = await db
		.update(centers)
		.set({ stripeCustomerId: customerId, updatedAt: new Date() })
		.where(and(eq(centers.id, center.id), isNull(centers.stripeCustomerId)))
		.returning();

	if (!updated) {
		const [currentCenter] = await db
			.select({ stripeCustomerId: centers.stripeCustomerId })
			.from(centers)
			.where(eq(centers.id, center.id))
			.limit(1);
		if (currentCenter?.stripeCustomerId) {
			return currentCenter.stripeCustomerId;
		}
		throw new Error("Center customer state changed before Stripe customer could be saved");
	}

	return customerId;
}

export type ResolvePromotionCodeInput = {
	env: Pick<Bindings, "STRIPE_SECRET_KEY">;
	code: string;
};

export async function resolvePromotionCode({
	env,
	code,
}: ResolvePromotionCodeInput): Promise<string | null> {
	const response = await fetch(
		`https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(code)}&active=true&limit=1`,
		{
			headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
		},
	);

	if (!response.ok) {
		throw new Error(`Stripe promotion lookup failed: ${await response.text()}`);
	}

	const body = (await response.json()) as {
		data?: Array<{ id?: string }>;
	};

	return body.data?.[0]?.id ?? null;
}

export type CreateSubscriptionCheckoutSessionInput = {
	env: PlatformEnv;
	customerId: string;
	priceId: string;
	plan: SubscriptionPlan;
	cadence: BillingCadence;
	centerId: string;
	promoCode?: string;
};

export async function createSubscriptionCheckoutSession({
	env,
	customerId,
	priceId,
	plan,
	cadence,
	centerId,
	promoCode,
}: CreateSubscriptionCheckoutSessionInput): Promise<{ url: string; id: string }> {
	const params = new URLSearchParams();
	params.set("mode", "subscription");
	params.set("customer", customerId);
	params.set("line_items[0][price]", priceId);
	params.set("line_items[0][quantity]", "1");
	params.set("subscription_data[trial_period_days]", String(TRIAL_DAYS));
	params.set("subscription_data[metadata][centerId]", centerId);
	params.set("subscription_data[metadata][plan]", plan);
	params.set("subscription_data[metadata][cadence]", cadence);
	params.set("payment_method_collection", "if_required");
	params.set("client_reference_id", centerId);
	params.set("metadata[centerId]", centerId);
	params.set("metadata[plan]", plan);
	params.set("metadata[cadence]", cadence);
	params.set("success_url", `${env.APP_URL}/dashboard?checkout=success`);
	params.set("cancel_url", `${env.APP_URL}/billing?checkout=cancelled`);

	const cadencePromotion = getSubscriptionPromotionForCadence(cadence);
	const isLimitedOfferCode =
		promoCode !== undefined &&
		SUBSCRIPTION_PROMOTIONS.some((promotion) => promotion.code === promoCode);
	const effectivePromoCode =
		isLimitedOfferCode || !promoCode
			? isPromotionActive()
				? cadencePromotion.code
				: undefined
			: promoCode;
	if (effectivePromoCode) {
		const promotionCodeId = await resolvePromotionCode({ env, code: effectivePromoCode });
		if (!promotionCodeId) {
			throw new Error(`Promotion code not found: ${effectivePromoCode}`);
		}
		params.set("discounts[0][promotion_code]", promotionCodeId);
	} else {
		params.set("allow_promotion_codes", "true");
	}

	const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: params,
	});

	const session = await parseStripeJsonResponse<{ id?: string; url?: string }>(response);
	if (!session.url || !session.id) {
		throw new Error("Stripe did not return a checkout session URL");
	}
	return { url: session.url, id: session.id };
}

export type CreateBillingPortalSessionInput = {
	env: Pick<Bindings, "STRIPE_SECRET_KEY">;
	customerId: string;
	returnUrl: string;
};

export async function createBillingPortalSession({
	env,
	customerId,
	returnUrl,
}: CreateBillingPortalSessionInput): Promise<{ url: string }> {
	const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			customer: customerId,
			return_url: returnUrl,
		}),
	});

	const session = await parseStripeJsonResponse<{ url?: string }>(response);
	if (!session.url) {
		throw new Error("Stripe did not return a billing portal URL");
	}
	return { url: session.url };
}

export function mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
	switch (stripeStatus) {
		case "trialing":
			return "trialing";
		case "active":
			return "active";
		case "past_due":
			return "past_due";
		case "paused":
			return "canceled";
		case "canceled":
			return "canceled";
		case "unpaid":
			return "unpaid";
		case "incomplete":
			return "incomplete";
		case "incomplete_expired":
			return "incomplete_expired";
		default:
			return "incomplete";
	}
}

export function verifyPlatformWebhookSignature(
	payload: string,
	signatureHeader: string | null,
	secret: string,
): boolean {
	return verifyStripeWebhookSignature(payload, signatureHeader, secret);
}
