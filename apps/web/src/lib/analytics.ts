import {
	ANALYTICS_EVENTS,
	type Role,
	type SubscriptionPlan,
	type SubscriptionStatus,
} from "@pebbledesk/shared";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const ANONYMOUS_ID_KEY = "pebbledesk:analytics:anonymous-id";
const SAFE_PROPERTY_KEYS = new Set([
	"age_group",
	"action",
	"billing",
	"cadence",
	"center_count",
	"checkout_result",
	"classroom_count",
	"count",
	"count_bucket",
	"dedupe_strategy",
	"email_domain",
	"email_verified",
	"entity_type",
	"error_code",
	"error_count",
	"feature_name",
	"field_count",
	"flow",
	"format",
	"has_account_id",
	"has_classroom_target",
	"has_filters",
	"import_type",
	"inserted_count",
	"issue_type",
	"line_item_count",
	"message_type",
	"method",
	"path",
	"plan",
	"promo_present",
	"ref",
	"reason",
	"recipient_count",
	"recipient_mode",
	"reconciliation_count",
	"report_type",
	"result",
	"role",
	"route_area",
	"row_count_bucket",
	"scanned_count",
	"search_present",
	"self_serve",
	"source",
	"stage",
	"step",
	"state",
	"subject_type",
	"subscription_status",
	"surface",
	"sync_action",
	"sync_log_count",
	"target",
	"timezone",
	"utm_campaign",
	"utm_content",
	"utm_medium",
	"utm_source",
	"utm_term",
	"skipped_count",
	"updated_count",
	"validation_status",
]);
const BOOLEAN_PROPERTY_KEYS = new Set([
	"email_verified",
	"has_account_id",
	"has_classroom_target",
	"has_filters",
	"promo_present",
	"search_present",
	"self_serve",
]);
const NUMBER_PROPERTY_KEYS = new Set([
	"center_count",
	"classroom_count",
	"count",
	"error_count",
	"field_count",
	"inserted_count",
	"line_item_count",
	"recipient_count",
	"reconciliation_count",
	"scanned_count",
	"skipped_count",
	"sync_log_count",
	"updated_count",
]);
const ROUTE_AREA_VALUES = new Set(["account", "conversion", "other", "workspace"]);
const RESULT_VALUES = new Set(["blocked", "cancelled", "failed", "success"]);
const FEATURE_NAME_VALUES = new Set([
	"account",
	"attendance",
	"billing",
	"center_switching",
	"children",
	"classrooms",
	"dashboard",
	"enrollment",
	"guardians",
	"help",
	"imports",
	"quickbooks",
	"login",
	"messages",
	"onboarding",
	"payments",
	"ratios",
	"reports",
	"scheduling",
	"settings",
	"signup",
	"subsidies",
	"unknown",
]);

interface PostHogConfig {
	apiKey: string;
	apiHost: string;
}

let activeConfig: PostHogConfig | null = null;
let currentDistinctId: string | null = null;
let fallbackAnonymousId: string | null = null;
let lastPageKey: string | null = null;

function getConfig(): PostHogConfig | null {
	const apiKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
	if (!apiKey) return null;

	return {
		apiKey,
		apiHost: import.meta.env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST,
	};
}

function isSafeString(value: string): boolean {
	return value.length <= 200 && !value.includes("@") && !/[\r\n]/.test(value);
}

function sanitizeValue(value: unknown): unknown {
	if (Array.isArray(value)) return undefined;
	if (value && typeof value === "object") {
		return sanitizeProperties(value as Record<string, unknown>);
	}
	if (typeof value === "string") {
		return isSafeString(value) ? value : undefined;
	}
	return value;
}

function isSafeToken(value: string): boolean {
	return /^[a-z0-9][a-z0-9_:-]{0,63}$/.test(value);
}

function isSafeDomain(value: string): boolean {
	return /^[a-z0-9.-]{1,200}$/.test(value);
}

function isSafeTimezone(value: string): boolean {
	return /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(value);
}

