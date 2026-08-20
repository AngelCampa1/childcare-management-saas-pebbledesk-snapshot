import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_PLANS_LIST } from "../types/billing.js";
import {
	ALL_PLAN_FEATURES,
	DEFAULT_BILLING_CADENCE,
	FEATURE_MIN_PLAN,
	formatAnnualSavingsLabel,
	formatAnnualTotal,
	formatPlanCapacityClaim,
	formatPlanFitSummary,
	formatPlanPrice,
	formatTrialEndReminderLabel,
	getAnnualSavingsMonths,
	getPlanPrice,
	getPromotionalPlanPrice,
	getStripePriceEnvKey,
	getSubscriptionPromotionForCadence,
	isPromotionActive,
	isServiceAllowedSubscriptionStatus,
	MONEY_BACK_GUARANTEE_DAYS,
	minPlanCovering,
	PAYABLE_PLANS,
	PEBBLEDESK_PROMOTION,
	PLAN_ENTITLEMENTS,
	PLAN_FEATURE_LABELS,
	type PlanFeature,
	pickActiveSubscriptionPromotion,
	planHasFeature,
	SUBSCRIPTION_PLAN_CONFIG,
	SUBSCRIPTION_PROMOTIONS,
	TRIAL_DAYS,
	TRIAL_END_REMINDER_DAYS,
} from "./billing.js";

describe("SUBSCRIPTION_PLAN_CONFIG", () => {
	it("trial is free with no Stripe keys", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.label).toBe("Free trial");
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.monthlyAmountCents).toBe(0);
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.annualAmountCents).toBe(0);
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.priceEnvKeys).toBeNull();
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.priceEnvKey).toBeNull();
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.selfServeCheckout).toBe(false);
	});

	it("home has correct label, price, and env key", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.home.label).toBe("Home");
		expect(SUBSCRIPTION_PLAN_CONFIG.home.monthlyAmountCents).toBe(4900);
		expect(SUBSCRIPTION_PLAN_CONFIG.home.annualAmountCents).toBe(46800);
		expect(SUBSCRIPTION_PLAN_CONFIG.home.priceEnvKeys?.monthly).toBe("STRIPE_PRICE_HOME_MONTHLY");
		expect(SUBSCRIPTION_PLAN_CONFIG.home.priceEnvKeys?.annual).toBe("STRIPE_PRICE_HOME_ANNUAL");
	});

	it("center_starter has correct label, price, and env key", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.label).toBe("Center Starter");
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.monthlyAmountCents).toBe(15900);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.annualAmountCents).toBe(154800);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.priceEnvKeys?.monthly).toBe(
			"STRIPE_PRICE_CENTER_STARTER_MONTHLY",
		);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.priceEnvKeys?.annual).toBe(
			"STRIPE_PRICE_CENTER_STARTER_ANNUAL",
		);
	});

	it("center_pro has correct label, price, and env key", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.label).toBe("Center Pro");
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.monthlyAmountCents).toBe(23900);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.annualAmountCents).toBe(238800);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.priceEnvKeys?.monthly).toBe(
			"STRIPE_PRICE_CENTER_PRO_MONTHLY",
		);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.priceEnvKeys?.annual).toBe(
			"STRIPE_PRICE_CENTER_PRO_ANNUAL",
		);
	});

	it("group has correct label, price, and env key", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.group.label).toBe("Group");
		expect(SUBSCRIPTION_PLAN_CONFIG.group.monthlyAmountCents).toBe(47900);
		expect(SUBSCRIPTION_PLAN_CONFIG.group.annualAmountCents).toBe(478800);
		expect(SUBSCRIPTION_PLAN_CONFIG.group.priceEnvKeys?.monthly).toBe("STRIPE_PRICE_GROUP_MONTHLY");
		expect(SUBSCRIPTION_PLAN_CONFIG.group.priceEnvKeys?.annual).toBe("STRIPE_PRICE_GROUP_ANNUAL");
	});

	it("enterprise has correct label, price, and null env key", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.enterprise.label).toBe("Enterprise");
		expect(SUBSCRIPTION_PLAN_CONFIG.enterprise.monthlyAmountCents).toBe(0);
		expect(SUBSCRIPTION_PLAN_CONFIG.enterprise.priceEnvKey).toBeNull();
	});

	it("group is self-serve checkout eligible", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.group.selfServeCheckout).toBe(true);
	});

	it("enterprise priceEnvKey is null (sales-led)", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.enterprise.priceEnvKey).toBeNull();
	});
});

