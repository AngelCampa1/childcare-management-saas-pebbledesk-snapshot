import { createMiddleware } from "hono/factory";
import type { RateLimiterDO } from "../durable-objects/rate-limiter.js";

export function createRateLimit({
	windowMs,
	max,
	bucket = "default",
	message = "Rate limit exceeded",
}: {
	windowMs: number;
	max: number;
	bucket?: string;
	message?: string;
}) {
	return createMiddleware(async (c, next) => {
		const cfIp = c.req.header("cf-connecting-ip");
		const forwarded = c.req.header("x-forwarded-for");
		const ip = cfIp ?? (forwarded ? forwarded.split(",")[0].trim() : "unknown");

		const namespace = (
			c.env as { RATE_LIMITER?: DurableObjectNamespace<RateLimiterDO> } | undefined
		)?.RATE_LIMITER;

		// Fall back to allowing all requests when the DO binding is not available
		// (e.g. unit-test environments that exercise routes without a namespace mock).
		if (!namespace) {
			await next();
			return;
		}

		const doId = namespace.idFromName(`rl:${bucket}:${windowMs}:${max}:${ip}`);
		const stub = namespace.get(doId);
		const { allowed, resetAt } = await stub.checkLimit(ip, max, windowMs);

		if (!allowed) {
			const retryAfterMs = resetAt - Date.now();
			const retryAfterSec = Math.ceil(Math.max(retryAfterMs, 0) / 1000);
			c.header("retry-after", String(retryAfterSec));
			return c.json({ error: message }, 429);
		}

		await next();
	});
}