function sanitizePropertyValue(key: string, value: unknown): unknown {
	if (BOOLEAN_PROPERTY_KEYS.has(key)) return typeof value === "boolean" ? value : undefined;
	if (NUMBER_PROPERTY_KEYS.has(key)) {
		return typeof value === "number" && Number.isFinite(value) ? value : undefined;
	}
	if (key === "feature_name") {
		return typeof value === "string" && FEATURE_NAME_VALUES.has(value) ? value : undefined;
	}
	if (key === "route_area") {
		return typeof value === "string" && ROUTE_AREA_VALUES.has(value) ? value : undefined;
	}
	if (key === "state") {
		return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : undefined;
	}
	if (key === "result") {
		return typeof value === "string" && RESULT_VALUES.has(value) ? value : undefined;
	}
	if (key === "action") {
		return typeof value === "string" && isSafeToken(value) ? value : undefined;
	}
	if (key === "email_domain") {
		return typeof value === "string" && isSafeDomain(value) ? value : undefined;
	}
	if (key === "path") {
		return typeof value === "string" ? getSafePagePath(value) : undefined;
	}
	if (key === "timezone") {
		return typeof value === "string" && isSafeTimezone(value) ? value : undefined;
	}
	if (typeof value === "string") {
		return isSafeToken(value) ? value : undefined;
	}
	return sanitizeValue(value);
}

function sanitizeProperties(properties: Record<string, unknown> | undefined) {
	if (!properties) return undefined;

	const safe: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (!SAFE_PROPERTY_KEYS.has(key)) continue;
		const sanitized = sanitizePropertyValue(key, value);
		if (sanitized !== undefined) safe[key] = sanitized;
	}
	return safe;
}

function getAnonymousId(): string {
	try {
		const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
		if (existing) return existing;
		const generated = crypto.randomUUID();
		try {
			window.localStorage.setItem(ANONYMOUS_ID_KEY, generated);
		} catch {
			fallbackAnonymousId = generated;
		}
		return generated;
	} catch {
		fallbackAnonymousId ??= crypto.randomUUID();
		return fallbackAnonymousId;
	}
}

function getDistinctId(): string {
	return currentDistinctId ?? getAnonymousId();
}

function posthogEndpoint(config: PostHogConfig): string {
	return `${config.apiHost.replace(/\/$/, "")}/capture/`;
}

type RouteAnalyticsContext = {
	feature_name: string;
	route_area: "conversion" | "workspace" | "account" | "other";
};

const ROUTE_FEATURES: Array<{
	prefix: string;
	feature_name: string;
	route_area: RouteAnalyticsContext["route_area"];
}> = [
	{ prefix: "/signup", feature_name: "signup", route_area: "conversion" },
	{ prefix: "/pay", feature_name: "payments", route_area: "conversion" },
	{ prefix: "/login", feature_name: "login", route_area: "conversion" },
	{ prefix: "/onboarding", feature_name: "onboarding", route_area: "conversion" },
	{ prefix: "/dashboard", feature_name: "dashboard", route_area: "workspace" },
	{ prefix: "/attendance", feature_name: "attendance", route_area: "workspace" },
	{ prefix: "/ratios", feature_name: "ratios", route_area: "workspace" },
	{ prefix: "/children/enroll", feature_name: "enrollment", route_area: "workspace" },
	{ prefix: "/children", feature_name: "children", route_area: "workspace" },
	{ prefix: "/guardians", feature_name: "guardians", route_area: "workspace" },
	{ prefix: "/help", feature_name: "help", route_area: "workspace" },
	{ prefix: "/classrooms", feature_name: "classrooms", route_area: "workspace" },
	{ prefix: "/billing/payments", feature_name: "payments", route_area: "workspace" },
	{ prefix: "/billing", feature_name: "billing", route_area: "workspace" },
	{ prefix: "/subsidies", feature_name: "subsidies", route_area: "workspace" },
	{ prefix: "/reports", feature_name: "reports", route_area: "workspace" },
	{ prefix: "/import", feature_name: "imports", route_area: "workspace" },
	{ prefix: "/scheduling", feature_name: "scheduling", route_area: "workspace" },
	{ prefix: "/messages", feature_name: "messages", route_area: "workspace" },
	{ prefix: "/settings", feature_name: "settings", route_area: "account" },
	{ prefix: "/account", feature_name: "account", route_area: "account" },
	{ prefix: "/overview", feature_name: "center_switching", route_area: "account" },
];

