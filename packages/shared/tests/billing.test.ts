import { describe, expect, it } from "vitest";
import {
	ALL_PLAN_FEATURES,
	FEATURE_MIN_PLAN,
	minPlanCovering,
	PAYABLE_PLANS,
	PLAN_ENTITLEMENTS,
	PLAN_FEATURE_LABELS,
	planHasFeature,
	SUBSCRIPTION_PLAN_CONFIG,
	TRIAL_DAYS,
} from "../src/constants/billing.js";
import { SUBSCRIPTION_PLANS_LIST, SUBSCRIPTION_STATUSES } from "../src/types/billing.js";

describe("SUBSCRIPTION_STATUSES", () => {
	it("contains all eight platform subscription statuses", () => {
		expect(SUBSCRIPTION_STATUSES).toEqual([
			"none",
			"trialing",
			"active",
			"past_due",
			"canceled",
			"unpaid",
			"incomplete",
			"incomplete_expired",
		]);
	});
});

describe("SUBSCRIPTION_PLANS_LIST", () => {
	it("contains all six plans in order", () => {
		expect(SUBSCRIPTION_PLANS_LIST).toEqual([
			"trial",
			"home",
			"center_starter",
			"center_pro",
			"group",
			"enterprise",
		]);
	});
});

describe("SUBSCRIPTION_PLAN_CONFIG", () => {
	it("has an entry for every plan", () => {
		for (const plan of SUBSCRIPTION_PLANS_LIST) {
			expect(SUBSCRIPTION_PLAN_CONFIG[plan]).toBeDefined();
		}
	});

	it("trial is free with no Stripe keys and no self-serve checkout", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.label).toBe("Free trial");
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.monthlyAmountCents).toBe(0);
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.annualAmountCents).toBe(0);
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.priceEnvKeys).toBeNull();
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.priceEnvKey).toBeNull();
		expect(SUBSCRIPTION_PLAN_CONFIG.trial.selfServeCheckout).toBe(false);
	});

	it("prices Home at $49/mo or $468/year", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.home.monthlyAmountCents).toBe(4900);
		expect(SUBSCRIPTION_PLAN_CONFIG.home.annualAmountCents).toBe(46800);
		expect(SUBSCRIPTION_PLAN_CONFIG.home.priceEnvKeys?.annual).toBe("STRIPE_PRICE_HOME_ANNUAL");
		expect(SUBSCRIPTION_PLAN_CONFIG.home.label).toBe("Home");
	});

	it("prices Center Starter at $159/mo or $1548/year", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.monthlyAmountCents).toBe(15900);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.annualAmountCents).toBe(154800);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.priceEnvKeys?.annual).toBe(
			"STRIPE_PRICE_CENTER_STARTER_ANNUAL",
		);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_starter.label).toBe("Center Starter");
	});

	it("prices Center Pro at $239/mo or $2388/year", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.monthlyAmountCents).toBe(23900);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.annualAmountCents).toBe(238800);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.priceEnvKeys?.annual).toBe(
			"STRIPE_PRICE_CENTER_PRO_ANNUAL",
		);
		expect(SUBSCRIPTION_PLAN_CONFIG.center_pro.label).toBe("Center Pro");
	});

	it("prices Group at $479/mo or $4788/year", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.group.monthlyAmountCents).toBe(47900);
		expect(SUBSCRIPTION_PLAN_CONFIG.group.annualAmountCents).toBe(478800);
		expect(SUBSCRIPTION_PLAN_CONFIG.group.priceEnvKeys?.annual).toBe("STRIPE_PRICE_GROUP_ANNUAL");
		expect(SUBSCRIPTION_PLAN_CONFIG.group.label).toBe("Group");
	});

	it("routes enterprise off Stripe", () => {
		expect(SUBSCRIPTION_PLAN_CONFIG.enterprise.priceEnvKey).toBeNull();
		expect(SUBSCRIPTION_PLAN_CONFIG.enterprise.monthlyAmountCents).toBe(0);
		expect(SUBSCRIPTION_PLAN_CONFIG.enterprise.label).toBe("Enterprise");
	});
});

