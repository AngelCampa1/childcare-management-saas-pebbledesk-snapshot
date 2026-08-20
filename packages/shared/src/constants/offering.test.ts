import { describe, expect, it } from "vitest";
import {
	MONEY_BACK_GUARANTEE_DAYS,
	PEBBLEDESK_PROMOTION,
	SUBSCRIPTION_PROMOTIONS,
	TRIAL_DAYS,
} from "./billing.js";
import {
	buildComparisonRows,
	buildEnterprisePricingNote,
	buildPricingTiers,
	COMPARISON_CAPABILITIES,
	type ComparisonCapabilityId,
	formatLimitedOfferTerms,
	formatPricingFaqAnswer,
	formatTrialDisclosure,
	getPlanOffering,
	getPromotionalPriceDisplay,
	getPromotionalPriceLabel,
	HOME_PROMO_PRICE,
	OFFERING_CLAIMS,
	OFFERING_CTA_DEFAULTS,
	type OfferingPlanId,
	PEBBLEDESK_OFFERING,
	PUBLIC_OFFER_CLAIMS,
	STARTER_PROMO_PRICE,
} from "./offering.js";

const EXPECTED_PLAN_IDS: OfferingPlanId[] = [
	"home",
	"center_starter",
	"center_pro",
	"group",
	"enterprise",
];

describe("PEBBLEDESK_OFFERING", () => {
	it("exposes all top-level keys", () => {
		expect(PEBBLEDESK_OFFERING).toHaveProperty("positioning");
		expect(PEBBLEDESK_OFFERING).toHaveProperty("plans");
		expect(PEBBLEDESK_OFFERING).toHaveProperty("comparisonCapabilities");
		expect(PEBBLEDESK_OFFERING).toHaveProperty("promotion");
		expect(PEBBLEDESK_OFFERING).toHaveProperty("trial");
		expect(PEBBLEDESK_OFFERING).toHaveProperty("guarantee");
		expect(PEBBLEDESK_OFFERING).toHaveProperty("claims");
		expect(PEBBLEDESK_OFFERING).toHaveProperty("ctaDefaults");
	});

	it("promotion echoes billing.ts PEBBLEDESK_PROMOTION", () => {
		expect(PEBBLEDESK_OFFERING.promotion).toBe(PEBBLEDESK_PROMOTION);
	});

	it("trial days echo billing.ts TRIAL_DAYS", () => {
		expect(PEBBLEDESK_OFFERING.trial.days).toBe(TRIAL_DAYS);
		expect(PEBBLEDESK_OFFERING.trial.label).toContain(String(TRIAL_DAYS));
	});

	it("guarantee days echo billing.ts MONEY_BACK_GUARANTEE_DAYS", () => {
		expect(PEBBLEDESK_OFFERING.guarantee.days).toBe(MONEY_BACK_GUARANTEE_DAYS);
		expect(PEBBLEDESK_OFFERING.guarantee.label).toContain(String(MONEY_BACK_GUARANTEE_DAYS));
	});
});

describe("plans", () => {
	it("contains exactly the expected plan ids in display order", () => {
		expect(PEBBLEDESK_OFFERING.plans.map((p) => p.id)).toEqual(EXPECTED_PLAN_IDS);
	});

	it.each(EXPECTED_PLAN_IDS)("plan %s has required fields", (id) => {
		const plan = getPlanOffering(id as OfferingPlanId);
		expect(plan.label).toBeTruthy();
		expect(plan.tagline).toBeTruthy();
		expect(plan.marketingFeatures.length).toBeGreaterThan(0);
		expect(plan.ctaText).toBeTruthy();
		expect(typeof plan.selfServe).toBe("boolean");
	});

	it("only center_starter is highlighted", () => {
		const highlighted = PEBBLEDESK_OFFERING.plans.filter((p) => p.highlighted);
		expect(highlighted.length).toBe(1);
		expect(highlighted[0].id).toBe("center_starter");
	});

	it("enterprise is not self-serve", () => {
		const enterprise = getPlanOffering("enterprise");
		expect(enterprise.selfServe).toBe(false);
	});

	it.each(EXPECTED_PLAN_IDS)("plan %s comparisonCells covers all capabilities", (id) => {
		const plan = getPlanOffering(id as OfferingPlanId);
		const capabilityIds = COMPARISON_CAPABILITIES.map((c) => c.id);
		for (const capId of capabilityIds) {
			expect(plan.comparisonCells[capId as ComparisonCapabilityId]).toBeTruthy();
		}
	});
});