export function getRouteAnalyticsContext(path: string): RouteAnalyticsContext {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const match = ROUTE_FEATURES.find(
		(route) => normalizedPath === route.prefix || normalizedPath.startsWith(`${route.prefix}/`),
	);

	if (!match) {
		return { feature_name: "unknown", route_area: "other" };
	}

	return { feature_name: match.feature_name, route_area: match.route_area };
}

export function getSafePagePath(path: string): string | undefined {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const dynamicRoutes: Array<{ pattern: RegExp; template: string }> = [
		{ pattern: /^\/children\/[^/]+$/, template: "/children/:id" },
		{ pattern: /^\/guardians\/[^/]+$/, template: "/guardians/:id" },
		{ pattern: /^\/classrooms\/[^/]+$/, template: "/classrooms/:id" },
		{ pattern: /^\/messages\/[^/]+$/, template: "/messages/:id" },
		{ pattern: /^\/pay\/[^/]+$/, template: "/pay/:token" },
	];
	const match = dynamicRoutes.find((route) => route.pattern.test(normalizedPath));
	if (match) return match.template;

	const routeMatch = ROUTE_FEATURES.find((route) => normalizedPath === route.prefix);
	return routeMatch?.prefix;
}

function capture(
	event: string,
	properties?: Record<string, unknown>,
	distinctId = getDistinctId(),
	protocolProperties?: Record<string, unknown>,
) {
	if (!activeConfig) return;

	const body = JSON.stringify({
		api_key: activeConfig.apiKey,
		event,
		distinct_id: distinctId,
		properties: {
			...protocolProperties,
			...sanitizeProperties(properties),
			surface: "app",
		},
	});

	try {
		void fetch(posthogEndpoint(activeConfig), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
			keepalive: true,
		}).catch(() => {});
	} catch {
		// Analytics is best-effort and must never break the app.
	}
}

export function initPostHog(): void {
	activeConfig = getConfig();
	currentDistinctId = null;
	lastPageKey = null;
}

export function track(event: string, properties?: Record<string, unknown>): void {
	capture(event, properties);
}

export function trackPageView(path: string, search: string): void {
	const pageKey = `${path}?${search}`;
	if (pageKey === lastPageKey) return;
	lastPageKey = pageKey;
	const safePath = getSafePagePath(path);
	if (!safePath) return;
	track(ANALYTICS_EVENTS.pageView, {
		path: safePath,
		search_present: search.length > 0,
		...getRouteAnalyticsContext(safePath),
	});
}

export function getEmailDomain(email: string | undefined): string | undefined {
	if (!email) return undefined;
	const at = email.lastIndexOf("@");
	if (at <= 0 || at === email.length - 1) return undefined;
	return email.slice(at + 1).toLowerCase();
}

export function identifyAuthenticatedUser(input: {
	id: string;
	email?: string;
	role: Role;
	emailVerified?: boolean;
	centerCount?: number;
}): void {
	const previousDistinctId = getDistinctId();
	currentDistinctId = input.id;
	capture("$identify", undefined, input.id, {
		$anon_distinct_id: previousDistinctId,
		$set: sanitizeProperties({
			role: input.role,
			email_domain: getEmailDomain(input.email),
			email_verified: input.emailVerified,
			center_count: input.centerCount,
		}),
	});
}

export function groupCenter(input: {
	id: string;
	plan?: SubscriptionPlan | null;
	subscriptionStatus?: SubscriptionStatus;
	state?: string;
	timezone?: string;
	role: Role;
	classroomCount?: number;
	name?: string;
}): void {
	capture("$groupidentify", undefined, getDistinctId(), {
		$group_type: "center",
		$group_key: input.id,
		$group_set: sanitizeProperties({
			plan: input.plan ?? undefined,
			subscription_status: input.subscriptionStatus,
			state: input.state,
			timezone: input.timezone,
			role: input.role,
			classroom_count: input.classroomCount,
		}),
	});
}

export function resetAnalytics(): void {
	currentDistinctId = null;
	fallbackAnonymousId = null;
	lastPageKey = null;
}
