import type { SubscriptionPlan, SubscriptionStatus } from "../types/billing.js";

export type BillingCadence = "monthly" | "annual";

export const BILLING_CADENCES = ["monthly", "annual"] as const satisfies readonly BillingCadence[];

export const DEFAULT_BILLING_CADENCE = "annual" satisfies BillingCadence;
export const DEFAULT_CENTER_SUBSCRIPTION_STATUS = "trialing" satisfies SubscriptionStatus;
export const DEFAULT_CENTER_SUBSCRIPTION_PLAN = "trial" satisfies SubscriptionPlan;
export const ACTIVE_SUBSCRIPTION_STATUS = "active" satisfies SubscriptionStatus;
export const NO_SUBSCRIPTION_STATUS = "none" satisfies SubscriptionStatus;

export type StripePriceEnvKey =
	| "STRIPE_PRICE_HOME_MONTHLY"
	| "STRIPE_PRICE_HOME_ANNUAL"
	| "STRIPE_PRICE_CENTER_STARTER_MONTHLY"
	| "STRIPE_PRICE_CENTER_STARTER_ANNUAL"
	| "STRIPE_PRICE_CENTER_PRO_MONTHLY"
	| "STRIPE_PRICE_CENTER_PRO_ANNUAL"
	| "STRIPE_PRICE_GROUP_MONTHLY"
	| "STRIPE_PRICE_GROUP_ANNUAL";

export type PlanFeature =
	| "subsidies"
	| "quickbooks"
	| "imports"
	| "public_payment_links"
	| "multi_center"
	| "larger_center_reporting";

export type PayablePlan = Exclude<SubscriptionPlan, "trial" | "enterprise">;

export const PAYABLE_PLANS: readonly PayablePlan[] = [
	"home",
	"center_starter",
	"center_pro",
	"group",
] as const;

export interface PlanConfig {
	label: string;
	monthlyAmountCents: number;
	annualAmountCents: number;
	priceEnvKeys: Record<BillingCadence, StripePriceEnvKey> | null;
	selfServeCheckout: boolean;
	priceEnvKey: StripePriceEnvKey | null;
}

export const SUBSCRIPTION_PLAN_CONFIG: Record<SubscriptionPlan, PlanConfig> = {
	trial: {
		label: "Free trial",
		monthlyAmountCents: 0,
		annualAmountCents: 0,
		priceEnvKeys: null,
		selfServeCheckout: false,
		priceEnvKey: null,
	},
	home: {
		label: "Home",
		monthlyAmountCents: 4900,
		annualAmountCents: 46800,
		priceEnvKeys: {
			monthly: "STRIPE_PRICE_HOME_MONTHLY",
			annual: "STRIPE_PRICE_HOME_ANNUAL",
		},
		selfServeCheckout: true,
		priceEnvKey: "STRIPE_PRICE_HOME_ANNUAL",
	},
	center_starter: {
		label: "Center Starter",
		monthlyAmountCents: 15900,
		annualAmountCents: 154800,
		priceEnvKeys: {
			monthly: "STRIPE_PRICE_CENTER_STARTER_MONTHLY",
			annual: "STRIPE_PRICE_CENTER_STARTER_ANNUAL",
		},
		selfServeCheckout: true,
		priceEnvKey: "STRIPE_PRICE_CENTER_STARTER_ANNUAL",
	},
	center_pro: {
		label: "Center Pro",
		monthlyAmountCents: 23900,
		annualAmountCents: 238800,
		priceEnvKeys: {
			monthly: "STRIPE_PRICE_CENTER_PRO_MONTHLY",
			annual: "STRIPE_PRICE_CENTER_PRO_ANNUAL",
		},
		selfServeCheckout: true,
		priceEnvKey: "STRIPE_PRICE_CENTER_PRO_ANNUAL",
	},
	group: {
		label: "Group",
		monthlyAmountCents: 47900,
		annualAmountCents: 478800,
		priceEnvKeys: {
			monthly: "STRIPE_PRICE_GROUP_MONTHLY",
			annual: "STRIPE_PRICE_GROUP_ANNUAL",
		},
		selfServeCheckout: true,
		priceEnvKey: "STRIPE_PRICE_GROUP_ANNUAL",
	},
	enterprise: {
		label: "Enterprise",
		monthlyAmountCents: 0,
		annualAmountCents: 0,
		priceEnvKeys: {
			monthly: "STRIPE_PRICE_GROUP_MONTHLY",
			annual: "STRIPE_PRICE_GROUP_ANNUAL",
		},
		selfServeCheckout: false,
		priceEnvKey: null,
	},
};

