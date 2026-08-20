import { SUBSCRIPTION_PLAN_CONFIG } from "@pebbledesk/shared/constants";

const VALID_PLANS = new Set(["home", "center_starter", "center_pro", "group"] as const);
const PROMO_PATTERN = /^[A-Za-z0-9_-]+$/;
const PROMO_MAX_LENGTH = 64;

export interface MarketingAttribution {
	plan?: "home" | "center_starter" | "center_pro" | "group";
	billing?: "monthly" | "annual";
	source?: string;
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
	ref?: string;
	promo?: string;
}

export function normalizeMarketingAttribution(
	input: Record<string, unknown>,
): MarketingAttribution {
	const attribution: MarketingAttribution = {};

	const plan = normalizePlan(readString(input.plan));
	if (plan && VALID_PLANS.has(plan as typeof VALID_PLANS extends Set<infer T> ? T : never)) {
		attribution.plan = plan as MarketingAttribution["plan"];
	}

	const billing = readString(input.billing);
	if (billing === "monthly" || billing === "annual") {
		attribution.billing = billing;
	}

	for (const key of [
		"source",
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
		"ref",
	] as const) {
		const value = readString(input[key]);
		if (value) {
			attribution[key] = value;
		}
	}

	const promo = readString(input.promo);
	if (promo && promo.length <= PROMO_MAX_LENGTH && PROMO_PATTERN.test(promo)) {
		attribution.promo = promo;
	}

	return attribution;
}

export function buildMarketingSearch(attribution: MarketingAttribution): Record<string, string> {
	return Object.fromEntries(
		Object.entries(attribution).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
}

export function getSelectedPlanLabel(plan: MarketingAttribution["plan"]): string | null {
	if (!plan) return null;
	return SUBSCRIPTION_PLAN_CONFIG[plan].label;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizePlan(plan: string | undefined): string | undefined {
	if (plan === "center") {
		return "center_starter";
	}

	return plan;
}
