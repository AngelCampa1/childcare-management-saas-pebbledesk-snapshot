import {
	type BillingCadence,
	DEFAULT_BILLING_CADENCE,
	formatAnnualTotal,
	formatPlanCapacityClaim,
	formatTrialEndReminderLabel,
	getPromotionalPlanPrice,
	MONEY_BACK_GUARANTEE_DAYS,
	type PayablePlan,
	PEBBLEDESK_PROMOTION,
	SUBSCRIPTION_PLAN_CONFIG,
	SUBSCRIPTION_PROMOTIONS,
	type SubscriptionPromotion,
	TRIAL_DAYS,
} from "./billing.js";

// ─── Comparison matrix ───────────────────────────────────────────────────────

export type ComparisonCapabilityId =
	| "self_serve_trial"
	| "attendance_records_ratios"
	| "billing_invoices"
	| "subsidy_audit"
	| "csv_import"
	| "quickbooks"
	| "multi_location";

export type ComparisonCellValue = string;

export interface ComparisonCapability {
	id: ComparisonCapabilityId;
	label: string;
}

export const COMPARISON_CAPABILITIES: readonly ComparisonCapability[] = [
	{ id: "self_serve_trial", label: "Self-serve trial" },
	{ id: "attendance_records_ratios", label: "Attendance, records, and ratio workflows" },
	{ id: "billing_invoices", label: "Billing, invoices, and payment status tracking" },
	{ id: "subsidy_audit", label: "Subsidy workflows and audit reporting" },
	{ id: "csv_import", label: "CSV import and migration presets" },
	{ id: "quickbooks", label: "QuickBooks support" },
	{ id: "multi_location", label: "Multi-location oversight" },
] as const;

// ─── Per-plan offering ───────────────────────────────────────────────────────

export interface TrustSignal {
	text: string;
	category: "roi" | "feature" | "compliance" | "integration";
}

export type OfferingPlanId = PayablePlan | "enterprise";

export interface PlanOffering {
	id: OfferingPlanId;
	label: string;
	tagline: string;
	marketingFeatures: readonly string[];
	comparisonCells: Record<ComparisonCapabilityId, ComparisonCellValue>;
	ctaText: string;
	highlighted?: true;
	selfServe: boolean;
}

const trialCtaText = `Start ${TRIAL_DAYS}-day free trial`;

