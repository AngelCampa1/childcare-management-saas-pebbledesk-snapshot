import { describe, expect, it } from "vitest";
import {
	redirectUrlResponseSchema,
	stripeConnectOnboardingLinkResponseSchema,
	stripeConnectStatusResponseSchema,
	subscriptionStatusResponseSchema,
	trialFeatureUsageResponseSchema,
} from "./subscription-responses.js";

describe("subscription/stripe response validators", () => {
	it("parses a subscription status payload", () => {
		const parsed = subscriptionStatusResponseSchema.parse({
			subscriptionStatus: "trialing",
			subscriptionPlan: null,
			trialEndsAt: "2026-06-01T00:00:00.000Z",
			currentPeriodEnd: null,
			stripeCustomerId: false,
		});
		expect(parsed.subscriptionStatus).toBe("trialing");
	});

	it("rejects an invalid subscription status", () => {
		expect(() =>
			subscriptionStatusResponseSchema.parse({
				subscriptionStatus: "bogus",
				subscriptionPlan: null,
				trialEndsAt: null,
				currentPeriodEnd: null,
				stripeCustomerId: false,
			}),
		).toThrow();
	});

	it("parses a trial feature usage payload", () => {
		const parsed = trialFeatureUsageResponseSchema.parse({ usedFeatures: [] });
		expect(parsed.usedFeatures).toEqual([]);
	});

	it("parses a redirect url response", () => {
		expect(redirectUrlResponseSchema.parse({ url: "https://example.test/checkout" })).toBeTruthy();
	});

	it("rejects a redirect response without a url", () => {
		expect(() => redirectUrlResponseSchema.parse({})).toThrow();
	});

	it("parses a stripe connect status payload", () => {
		const parsed = stripeConnectStatusResponseSchema.parse({
			stripeAccountId: null,
			stripeAccountStatus: "not_connected",
		});
		expect(parsed.stripeAccountStatus).toBe("not_connected");
	});

	it("parses a stripe onboarding link payload", () => {
		const parsed = stripeConnectOnboardingLinkResponseSchema.parse({
			accountId: "acct_1",
			url: "https://connect.stripe.test/onboard",
		});
		expect(parsed.accountId).toBe("acct_1");
	});

	it("rejects an onboarding link missing the url", () => {
		expect(() =>
			stripeConnectOnboardingLinkResponseSchema.parse({ accountId: "acct_1" }),
		).toThrow();
	});
});