describe("pricing helpers", () => {
	it("defaults buyers to annual billing", () => {
		expect(DEFAULT_BILLING_CADENCE).toBe("annual");
		expect(getPlanPrice("home")).toEqual({
			amountCents: 46800,
			monthlyEquivalentCents: 3900,
			cadence: "annual",
		});
	});

	it("returns monthly and annual env keys by cadence", () => {
		expect(getStripePriceEnvKey("center_pro", "monthly")).toBe("STRIPE_PRICE_CENTER_PRO_MONTHLY");
		expect(getStripePriceEnvKey("center_pro", "annual")).toBe("STRIPE_PRICE_CENTER_PRO_ANNUAL");
	});

	it("returns null for trial (no Stripe keys)", () => {
		expect(getStripePriceEnvKey("trial", "monthly")).toBeNull();
		expect(getStripePriceEnvKey("trial", "annual")).toBeNull();
	});

	it("formats primary annual and monthly price labels", () => {
		expect(formatPlanPrice("center_starter", "annual")).toBe("$129/mo billed annually");
		expect(formatPlanPrice("center_starter", "monthly")).toBe("$159/mo");
		expect(formatAnnualTotal("group")).toBe("$4788/year");
	});

	it("centralizes trial, guarantee, and limited offer terms", () => {
		expect(TRIAL_DAYS).toBe(30);
		expect(TRIAL_END_REMINDER_DAYS).toBe(3);
		expect(MONEY_BACK_GUARANTEE_DAYS).toBe(30);
		expect(PEBBLEDESK_PROMOTION).toMatchObject({
			code: "Y80OFF",
			name: "80% OFF - Yearly",
			label: "80% off the first year",
			stripeTermsLabel: "80% off once",
			discountPercent: 80,
			durationLabel: "first year",
			urgencyLabel: "Limited time offer",
			validThrough: null,
			redemptionCap: 200,
		});
		expect(isPromotionActive(new Date("2026-05-31T23:59:59.000Z"))).toBe(true);
		expect(isPromotionActive(new Date("2030-06-01T00:00:00.000Z"))).toBe(true);
	});

	it("formats trial reminder copy from the canonical reminder window", () => {
		expect(formatTrialEndReminderLabel()).toBe("We email you 3 days before the trial ends.");
	});

	it("derives annual savings copy from canonical plan prices", () => {
		expect(getAnnualSavingsMonths("home")).toBe(2);
		expect(getAnnualSavingsMonths("center_starter")).toBe(2);
		expect(getAnnualSavingsMonths("center_pro")).toBe(2);
		expect(getAnnualSavingsMonths("group")).toBe(2);
		expect(formatAnnualSavingsLabel("center_pro")).toBe("2 months free");
	});

	it("formats singular annual savings copy when a plan saves one month", () => {
		const mutableHomeConfig = SUBSCRIPTION_PLAN_CONFIG.home as { annualAmountCents: number };
		const originalAnnualAmountCents = mutableHomeConfig.annualAmountCents;

		try {
			mutableHomeConfig.annualAmountCents = SUBSCRIPTION_PLAN_CONFIG.home.monthlyAmountCents * 11;

			expect(formatAnnualSavingsLabel("home")).toBe("1 month free");
		} finally {
			mutableHomeConfig.annualAmountCents = originalAnnualAmountCents;
		}
	});

	it("fails fast when a cadence has no configured promotion", () => {
		expect(() => getSubscriptionPromotionForCadence("weekly" as never)).toThrow(
			"No subscription promotion configured for cadence: weekly",
		);
	});

	it("derives plan fit copy from canonical entitlements", () => {
		expect(formatPlanCapacityClaim("home")).toBe("up to 15 active children");
		expect(formatPlanCapacityClaim("center_starter")).toBe("up to 50 active children");
		expect(formatPlanCapacityClaim("center_pro")).toBe("up to 100 active children");
		expect(formatPlanCapacityClaim("group")).toBe("multi-site operators");
		expect(formatPlanCapacityClaim("enterprise")).toBe("complex multi-site operators");
		expect(formatPlanCapacityClaim("trial")).toBe("trial users");
		expect(formatPlanFitSummary("home")).toBe("Home fits programs with up to 15 active children.");
		expect(formatPlanFitSummary("center_starter")).toBe(
			"Center Starter fits programs with up to 50 active children.",
		);
	});

	it("supports a dated promotion window when validThrough is configured", () => {
		const mutablePromotion = PEBBLEDESK_PROMOTION as { validThrough: string | null };
		const originalValidThrough = mutablePromotion.validThrough;

		try {
			mutablePromotion.validThrough = "2026-05-31";

			expect(isPromotionActive(new Date("2026-05-31T23:59:59.999Z"))).toBe(true);
			expect(isPromotionActive(new Date("2026-06-01T00:00:00.000Z"))).toBe(false);
		} finally {
			mutablePromotion.validThrough = originalValidThrough;
		}
	});

	it("returns exact 80% off promotional price labels by cadence", () => {
		expect(getPromotionalPlanPrice("home", "monthly")).toMatchObject({
			originalAmountCents: 4900,
			discountedAmountCents: 980,
			originalPriceLabel: "$49/mo",
			discountedPriceLabel: "$10/mo",
			badgeLabel: "80% off the first year",
			renewalPriceLabel: "Then $49/mo",
		});
		expect(getPromotionalPlanPrice("center_starter", "monthly").discountedPriceLabel).toBe(
			"$32/mo",
		);
		expect(getPromotionalPlanPrice("center_pro", "monthly").discountedPriceLabel).toBe("$48/mo");
		expect(getPromotionalPlanPrice("group", "monthly").discountedPriceLabel).toBe("$96/mo");
	});

	it("returns discounted annual monthly equivalents and annual totals", () => {
		expect(getPromotionalPlanPrice("center_starter", "annual")).toMatchObject({
			originalAmountCents: 154800,
			discountedAmountCents: 30960,
			originalPriceLabel: "$129/mo billed annually",
			discountedPriceLabel: "$26/mo when paid yearly",
			originalAnnualTotalLabel: "$1548/year",
			discountedAnnualTotalLabel: "$309.60/year",
		});
	});

	it("keeps annual promotional monthly equivalents consistent for every self-serve plan", () => {
		expect(getPromotionalPlanPrice("home", "annual")).toMatchObject({
			discountedPriceLabel: "$8/mo when paid yearly",
			discountedAnnualTotalLabel: "$93.60/year",
		});
		expect(getPromotionalPlanPrice("center_starter", "annual")).toMatchObject({
			discountedPriceLabel: "$26/mo when paid yearly",
			discountedAnnualTotalLabel: "$309.60/year",
		});
		expect(getPromotionalPlanPrice("center_pro", "annual")).toMatchObject({
			discountedPriceLabel: "$40/mo when paid yearly",
			discountedAnnualTotalLabel: "$477.60/year",
		});
		expect(getPromotionalPlanPrice("group", "annual")).toMatchObject({
			discountedPriceLabel: "$80/mo when paid yearly",
			discountedAnnualTotalLabel: "$957.60/year",
		});
	});

	it("allows service access only for paid or trialing subscription statuses", () => {
		expect(isServiceAllowedSubscriptionStatus("trialing")).toBe(true);
		expect(isServiceAllowedSubscriptionStatus("active")).toBe(true);
		expect(isServiceAllowedSubscriptionStatus("canceled")).toBe(false);
		expect(isServiceAllowedSubscriptionStatus("none")).toBe(false);
	});
});

