import { describe, expect, it } from "vitest";
import type { Bindings } from "./context.js";
import { validateEnv } from "./env.js";

function validEnv(): Bindings {
	return {
		BETTER_AUTH_SECRET: "a-valid-secret",
		BETTER_AUTH_URL: "http://localhost:8790",
		APP_URL: "http://localhost:3040",
		PUBLIC_LINK_SECRET: "a-valid-public-link-secret",
		GOOGLE_CLIENT_ID: "123456789-abc.apps.googleusercontent.com",
		GOOGLE_CLIENT_SECRET: "GOCSPX-valid-google-secret",
		RESEND_API_KEY: "re_valid_key",
		RESEND_FROM_EMAIL: "angel.campa@pebbledesk.app",
		STRIPE_SECRET_KEY: "sk_test_valid_key",
		STRIPE_PUBLISHABLE_KEY: "pk_test_valid_key",
		STRIPE_WEBHOOK_SECRET: "whsec_valid_webhook_secret",
		STRIPE_PRICE_HOME_MONTHLY: "price_home_monthly_valid",
		STRIPE_PRICE_HOME_ANNUAL: "price_home_annual_valid",
		STRIPE_PRICE_CENTER_STARTER_MONTHLY: "price_center_starter_monthly_valid",
		STRIPE_PRICE_CENTER_STARTER_ANNUAL: "price_center_starter_annual_valid",
		STRIPE_PRICE_CENTER_PRO_MONTHLY: "price_center_pro_monthly_valid",
		STRIPE_PRICE_CENTER_PRO_ANNUAL: "price_center_pro_annual_valid",
		STRIPE_PRICE_GROUP_MONTHLY: "price_group_monthly_valid",
		STRIPE_PRICE_GROUP_ANNUAL: "price_group_annual_valid",
		STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: "whsec_sub_valid_secret",
		DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
		RATE_LIMITER: {} as DurableObjectNamespace,
		SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
		MARKETING_FROM_EMAIL: "angel.campa@pebbledesk.app",
		R2_PUBLIC_URL: "https://cdn.pebbledesk.app",
		UNSUBSCRIBE_SECRET: "a-valid-unsubscribe-secret",
	} as unknown as Bindings;
}