describe("comparisonCapabilities", () => {
	it("has at least 5 capabilities", () => {
		expect(PEBBLEDESK_OFFERING.comparisonCapabilities.length).toBeGreaterThanOrEqual(5);
	});

	it("every capability has a non-empty id and label", () => {
		for (const cap of PEBBLEDESK_OFFERING.comparisonCapabilities) {
			expect(cap.id).toBeTruthy();
			expect(cap.label).toBeTruthy();
		}
	});
});

describe("positioning", () => {
	const { positioning } = PEBBLEDESK_OFFERING;

	it("has non-empty tagline, category, targetAudience", () => {
		expect(positioning.tagline).toBeTruthy();
		expect(positioning.productCategory).toBeTruthy();
		expect(positioning.targetAudience).toBeTruthy();
	});

	it("has hero headline and subheadline", () => {
		expect(positioning.hero.headline).toBeTruthy();
		expect(positioning.hero.subheadline).toBeTruthy();
	});

	it("has at least 2 heroBenefits", () => {
		expect(positioning.heroBenefits.length).toBeGreaterThanOrEqual(2);
	});

	it("has heroTrustSignal", () => {
		expect(positioning.heroTrustSignal).toBeTruthy();
	});

	it("has problemAgitation with heading, closingLine, and painPoints", () => {
		expect(positioning.problemAgitation.heading).toBeTruthy();
		expect(positioning.problemAgitation.closingLine).toBeTruthy();
		expect(positioning.problemAgitation.painPoints.length).toBeGreaterThan(0);
	});

	it("has at least 3 trustSignals", () => {
		expect(positioning.trustSignals.length).toBeGreaterThanOrEqual(3);
	});

	it("trustSignals have text and category", () => {
		for (const signal of positioning.trustSignals) {
			expect(signal.text).toBeTruthy();
			expect(["roi", "feature", "compliance", "integration"]).toContain(signal.category);
		}
	});
});

describe("OFFERING_CLAIMS", () => {
	it("echoes TRIAL_DAYS and MONEY_BACK_GUARANTEE_DAYS", () => {
		expect(OFFERING_CLAIMS.trialDays).toBe(TRIAL_DAYS);
		expect(OFFERING_CLAIMS.moneyBackGuaranteeDays).toBe(MONEY_BACK_GUARANTEE_DAYS);
	});

	it("promotionCode matches PEBBLEDESK_PROMOTION.code", () => {
		expect(OFFERING_CLAIMS.promotionCode).toBe(PEBBLEDESK_PROMOTION.code);
	});

	it("non-empty label strings", () => {
		expect(OFFERING_CLAIMS.trialLabel).toBeTruthy();
		expect(OFFERING_CLAIMS.trialReminderLabel).toBeTruthy();
		expect(OFFERING_CLAIMS.trialDisclosure).toBeTruthy();
		expect(OFFERING_CLAIMS.noCreditCardRequired).toBeTruthy();
		expect(OFFERING_CLAIMS.noSetupFees).toBeTruthy();
		expect(OFFERING_CLAIMS.noContracts).toBeTruthy();
		expect(OFFERING_CLAIMS.moneyBackGuaranteeLabel).toBeTruthy();
		expect(OFFERING_CLAIMS.promotionLabel).toBeTruthy();
	});

	it("centralizes public trial disclosure copy", () => {
		expect(formatTrialDisclosure()).toBe(
			"30-day free trial. No credit card required. We email you 3 days before the trial ends.",
		);
		expect(formatTrialDisclosure({ startPrefix: true })).toBe(
			"Start your 30-day free trial. No credit card required. We email you 3 days before the trial ends.",
		);
		expect(OFFERING_CLAIMS.trialDisclosure).toBe(formatTrialDisclosure());
	});

	it("centralizes first-party product boundary claims", () => {
		expect(OFFERING_CLAIMS.onlineOnlyV1).toBe(
			"PebbleDesk is online-only in V1. Centers should keep a temporary outage fallback.",
		);
		expect(OFFERING_CLAIMS.stateSupport).toBe(
			"PebbleDesk supports generic attendance, records, billing, messaging, and ratio workflows nationally, with verified state-specific ratio and licensing-report support today for Texas, California, and Florida.",
		);
		expect(OFFERING_CLAIMS.migrationSupport).toBe(
			"PebbleDesk supports CSV import plus Brightwheel and Procare migration presets.",
		);
		expect(OFFERING_CLAIMS.quickBooksSupport).toBe(
			"QuickBooks support is available on qualifying setups.",
		);
	});
});