describe("SUBSCRIPTION_PLANS_LIST", () => {
	it("contains exactly 6 plans", () => {
		expect(SUBSCRIPTION_PLANS_LIST).toHaveLength(6);
	});

	it("contains all expected plan values", () => {
		expect(SUBSCRIPTION_PLANS_LIST).toContain("trial");
		expect(SUBSCRIPTION_PLANS_LIST).toContain("home");
		expect(SUBSCRIPTION_PLANS_LIST).toContain("center_starter");
		expect(SUBSCRIPTION_PLANS_LIST).toContain("center_pro");
		expect(SUBSCRIPTION_PLANS_LIST).toContain("group");
		expect(SUBSCRIPTION_PLANS_LIST).toContain("enterprise");
	});

	it("follows the correct order matching the type union", () => {
		expect(SUBSCRIPTION_PLANS_LIST[0]).toBe("trial");
		expect(SUBSCRIPTION_PLANS_LIST[1]).toBe("home");
		expect(SUBSCRIPTION_PLANS_LIST[2]).toBe("center_starter");
		expect(SUBSCRIPTION_PLANS_LIST[3]).toBe("center_pro");
		expect(SUBSCRIPTION_PLANS_LIST[4]).toBe("group");
		expect(SUBSCRIPTION_PLANS_LIST[5]).toBe("enterprise");
	});

	it("does not contain removed legacy plan 'center'", () => {
		expect(SUBSCRIPTION_PLANS_LIST).not.toContain("center");
	});
});

