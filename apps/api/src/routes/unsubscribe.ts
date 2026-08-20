import { leads } from "@pebbledesk/db";
import { getPublicBrandUrl, PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { computeHmac } from "../lib/hmac.js";

export const unsubscribeRoutes = new Hono<AppEnv>();

/**
 * Compute HMAC-SHA256(email, secret) as a hex string.
 * Exported so tests can generate tokens for assertions.
 */
export async function computeUnsubscribeToken(email: string, secret: string): Promise<string> {
	return computeHmac(email, secret);
}

/**
 * Constant-time comparison to avoid timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

unsubscribeRoutes.get("/", async (c) => {
	const email = c.req.query("email");
	const token = c.req.query("token");

	if (!email || !token) {
		return c.json({ error: "Missing email or token" }, 400);
	}

	const expectedToken = await computeHmac(email, c.env.UNSUBSCRIBE_SECRET);

	if (!timingSafeEqual(token, expectedToken)) {
		return c.json({ error: "Invalid token" }, 400);
	}

	const db = c.get("db");
	await db
		.update(leads)
		.set({ unsubscribedAt: new Date() })
		.where(and(eq(leads.email, email), isNull(leads.unsubscribedAt)));

	const publicHomeUrl = getPublicBrandUrl("/");
	const productName = PUBLIC_BRAND_KNOWLEDGE.name;
	const publicHostname = new URL(publicHomeUrl).hostname;

	return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribed - ${productName}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; color: #374151; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 12px; }
    p { line-height: 1.6; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>You've been unsubscribed.</h1>
  <p>You've been unsubscribed from ${productName} emails. You won't receive any more marketing messages from us.</p>
  <p><a href="${publicHomeUrl}">Return to ${publicHostname}</a></p>
</body>
</html>`);
});
