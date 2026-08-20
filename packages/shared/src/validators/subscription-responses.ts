import { z } from "zod";
import { STRIPE_ACCOUNT_STATUSES } from "../constants/enums.js";

/**
 * Response shapes for subscription and Stripe Connect endpoints. Schemas use
 * `passthrough()` so unknown fields from the API are preserved — only the
 * fields the web app reads are validated.
 */
const SUBSCRIPTION_STATUS_VALUES = [
	"none",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
	"incomplete",
	"incomplete_expired",
] as const;

export const subscriptionStatusResponseSchema = z
	.object({
		subscriptionStatus: z.enum(SUBSCRIPTION_STATUS_VALUES),
		subscriptionPlan: z.string().nullable(),
		trialEndsAt: z.string().nullable(),
		currentPeriodEnd: z.string().nullable(),
		stripeCustomerId: z.boolean(),
	})
	.passthrough();

export const trialFeatureUsageResponseSchema = z
	.object({ usedFeatures: z.array(z.string()) })
	.passthrough();

export const redirectUrlResponseSchema = z.object({ url: z.string() }).passthrough();

export const stripeConnectStatusResponseSchema = z
	.object({
		stripeAccountId: z.string().nullable(),
		stripeAccountStatus: z.enum(STRIPE_ACCOUNT_STATUSES),
		stripeAccountDisabledReason: z.string().nullable().optional(),
	})
	.passthrough();

export const stripeConnectOnboardingLinkResponseSchema = z
	.object({
		accountId: z.string(),
		url: z.string(),
	})
	.passthrough();