describe("PAYABLE_PLANS", () => {
	it("contains exactly the four self-serve plans in price order", () => {
		expect(PAYABLE_PLANS).toEqual(["home", "center_starter", "center_pro", "group"]);
	});

	it("excludes trial and enterprise", () => {
		expect(PAYABLE_PLANS).not.toContain("trial");
		expect(PAYABLE_PLANS).not.toContain("enterprise");
	});
});

describe("PLAN_ENTITLEMENTS", () => {
	it("trial unlocks every feature", () => {
		for (const feature of ALL_PLAN_FEATURES) {
			expect(planHasFeature("trial", feature)).toBe(true);
		}
		expect(PLAN_ENTITLEMENTS.trial.maxActiveChildren).toBeNull();
	});
});

describe("PLAN_FEATURE_LABELS", () => {
	it("has a human-readable label for every feature", () => {
		for (const feature of ALL_PLAN_FEATURES) {
			expect(PLAN_FEATURE_LABELS[feature]).toBeTruthy();
		}
	});
});

describe("FEATURE_MIN_PLAN", () => {
	it("maps each feature to the correct minimum plan", () => {
		expect(FEATURE_MIN_PLAN.subsidies).toBe("center_starter");
		expect(FEATURE_MIN_PLAN.imports).toBe("center_starter");
		expect(FEATURE_MIN_PLAN.public_payment_links).toBe("center_starter");
		expect(FEATURE_MIN_PLAN.quickbooks).toBe("center_pro");
		expect(FEATURE_MIN_PLAN.larger_center_reporting).toBe("center_pro");
		expect(FEATURE_MIN_PLAN.multi_center).toBe("group");
	});
});

describe("minPlanCovering", () => {
	it("returns home for no features", () => {
		expect(minPlanCovering([])).toBe("home");
	});

	it("returns center_starter for subsidies+imports", () => {
		expect(minPlanCovering(["subsidies", "imports"])).toBe("center_starter");
	});

	it("returns center_pro when quickbooks is needed", () => {
		expect(minPlanCovering(["subsidies", "quickbooks"])).toBe("center_pro");
	});

	it("returns group when multi_center is needed", () => {
		expect(minPlanCovering(["subsidies", "quickbooks", "multi_center"])).toBe("group");
	});

	it("falls back to group when no explicit self-serve plan covers every feature", () => {
		expect(minPlanCovering(["unlisted_feature" as PlanFeature])).toBe("group");
	});
});

