import { z } from "zod";
import type { Bindings } from "./context.js";

const envSchema = z.object({
	BETTER_AUTH_SECRET: z.string().min(1),
	BETTER_AUTH_URL: z.string().url(),
	APP_URL: z.string().url(),
	PUBLIC_LINK_SECRET: z.string().min(1),
	GOOGLE_CLIENT_ID: z.string().min(1),
	GOOGLE_CLIENT_SECRET: z.string().min(1),
	RESEND_API_KEY: z.string().min(1).startsWith("re_"),
	RESEND_FROM_EMAIL: z.string().email(),
	RESEND_WEBHOOK_SECRET: z.string().min(1).startsWith("whsec_").optional(),
	RESEND_INBOUND_REPLY_DOMAIN: z.string().min(1).optional(),
	STRIPE_SECRET_KEY: z.string().min(1).startsWith("sk_"),
	STRIPE_PUBLISHABLE_KEY: z.string().min(1).startsWith("pk_"),
	STRIPE_WEBHOOK_SECRET: z.string().min(1).startsWith("whsec_"),
	STRIPE_PRICE_HOME_MONTHLY: z.string().min(1).startsWith("price_"),
	STRIPE_PRICE_HOME_ANNUAL: z.string().min(1).startsWith("price_"),
	STRIPE_PRICE_CENTER_STARTER_MONTHLY: z.string().min(1).startsWith("price_"),
	STRIPE_PRICE_CENTER_STARTER_ANNUAL: z.string().min(1).startsWith("price_"),
	STRIPE_PRICE_CENTER_PRO_MONTHLY: z.string().min(1).startsWith("price_"),
	STRIPE_PRICE_CENTER_PRO_ANNUAL: z.string().min(1).startsWith("price_"),
	STRIPE_PRICE_GROUP_MONTHLY: z.string().min(1).startsWith("price_"),
	STRIPE_PRICE_GROUP_ANNUAL: z.string().min(1).startsWith("price_"),
	STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: z.string().min(1).startsWith("whsec_"),
	QB_TOKEN_ENC_KEY: z.string().min(32).optional(),
	QUICKBOOKS_CLIENT_ID: z.string().min(1).optional(),
	QUICKBOOKS_CLIENT_SECRET: z.string().min(1).optional(),
	QUICKBOOKS_REDIRECT_URI: z.string().url().optional(),
	DATABASE_URL: z.string().url(),
	SENTRY_DSN: z.string().url().optional(),
	MARKETING_FROM_EMAIL: z.string().email(),
	R2_PUBLIC_URL: z.string().url(),
	UNSUBSCRIBE_SECRET: z.string().min(1),
	API_READINESS_TOKEN: z.string().min(1).optional(),
});

export function validateEnv(env: Bindings): void {
	const result = envSchema.safeParse(env);
	if (!result.success) {
		const missing = result.error.issues.map((i) => i.path[0]).join(", ");
		throw new Error(`Missing or invalid environment variables: ${missing}`);
	}
}