const PLAN_OFFERINGS: readonly PlanOffering[] = [
	{
		id: "home",
		label: SUBSCRIPTION_PLAN_CONFIG.home.label,
		tagline: `In-home programs with ${formatPlanCapacityClaim("home")} at 1 location`,
		marketingFeatures: [
			"Attendance, classrooms, and family records",
			"Ratio visibility and attendance history",
			"Invoices, payment status tracking, and reports",
			"Outbound messages and daily announcements",
			"Online-only workflow with exportable records",
		],
		comparisonCells: {
			self_serve_trial: "Included",
			attendance_records_ratios: "Included",
			billing_invoices: "Included",
			subsidy_audit: "Available on qualifying plans",
			csv_import: "Available on qualifying plans",
			quickbooks: "Available on qualifying plans",
			multi_location: "Not included",
		},
		ctaText: trialCtaText,
		selfServe: SUBSCRIPTION_PLAN_CONFIG.home.selfServeCheckout,
	},
	{
		id: "center_starter",
		label: SUBSCRIPTION_PLAN_CONFIG.center_starter.label,
		tagline: "Licensed single-site centers",
		marketingFeatures: [
			"Daily operations, family records, and billing",
			"Subsidy workflows, audit exports, and reports",
			"Staff scheduling and room coverage planning",
			"CSV import plus Brightwheel and Procare presets",
			"Public payment links for guardians",
		],
		comparisonCells: {
			self_serve_trial: "Included",
			attendance_records_ratios: "Included",
			billing_invoices: "Included",
			subsidy_audit: "Included",
			csv_import: "Included",
			quickbooks: "Available on qualifying plans",
			multi_location: "Not included",
		},
		ctaText: trialCtaText,
		highlighted: true,
		selfServe: SUBSCRIPTION_PLAN_CONFIG.center_starter.selfServeCheckout,
	},
	{
		id: "center_pro",
		label: SUBSCRIPTION_PLAN_CONFIG.center_pro.label,
		tagline: "Larger single-site centers that need more operational headroom",
		marketingFeatures: [
			"Everything in Center Starter",
			"More reporting depth for larger centers",
			"Expanded scheduling and finance operations",
			"Good fit before a multi-site rollout",
		],
		comparisonCells: {
			self_serve_trial: "Included",
			attendance_records_ratios: "Included",
			billing_invoices: "Included",
			subsidy_audit: "Included",
			csv_import: "Included",
			quickbooks: "Available on qualifying plans",
			multi_location: "Available on qualifying plans",
		},
		ctaText: trialCtaText,
		selfServe: SUBSCRIPTION_PLAN_CONFIG.center_pro.selfServeCheckout,
	},
	{
		id: "group",
		label: SUBSCRIPTION_PLAN_CONFIG.group.label,
		tagline: "Multi-site operators with rollout support",
		marketingFeatures: [
			"Cross-center oversight and standardized reporting",
			"Migration planning and rollout sequencing",
			"Sales-led plan fit and implementation support",
			"Multi-location workflows on qualifying plans",
		],
		comparisonCells: {
			self_serve_trial: "Included",
			attendance_records_ratios: "Included",
			billing_invoices: "Included",
			subsidy_audit: "Included",
			csv_import: "Included",
			quickbooks: "Rollout-supported",
			multi_location: "Included on qualifying plans",
		},
		ctaText: trialCtaText,
		selfServe: SUBSCRIPTION_PLAN_CONFIG.group.selfServeCheckout,
	},
	{
		id: "enterprise",
		label: SUBSCRIPTION_PLAN_CONFIG.enterprise.label,
		tagline: "10+ sites or complex requirements",
		marketingFeatures: [
			"Custom rollout design and implementation support",
			"Cross-center oversight for complex organizations",
			"Custom integrations and enterprise requirements",
			"SLA support",
		],
		comparisonCells: {
			self_serve_trial: "Sales-led / rollout-supported",
			attendance_records_ratios: "Included",
			billing_invoices: "Included",
			subsidy_audit: "Included",
			csv_import: "Included",
			quickbooks: "Rollout-supported",
			multi_location: "Included",
		},
		ctaText: "Contact sales",
		selfServe: SUBSCRIPTION_PLAN_CONFIG.enterprise.selfServeCheckout,
	},
] as const;

// ─── Positioning ─────────────────────────────────────────────────────────────

export interface OfferingPositioning {
	tagline: string;
	productCategory: string;
	targetAudience: string;
	hero: { headline: string; subheadline: string };
	heroBenefits: readonly string[];
	heroTrustSignal: string;
	problemAgitation: {
		heading: string;
		closingLine: string;
		painPoints: readonly string[];
	};
	trustSignals: readonly TrustSignal[];
}

const homePromoPrice = getPromotionalPlanPrice("home");
const starterPromoPrice = getPromotionalPlanPrice("center_starter");
const guaranteeLabel = `${MONEY_BACK_GUARANTEE_DAYS}-day money-back guarantee`;
const trialLabel = `${TRIAL_DAYS}-day free trial`;
const trialReminderLabel = formatTrialEndReminderLabel();
const onlineOnlyV1Claim =
	"PebbleDesk is online-only in V1. Centers should keep a temporary outage fallback.";
const stateSupportClaim =
	"PebbleDesk supports generic attendance, records, billing, messaging, and ratio workflows nationally, with verified state-specific ratio and licensing-report support today for Texas, California, and Florida.";
const migrationSupportClaim =
	"PebbleDesk supports CSV import plus Brightwheel and Procare migration presets.";
const quickBooksSupportClaim = "QuickBooks support is available on qualifying setups.";

export function formatTrialDisclosure(options: { startPrefix?: boolean } = {}): string {
	const prefix = options.startPrefix ? `Start your ${trialLabel}` : trialLabel;
	return `${prefix}. No credit card required. ${trialReminderLabel}`;
}