describe("validateEnv", () => {
	it("does not throw when all required env vars are present and valid", () => {
		expect(() => validateEnv(validEnv())).not.toThrow();
	});

	it("throws when BETTER_AUTH_SECRET is missing", () => {
		const env = { ...validEnv(), BETTER_AUTH_SECRET: "" };
		expect(() => validateEnv(env)).toThrow(/BETTER_AUTH_SECRET/);
	});

	it("throws when BETTER_AUTH_URL is not a valid URL", () => {
		const env = { ...validEnv(), BETTER_AUTH_URL: "not-a-url" };
		expect(() => validateEnv(env)).toThrow(/BETTER_AUTH_URL/);
	});

	it("throws when APP_URL is not a valid URL", () => {
		const env = { ...validEnv(), APP_URL: "not-a-url" };
		expect(() => validateEnv(env)).toThrow(/APP_URL/);
	});

	it("throws when PUBLIC_LINK_SECRET is missing", () => {
		const env = { ...validEnv(), PUBLIC_LINK_SECRET: "" };
		expect(() => validateEnv(env)).toThrow(/PUBLIC_LINK_SECRET/);
	});

	it("throws when GOOGLE_CLIENT_ID is empty", () => {
		const env = { ...validEnv(), GOOGLE_CLIENT_ID: "" };
		expect(() => validateEnv(env)).toThrow(/GOOGLE_CLIENT_ID/);
	});

	it("throws when GOOGLE_CLIENT_SECRET is empty", () => {
		const env = { ...validEnv(), GOOGLE_CLIENT_SECRET: "" };
		expect(() => validateEnv(env)).toThrow(/GOOGLE_CLIENT_SECRET/);
	});

	it("throws when RESEND_API_KEY does not start with re_", () => {
		const env = { ...validEnv(), RESEND_API_KEY: "bad_key" };
		expect(() => validateEnv(env)).toThrow(/RESEND_API_KEY/);
	});

	it("throws when RESEND_FROM_EMAIL is not a valid email", () => {
		const env = { ...validEnv(), RESEND_FROM_EMAIL: "not-an-email" };
		expect(() => validateEnv(env)).toThrow(/RESEND_FROM_EMAIL/);
	});

	it("throws when STRIPE_SECRET_KEY does not start with sk_", () => {
		const env = { ...validEnv(), STRIPE_SECRET_KEY: "not_a_stripe_key" };
		expect(() => validateEnv(env)).toThrow(/STRIPE_SECRET_KEY/);
	});

	it("throws when STRIPE_PUBLISHABLE_KEY does not start with pk_", () => {
		const env = { ...validEnv(), STRIPE_PUBLISHABLE_KEY: "sk_wrong_prefix" };
		expect(() => validateEnv(env)).toThrow(/STRIPE_PUBLISHABLE_KEY/);
	});

	it("throws when STRIPE_WEBHOOK_SECRET does not start with whsec_", () => {
		const env = { ...validEnv(), STRIPE_WEBHOOK_SECRET: "bad_secret" };
		expect(() => validateEnv(env)).toThrow(/STRIPE_WEBHOOK_SECRET/);
	});

	it("throws when STRIPE_PRICE_HOME_ANNUAL does not start with price_", () => {
		const env = { ...validEnv(), STRIPE_PRICE_HOME_ANNUAL: "prod_wrong" };
		expect(() => validateEnv(env)).toThrow(/STRIPE_PRICE_HOME_ANNUAL/);
	});

	it("throws when STRIPE_PRICE_CENTER_STARTER_MONTHLY does not start with price_", () => {
		const env = { ...validEnv(), STRIPE_PRICE_CENTER_STARTER_MONTHLY: "prod_wrong" };
		expect(() => validateEnv(env)).toThrow(/STRIPE_PRICE_CENTER_STARTER_MONTHLY/);
	});

	it("throws when STRIPE_PRICE_CENTER_PRO_ANNUAL does not start with price_", () => {
		const env = { ...validEnv(), STRIPE_PRICE_CENTER_PRO_ANNUAL: "prod_wrong" };
		expect(() => validateEnv(env)).toThrow(/STRIPE_PRICE_CENTER_PRO_ANNUAL/);
	});

	it("throws when STRIPE_PRICE_GROUP_MONTHLY does not start with price_", () => {
		const env = { ...validEnv(), STRIPE_PRICE_GROUP_MONTHLY: "prod_wrong" };
		expect(() => validateEnv(env)).toThrow(/STRIPE_PRICE_GROUP_MONTHLY/);
	});

	it("requires group price ids because group is self-serve", () => {
		const { STRIPE_PRICE_GROUP_ANNUAL: _removed, ...env } = validEnv();
		expect(() => validateEnv(env as Parameters<typeof validateEnv>[0])).toThrow(
			/STRIPE_PRICE_GROUP_ANNUAL/,
		);
	});

	it("throws when STRIPE_SUBSCRIPTION_WEBHOOK_SECRET does not start with whsec_", () => {
		const env = { ...validEnv(), STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: "bad_secret" };
		expect(() => validateEnv(env)).toThrow(/STRIPE_SUBSCRIPTION_WEBHOOK_SECRET/);
	});

	it("allows QuickBooks env vars to be absent when the integration is disabled", () => {
		expect(() => validateEnv(validEnv())).not.toThrow();
	});

	it("throws when QB_TOKEN_ENC_KEY is shorter than 32 chars when provided", () => {
		const env = { ...validEnv(), QB_TOKEN_ENC_KEY: "too-short" };
		expect(() => validateEnv(env)).toThrow(/QB_TOKEN_ENC_KEY/);
	});

	it("throws when QUICKBOOKS_CLIENT_ID is empty when provided", () => {
		const env = { ...validEnv(), QUICKBOOKS_CLIENT_ID: "" };
		expect(() => validateEnv(env)).toThrow(/QUICKBOOKS_CLIENT_ID/);
	});

	it("throws when QUICKBOOKS_CLIENT_SECRET is empty when provided", () => {
		const env = { ...validEnv(), QUICKBOOKS_CLIENT_SECRET: "" };
		expect(() => validateEnv(env)).toThrow(/QUICKBOOKS_CLIENT_SECRET/);
	});

	it("throws when QUICKBOOKS_REDIRECT_URI is not a valid URL when provided", () => {
		const env = { ...validEnv(), QUICKBOOKS_REDIRECT_URI: "not-a-url" };
		expect(() => validateEnv(env)).toThrow(/QUICKBOOKS_REDIRECT_URI/);
	});

	it("throws when DATABASE_URL is not a valid URL", () => {
		const env = { ...validEnv(), DATABASE_URL: "not-a-url" };
		expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
	});

	it("throws when MARKETING_FROM_EMAIL is not a valid email", () => {
		const env = { ...validEnv(), MARKETING_FROM_EMAIL: "not-an-email" };
		expect(() => validateEnv(env)).toThrow(/MARKETING_FROM_EMAIL/);
	});

	it("throws when R2_PUBLIC_URL is not a valid URL", () => {
		const env = { ...validEnv(), R2_PUBLIC_URL: "not-a-url" };
		expect(() => validateEnv(env)).toThrow(/R2_PUBLIC_URL/);
	});

	it("throws when SENTRY_DSN is not a valid URL when provided", () => {
		const env = { ...validEnv(), SENTRY_DSN: "not-a-url" };
		expect(() => validateEnv(env)).toThrow(/SENTRY_DSN/);
	});

	it("throws when UNSUBSCRIBE_SECRET is empty", () => {
		const env = { ...validEnv(), UNSUBSCRIBE_SECRET: "" };
		expect(() => validateEnv(env)).toThrow(/UNSUBSCRIBE_SECRET/);
	});

	it("error message lists all missing vars when multiple are invalid", () => {
		const env = {
			...validEnv(),
			BETTER_AUTH_SECRET: "",
			RESEND_API_KEY: "bad_key",
		};
		expect(() => validateEnv(env)).toThrow(/Missing or invalid environment variables/);
	});
});
