import { type MagnetSlug, renderTemplate } from "@pebbledesk/emails";
import {
	DEFAULT_BILLING_CADENCE,
	getPromotionalPlanPrice,
	getSubscriptionPromotionForCadence,
	PAYABLE_PLANS,
	PEBBLEDESK_OFFERING,
	SUBSCRIPTION_PLAN_CONFIG,
	TRIAL_DAYS,
} from "@pebbledesk/shared";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared/constants";
import {
	getLeadMagnetSlugs,
	getLeadMagnetTitle,
	getNurtureSequenceForMagnet,
	PUBLIC_BRAND_KNOWLEDGE,
	publicKnowledgeDocuments,
	publicMarketingKnowledgeConfig,
	UNSUBSCRIBE_CONFIRMATION_COPY,
} from "@pebbledesk/shared/public-knowledge";
import * as Sentry from "@sentry/cloudflare";
import { sendEmail } from "./worker/email.js";
import { consumeRateLimit, type RateLimitConfig } from "./worker/rate-limit.js";
import { verifyTurnstile } from "./worker/turnstile.js";

type Env = {
	ASSETS: Fetcher;
	MARKETING_DB: D1Database;
	RESEND_API_KEY: string;
	MARKETING_FROM_EMAIL: string;
	R2_PUBLIC_URL: string;
	UNSUBSCRIBE_SECRET: string;
	SENTRY_DSN?: string;
	SEQUENCER_BASE_URL?: string;
	SEQUENCER_CF_ACCESS_CLIENT_ID?: string;
	SEQUENCER_CF_ACCESS_CLIENT_SECRET?: string;
	AI_SDR_CONTEXT_SECRET?: string;
	TURNSTILE_SECRET_KEY?: string;
	ENVIRONMENT?: string;
	POSTHOG_PROJECT_API_KEY?: string;
	POSTHOG_HOST?: string;
};

type ExecutionContextLike = {
	waitUntil(promise: Promise<unknown>): void;
};

type PostHogInput = {
	event: string;
	distinctId: string;
	properties?: Record<string, unknown>;
};

// Token-bucket limits for the public lead-capture endpoint. The IP limit absorbs
// bursts from one source; the per-email limit caps how often any single address
// can be targeted even across rotated IPs.
const LEAD_IP_RATE_LIMIT: RateLimitConfig = { limit: 10, windowMs: 60_000 };
const LEAD_EMAIL_RATE_LIMIT: RateLimitConfig = { limit: 3, windowMs: 600_000 };
const SIGNUP_IP_RATE_LIMIT: RateLimitConfig = { limit: 10, windowMs: 60_000 };
const SIGNUP_EMAIL_RATE_LIMIT: RateLimitConfig = { limit: 3, windowMs: 600_000 };
const SURVEY_IP_RATE_LIMIT: RateLimitConfig = { limit: 20, windowMs: 60_000 };
const SURVEY_TOKEN_RATE_LIMIT: RateLimitConfig = { limit: 5, windowMs: 600_000 };
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_SAFE_KEYS = new Set([
	"field_count",
	"lead_type",
	"magnet_slug",
	"page_path",
	"position",
	"reason",
	"result",
	"source_app",
	"utm_campaign",
	"utm_medium",
	"utm_source",
]);
const POSTHOG_RESULT_VALUES = new Set(["blocked", "duplicate", "failed", "success"]);
const POSTHOG_REASON_VALUES = new Set([
	"audit_failed",
	"duplicate",
	"email_config_missing",
	"email_failed",
	"honeypot",
	"invalid_payload",
	"not_found",
	"rate_limited_email",
	"rate_limited_ip",
	"rate_limited_token",
	"sequencer_failed",
	"unsubscribed",
	"verification_failed",
]);

type LeadPayload = {
	email: string;
	firstName?: string;
	magnetSlug: MagnetSlug;
	sourcePage?: string;
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
};

type MarketingLead = {
	id: string;
	email: string;
	firstName: string | null;
	unsubscribedAt: string | null;
	createdAt: string;
};

type PublicSignupPayload = {
	email: string;
	sourcePage?: string;
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
	referredBy?: string;
};

type PublicSignupRow = {
	id: string;
	email: string;
	referralCode: string;
	surveyToken: string;
	position: number;
};

type PublicSurveyAnswer = {
	questionId: string;
	answer: string;
};

type PublicSurveySignup = {
	id: string;
	surveySubmittedAt: string | null;
};

const PUBLIC_BRAND_ORIGIN = PUBLIC_BRAND_KNOWLEDGE.publicOrigin;
const PUBLIC_BRAND_HOST = new URL(PUBLIC_BRAND_ORIGIN).hostname;
const APP_BRAND_ORIGIN = PUBLIC_BRAND_KNOWLEDGE.appOrigin;
const CONTACT_URL = new URL("/contact/", PUBLIC_BRAND_ORIGIN).toString();
const CANONICAL_HOST = PUBLIC_BRAND_HOST;
const AI_SDR_PRODUCT_ID = "pebbledesk";
const AI_SDR_MAX_SKEW_MS = 5 * 60 * 1000;
const magnetSlugs = getLeadMagnetSlugs();
const controlledStaticContentTypes = new Map([
	["/sitemap-index.xml", "application/xml; charset=utf-8"],
	["/llms.txt", "text/plain; charset=utf-8"],
	["/llms-full.txt", "text/plain; charset=utf-8"],
	["/pricing.md", "text/markdown; charset=utf-8"],
	["/pricing.txt", "text/plain; charset=utf-8"],
]);

