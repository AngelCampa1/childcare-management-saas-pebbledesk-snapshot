import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/context.js";
import { createRateLimit } from "./rate-limit.js";

const SIGNUP_RATE_LIMIT_WINDOW_MS = 60_000;
const STANDARD_SIGNUP_RATE_LIMIT_MAX = 5;
const E2E_SIGNUP_RATE_LIMIT_MAX = 30;
const E2E_SIGNUP_TOKEN_HEADER = "x-pebbledesk-e2e-signup";

export function createSignUpRateLimit() {
	const standardRateLimit = createRateLimit({
		windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
		max: STANDARD_SIGNUP_RATE_LIMIT_MAX,
		bucket: "auth-sign-up",
	});
	const e2eRateLimit = createRateLimit({
		windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
		max: E2E_SIGNUP_RATE_LIMIT_MAX,
		bucket: "auth-sign-up-e2e",
		message: "Too many E2E sign-up attempts, please try again shortly.",
	});

	return createMiddleware<AppEnv>(async (c, next) => {
		if (await isConfiguredE2ESignUp(c.env, c.req.raw)) {
			return e2eRateLimit(c, next);
		}

		return standardRateLimit(c, next);
	});
}

async function isConfiguredE2ESignUp(env: AppEnv["Bindings"], request: Request): Promise<boolean> {
	const domains = parseConfiguredDomains(env.E2E_SIGNUP_EMAIL_DOMAINS);
	if (domains.size === 0) return false;
	if (!hasValidE2EToken(env, request)) return false;

	const email = await readSignUpEmail(request);
	if (!email) return false;

	const domain = getSingleEmailDomain(email);
	return Boolean(domain && domains.has(domain));
}

function parseConfiguredDomains(value: string | undefined): Set<string> {
	return new Set(
		(value ?? "")
			.split(",")
			.map((domain) => domain.trim().toLowerCase())
			.filter((domain) => domain.length > 0),
	);
}

async function readSignUpEmail(request: Request): Promise<string | null> {
	try {
		const contentType = request.headers.get("content-type") ?? "";
		if (contentType.includes("application/x-www-form-urlencoded")) {
			const form = await request.clone().formData();
			const email = form.get("email");
			return typeof email === "string" ? email.trim().toLowerCase() : null;
		}

		if (contentType.includes("application/json")) {
			const body = (await request.clone().json()) as unknown;
			if (!isRecord(body)) return null;

			const email = body.email;
			return typeof email === "string" ? email.trim().toLowerCase() : null;
		}
	} catch {
		return null;
	}

	return null;
}

function hasValidE2EToken(env: AppEnv["Bindings"], request: Request): boolean {
	const configuredToken = env.E2E_SIGNUP_RATE_LIMIT_TOKEN?.trim();
	if (!configuredToken) return false;

	return request.headers.get(E2E_SIGNUP_TOKEN_HEADER) === configuredToken;
}

function getSingleEmailDomain(email: string): string | null {
	const segments = email.split("@");
	if (segments.length !== 2) return null;

	const local = segments[0]?.trim();
	const domain = segments[1]?.trim().toLowerCase();
	return local && domain ? domain : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