describe("PLAN_ENTITLEMENTS", () => {
	it("has an entry for every plan", () => {
		for (const plan of SUBSCRIPTION_PLANS_LIST) {
			expect(PLAN_ENTITLEMENTS[plan]).toBeDefined();
		}
	});

	it("trial has no child cap and all features unlocked", () => {
		expect(PLAN_ENTITLEMENTS.trial.maxActiveChildren).toBeNull();
		for (const feature of ALL_PLAN_FEATURES) {
			expect(planHasFeature("trial", feature)).toBe(true);
		}
	});

	it("defines active-child caps and tier feature access", () => {
		expect(PLAN_ENTITLEMENTS.home.maxActiveChildren).toBe(15);
		expect(PLAN_ENTITLEMENTS.center_starter.maxActiveChildren).toBe(50);
		expect(PLAN_ENTITLEMENTS.center_pro.maxActiveChildren).toBe(100);
		expect(PLAN_ENTITLEMENTS.group.maxActiveChildren).toBeNull();
		expect(PLAN_ENTITLEMENTS.enterprise.maxActiveChildren).toBeNull();

		expect(planHasFeature("home", "subsidies")).toBe(false);
		expect(planHasFeature("center_starter", "subsidies")).toBe(true);
		expect(planHasFeature("center_starter", "quickbooks")).toBe(false);
		expect(planHasFeature("center_pro", "quickbooks")).toBe(true);
		expect(planHasFeature("group", "multi_center")).toBe(true);
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

describe("PLAN_FEATURE_LABELS", () => {
	it("has a label for every plan feature", () => {
		for (const feature of ALL_PLAN_FEATURES) {
			expect(PLAN_FEATURE_LABELS[feature]).toBeTruthy();
		}
	});

	it("maps features to human-readable labels", () => {
		expect(PLAN_FEATURE_LABELS.subsidies).toBe("Subsidy billing");
		expect(PLAN_FEATURE_LABELS.quickbooks).toBe("QuickBooks sync");
		expect(PLAN_FEATURE_LABELS.imports).toBe("Data imports");
		expect(PLAN_FEATURE_LABELS.public_payment_links).toBe("Public payment links");
		expect(PLAN_FEATURE_LABELS.multi_center).toBe("Multi-center management");
		expect(PLAN_FEATURE_LABELS.larger_center_reporting).toBe("Larger center reporting");
	});
});

describe("FEATURE_MIN_PLAN", () => {
	it("maps each feature to the cheapest plan that includes it", () => {
		expect(FEATURE_MIN_PLAN.subsidies).toBe("center_starter");
		expect(FEATURE_MIN_PLAN.imports).toBe("center_starter");
		expect(FEATURE_MIN_PLAN.public_payment_links).toBe("center_starter");
		expect(FEATURE_MIN_PLAN.quickbooks).toBe("center_pro");
		expect(FEATURE_MIN_PLAN.larger_center_reporting).toBe("center_pro");
		expect(FEATURE_MIN_PLAN.multi_center).toBe("group");
	});

	it("is consistent with PLAN_ENTITLEMENTS", () => {
		for (const [feature, minPlan] of Object.entries(FEATURE_MIN_PLAN) as [
			keyof typeof FEATURE_MIN_PLAN,
			(typeof PAYABLE_PLANS)[number],
		][]) {
			expect(planHasFeature(minPlan, feature)).toBe(true);
			const minPlanIndex = PAYABLE_PLANS.indexOf(minPlan);
			for (let i = 0; i < minPlanIndex; i++) {
				const cheaperPlan = PAYABLE_PLANS[i];
				if (cheaperPlan) {
					expect(planHasFeature(cheaperPlan, feature)).toBe(false);
				}
			}
		}
	});
});

describe("minPlanCovering", () => {
	it("returns home when no features are required", () => {
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

	it("returns the minimum sufficient plan (not always the most expensive)", () => {
		expect(minPlanCovering(["larger_center_reporting"])).toBe("center_pro");
		expect(minPlanCovering(["imports", "public_payment_links"])).toBe("center_starter");
	});
});

describe("TRIAL_DAYS", () => {
	it("is 30", () => {
		expect(TRIAL_DAYS).toBe(30);
	});
});