function hasValue(value: string | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isPostHogToken(value: string): boolean {
	return /^[a-z0-9][a-z0-9_:-]{0,63}$/.test(value);
}

function isPostHogSlug(value: string): boolean {
	return /^[a-z0-9][a-z0-9_-]{0,80}$/.test(value);
}

function sanitizePostHogPath(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	try {
		const parsed = new URL(value, PUBLIC_BRAND_ORIGIN);
		return parsed.pathname.startsWith("/") ? parsed.pathname : undefined;
	} catch {
		return undefined;
	}
}

function sanitizePostHogProperties(
	properties: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!properties) return undefined;

	const safe: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (!POSTHOG_SAFE_KEYS.has(key)) continue;
		if (key === "field_count" || key === "position") {
			if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
			continue;
		}
		if (key === "page_path") {
			const path = sanitizePostHogPath(value);
			if (path) safe[key] = path;
			continue;
		}
		if (key === "magnet_slug") {
			if (typeof value === "string" && isPostHogSlug(value)) safe[key] = value;
			continue;
		}
		if (key === "result") {
			if (typeof value === "string" && POSTHOG_RESULT_VALUES.has(value)) safe[key] = value;
			continue;
		}
		if (key === "reason") {
			if (typeof value === "string" && POSTHOG_REASON_VALUES.has(value)) safe[key] = value;
			continue;
		}
		if (typeof value === "string" && isPostHogToken(value)) {
			safe[key] = value;
		}
	}
	return safe;
}

async function capturePostHogEvent(env: Env, input: PostHogInput): Promise<boolean> {
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

function schedulePostHogEvent(
	env: Env,
	executionContext: ExecutionContextLike | undefined,
	input: PostHogInput,
): void {
	const capture = capturePostHogEvent(env, input);
	if (executionContext) {
		executionContext.waitUntil(capture);
		return;
	}
	void capture;
}

function hasLeadEmailConfig(env: Env): boolean {
	return (
		hasValue(env.RESEND_API_KEY) &&
		hasValue(env.MARKETING_FROM_EMAIL) &&
		hasValue(env.UNSUBSCRIBE_SECRET)
	);
}

function hasSequencerConfig(env: Env): boolean {
	return (
		hasValue(env.SEQUENCER_BASE_URL) &&
		hasValue(env.SEQUENCER_CF_ACCESS_CLIENT_ID) &&
		hasValue(env.SEQUENCER_CF_ACCESS_CLIENT_SECRET)
	);
}

async function callSequencer(env: Env, path: string, body: unknown): Promise<Response> {
	const baseUrl = env.SEQUENCER_BASE_URL?.replace(/\/+$/, "");
	if (!baseUrl) throw new Error("SEQUENCER_BASE_URL is required");

	return fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"CF-Access-Client-Id": env.SEQUENCER_CF_ACCESS_CLIENT_ID ?? "",
			"CF-Access-Client-Secret": env.SEQUENCER_CF_ACCESS_CLIENT_SECRET ?? "",
		},
		body: JSON.stringify(body),
	});
}

async function assertSequencerOk(response: Response, action: string): Promise<void> {
	if (response.ok) return;
	const body = await response.text().catch(() => "");
	throw new Error(`Sequencer ${action} failed with ${response.status}: ${body}`);
}

async function enrollSequencerNurture(env: Env, lead: MarketingLead, data: LeadPayload) {
	const contactResponse = await callSequencer(env, "/api/v1/contacts", {
		product: "pebbledesk",
		email: lead.email,
		first_name: lead.firstName ?? data.firstName,
		properties: {
			magnetSlug: data.magnetSlug,
			sourcePage: data.sourcePage,
			utmSource: data.utmSource,
			utmMedium: data.utmMedium,
			utmCampaign: data.utmCampaign,
		},
	});
	await assertSequencerOk(contactResponse, "contact upsert");

	const payload = (await contactResponse.json().catch(() => ({}))) as {
		id?: string;
		contact?: { id?: string };
	};
	const contactId = payload.id ?? payload.contact?.id;
	if (!contactId) throw new Error("Sequencer contact upsert did not return id");

	const enrollmentResponse = await callSequencer(env, "/api/v1/enrollments", {
		product: "pebbledesk",
		email: lead.email,
		sequence_slug: getNurtureSequenceForMagnet(data.magnetSlug),
		source: `lead_magnet:${data.magnetSlug}`,
		properties: {
			contactId,
			magnetSlug: data.magnetSlug,
			sourcePage: data.sourcePage,
		},
	});
	await assertSequencerOk(enrollmentResponse, "enrollment");
}

async function unsubscribeSequencerNurture(env: Env, email: string) {
	const response = await callSequencer(env, "/api/v1/unsubscribe", {
		product: "pebbledesk",
		email,
		scope: "product",
		reason: "unsubscribe_link",
	});
	await assertSequencerOk(response, "unsubscribe");
}

function json(data: unknown, status = 200, requestId?: string): Response {
	const body = status === 204 || status === 304 ? null : JSON.stringify(data);
	const headers = new Headers({
		"content-type": "application/json",
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "POST, OPTIONS",
		"access-control-allow-headers": "content-type",
	});
	if (requestId) {
		headers.set("x-request-id", requestId);
	}

	return new Response(body, {
		status,
		headers,
	});
}