export const TRIAL_DAYS = 30;
export const TRIAL_END_REMINDER_DAYS = 3;
export const MONEY_BACK_GUARANTEE_DAYS = 30;

export interface SubscriptionPromotion {
	cadence: BillingCadence;
	code: string;
	name: string;
	label: string;
	stripeTermsLabel: string;
	discountPercent: number;
	durationLabel: string;
	urgencyLabel: string;
	validThrough: string | null;
	redemptionCap: number;
}

export const SUBSCRIPTION_PROMOTIONS: readonly SubscriptionPromotion[] = [
	{
		cadence: "monthly",
		code: "M80OFF",
		name: "80% OFF - Monthly",
		label: "80% off the first year",
		stripeTermsLabel: "80% off for 12 months",
		discountPercent: 80,
		durationLabel: "12 months",
		urgencyLabel: "Limited time offer",
		validThrough: null,
		redemptionCap: 100,
	},
	{
		cadence: "annual",
		code: "Y80OFF",
		name: "80% OFF - Yearly",
		label: "80% off the first year",
		stripeTermsLabel: "80% off once",
		discountPercent: 80,
		durationLabel: "first year",
		urgencyLabel: "Limited time offer",
		validThrough: null,
		redemptionCap: 200,
	},
] as const;

export const PEBBLEDESK_PROMOTION: SubscriptionPromotion = SUBSCRIPTION_PROMOTIONS[1];

export function getSubscriptionPromotionForCadence(
	cadence: BillingCadence = DEFAULT_BILLING_CADENCE,
): SubscriptionPromotion {
	const promotion = SUBSCRIPTION_PROMOTIONS.find((candidate) => candidate.cadence === cadence);
	if (!promotion) throw new Error(`No subscription promotion configured for cadence: ${cadence}`);
	return promotion;
}

export function pickActiveSubscriptionPromotion(
	cadence: BillingCadence,
	redemptionCounts: Record<string, number>,
): SubscriptionPromotion | null {
	const promotion = getSubscriptionPromotionForCadence(cadence);
	const count = redemptionCounts[promotion.code] ?? 0;
	return count < promotion.redemptionCap ? promotion : null;
}

export interface PlanPrice {
	amountCents: number;
	monthlyEquivalentCents: number;
	cadence: BillingCadence;
}

export interface PromotionalPlanPrice {
	plan: PayablePlan;
	cadence: BillingCadence;
	discountPercent: number;
	badgeLabel: string;
	originalAmountCents: number;
	discountedAmountCents: number;
	originalMonthlyEquivalentCents: number;
	discountedMonthlyEquivalentCents: number;
	originalPriceLabel: string;
	discountedPriceLabel: string;
	renewalPriceLabel: string;
	originalAnnualTotalLabel: string | null;
	discountedAnnualTotalLabel: string | null;
}

export function getPlanPrice(
	plan: SubscriptionPlan,
	cadence: BillingCadence = DEFAULT_BILLING_CADENCE,
): PlanPrice {
	const config = SUBSCRIPTION_PLAN_CONFIG[plan];
	const amountCents = cadence === "annual" ? config.annualAmountCents : config.monthlyAmountCents;
	return {
		amountCents,
		monthlyEquivalentCents: cadence === "annual" ? Math.round(amountCents / 12) : amountCents,
		cadence,
	};
}

