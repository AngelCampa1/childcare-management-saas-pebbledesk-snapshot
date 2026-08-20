import type { SubscriptionStatus } from "@pebbledesk/shared";

// Returns true when the center has an active subscription or is in a trial period.
// Exported separately so tests can override it without mocking the entire dashboard module.
export const getBillingState = (subscriptionStatus: SubscriptionStatus | undefined): boolean =>
	subscriptionStatus === "active" ||
	subscriptionStatus === "trialing" ||
	subscriptionStatus === "past_due";
