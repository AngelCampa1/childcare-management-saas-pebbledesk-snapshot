import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const SAFE_PROPERTY_KEYS = new Set([
	"age_group",
	"billing",
	"billing_cycle",
	"billing_period",
	"buyer_stage",
	"cadence",
	"checkout_result",
	"download_available",
	"email_provided",
	"emailed",
	"field_count",
	"form_type",
	"had_value",
	"has_referral",
	"href",
	"intent",
	"labor_rate",
	"milestone_seconds",
	"method",
	"magnet_slug",
	"page_family",
	"page_path",
	"parts_markup",
	"placement",
	"plan",
	"qualification_segment",
	"question_count",
	"question_index",
	"reason",
	"role",
	"section",
	"source",
	"source_page",
	"stage",
	"status_code",
	"target",
	"team_size",
	"threshold",
	"time_to_view_ms",
	"trade",
	"trigger",
	"utm_campaign",
	"utm_content",
	"utm_medium",
	"utm_source",
	"utm_term",
]);
const BOOLEAN_PROPERTY_KEYS = new Set([
	"download_available",
	"email_provided",
	"emailed",
	"had_value",
	"has_referral",
]);
const NUMBER_PROPERTY_KEYS = new Set([
	"field_count",
	"labor_rate",
	"milestone_seconds",
	"parts_markup",
	"question_count",
	"question_index",
	"team_size",
	"threshold",
	"time_to_view_ms",
	"status_code",
]);

export interface PostHogConfig {
	apiKey: string;
	apiHost: string;
}

export interface PostHogInstance {
	capture(event: string, properties?: Record<string, unknown>): void;
	identify(distinctId: string, properties?: Record<string, unknown>): void;
	register?(properties: Record<string, unknown>): void;
	group?(groupType: string, groupKey: string, properties?: Record<string, unknown>): void;
	reset?(): void;
}

declare global {
	interface Window {
		posthog?: PostHogInstance;
	}
}

export function resolvePostHogConfig(): PostHogConfig | null {
	const env = import.meta.env as Record<string, unknown>;
	const apiKey = typeof env.PUBLIC_POSTHOG_KEY === "string" ? env.PUBLIC_POSTHOG_KEY.trim() : "";
	if (!apiKey) return null;

	const apiHost =
		typeof env.PUBLIC_POSTHOG_HOST === "string" && env.PUBLIC_POSTHOG_HOST.trim()
			? env.PUBLIC_POSTHOG_HOST.trim()
			: DEFAULT_POSTHOG_HOST;

	return { apiKey, apiHost };
}

function isSafeString(value: string): boolean {
	return value.length <= 200 && !value.includes("@") && !/[\r\n]/.test(value);
}

function sanitizeValue(value: unknown): unknown {
	if (Array.isArray(value)) return undefined;

	if (value && typeof value === "object") {
		return sanitizeAnalyticsProperties(value as Record<string, unknown>);
	}

	if (typeof value === "string") {
		return isSafeString(value) ? value : undefined;
	}
	return value;
}

function sanitizeHref(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	try {
		const parsed = new URL(value, PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
		return parsed.pathname.startsWith("/") ? parsed.pathname : undefined;
	} catch {
		return undefined;
	}
}

function isSafeToken(value: string): boolean {
	return /^[a-z0-9][a-z0-9_:-]{0,63}$/.test(value);
}

function sanitizePropertyValue(key: string, value: unknown): unknown {
	if (key === "href") return sanitizeHref(value);
	if (key === "page_path" || key === "source_page") return sanitizeHref(value);
	if (BOOLEAN_PROPERTY_KEYS.has(key)) return typeof value === "boolean" ? value : undefined;
	if (NUMBER_PROPERTY_KEYS.has(key)) {
		return typeof value === "number" && Number.isFinite(value) ? value : undefined;
	}
	if (typeof value === "string") {
		return isSafeToken(value) ? value : undefined;
	}
	return sanitizeValue(value);
}

export function sanitizeAnalyticsProperties(
	properties: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!properties) return undefined;

	const safe: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (!SAFE_PROPERTY_KEYS.has(key)) continue;
		const sanitized = sanitizePropertyValue(key, value);
		if (sanitized !== undefined) safe[key] = sanitized;
	}

	return safe;
}

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
	try {
		window.posthog?.capture(event, sanitizeAnalyticsProperties(properties));
	} catch {
		// PostHog is best-effort; browser analytics failures should never break the page.
	}
}

export function identifyUser(distinctId: string, properties?: Record<string, unknown>): void {
	try {
		window.posthog?.identify(distinctId, sanitizeAnalyticsProperties(properties));
	} catch {
		// PostHog is best-effort; browser analytics failures should never break the page.
	}
}

export function buildPostHogBootstrapScript(
	siteName: string,
	config: PostHogConfig | null = resolvePostHogConfig(),
): string {
	if (!config) return "";

	return `/* PostHog CDN snippet - loads array.js asynchronously */
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub people)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
try {
  posthog.init(${JSON.stringify(config.apiKey)}, {
    api_host: ${JSON.stringify(config.apiHost)},
    autocapture: { css_selector_allowlist: ["[data-cta-button]", "[data-analytics]"] },
    capture_pageview: true,
    capture_pageleave: true,
    person_profiles: "identified_only",
    session_recording: { maskAllInputs: true, maskInputOptions: { password: true } },
    mask_all_text: true
  });
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}
try {
  posthog.register({ site: ${JSON.stringify(siteName)} });
} catch {
  // PostHog is best-effort; bootstrap failures should never break the page.
}`;
}
