import type { Context } from "hono";
import { Hono } from "hono";
import { unsubscribeAppSignupSequences } from "../lib/app-signup-sequencer.js";
import type { AppEnv } from "../lib/context.js";
import { computeHmac } from "../lib/hmac.js";

export const appSignupRoutes = new Hono<AppEnv>();

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let index = 0; index < a.length; index++) {
		result |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}
	return result === 0;
}

async function handleUnsubscribe(c: Context<AppEnv>) {
	const userId = c.req.query("userId");
	const token = c.req.query("token");
	if (!userId || !token) {
		return c.json({ error: "Missing userId or token" }, 400);
	}

	const expected = await computeHmac(`app-signup:${userId}`, c.env.UNSUBSCRIBE_SECRET);
	if (!timingSafeEqual(token, expected)) {
		return c.json({ error: "Invalid token" }, 400);
	}

	const now = new Date().toISOString();
	const subscriber = await c.env.MARKETING_DB.prepare(
		"SELECT email FROM marketing_app_signup_subscribers WHERE user_id = ? LIMIT 1",
	)
		.bind(userId)
		.first<{ email?: string | null }>();

	await c.env.MARKETING_DB.prepare(`
		UPDATE marketing_app_signup_subscribers
		SET
			suppressed_at = ?,
			suppression_reason = ?,
			updated_at = ?
		WHERE user_id = ?
			AND (
				suppressed_at IS NULL
				OR suppression_reason IS NULL
				OR suppression_reason != 'unsubscribe_link'
			)
	`)
		.bind(now, "unsubscribe_link", now, userId)
		.run();

	if (subscriber?.email) {
		await unsubscribeAppSignupSequences(c.env, { email: subscriber.email }).catch((error) => {
			console.error("App signup Sequencer unsubscribe failed:", error);
		});
	}

	return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Unsubscribed - PebbleDesk</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; color: #374151;">
<h1 style="font-size: 1.5rem;">You've been unsubscribed.</h1>
<p>You won't receive PebbleDesk trial setup emails anymore.</p>
</body>
</html>`);
}

appSignupRoutes.get("/unsubscribe", handleUnsubscribe);
appSignupRoutes.post("/unsubscribe", handleUnsubscribe);