function getCanonicalRedirect(url: URL): Response | null {
	const isCanonicalHost = url.hostname === CANONICAL_HOST;
	const isWwwHost = url.hostname === `www.${CANONICAL_HOST}`;

	if (!isCanonicalHost && !isWwwHost) {
		return null;
	}

	if (isCanonicalHost && url.protocol === "https:") {
		return null;
	}

	const canonicalUrl = new URL(url);
	canonicalUrl.protocol = "https:";
	canonicalUrl.hostname = CANONICAL_HOST;

	return Response.redirect(canonicalUrl.href, 301);
}

function shouldSendNoindexHeader(pathname: string): boolean {
	return (
		/^\/lead-magnets\/[^/]+\.pdf$/.test(pathname) ||
		/^\/lead-magnets\/[^/]+-cover\.png$/.test(pathname) ||
		/^\/free\/[^/]+\/print\/?$/.test(pathname)
	);
}

function getSitemapRedirect(url: URL): Response | null {
	if (url.pathname !== "/sitemap.xml") {
		return null;
	}

	if (url.hostname !== CANONICAL_HOST && url.hostname !== `www.${CANONICAL_HOST}`) {
		return null;
	}

	const sitemapIndexUrl = new URL(url);
	sitemapIndexUrl.protocol = "https:";
	sitemapIndexUrl.hostname = CANONICAL_HOST;
	sitemapIndexUrl.pathname = "/sitemap-index.xml";
	return Response.redirect(sitemapIndexUrl.href, 301);
}

function getCustomersNoindexResponse(pathname: string): Response | null {
	if (pathname !== "/customers" && pathname !== "/customers/") {
		return null;
	}

	return new Response(null, {
		status: 404,
		statusText: "Not Found",
		headers: {
			"x-robots-tag": "noindex, nofollow",
		},
	});
}