export function getStripePriceEnvKey(
	plan: SubscriptionPlan,
	cadence: BillingCadence = DEFAULT_BILLING_CADENCE,
): StripePriceEnvKey | null {
	const config = SUBSCRIPTION_PLAN_CONFIG[plan];
	if (!config.selfServeCheckout || !config.priceEnvKeys) return null;
	return config.priceEnvKeys[cadence];
}

export function formatCurrencyCents(amountCents: number): string {
	const amount = amountCents / 100;
	return `$${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`;
}

export function formatRoundedUpCurrencyCents(amountCents: number): string {
	return `$${Math.ceil(amountCents / 100).toFixed(0)}`;
}

export function formatPlanPrice(
	plan: SubscriptionPlan,
	cadence: BillingCadence = DEFAULT_BILLING_CADENCE,
): string {
	const price = getPlanPrice(plan, cadence);
	const monthlyLabel = `${formatCurrencyCents(price.monthlyEquivalentCents)}/mo`;
	return cadence === "annual" ? `${monthlyLabel} billed annually` : monthlyLabel;
}

export function formatAnnualTotal(plan: SubscriptionPlan): string {
	return `${formatCurrencyCents(SUBSCRIPTION_PLAN_CONFIG[plan].annualAmountCents)}/year`;
}

export function formatTrialEndReminderLabel(): string {
	return `We email you ${TRIAL_END_REMINDER_DAYS} days before the trial ends.`;
}

export function getAnnualSavingsMonths(plan: PayablePlan): number {
	const config = SUBSCRIPTION_PLAN_CONFIG[plan];
	if (config.monthlyAmountCents <= 0) return 0;
	const monthlyEquivalentMonths = config.annualAmountCents / config.monthlyAmountCents;
	return Math.max(0, Math.round(12 - monthlyEquivalentMonths));
}

export function formatAnnualSavingsLabel(plan: PayablePlan = PAYABLE_PLANS[0]): string {
	const months = getAnnualSavingsMonths(plan);
	return `${months} ${months === 1 ? "month" : "months"} free`;
}

export function getPromotionalPlanPrice(
	plan: PayablePlan,
	cadence: BillingCadence = DEFAULT_BILLING_CADENCE,
	promotion: SubscriptionPromotion = getSubscriptionPromotionForCadence(cadence),
): PromotionalPlanPrice {
	const originalPrice = getPlanPrice(plan, cadence);
	const discountedAmountCents = Math.round(
		(originalPrice.amountCents * (100 - promotion.discountPercent)) / 100,
	);
	const discountedMonthlyEquivalentCents =
		cadence === "annual" ? Math.round(discountedAmountCents / 12) : discountedAmountCents;

	return {
		plan,
		cadence,
		discountPercent: promotion.discountPercent,
		badgeLabel: promotion.label,
		originalAmountCents: originalPrice.amountCents,
		discountedAmountCents,
		originalMonthlyEquivalentCents: originalPrice.monthlyEquivalentCents,
		discountedMonthlyEquivalentCents,
		originalPriceLabel: formatPlanPrice(plan, cadence),
		discountedPriceLabel:
			cadence === "annual"
				? `${formatRoundedUpCurrencyCents(discountedMonthlyEquivalentCents)}/mo when paid yearly`
				: `${formatRoundedUpCurrencyCents(discountedAmountCents)}/mo`,
		renewalPriceLabel:
			cadence === "annual"
				? `Then ${formatCurrencyCents(originalPrice.monthlyEquivalentCents)}/mo when paid yearly (${formatAnnualTotal(plan)})`
				: `Then ${formatCurrencyCents(originalPrice.amountCents)}/mo`,
		originalAnnualTotalLabel: cadence === "annual" ? formatAnnualTotal(plan) : null,
		discountedAnnualTotalLabel:
			cadence === "annual" ? `${formatCurrencyCents(discountedAmountCents)}/year` : null,
	};
}

