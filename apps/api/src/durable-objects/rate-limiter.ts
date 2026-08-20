import { DurableObject } from "cloudflare:workers";

interface RateLimitState {
	count: number;
	windowStart: number;
}

export class RateLimiterDO extends DurableObject {
	async checkLimit(
		key: string,
		limit: number,
		windowMs: number,
	): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
		const now = Date.now();
		const stored = await this.ctx.storage.get<RateLimitState>(key);

		const windowStart = stored?.windowStart ?? now;
		const count = stored?.count ?? 0;

		if (now - windowStart > windowMs) {
			// Window expired, start fresh
			await this.ctx.storage.put(key, { count: 1, windowStart: now });
			return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
		}

		const resetAt = windowStart + windowMs;

		if (count >= limit) {
			return { allowed: false, remaining: 0, resetAt };
		}

		await this.ctx.storage.put(key, { count: count + 1, windowStart });
		return { allowed: true, remaining: limit - count - 1, resetAt };
	}
}