const POSITIONING: OfferingPositioning = {
	tagline: "Audit-ready records without the end-of-week scramble.",
	productCategory: "Childcare Center Administration Software",
	targetAudience:
		"licensed childcare centers, family childcare homes, and multi-site childcare operators that need attendance, ratio, subsidy, billing, and audit records to stay together",
	hero: {
		headline: "Audit-ready childcare records in one place.",
		subheadline:
			"PebbleDesk keeps attendance, ratios, subsidy billing, family records, and reports connected so directors are not rebuilding the story before licensing visits or payment reviews.",
	},
	heroBenefits: [
		"Built for licensed centers, family childcare homes, and multi-site operators",
		"Attendance, ratios, subsidy billing, and reports in one place",
		"Import-ready for Brightwheel, Procare, and CSV cleanup",
		"Self-serve for single sites, rollout-supported for larger groups",
	],
	heroTrustSignal:
		"Industry estimates put revenue lost to subsidy billing errors above 8% without automation.",
	problemAgitation: {
		heading: "Childcare records fall apart when the daily work is split across too many places.",
		closingLine:
			"PebbleDesk keeps the daily record connected so audit prep starts during the day, not the week before a visit.",
		painPoints: [
			"Attendance logs, classroom moves, and billing notes drift apart when each one lives in a different tool.",
			"Ratio gaps can happen in the middle of a normal morning, before anyone has time to rebuild a spreadsheet.",
			"Subsidy claims become harder to defend when the attendance record and reimbursement record do not match.",
			"Licensing visits get stressful when guardian records, staff coverage, invoices, and reports have to be pulled together after the fact.",
		],
	},
	trustSignals: [
		{ text: `Plans from ${homePromoPrice.discountedPriceLabel}`, category: "roi" },
		{
			text: "Attendance, ratios, billing, records, and reports in one workflow",
			category: "feature",
		},
		{
			text: "Built around audit readiness, ratio coverage, and subsidy paperwork",
			category: "compliance",
		},
		{
			text: "CSV import plus Brightwheel and Procare migration presets",
			category: "integration",
		},
		{
			text: "Public guardian payment links and QuickBooks support on qualifying setups",
			category: "integration",
		},
		{
			text: `No setup fee, ${guaranteeLabel}, and no surprise per-child add-on for center plans`,
			category: "roi",
		},
	],
};

// ─── Offer claims ─────────────────────────────────────────────────────────────

export const OFFERING_CLAIMS = {
	trialDays: TRIAL_DAYS,
	trialLabel,
	trialReminderLabel,
	trialDisclosure: formatTrialDisclosure(),
	trialStartDisclosure: formatTrialDisclosure({ startPrefix: true }),
	onlineOnlyV1: onlineOnlyV1Claim,
	stateSupport: stateSupportClaim,
	migrationSupport: migrationSupportClaim,
	quickBooksSupport: quickBooksSupportClaim,
	noCreditCardRequired: "No credit card required for self-serve trial signup.",
	noSetupFees: "No setup fees on any plan.",
	noContracts: "No long-term contracts for self-serve plans.",
	moneyBackGuaranteeDays: MONEY_BACK_GUARANTEE_DAYS,
	moneyBackGuaranteeLabel: guaranteeLabel,
	promotionCode: PEBBLEDESK_PROMOTION.code,
	promotionLabel: PEBBLEDESK_PROMOTION.label,
} as const;

// ─── CTA defaults ─────────────────────────────────────────────────────────────

export const OFFERING_CTA_DEFAULTS = {
	tofu: {
		ctaMode: "educate" as const,
		ctaText: "See How It Works",
		ctaTarget: "/resources/",
	},
	mofu: {
		ctaMode: "evaluate" as const,
		ctaText: "Compare Plans",
		ctaTarget: "/compare/",
	},
} as const;

// ─── Pricing FAQ ──────────────────────────────────────────────────────────────