describe("SUBSCRIPTION_PROMOTIONS", () => {
	it("contains exactly the monthly and annual limited offer codes", () => {
		expect(SUBSCRIPTION_PROMOTIONS).toHaveLength(2);
		expect(SUBSCRIPTION_PROMOTIONS.map((promotion) => promotion.code)).toEqual([
			"M80OFF",
			"Y80OFF",
		]);
	});

	it("keeps the Stripe coupon names, terms, and redemption caps explicit", () => {
		expect(SUBSCRIPTION_PROMOTIONS[0]).toMatchObject({
			cadence: "monthly",
			code: "M80OFF",
			name: "80% OFF - Monthly",
			label: "80% off the first year",
			stripeTermsLabel: "80% off for 12 months",
			redemptionCap: 100,
		});
		expect(SUBSCRIPTION_PROMOTIONS[1]).toMatchObject({
			cadence: "annual",
			code: "Y80OFF",
			name: "80% OFF - Yearly",
			label: "80% off the first year",
			stripeTermsLabel: "80% off once",
			redemptionCap: 200,
		});
	});

	it("each subscription promotion has an 80% discount and limited-offer copy", () => {
		for (const promotion of SUBSCRIPTION_PROMOTIONS) {
			expect(promotion.discountPercent).toBe(80);
			expect(promotion.urgencyLabel).toBe("Limited time offer");
			expect(promotion.urgencyLabel.toLowerCase()).not.toContain("launch");
		}
	});

	it("PEBBLEDESK_PROMOTION aliases the annual subscription promotion", () => {
		expect(PEBBLEDESK_PROMOTION).toBe(SUBSCRIPTION_PROMOTIONS[1]);
		expect(PEBBLEDESK_PROMOTION.code).toBe("Y80OFF");
	});

	it("each phase has a non-empty string urgencyLabel", () => {
		for (const phase of SUBSCRIPTION_PROMOTIONS) {
			expect(typeof phase.urgencyLabel).toBe("string");
			expect(phase.urgencyLabel.length).toBeGreaterThan(0);
		}
	});
});

describe("pickActiveSubscriptionPromotion", () => {
	it("returns the monthly code while monthly redemptions remain", () => {
		const result = pickActiveSubscriptionPromotion("monthly", { M80OFF: 99, Y80OFF: 200 });
		expect(result?.code).toBe("M80OFF");
	});

	it("returns the annual code while annual redemptions remain", () => {
		const result = pickActiveSubscriptionPromotion("annual", { M80OFF: 100, Y80OFF: 199 });
		expect(result?.code).toBe("Y80OFF");
	});

	it("returns null when the cadence-specific cap is full", () => {
		const result = pickActiveSubscriptionPromotion("monthly", { M80OFF: 100 });
		expect(result).toBeNull();
	});

	it("defaults missing cadence-specific counts to 0 redemptions", () => {
		const result = pickActiveSubscriptionPromotion("annual", {});
		expect(result?.code).toBe("Y80OFF");
	});
});

describe("getPromotionalPlanPrice with explicit promotion", () => {
	it("applies an explicit monthly promotion correctly", () => {
		const monthlyPromotion = SUBSCRIPTION_PROMOTIONS[0];
		const result = getPromotionalPlanPrice("center_starter", "monthly", monthlyPromotion);
		expect(result.discountPercent).toBe(80);
		expect(result.badgeLabel).toBe("80% off the first year");
		expect(result.renewalPriceLabel).toBe("Then $159/mo");
		expect(result.discountedAmountCents).toBe(Math.round(15900 * 0.2));
	});

	it("defaults to the cadence-specific limited offer when no promotion is given", () => {
		const defaultResult = getPromotionalPlanPrice("home", "monthly");
		const explicitResult = getPromotionalPlanPrice("home", "monthly", SUBSCRIPTION_PROMOTIONS[0]);
		expect(defaultResult.discountedAmountCents).toBe(explicitResult.discountedAmountCents);
		expect(defaultResult.discountPercent).toBe(80);
	});
});