describe("OFFERING_CTA_DEFAULTS", () => {
	it("tofu and mofu have ctaMode, ctaText, ctaTarget", () => {
		expect(OFFERING_CTA_DEFAULTS.tofu.ctaMode).toBeTruthy();
		expect(OFFERING_CTA_DEFAULTS.tofu.ctaText).toBeTruthy();
		expect(OFFERING_CTA_DEFAULTS.tofu.ctaTarget).toBeTruthy();
		expect(OFFERING_CTA_DEFAULTS.mofu.ctaMode).toBeTruthy();
		expect(OFFERING_CTA_DEFAULTS.mofu.ctaText).toBeTruthy();
		expect(OFFERING_CTA_DEFAULTS.mofu.ctaTarget).toBeTruthy();
	});
});

describe("getPlanOffering", () => {
	it.each(EXPECTED_PLAN_IDS)("returns plan for id %s", (id) => {
		const plan = getPlanOffering(id);
		expect(plan.id).toBe(id);
	});

	it("throws for unknown id", () => {
		expect(() => getPlanOffering("unknown" as OfferingPlanId)).toThrow();
	});
});

describe("getPromotionalPriceDisplay", () => {
	const PAYABLE: Array<"home" | "center_starter" | "center_pro" | "group"> = [
		"home",
		"center_starter",
		"center_pro",
		"group",
	];

	it.each(PAYABLE)("returns display for %s", (plan) => {
		const display = getPromotionalPriceDisplay(plan);
		expect(display.monthly.badgeLabel).toBeTruthy();
		expect(display.annual.badgeLabel).toBeTruthy();
		expect(display.monthly.originalPriceLabel).toBeTruthy();
		expect(display.monthly.discountedPriceLabel).toBeTruthy();
		expect(display.monthly.renewalPriceLabel).toBeTruthy();
		expect(display.annual.originalPriceLabel).toBeTruthy();
		expect(display.annual.discountedPriceLabel).toBeTruthy();
		expect(display.annual.originalAnnualTotalLabel).toBeTruthy();
		expect(display.annual.discountedAnnualTotalLabel).toBeTruthy();
		expect(display.annual.renewalPriceLabel).toBeTruthy();
	});

	it("uses first-year customer wording and regular-price-after labels", () => {
		const display = getPromotionalPriceDisplay("center_starter");
		expect(display.monthly.badgeLabel).toBe("80% off the first year");
		expect(display.monthly.renewalPriceLabel).toBe("Then $159/mo");
		expect(display.annual.badgeLabel).toBe("80% off the first year");
		expect(display.annual.renewalPriceLabel).toBe("Then $129/mo when paid yearly ($1548/year)");
		expect(display.monthly.badgeLabel).not.toContain("12 months");
		expect(display.annual.badgeLabel).not.toContain("once");
	});
});