export function isPromotionActive(now = new Date()): boolean {
	const activePromotion = PEBBLEDESK_PROMOTION;
	if (!activePromotion.validThrough) return true;
	const validThrough = new Date(`${activePromotion.validThrough}T23:59:59.999Z`);
	return now.getTime() <= validThrough.getTime();
}

export const SERVICE_ALLOWED_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
	"trialing",
	"active",
	"past_due",
] as const;

export interface PlanEntitlement {
	maxActiveChildren: number | null;
	features: readonly PlanFeature[];
}

export const ALL_PLAN_FEATURES: readonly PlanFeature[] = [
	"subsidies",
	"imports",
	"public_payment_links",
	"quickbooks",
	"larger_center_reporting",
	"multi_center",
] as const;

export const PLAN_ENTITLEMENTS: Record<SubscriptionPlan, PlanEntitlement> = {
	trial: {
		maxActiveChildren: null,
		features: ALL_PLAN_FEATURES,
	},
	home: {
		maxActiveChildren: 15,
		features: [],
	},
	center_starter: {
		maxActiveChildren: 50,
		features: ["subsidies", "imports", "public_payment_links"],
	},
	center_pro: {
		maxActiveChildren: 100,
		features: [
			"subsidies",
			"imports",
			"public_payment_links",
			"quickbooks",
			"larger_center_reporting",
		],
	},
	group: {
		maxActiveChildren: null,
		features: [
			"subsidies",
			"imports",
			"public_payment_links",
			"quickbooks",
			"larger_center_reporting",
			"multi_center",
		],
	},
	enterprise: {
		maxActiveChildren: null,
		features: [
			"subsidies",
			"imports",
			"public_payment_links",
			"quickbooks",
			"larger_center_reporting",
			"multi_center",
		],
	},
};

export function formatPlanCapacityClaim(plan: SubscriptionPlan): string {
	const maxActiveChildren = PLAN_ENTITLEMENTS[plan].maxActiveChildren;
	if (maxActiveChildren) {
		return `up to ${maxActiveChildren} active children`;
	}
	if (plan === "group") {
		return "multi-site operators";
	}
	if (plan === "enterprise") {
		return "complex multi-site operators";
	}
	return "trial users";
}

export function formatPlanFitSummary(plan: SubscriptionPlan): string {
	const label = SUBSCRIPTION_PLAN_CONFIG[plan].label;
	return `${label} fits programs with ${formatPlanCapacityClaim(plan)}.`;
}

export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
	subsidies: "Subsidy billing",
	quickbooks: "QuickBooks sync",
	imports: "Data imports",
	public_payment_links: "Public payment links",
	multi_center: "Multi-center management",
	larger_center_reporting: "Larger center reporting",
};

export const FEATURE_MIN_PLAN: Record<PlanFeature, PayablePlan> = {
	subsidies: "center_starter",
	quickbooks: "center_pro",
	imports: "center_starter",
	public_payment_links: "center_starter",
	multi_center: "group",
	larger_center_reporting: "center_pro",
};

export function minPlanCovering(usedFeatures: readonly PlanFeature[]): PayablePlan {
	for (const plan of PAYABLE_PLANS) {
		const { features } = PLAN_ENTITLEMENTS[plan];
		if (usedFeatures.every((f) => features.includes(f))) {
			return plan;
		}
	}
	return "group";
}

export function planHasFeature(plan: SubscriptionPlan, feature: PlanFeature): boolean {
	return PLAN_ENTITLEMENTS[plan].features.includes(feature);
}

export function isServiceAllowedSubscriptionStatus(status: SubscriptionStatus): boolean {
	return SERVICE_ALLOWED_SUBSCRIPTION_STATUSES.includes(status);
}