export function formatPricingFaqAnswer(promotion?: SubscriptionPromotion): string {
	const promo = promotion ?? PEBBLEDESK_PROMOTION;
	const cadence = promo.cadence;
	const homePromo = getPromotionalPlanPrice("home", cadence, promo);
	const starterPromo = getPromotionalPlanPrice("center_starter", cadence, promo);
	const proPromo = getPromotionalPlanPrice("center_pro", cadence, promo);
	const groupPromo = getPromotionalPlanPrice("group", cadence, promo);
	const totals =
		cadence === "annual"
			? ` Home is ${homePromo.discountedPriceLabel} (${homePromo.discountedAnnualTotalLabel}), then ${homePromo.renewalPriceLabel.replace(/^Then /, "")}. Center Starter is ${starterPromo.discountedPriceLabel} (${starterPromo.discountedAnnualTotalLabel}), then ${starterPromo.renewalPriceLabel.replace(/^Then /, "")}. Center Pro is ${proPromo.discountedPriceLabel} (${proPromo.discountedAnnualTotalLabel}), then ${proPromo.renewalPriceLabel.replace(/^Then /, "")}. Group is ${groupPromo.discountedPriceLabel} (${groupPromo.discountedAnnualTotalLabel}), then ${groupPromo.renewalPriceLabel.replace(/^Then /, "")}.`
			: ` Home is ${homePromo.discountedPriceLabel}, then ${homePromo.renewalPriceLabel.replace(/^Then /, "")}. Center Starter is ${starterPromo.discountedPriceLabel}, then ${starterPromo.renewalPriceLabel.replace(/^Then /, "")}. Center Pro is ${proPromo.discountedPriceLabel}, then ${proPromo.renewalPriceLabel.replace(/^Then /, "")}. Group is ${groupPromo.discountedPriceLabel}, then ${groupPromo.renewalPriceLabel.replace(/^Then /, "")}.`;
	return `PebbleDesk has flat plan prices. Annual billing is the default. ${promo.code} gives ${promo.label} on eligible subscriptions.${totals} Larger multi-site rollouts are scoped with sales first. Monthly billing is also available.`;
}

// ─── Promotional price helpers ────────────────────────────────────────────────

export function formatLimitedOfferTerms(): string {
	const promotionCodes = SUBSCRIPTION_PROMOTIONS.map((promotion) => promotion.code).join(" or ");
	const promotionTerms = SUBSCRIPTION_PROMOTIONS.map((promotion) => {
		const cadenceLabel = promotion.cadence === "annual" ? "yearly" : promotion.cadence;
		return `${promotion.code} gives ${promotion.stripeTermsLabel}. It is for ${cadenceLabel} billing.`;
	}).join(" ");
	const renewalTerms = (["home", "center_starter", "center_pro", "group"] as const)
		.map((plan) => {
			const price = getPromotionalPlanPrice(plan, "annual");
			return `${SUBSCRIPTION_PLAN_CONFIG[plan].label} renews at ${price.renewalPriceLabel.replace(/^Then /, "")}.`;
		})
		.join(" ");

	return `Use ${promotionCodes}. ${promotionTerms} The offer is for subscriptions only. After year one, ${renewalTerms} Discounted display prices are rounded up to the next whole dollar.`;
}

export interface PromotionalPriceDisplay {
	monthly: {
		badgeLabel: string;
		originalPriceLabel: string;
		discountedPriceLabel: string;
		renewalPriceLabel: string;
	};
	annual: {
		badgeLabel: string;
		originalPriceLabel: string;
		discountedPriceLabel: string;
		renewalPriceLabel: string;
		originalAnnualTotalLabel: string;
		discountedAnnualTotalLabel: string;
	};
}

export function getPromotionalPriceDisplay(
	plan: PayablePlan,
	promotion?: SubscriptionPromotion,
): PromotionalPriceDisplay {
	const monthly = getPromotionalPlanPrice(plan, "monthly", promotion);
	const annual = getPromotionalPlanPrice(plan, "annual", promotion);
	return {
		monthly: {
			badgeLabel: monthly.badgeLabel,
			originalPriceLabel: monthly.originalPriceLabel,
			discountedPriceLabel: monthly.discountedPriceLabel,
			renewalPriceLabel: monthly.renewalPriceLabel,
		},
		annual: {
			badgeLabel: annual.badgeLabel,
			originalPriceLabel: annual.originalPriceLabel,
			discountedPriceLabel: annual.discountedPriceLabel,
			renewalPriceLabel: annual.renewalPriceLabel,
			originalAnnualTotalLabel: annual.originalAnnualTotalLabel ?? formatAnnualTotal(plan),
			discountedAnnualTotalLabel: annual.discountedAnnualTotalLabel ?? formatAnnualTotal(plan),
		},
	};
}