describe("getPromotionalPriceLabel", () => {
	it("returns non-empty string for home (annual default)", () => {
		const label = getPromotionalPriceLabel("home");
		expect(label).toBeTruthy();
		expect(label).toContain("/mo");
	});

	it("returns non-empty string for center_starter monthly", () => {
		const label = getPromotionalPriceLabel("center_starter", "monthly");
		expect(label).toBeTruthy();
	});
});

describe("formatPricingFaqAnswer", () => {
	it("returns non-empty string mentioning key plan names and promo code", () => {
		const answer = formatPricingFaqAnswer();
		expect(answer).toBeTruthy();
		expect(answer).toContain(PEBBLEDESK_PROMOTION.code);
		expect(answer).toContain("Home");
		expect(answer).toContain("Center Starter");
		expect(answer).toContain("Center Pro");
		expect(answer).toContain("Group");
		expect(answer).toContain("Larger multi-site rollouts are scoped with sales first");
		expect(answer).not.toContain("Enterprise is custom");
	});
});

describe("formatLimitedOfferTerms", () => {
	it("derives legal-facing limited offer terms from promotion and plan constants", () => {
		expect(formatLimitedOfferTerms()).toBe(
			"Use M80OFF or Y80OFF. M80OFF gives 80% off for 12 months. It is for monthly billing. Y80OFF gives 80% off once. It is for yearly billing. The offer is for subscriptions only. After year one, Home renews at $39/mo when paid yearly ($468/year). Center Starter renews at $129/mo when paid yearly ($1548/year). Center Pro renews at $199/mo when paid yearly ($2388/year). Group renews at $399/mo when paid yearly ($4788/year). Discounted display prices are rounded up to the next whole dollar.",
		);
		for (const promotion of SUBSCRIPTION_PROMOTIONS) {
			expect(formatLimitedOfferTerms()).toContain(promotion.stripeTermsLabel);
			expect(formatLimitedOfferTerms()).toContain(promotion.code);
			expect(formatLimitedOfferTerms()).not.toContain(`${promotion.redemptionCap} redemptions`);
			const cadenceLabel = promotion.cadence === "annual" ? "yearly" : promotion.cadence;
			expect(formatLimitedOfferTerms()).toContain(`for ${cadenceLabel} billing`);
		}
	});
});

describe("buildPricingTiers", () => {
	it("returns only self-serve price card tiers", () => {
		const tiers = buildPricingTiers();
		expect(tiers.map((tier) => tier.slug)).toEqual([
			"home",
			"center_starter",
			"center_pro",
			"group",
		]);
	});

	it("keeps enterprise out of selectable pricing tiers", () => {
		const tiers = buildPricingTiers();
		expect(tiers.map((tier) => tier.slug as string)).not.toContain("enterprise");
	});

	it("center_starter is highlighted", () => {
		const tiers = buildPricingTiers();
		const starter = tiers.find((t) => t.slug === "center_starter");
		expect(starter).toBeDefined();
		if (!starter) return;
		expect(starter.highlighted).toBe(true);
	});

	it("non-enterprise tiers have monthlyPriceCents and promotionalPrice", () => {
		const tiers = buildPricingTiers();
		for (const tier of tiers) {
			expect(tier.monthlyPriceCents).toBeTypeOf("number");
			expect(tier.promotionalPrice).toBeDefined();
		}
	});

	it("uses the annual limited-offer price as the public tier price", () => {
		const tiers = buildPricingTiers();
		const starter = tiers.find((t) => t.slug === "center_starter");
		expect(starter).toBeDefined();
		if (!starter) return;
		expect(starter.price).toBe("$26/mo when paid yearly");
		expect(starter.price).not.toBe("$129/mo billed annually");
	});

	it("ctaText includes trial days", () => {
		const tiers = buildPricingTiers();
		const home = tiers.find((t) => t.slug === "home");
		expect(home).toBeDefined();
		if (!home) return;
		expect(home.ctaText).toContain(String(TRIAL_DAYS));
	});
});