async function fetchStaticAsset(request: Request, env: Env, url: URL): Promise<Response> {
	const response = await env.ASSETS.fetch(request);
	if (response.status === 404 && url.pathname !== "/404" && request.method === "GET") {
		const fallbackUrl = new URL("/404", url);
		const fallbackResponse = await env.ASSETS.fetch(new Request(fallbackUrl, request));
		if (fallbackResponse.ok) {
			return new Response(fallbackResponse.body, {
				status: 404,
				statusText: "Not Found",
				headers: fallbackResponse.headers,
			});
		}
	}

	const shouldNoindex = shouldSendNoindexHeader(url.pathname);
	const contentType = controlledStaticContentTypes.get(url.pathname);

	if (!shouldNoindex && !contentType) {
		return response;
	}

	const headers = new Headers(response.headers);
	if (shouldNoindex) {
		headers.set("x-robots-tag", "noindex, nofollow");
	}

	if (contentType) {
		headers.set("content-type", contentType);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function captureWorkerException(env: Env, error: unknown, task: string, requestId?: string): void {
	if (!env.SENTRY_DSN) return;

	Sentry.withScope((scope) => {
		scope.setTag("surface", "marketing-worker");
		scope.setTag("task", task);
		if (requestId) {
			scope.setTag("request_id", requestId);
		}
		Sentry.captureException(error);
	});
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function marketingDistinctId(kind: string, id: string): Promise<string> {
	return `${kind}:${await sha256Hex(`${kind}:${id}`)}`;
}

async function hmacHex(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
	return Array.from(new Uint8Array(sig))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function buildAiSdrPayload(input: {
	timestamp: string;
	nonce: string;
	method: string;
	path: string;
	body: Record<string, unknown>;
}): Promise<string> {
	const bodyHash = await sha256Hex(stableJson(input.body));
	return `${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
}

async function verifyAiSdrSignature(input: {
	payload: string;
	signature: string;
	secret: string;
	timestamp: string;
}): Promise<boolean> {
	if (!/^[0-9a-f]{64}$/.test(input.signature)) return false;
	const parsedTimestamp = Date.parse(input.timestamp);
	if (!Number.isFinite(parsedTimestamp)) return false;
	if (Math.abs(Date.now() - parsedTimestamp) > AI_SDR_MAX_SKEW_MS) return false;
	const expected = await hmacHex(input.payload, input.secret);
	return timingSafeEqual(expected, input.signature);
}

function buildAiSdrContext() {
	const publicDocs = publicKnowledgeDocuments.filter((document) =>
		document.roleVisibility.includes("public"),
	);
	const monthlyPromotion = getSubscriptionPromotionForCadence("monthly");
	const annualPromotion = getSubscriptionPromotionForCadence("annual");
	return {
		productId: AI_SDR_PRODUCT_ID,
		name: PUBLIC_BRAND_KNOWLEDGE.name,
		description: publicMarketingKnowledgeConfig.product.category,
		sources: [
			...publicDocs.slice(0, 3).map((document) => ({
				id: document.id,
				title: document.title,
				url: new URL(document.publicPaths[0] ?? "/", PUBLIC_BRAND_ORIGIN).toString(),
				excerpt: document.botSafeAnswer,
			})),
			{
				id: "founder-contact",
				title: "Founder contact",
				url: CONTACT_URL,
				excerpt: `Founder sales contact: ${PUBLIC_BRAND_KNOWLEDGE.supportEmail}.`,
			},
		],
		plans: PAYABLE_PLANS.map((plan) => {
			const defaultPrice = getPromotionalPlanPrice(plan);
			const monthlyPrice = getPromotionalPlanPrice(plan, "monthly");
			const annualPrice = getPromotionalPlanPrice(plan, "annual");
			return {
				id: plan,
				name: SUBSCRIPTION_PLAN_CONFIG[plan].label,
				price: defaultPrice.discountedPriceLabel,
				renewalPrice: defaultPrice.renewalPriceLabel,
				monthlyPrice: monthlyPrice.discountedPriceLabel,
				monthlyRenewalPrice: monthlyPrice.renewalPriceLabel,
				annualPrice: annualPrice.discountedPriceLabel,
				annualRenewalPrice: annualPrice.renewalPriceLabel,
				promotions: {
					monthly: {
						code: monthlyPromotion.code,
						terms: monthlyPromotion.label,
						renewalPrice: monthlyPrice.renewalPriceLabel,
						ctaUrl: `${APP_BRAND_ORIGIN}/signup?promo=${monthlyPromotion.code}&billing=monthly`,
					},
					annual: {
						code: annualPromotion.code,
						terms: annualPromotion.label,
						renewalPrice: annualPrice.renewalPriceLabel,
						ctaUrl: `${APP_BRAND_ORIGIN}/signup?promo=${annualPromotion.code}&billing=annual`,
					},
				},
				defaultCadence: DEFAULT_BILLING_CADENCE === "annual" ? "year" : "month",
				trialDays: TRIAL_DAYS,
				features: [
					PEBBLEDESK_OFFERING.claims.trialLabel,
					"Flat childcare operations pricing",
					"Audit-ready records",
				],
			};
		}),
	};
}

async function handleAiSdrProductContext(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const productId = url.searchParams.get("productId") ?? url.searchParams.get("product_id");
	if (productId !== AI_SDR_PRODUCT_ID) return json({ error: "Unknown product" }, 404);
	const secret = env.AI_SDR_CONTEXT_SECRET?.trim();
	if (!secret) return json({ error: "Product context unavailable" }, 503);
	const timestamp = request.headers.get("X-Ventora-Timestamp");
	const nonce = request.headers.get("X-Ventora-Nonce");
	const signature = request.headers.get("X-Ventora-Signature");
	if (!timestamp || !nonce || !signature) return json({ error: "Missing signature" }, 401);
	const path = `${url.pathname}${url.search}`;
	const requestPayload = await buildAiSdrPayload({
		timestamp,
		nonce,
		method: "GET",
		path,
		body: { productId },
	});
	const valid = await verifyAiSdrSignature({
		payload: requestPayload,
		signature,
		secret,
		timestamp,
	});
	if (!valid) return json({ error: "Invalid signature" }, 401);
	const body = buildAiSdrContext();
	const responseTimestamp = new Date().toISOString();
	const responseNonce = crypto.randomUUID().replaceAll("-", "");
	const responsePayload = await buildAiSdrPayload({
		timestamp: responseTimestamp,
		nonce: responseNonce,
		method: "GET",
		path,
		body,
	});
	const response = json(body);
	response.headers.set("Cache-Control", "private, max-age=300");
	response.headers.set("X-Ventora-Timestamp", responseTimestamp);
	response.headers.set("X-Ventora-Nonce", responseNonce);
	response.headers.set("X-Ventora-Signature", await hmacHex(responsePayload, secret));
	return response;
}

function cleanOptional(value: unknown, maxLength: number): string | null {
	if (!isString(value)) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, maxLength);
}

function isEmail(value: unknown): value is string {
	return isString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function randomSlug(prefix: string, length: number): string {
	return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, length).toLowerCase()}`;
}

function parseLeadPayload(input: unknown): LeadPayload | null {
	if (typeof input !== "object" || input === null) return null;
	const data = input as Record<string, unknown>;
	const magnetSlug = data.magnetSlug;

	if (!isEmail(data.email) || !isString(magnetSlug) || !magnetSlugs.includes(magnetSlug)) {
		return null;
	}

	return {
		email: data.email.toLowerCase(),
		magnetSlug: magnetSlug as MagnetSlug,
		firstName: cleanOptional(data.firstName, 200) ?? undefined,
		sourcePage: cleanOptional(data.sourcePage, 2000) ?? undefined,
		utmSource: cleanOptional(data.utmSource, 200) ?? undefined,
		utmMedium: cleanOptional(data.utmMedium, 200) ?? undefined,
		utmCampaign: cleanOptional(data.utmCampaign, 200) ?? undefined,
	};
}

function parsePublicSignupPayload(input: unknown): PublicSignupPayload | null {
	if (typeof input !== "object" || input === null) return null;
	const data = input as Record<string, unknown>;
	if (!isEmail(data.email)) return null;

	return {
		email: data.email.toLowerCase(),
		sourcePage: cleanOptional(data.sourcePage, 2000) ?? undefined,
		utmSource: cleanOptional(data.utmSource, 200) ?? undefined,
		utmMedium: cleanOptional(data.utmMedium, 200) ?? undefined,
		utmCampaign: cleanOptional(data.utmCampaign, 200) ?? undefined,
		referredBy: cleanOptional(data.referredBy, 200) ?? undefined,
	};
}

function parseSurveyAnswers(input: unknown): PublicSurveyAnswer[] | null {
	if (!Array.isArray(input) || input.length === 0 || input.length > 20) return null;
	const answers: PublicSurveyAnswer[] = [];
	const questionIds = new Set<string>();

	for (const item of input) {
		if (typeof item !== "object" || item === null) return null;
		const raw = item as Record<string, unknown>;
		const questionId = cleanOptional(raw.questionId, 120);
		const answer = cleanOptional(raw.answer, 1000);
		if (!questionId || !answer || questionIds.has(questionId)) return null;
		questionIds.add(questionId);
		answers.push({ questionId, answer });
	}

	return answers;
}

export async function computeUnsubscribeToken(email: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email));
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

async function findLeadByEmail(db: D1Database, email: string): Promise<MarketingLead | null> {
	return db
		.prepare(`
			SELECT id, email, first_name AS firstName, unsubscribed_at AS unsubscribedAt,
			       created_at AS createdAt
			FROM marketing_leads
			WHERE email = ?
			LIMIT 1
		`)
		.bind(email)
		.first<MarketingLead>();
}

async function upsertLead(
	db: D1Database,
	data: LeadPayload,
): Promise<{ lead: MarketingLead; isNewLead: boolean }> {
	const existing = await findLeadByEmail(db, data.email);

	if (existing) {
		await db
			.prepare(`
				UPDATE marketing_leads
				SET
					first_name = COALESCE(first_name, ?),
					source_magnet_slug = COALESCE(source_magnet_slug, ?),
					source_page = COALESCE(source_page, ?),
					utm_source = COALESCE(utm_source, ?),
					utm_medium = COALESCE(utm_medium, ?),
					utm_campaign = COALESCE(utm_campaign, ?),
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`)
			.bind(
				data.firstName ?? null,
				data.magnetSlug,
				data.sourcePage ?? null,
				data.utmSource ?? null,
				data.utmMedium ?? null,
				data.utmCampaign ?? null,
				existing.id,
			)
			.run();
		return { lead: existing, isNewLead: false };
	}

	const id = crypto.randomUUID();
	await db
		.prepare(`
			INSERT INTO marketing_leads (
				id, email, first_name, source_magnet_slug, source_page,
				utm_source, utm_medium, utm_campaign
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			id,
			data.email,
			data.firstName ?? null,
			data.magnetSlug,
			data.sourcePage ?? null,
			data.utmSource ?? null,
			data.utmMedium ?? null,
			data.utmCampaign ?? null,
		)
		.run();

	return {
		lead: {
			id,
			email: data.email,
			firstName: data.firstName ?? null,
			unsubscribedAt: null,
			createdAt: new Date().toISOString(),
		},
		isNewLead: true,
	};
}

/**
 * Idempotently record a lead-magnet download. Returns `true` only when a new
 * (lead, magnet) row was actually written, so the welcome email and Sequencer
 * enrollment can be gated on a genuinely new request. A repeat of the same
 * (email, magnet) pair conflicts on the unique index, writes nothing, and
 * returns `false`.
 */
async function recordDownload(
	db: D1Database,
	leadId: string,
	magnetSlug: string,
	r2Key: string,
): Promise<boolean> {
	const inserted = await db
		.prepare(`
			INSERT INTO marketing_lead_magnet_downloads (id, lead_id, magnet_slug, r2_key)
			VALUES (?, ?, ?, ?)
			ON CONFLICT (lead_id, magnet_slug) DO NOTHING
			RETURNING id
		`)
		.bind(crypto.randomUUID(), leadId, magnetSlug, r2Key)
		.first<{ id: string }>();
	return inserted !== null;
}

// Both readers run only after `parseLeadPayload` has confirmed the body is a
// non-null object, so they take the already-narrowed record directly.
function readHoneypot(raw: Record<string, unknown>): boolean {
	const value = raw.company_website;
	return typeof value === "string" && value.trim().length > 0;
}

function readTurnstileToken(raw: Record<string, unknown>): string | undefined {
	const value = raw.turnstileToken;
	return typeof value === "string" ? value : undefined;
}

async function handleLeadCapture(
	request: Request,
	env: Env,
	executionContext?: ExecutionContextLike,
): Promise<Response> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		raw = null;
	}

	const parsed = parseLeadPayload(raw);
	if (!parsed) {
		return json({ error: "invalid_lead_payload" }, 400);
	}
	// `parseLeadPayload` only succeeds for a non-null object body.
	const fields = raw as Record<string, unknown>;

	const r2Key = `lead-magnets/${parsed.magnetSlug}.pdf`;
	const r2PublicUrl = env.R2_PUBLIC_URL.replace(/\/$/, "");
	const downloadUrl = `${r2PublicUrl}/${r2Key}`;

	// Honeypot: a bot that filled the hidden field gets a success-shaped response
	// with no DB write and no side effects, and no detection tell.
	if (readHoneypot(fields)) {
		return json({
			ok: true,
			downloadUrl,
			emailed: false,
			recordedDownload: false,
			scheduled: false,
		});
	}

	// Per-IP flood guard runs first — it is the cheapest check and absorbs bursts
	// from a single source before we spend a Turnstile network call. On Cloudflare
	// `cf-connecting-ip` is always present in production; the `"unknown"` fallback
	// only applies to non-CF/local contexts, where the per-email cap and Turnstile
	// still apply.
	const clientIp = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
	const ipAllowed = await consumeRateLimit(
		env.MARKETING_DB,
		`lead-ip:${clientIp}`,
		LEAD_IP_RATE_LIMIT,
	);
	if (!ipAllowed) {
		return json({ error: "rate_limited" }, 429);
	}

	// Proof-of-humanity. Fails closed; bypassed only outside production when the
	// secret is unset (local dev / tests). Verified BEFORE the per-email throttle so
	// a failed or expired challenge cannot burn a legitimate visitor's email bucket.
	const isProduction = env.ENVIRONMENT === "production";
	const humanVerified = await verifyTurnstile({
		token: readTurnstileToken(fields),
		secret: env.TURNSTILE_SECRET_KEY,
		isProduction,
		remoteIp: clientIp === "unknown" ? undefined : clientIp,
	});
	if (!humanVerified) {
		return json({ error: "verification_failed" }, 403);
	}

	// Per-identity cap: now that the request is verified human, limit how often any
	// single address can be targeted, even across rotated IPs.
	const emailAllowed = await consumeRateLimit(
		env.MARKETING_DB,
		`lead-email:${parsed.email}`,
		LEAD_EMAIL_RATE_LIMIT,
	);
	if (!emailAllowed) {
		return json({ error: "rate_limited" }, 429);
	}

	const { lead } = await upsertLead(env.MARKETING_DB, parsed);
	let recordedDownload = false;
	try {
		recordedDownload = await recordDownload(env.MARKETING_DB, lead.id, parsed.magnetSlug, r2Key);
	} catch (err) {
		console.error("Lead magnet download audit failed:", err);
		captureWorkerException(env, err, "lead-download-audit");
	}

	// Gate every side effect on a genuinely new (email, magnet) request. A repeat
	// submission returns a success-shaped response but sends and enrolls nothing.
	if (!recordedDownload) {
		schedulePostHogEvent(env, executionContext, {
			event: ANALYTICS_EVENTS.leadMagnetSubmission,
			distinctId: await marketingDistinctId("marketing_lead", lead.id),
			properties: {
				source_app: "site",
				result: "duplicate",
				reason: "duplicate",
				lead_type: "lead_magnet",
				magnet_slug: parsed.magnetSlug,
				page_path: parsed.sourcePage,
				utm_source: parsed.utmSource,
				utm_medium: parsed.utmMedium,
				utm_campaign: parsed.utmCampaign,
			},
		});
		return json({
			ok: true,
			downloadUrl,
			emailed: false,
			recordedDownload: false,
			scheduled: false,
		});
	}

	if (lead.unsubscribedAt) {
		schedulePostHogEvent(env, executionContext, {
			event: ANALYTICS_EVENTS.leadMagnetSubmission,
			distinctId: await marketingDistinctId("marketing_lead", lead.id),
			properties: {
				source_app: "site",
				result: "success",
				reason: "unsubscribed",
				lead_type: "lead_magnet",
				magnet_slug: parsed.magnetSlug,
				page_path: parsed.sourcePage,
				utm_source: parsed.utmSource,
				utm_medium: parsed.utmMedium,
				utm_campaign: parsed.utmCampaign,
			},
		});
		return json({ ok: true, downloadUrl, emailed: false, recordedDownload, scheduled: false });
	}

	if (!hasLeadEmailConfig(env)) {
		console.error("Lead email configuration is incomplete; returning direct download only.");
		schedulePostHogEvent(env, executionContext, {
			event: ANALYTICS_EVENTS.leadMagnetSubmission,
			distinctId: await marketingDistinctId("marketing_lead", lead.id),
			properties: {
				source_app: "site",
				result: "success",
				reason: "email_config_missing",
				lead_type: "lead_magnet",
				magnet_slug: parsed.magnetSlug,
				page_path: parsed.sourcePage,
				utm_source: parsed.utmSource,
				utm_medium: parsed.utmMedium,
				utm_campaign: parsed.utmCampaign,
			},
		});
		return json({ ok: true, downloadUrl, emailed: false, recordedDownload, scheduled: false });
	}

	const unsubscribeToken = await computeUnsubscribeToken(parsed.email, env.UNSUBSCRIBE_SECRET);
	const unsubscribeUrl = `${PUBLIC_BRAND_ORIGIN}/api/unsubscribe?email=${encodeURIComponent(parsed.email)}&token=${unsubscribeToken}`;
	const rendered = await renderTemplate("nurture-0-welcome", {
		firstName: lead.firstName ?? undefined,
		magnetSlug: parsed.magnetSlug,
		magnetTitle: getLeadMagnetTitle(parsed.magnetSlug),
		downloadUrl,
		unsubscribeUrl,
	});

	let emailed = false;
	try {
		await sendEmail({
			to: parsed.email,
			from: env.MARKETING_FROM_EMAIL,
			subject: rendered.subject,
			html: rendered.html,
			text: rendered.text,
			apiKey: env.RESEND_API_KEY,
		});
		emailed = true;
	} catch (err) {
		console.error("Lead magnet welcome email failed:", err);
		captureWorkerException(env, err, "lead-welcome-email");
	}

	let scheduled = false;
	if (hasSequencerConfig(env)) {
		try {
			await enrollSequencerNurture(env, lead, parsed);
			scheduled = true;
		} catch (err) {
			console.error("Lead magnet Sequencer enrollment failed:", err);
			captureWorkerException(env, err, "lead-sequencer-enrollment");
		}
	}

	schedulePostHogEvent(env, executionContext, {
		event: ANALYTICS_EVENTS.leadMagnetSubmission,
		distinctId: await marketingDistinctId("marketing_lead", lead.id),
		properties: {
			source_app: "site",
			result: "success",
			lead_type: "lead_magnet",
			magnet_slug: parsed.magnetSlug,
			page_path: parsed.sourcePage,
			utm_source: parsed.utmSource,
			utm_medium: parsed.utmMedium,
			utm_campaign: parsed.utmCampaign,
		},
	});
	return json({ ok: true, downloadUrl, emailed, recordedDownload, scheduled });
}

async function findPublicSignupByEmail(
	db: D1Database,
	email: string,
): Promise<PublicSignupRow | null> {
	return db
		.prepare(`
			SELECT id, email, referral_code AS referralCode, survey_token AS surveyToken,
			       position
			FROM marketing_public_signups
			WHERE email = ?
			LIMIT 1
		`)
		.bind(email)
		.first<PublicSignupRow>();
}

async function nextPublicSignupPosition(db: D1Database): Promise<number> {
	const row = await db
		.prepare(`
			SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition
			FROM marketing_public_signups
		`)
		.bind()
		.first<{ nextPosition: number }>();
	return Number(row?.nextPosition ?? 1);
}

function serializePublicSignup(signup: PublicSignupRow) {
	return {
		ok: true,
		referralCode: signup.referralCode,
		position: signup.position,
		surveyToken: signup.surveyToken,
	};
}

async function handlePublicSignup(
	request: Request,
	env: Env,
	executionContext?: ExecutionContextLike,
): Promise<Response> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		raw = null;
	}

	const parsed = parsePublicSignupPayload(raw);
	if (!parsed) {
		return json({ error: "invalid_signup_payload" }, 400);
	}

	const clientIp = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
	const ipAllowed = await consumeRateLimit(
		env.MARKETING_DB,
		`signup-ip:${clientIp}`,
		SIGNUP_IP_RATE_LIMIT,
	);
	if (!ipAllowed) {
		return json({ error: "rate_limited" }, 429);
	}

	const emailAllowed = await consumeRateLimit(
		env.MARKETING_DB,
		`signup-email:${parsed.email}`,
		SIGNUP_EMAIL_RATE_LIMIT,
	);
	if (!emailAllowed) {
		return json({ error: "rate_limited" }, 429);
	}

	const existing = await findPublicSignupByEmail(env.MARKETING_DB, parsed.email);
	if (existing) {
		schedulePostHogEvent(env, executionContext, {
			event: ANALYTICS_EVENTS.publicSignupSubmission,
			distinctId: await marketingDistinctId("marketing_signup", existing.id),
			properties: {
				source_app: "site",
				result: "duplicate",
				reason: "duplicate",
				lead_type: "waitlist",
				page_path: parsed.sourcePage,
				utm_source: parsed.utmSource,
				utm_medium: parsed.utmMedium,
				utm_campaign: parsed.utmCampaign,
			},
		});
		return json({ ok: true });
	}

	const signup: PublicSignupRow = {
		id: crypto.randomUUID(),
		email: parsed.email,
		referralCode: randomSlug("pd", 10),
		surveyToken: randomSlug("sv", 32),
		position: await nextPublicSignupPosition(env.MARKETING_DB),
	};
	const now = new Date().toISOString();

	await env.MARKETING_DB.prepare(`
		INSERT INTO marketing_public_signups (
			id, email, referral_code, survey_token, position, source_page,
			utm_source, utm_medium, utm_campaign, referred_by, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
		.bind(
			signup.id,
			signup.email,
			signup.referralCode,
			signup.surveyToken,
			signup.position,
			parsed.sourcePage ?? null,
			parsed.utmSource ?? null,
			parsed.utmMedium ?? null,
			parsed.utmCampaign ?? null,
			parsed.referredBy ?? null,
			now,
			now,
		)
		.run();

	schedulePostHogEvent(env, executionContext, {
		event: ANALYTICS_EVENTS.publicSignupSubmission,
		distinctId: await marketingDistinctId("marketing_signup", signup.id),
		properties: {
			source_app: "site",
			result: "success",
			lead_type: "waitlist",
			page_path: parsed.sourcePage,
			utm_source: parsed.utmSource,
			utm_medium: parsed.utmMedium,
			utm_campaign: parsed.utmCampaign,
			position: signup.position,
		},
	});
	return json(serializePublicSignup(signup));
}

async function handlePublicSurvey(
	request: Request,
	env: Env,
	executionContext?: ExecutionContextLike,
): Promise<Response> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		raw = null;
	}
	if (typeof raw !== "object" || raw === null) {
		return json({ error: "invalid_survey_payload" }, 400);
	}

	const data = raw as Record<string, unknown>;
	const surveyToken = isString(data.surveyToken) ? data.surveyToken.trim() : "";
	const answers = parseSurveyAnswers(data.answers);
	if (!/^sv_[a-z0-9]{16,64}$/.test(surveyToken) || !answers) {
		return json({ error: "invalid_survey_payload" }, 400);
	}

	const clientIp = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
	const ipAllowed = await consumeRateLimit(
		env.MARKETING_DB,
		`survey-ip:${clientIp}`,
		SURVEY_IP_RATE_LIMIT,
	);
	if (!ipAllowed) {
		return json({ error: "rate_limited" }, 429);
	}

	const tokenAllowed = await consumeRateLimit(
		env.MARKETING_DB,
		`survey-token:${surveyToken}`,
		SURVEY_TOKEN_RATE_LIMIT,
	);
	if (!tokenAllowed) {
		return json({ error: "rate_limited" }, 429);
	}

	const signup = await env.MARKETING_DB.prepare(`
		SELECT id, survey_submitted_at AS surveySubmittedAt
		FROM marketing_public_signups
		WHERE survey_token = ?
		LIMIT 1
	`)
		.bind(surveyToken)
		.first<PublicSurveySignup>();
	if (!signup) {
		return json({ error: "survey_token_not_found" }, 404);
	}
	if (signup.surveySubmittedAt) {
		schedulePostHogEvent(env, executionContext, {
			event: ANALYTICS_EVENTS.publicSurveySubmission,
			distinctId: await marketingDistinctId("marketing_survey_signup", signup.id),
			properties: {
				source_app: "site",
				result: "duplicate",
				reason: "duplicate",
				field_count: answers.length,
			},
		});
		return json({ ok: true }, 409);
	}

	const now = new Date().toISOString();
	for (const answer of answers) {
		await env.MARKETING_DB.prepare(`
			INSERT INTO marketing_public_survey_answers (
				id, signup_id, question_id, answer, created_at
			)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (signup_id, question_id) DO UPDATE SET
				answer = excluded.answer,
				created_at = excluded.created_at
		`)
			.bind(crypto.randomUUID(), signup.id, answer.questionId, answer.answer, now)
			.run();
	}
	await env.MARKETING_DB.prepare(`
		UPDATE marketing_public_signups
		SET survey_submitted_at = ?, updated_at = ?
		WHERE id = ?
	`)
		.bind(now, now, signup.id)
		.run();

	schedulePostHogEvent(env, executionContext, {
		event: ANALYTICS_EVENTS.publicSurveySubmission,
		distinctId: await marketingDistinctId("marketing_survey_signup", signup.id),
		properties: {
			source_app: "site",
			result: "success",
			field_count: answers.length,
		},
	});
	return json({ ok: true });
}

async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const email = url.searchParams.get("email");
	const token = url.searchParams.get("token");

	if (!email || !token) {
		return json({ error: "Missing email or token" }, 400);
	}

	const expectedToken = await computeUnsubscribeToken(email, env.UNSUBSCRIBE_SECRET);
	if (!timingSafeEqual(token, expectedToken)) {
		return json({ error: "Invalid token" }, 400);
	}

	await env.MARKETING_DB.prepare(`
		UPDATE marketing_leads
		SET unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE email = ? AND unsubscribed_at IS NULL
	`)
		.bind(email.toLowerCase())
		.run();

	if (hasSequencerConfig(env)) {
		await unsubscribeSequencerNurture(env, email.toLowerCase()).catch((error) => {
			console.error("Lead magnet Sequencer unsubscribe failed:", error);
			Sentry.captureException(error);
		});
	}

	return new Response(
		`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${UNSUBSCRIBE_CONFIRMATION_COPY.title}</title></head>
<body>
  <h1>${UNSUBSCRIBE_CONFIRMATION_COPY.heading}</h1>
  <p>${UNSUBSCRIBE_CONFIRMATION_COPY.body}</p>
  <p><a href="${UNSUBSCRIBE_CONFIRMATION_COPY.returnHref}">${UNSUBSCRIBE_CONFIRMATION_COPY.returnLabel}</a></p>
</body>
</html>`,
		{
			headers: { "content-type": "text/html; charset=utf-8" },
		},
	);
}

const worker: ExportedHandler<Env> = {
	async fetch(request, env, ctx) {
		try {
			const url = new URL(request.url);
			const sitemapRedirect = getSitemapRedirect(url);
			if (sitemapRedirect) return sitemapRedirect;

			const canonicalRedirect = getCanonicalRedirect(url);
			if (canonicalRedirect) return canonicalRedirect;

			const customersNoindexResponse = getCustomersNoindexResponse(url.pathname);
			if (customersNoindexResponse) return customersNoindexResponse;

			if (
				request.method === "OPTIONS" &&
				(url.pathname === "/api/leads" ||
					url.pathname === "/api/signup" ||
					url.pathname === "/api/survey")
			) {
				return json({}, 204);
			}

			if (request.method === "POST" && url.pathname === "/api/leads") {
				return await handleLeadCapture(request, env, ctx);
			}

			if (request.method === "POST" && url.pathname === "/api/signup") {
				return await handlePublicSignup(request, env, ctx);
			}

			if (request.method === "POST" && url.pathname === "/api/survey") {
				return await handlePublicSurvey(request, env, ctx);
			}

			if (request.method === "GET" && url.pathname === "/api/unsubscribe") {
				return await handleUnsubscribe(request, env);
			}

			if (request.method === "GET" && url.pathname === "/api/ai-sdr/product-context") {
				return await handleAiSdrProductContext(request, env);
			}

			return await fetchStaticAsset(request, env, url);
		} catch (err) {
			const requestId = crypto.randomUUID();
			captureWorkerException(env, err, "request", requestId);
			return json({ error: "internal_error", requestId }, 500, requestId);
		}
	},
};

export default Sentry.withSentry<Env>(
	(env) =>
		env.SENTRY_DSN
			? {
					dsn: env.SENTRY_DSN,
					environment: "production",
				}
			: undefined,
	worker,
);
