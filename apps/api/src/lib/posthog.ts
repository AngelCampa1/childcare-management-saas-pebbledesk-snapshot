import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const SAFE_PROPERTY_KEYS = new Set([
	"action",
	"age_group",
	"cadence",
	"feature_name",
	"field_count",
	"landing_page",
	"method",
	"page_path",
	"reason",
	"referring_domain",
	"report_type",
	"result",
	"role",
	"self_serve",
	"source_app",
	"stage",
	"state",
	"subject_type",
	"timezone",
	"country",
	"lead_type",
	"activation_type",
	"plan",
	"promo_present",
	"subscription_status",
	"utm_campaign",
	"utm_medium",
	"utm_source",
]);
const BOOLEAN_PROPERTY_KEYS = new Set(["promo_present", "self_serve"]);
const NUMBER_PROPERTY_KEYS = new Set(["field_count"]);
const RESULT_VALUES = new Set(["blocked", "cancelled", "failed", "success"]);
const FEATURE_NAME_VALUES = new Set([
	"attendance",
	"billing",
	"center",
	"children",
	"classrooms",
	"enrollment",
	"guardians",
	"imports",
	"messages",
	"payments",
	"ratios",
	"reports",
	"scheduling",
	"settings",
	"signup",
	"subsidies",
]);

type PostHogEnv = {
	POSTHOG_PROJECT_API_KEY?: string;
	POSTHOG_HOST?: string;
};

type CaptureInput = {
	event: string;
	distinctId: string;
	properties?: Record<string, unknown>;
};

type ExecutionContextLike = {
	waitUntil(promise: Promise<unknown>): void;
};

function isSafeString(value: string): boolean {
	return value.length <= 200 && !value.includes("@") && !/[\r\n]/.test(value);
}

function sanitizeValue(value: unknown): unknown {
	if (Array.isArray(value)) return undefined;
	if (value && typeof value === "object") {
		return sanitizePostHogProperties(value as Record<string, unknown>);
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

function sanitizePath(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	try {
		const parsed = new URL(value, PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
		return parsed.pathname.startsWith("/") ? parsed.pathname : undefined;
	} catch {
		return undefined;
	}
}

function sanitizePropertyValue(key: string, value: unknown): unknown {
	if (BOOLEAN_PROPERTY_KEYS.has(key)) return typeof value === "boolean" ? value : undefined;
	if (NUMBER_PROPERTY_KEYS.has(key)) {
		return typeof value === "number" && Number.isFinite(value) ? value : undefined;
	}
	if (key === "feature_name") {
		return typeof value === "string" && FEATURE_NAME_VALUES.has(value) ? value : undefined;
	}
	if (key === "result") {
		return typeof value === "string" && RESULT_VALUES.has(value) ? value : undefined;
	}
	if (key === "action") {
		return typeof value === "string" && isSafeToken(value) ? value : undefined;
	}
	if (key === "state") {
		return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : undefined;
	}
	if (key === "country") {
		return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : undefined;
	}
	if (key === "landing_page" || key === "page_path") {
		return sanitizePath(value);
	}
	if (key === "referring_domain") {
		return typeof value === "string" && isSafeDomain(value) ? value : undefined;
	}
	if (key === "timezone") {
		return typeof value === "string" && isSafeTimezone(value) ? value : undefined;
	}
	if (typeof value === "string") {
		return isSafeToken(value) ? value : undefined;
	}
	return sanitizeValue(value);
}

export function sanitizePostHogProperties(
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

export async function analyticsDistinctId(kind: string, id: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${kind}:${id}`));
	const hash = Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return `${kind}:${hash}`;
}

export async function capturePostHogEvent(env: PostHogEnv, input: CaptureInput): Promise<boolean> {
	const apiKey = env.POSTHOG_PROJECT_API_KEY?.trim();
	if (!apiKey) return false;

	const host = env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
	try {
		const response = await fetch(`${host.replace(/\/$/, "")}/capture/`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: apiKey,
				event: input.event,
				distinct_id: input.distinctId,
				properties: sanitizePostHogProperties(input.properties),
			}),
		});
		return response.ok;
	} catch {
		return false;
	}
}

export function schedulePostHogEvent(
	env: PostHogEnv,
	executionContext: ExecutionContextLike | undefined,
	input: CaptureInput,
): void {
	const capture = capturePostHogEvent(env, input);
	if (executionContext) {
		executionContext.waitUntil(capture);
		return;
	}
	void capture;
}

export function getExecutionContext(target: unknown): ExecutionContextLike | undefined {
	try {
		const maybeContext = (target as { executionCtx?: ExecutionContextLike }).executionCtx;
		return maybeContext && typeof maybeContext.waitUntil === "function" ? maybeContext : undefined;
	} catch {
		return undefined;
	}
}
