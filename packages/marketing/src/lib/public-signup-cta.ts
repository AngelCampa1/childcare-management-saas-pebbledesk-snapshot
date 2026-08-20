import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";

const PRODUCT_APP_FALLBACK = PUBLIC_BRAND_KNOWLEDGE.appOrigin;
export const PUBLIC_SIGNUP_PATH = "/signup";
export const DEFAULT_PUBLIC_SIGNUP_CTA_TEXT = "Create account";
export const DEFAULT_PUBLIC_SIGNUP_MESSAGE =
	"Create your account in PebbleDesk and continue setup in the product app.";
const DISALLOWED_PUBLIC_CTA_TEXT_PATTERN =
	/\b(waitlist|launch access|questionnaire|survey|follow-?up|request trial|book walkthrough|talk to us)\b/i;
const DISALLOWED_PUBLIC_MESSAGE_PATTERN =
	/\b(waitlist|launch access|questionnaire|survey|follow-?up|book walkthrough)\b/i;

interface ResolvePublicSignupCtaOptions {
	sourcePage: string;
	explicitTarget?: string;
	explicitText?: string;
	attribution?: {
		utmSource?: string;
		utmMedium?: string;
		utmCampaign?: string;
		utmTerm?: string;
		utmContent?: string;
		referredBy?: string;
		billingCadence?: "monthly" | "annual";
	};
}

export interface PublicSignupCta {
	text: string;
	target: string;
}

export function getProductSignupUrl(): string {
	const raw = import.meta.env.PUBLIC_APP_URL as string | undefined;
	const trimmed = raw?.trim();
	const base =
		trimmed && (trimmed.startsWith("https://") || trimmed.startsWith("http://"))
			? trimmed
			: PRODUCT_APP_FALLBACK;
	return `${base.replace(/\/$/, "")}/signup`;
}

export function getProductLoginUrl(): string {
	const raw = import.meta.env.PUBLIC_APP_URL as string | undefined;
	const trimmed = raw?.trim();
	const base =
		trimmed && (trimmed.startsWith("https://") || trimmed.startsWith("http://"))
			? trimmed
			: PRODUCT_APP_FALLBACK;
	return `${base.replace(/\/$/, "")}/login`;
}

export const PRODUCT_SIGNUP_URL = `${PRODUCT_APP_FALLBACK}/signup`;

export function isDirectSignupTarget(target: string): boolean {
	return target.startsWith(getProductSignupUrl()) || target.startsWith(PUBLIC_SIGNUP_PATH);
}

export function sanitizePublicSignupCtaText(text?: string): string {
	if (!text) {
		return DEFAULT_PUBLIC_SIGNUP_CTA_TEXT;
	}

	return DISALLOWED_PUBLIC_CTA_TEXT_PATTERN.test(text) ? DEFAULT_PUBLIC_SIGNUP_CTA_TEXT : text;
}

export function sanitizePublicSignupMessage(
	text: string | undefined,
	fallback = DEFAULT_PUBLIC_SIGNUP_MESSAGE,
): string | undefined {
	if (!text) {
		return text;
	}

	return DISALLOWED_PUBLIC_MESSAGE_PATTERN.test(text) ? fallback : text;
}

export function resolvePublicSignupCta({
	sourcePage,
	explicitTarget,
	explicitText,
	attribution,
}: ResolvePublicSignupCtaOptions): PublicSignupCta {
	const params = new URLSearchParams();
	const inferredPlan = inferPlan(explicitTarget);
	const inferredBillingCadence = inferBillingCadence(explicitTarget) ?? attribution?.billingCadence;

	if (inferredPlan) {
		params.set("plan", inferredPlan);
	}
	if (inferredBillingCadence) {
		params.set("billing", inferredBillingCadence);
	}

	params.set("source", sourcePage);
	if (attribution?.utmSource) {
		params.set("utm_source", attribution.utmSource);
	}
	if (attribution?.utmMedium) {
		params.set("utm_medium", attribution.utmMedium);
	}
	if (attribution?.utmCampaign) {
		params.set("utm_campaign", attribution.utmCampaign);
	}
	if (attribution?.utmTerm) {
		params.set("utm_term", attribution.utmTerm);
	}
	if (attribution?.utmContent) {
		params.set("utm_content", attribution.utmContent);
	}
	if (attribution?.referredBy) {
		params.set("ref", attribution.referredBy);
	}

	return {
		text: sanitizePublicSignupCtaText(explicitText),
		target: `${getProductSignupUrl()}?${params.toString()}`,
	};
}

function normalizeBillingCadence(
	value: string | null | undefined,
): "monthly" | "annual" | undefined {
	return value === "monthly" || value === "annual" ? value : undefined;
}

function inferBillingCadence(target?: string): "monthly" | "annual" | undefined {
	if (!target) {
		return undefined;
	}

	try {
		const parsed = target.startsWith("http")
			? new URL(target)
			: new URL(target, PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
		return normalizeBillingCadence(parsed.searchParams.get("billing"));
	} catch {
		return undefined;
	}
}

function normalizePlanValue(plan?: string): string | undefined {
	if (!plan) {
		return undefined;
	}

	const normalized = plan
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

	switch (normalized) {
		case "home":
			return "home";
		case "center":
		case "starter":
		case "center_starter":
			return "center_starter";
		case "pro":
		case "center_pro":
			return "center_pro";
		case "group":
			return "group";
		default:
			return undefined;
	}
}

function inferPlan(target?: string): string | undefined {
	if (!target) {
		return undefined;
	}

	try {
		const parsed = target.startsWith("http")
			? new URL(target)
			: new URL(target, PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
		const searchPlan = parsed.searchParams.get("plan");
		if (searchPlan) {
			const normalizedSearchPlan = normalizePlanValue(searchPlan);
			if (normalizedSearchPlan) {
				return normalizedSearchPlan;
			}
		}
	} catch {
		// Fall through to keyword matching.
	}

	const normalizedTarget = target.toLowerCase();

	if (normalizedTarget.includes("home")) {
		return "home";
	}

	if (normalizedTarget.includes("center_pro") || normalizedTarget.includes("center-pro")) {
		return "center_pro";
	}

	if (
		normalizedTarget.includes("center_starter") ||
		normalizedTarget.includes("center-starter") ||
		normalizedTarget.includes("starter")
	) {
		return "center_starter";
	}

	if (normalizedTarget.includes("group")) {
		return "group";
	}

	return undefined;
}
