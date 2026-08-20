import type { Auth } from "@pebbledesk/auth";
import type { Database } from "@pebbledesk/db";
import type { Role } from "@pebbledesk/shared";
import type { RateLimiterDO } from "../durable-objects/rate-limiter.js";

export type Bindings = {
	// Optional: set a real Hyperdrive ID in wrangler.jsonc to enable connection pooling.
	// Without it the worker falls back to DATABASE_URL (neon-http, no connection pool).
	HYPERDRIVE?: { connectionString: string };
	MARKETING_DB: D1Database;
	REPORTS_BUCKET?: R2Bucket;
	RATE_LIMITER: DurableObjectNamespace<RateLimiterDO>;
	DATABASE_URL: string;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	APP_URL: string;
	PUBLIC_LINK_SECRET: string;
	RESEND_API_KEY: string;
	RESEND_FROM_EMAIL: string;
	RESEND_WEBHOOK_SECRET?: string;
	RESEND_INBOUND_REPLY_DOMAIN?: string;
	STRIPE_PUBLISHABLE_KEY: string;
	STRIPE_SECRET_KEY: string;
	STRIPE_WEBHOOK_SECRET: string;
	STRIPE_PRICE_HOME_MONTHLY: string;
	STRIPE_PRICE_HOME_ANNUAL: string;
	STRIPE_PRICE_CENTER_STARTER_MONTHLY: string;
	STRIPE_PRICE_CENTER_STARTER_ANNUAL: string;
	STRIPE_PRICE_CENTER_PRO_MONTHLY: string;
	STRIPE_PRICE_CENTER_PRO_ANNUAL: string;
	STRIPE_PRICE_GROUP_MONTHLY: string;
	STRIPE_PRICE_GROUP_ANNUAL: string;
	STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: string;
	QUICKBOOKS_CLIENT_ID?: string;
	QUICKBOOKS_CLIENT_SECRET?: string;
	QUICKBOOKS_REDIRECT_URI?: string;
	QB_TOKEN_ENC_KEY?: string;
	SENTRY_DSN?: string;
	FEEDBACK_TO_EMAIL?: string;
	MARKETING_FROM_EMAIL: string;
	R2_PUBLIC_URL: string;
	UNSUBSCRIBE_SECRET: string;
	LEAD_MAGNETS_BUCKET?: R2Bucket;
	E2E_SIGNUP_EMAIL_DOMAINS?: string;
	E2E_SIGNUP_RATE_LIMIT_TOKEN?: string;
	POSTHOG_PROJECT_API_KEY?: string;
	POSTHOG_HOST?: string;
	SEQUENCER_BASE_URL?: string;
	SEQUENCER_CF_ACCESS_CLIENT_ID?: string;
	SEQUENCER_CF_ACCESS_CLIENT_SECRET?: string;
	AI_CS_CLIENT_ASSERTION_SECRET?: string;
	AI_CS_WORKER_ORIGIN?: string;
	AI_CS_CONTEXT_SECRET?: string;
	AI_CS_NONCE_DB?: D1Database;
	API_READINESS_TOKEN?: string;
};

export type Variables = {
	db: Database;
	auth: Auth;
	userId: string;
	/** Authenticated email of the session user. Set by the AI-CS proxy middleware. */
	userEmail?: string;
	/** Set by requireAuth when a valid center membership exists. Undefined when the user has no membership. */
	centerId?: string;
	/** Set by requireAuth when a valid center membership exists. Undefined when the user has no membership. */
	membershipId?: string;
	/** Set by requireAuth when a valid center membership exists. Undefined when the user has no membership. */
	role?: Role;
	requestId: string;
};

export type AppEnv = {
	Bindings: Bindings;
	Variables: Variables;
};