export function getPromotionalPriceLabel(
	plan: PayablePlan,
	cadence: BillingCadence = DEFAULT_BILLING_CADENCE,
	promotion?: SubscriptionPromotion,
): string {
	return getPromotionalPlanPrice(plan, cadence, promotion).discountedPriceLabel;
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getPlanOffering(id: OfferingPlanId): PlanOffering {
	const plan = PLAN_OFFERINGS.find((p) => p.id === id);
	if (!plan) throw new Error(`No offering found for plan id: ${id}`);
	return plan;
}

// ─── Pricing tier shape (used by marketing components) ────────────────────────

export interface PricingTier {
	slug: PayablePlan;
	name: string;
	price: string;
	monthlyPriceCents: number | undefined;
	annualPriceOverride: string | undefined;
	promotionalPrice: PromotionalPriceDisplay | undefined;
	description: string;
	ctaText: string;
	highlighted?: true;
	features: readonly string[];
}

export interface EnterprisePricingNote {
	label: string;
	price: string;
	summary: string;
	ctaText: string;
}

export function buildPricingTiers(
	trialDays = TRIAL_DAYS,
	promotion?: SubscriptionPromotion,
): readonly PricingTier[] {
	return PLAN_OFFERINGS.filter((plan): plan is PlanOffering & { id: PayablePlan } => {
		return plan.id !== "enterprise";
	}).map((plan) => {
		const promotionalPrice = getPromotionalPriceDisplay(plan.id, promotion);
		return {
			slug: plan.id,
			name: plan.label,
			price: promotionalPrice.annual.discountedPriceLabel,
			monthlyPriceCents: SUBSCRIPTION_PLAN_CONFIG[plan.id].monthlyAmountCents,
			annualPriceOverride: formatAnnualTotal(plan.id),
			promotionalPrice,
			description: plan.tagline,
			ctaText: `Start ${trialDays}-day free trial`,
			...(plan.highlighted ? { highlighted: true as const } : {}),
			features: plan.marketingFeatures,
		};
	});
}

export function buildEnterprisePricingNote(): EnterprisePricingNote {
	const enterprise = getPlanOffering("enterprise");
	return {
		label: enterprise.label,
		price: "Custom",
		summary: "For 10+ sites or custom setup. Talk with sales first, so we can map the right plan.",
		ctaText: enterprise.ctaText,
	};
}

// ─── Comparison row shape (used by pricing.astro) ────────────────────────────

export interface ComparisonRow {
	feature: string;
	home: string;
	centerStarter: string;
	centerPro: string;
	group: string;
}

export function buildComparisonRows(): readonly ComparisonRow[] {
	const cell = (id: OfferingPlanId, capId: ComparisonCapabilityId): string =>
		PLAN_OFFERINGS.find((p) => p.id === id)?.comparisonCells[capId] ?? "—";
	return COMPARISON_CAPABILITIES.map((capability) => ({
		feature: capability.label,
		home: cell("home", capability.id),
		centerStarter: cell("center_starter", capability.id),
		centerPro: cell("center_pro", capability.id),
		group: cell("group", capability.id),
	}));
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const PEBBLEDESK_OFFERING = {
	positioning: POSITIONING,
	plans: PLAN_OFFERINGS,
	comparisonCapabilities: COMPARISON_CAPABILITIES,
	promotion: PEBBLEDESK_PROMOTION,
	trial: { days: TRIAL_DAYS, label: trialLabel },
	guarantee: { days: MONEY_BACK_GUARANTEE_DAYS, label: guaranteeLabel },
	claims: OFFERING_CLAIMS,
	ctaDefaults: OFFERING_CTA_DEFAULTS,
} as const;

// Backwards-compat re-export so existing consumers of offers.ts keep working
export const PUBLIC_OFFER_CLAIMS = OFFERING_CLAIMS;

// Readable alias used in marketing-surfaces / AI knowledge
export { homePromoPrice as HOME_PROMO_PRICE, starterPromoPrice as STARTER_PROMO_PRICE };