describe("buildEnterprisePricingNote", () => {
	it("returns sales-led enterprise copy outside the self-serve card list", () => {
		const note = buildEnterprisePricingNote();

		expect(note.label).toBe("Enterprise");
		expect(note.price).toBe("Custom");
		expect(note.summary).toContain("10+ sites");
		expect(note.summary).toContain("Talk with sales first");
		expect(note.ctaText).toBe("Contact sales");
	});
});

describe("backwards-compat re-exports", () => {
	it("PUBLIC_OFFER_CLAIMS is the same object as OFFERING_CLAIMS", () => {
		expect(PUBLIC_OFFER_CLAIMS).toBe(OFFERING_CLAIMS);
	});

	it("HOME_PROMO_PRICE is defined and has discountedPriceLabel", () => {
		expect(HOME_PROMO_PRICE).toBeDefined();
		expect(HOME_PROMO_PRICE.discountedPriceLabel).toBeTruthy();
	});

	it("STARTER_PROMO_PRICE is defined and has discountedPriceLabel", () => {
		expect(STARTER_PROMO_PRICE).toBeDefined();
		expect(STARTER_PROMO_PRICE.discountedPriceLabel).toBeTruthy();
	});
});

describe("buildComparisonRows", () => {
	it("returns one row per comparison capability", () => {
		const rows = buildComparisonRows();
		expect(rows.length).toBe(COMPARISON_CAPABILITIES.length);
	});

	it("every row has a non-empty feature label and values for all plan columns", () => {
		const rows = buildComparisonRows();
		for (const row of rows) {
			expect(row.feature).toBeTruthy();
			expect(row.home).toBeTruthy();
			expect(row.centerStarter).toBeTruthy();
			expect(row.centerPro).toBeTruthy();
			expect(row.group).toBeTruthy();
			expect("enterprise" in row).toBe(false);
		}
	});
});

describe("promotion-threaded helpers", () => {
	const monthlyPromotion = SUBSCRIPTION_PROMOTIONS[0];

	it("getPromotionalPriceDisplay uses supplied promotion", () => {
		const display = getPromotionalPriceDisplay("center_starter", monthlyPromotion);
		expect(display.monthly.badgeLabel).toBe("80% off the first year");
		expect(display.monthly.renewalPriceLabel).toBe("Then $159/mo");
		expect(display.monthly.discountedPriceLabel).toContain("$32");
	});

	it("getPromotionalPriceLabel uses supplied promotion and cadence", () => {
		const label = getPromotionalPriceLabel("home", "monthly", monthlyPromotion);
		expect(label).toContain("$10");
	});

	it("formatPricingFaqAnswer mentions the supplied promo code", () => {
		const answer = formatPricingFaqAnswer(monthlyPromotion);
		expect(answer).toContain("M80OFF");
		expect(answer).not.toContain("Y80OFF");
		expect(answer).not.toContain("launch");
	});

	it("buildPricingTiers uses supplied promotion for tier prices", () => {
		const defaultTiers = buildPricingTiers(TRIAL_DAYS);
		const monthlyTiers = buildPricingTiers(TRIAL_DAYS, monthlyPromotion);
		const homeAnnual = defaultTiers.find((t) => t.slug === "home");
		const homeMonthly = monthlyTiers.find((t) => t.slug === "home");
		expect(homeAnnual?.promotionalPrice?.annual.badgeLabel).toBe("80% off the first year");
		expect(homeMonthly?.promotionalPrice?.monthly.badgeLabel).toBe("80% off the first year");
	});

	it("rounds promotional monthly display prices up to whole dollars", () => {
		expect(getPromotionalPriceLabel("center_starter", "monthly")).toBe("$32/mo");
		expect(getPromotionalPriceLabel("center_starter", "annual")).toBe("$26/mo when paid yearly");
	});
});
