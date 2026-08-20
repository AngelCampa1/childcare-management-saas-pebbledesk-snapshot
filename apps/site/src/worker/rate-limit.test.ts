import { describe, expect, it } from "vitest";
import { consumeRateLimit, type RateLimitConfig } from "./rate-limit.js";

interface StoredBucket {
	tokens: number;
	updated_at: number;
}

/**
 * Minimal in-memory fake of the D1 surface used by `consumeRateLimit`. It
 * faithfully implements the insert-or-ignore, conditional consume update, and
 * rejected-request refill update used by the D1-backed limiter.
 */
class FakeRateLimitDb {
	private readonly rows = new Map<string, StoredBucket>();

	prepare(sql: string) {
		const db = this;
		return {
			bind(...bindings: unknown[]) {
				return {
					async first<T>() {
						throw new Error(`unexpected first() for: ${sql}`) as T;
					},
					async run<T>() {
						if (sql.includes("INSERT OR IGNORE")) {
							const [key, tokens, updatedAt] = bindings as [string, number, number];
							if (db.rows.has(key)) {
								return { success: true, meta: { changes: 0 } } as T;
							}
							db.rows.set(key, { tokens, updated_at: updatedAt });
							return { success: true, meta: { changes: 1 } } as T;
						}

						if (sql.includes("UPDATE marketing_rate_limits")) {
							if (bindings.length === 10) {
								const [
									limit,
									now,
									windowMs,
									refillLimit,
									updatedAt,
									key,
									whereLimit,
									whereNow,
									whereWindowMs,
									whereRefillLimit,
								] = bindings as [
									number,
									number,
									number,
									number,
									number,
									string,
									number,
									number,
									number,
									number,
								];
								// The WHERE-clause refill guard must be bound with the same
								// parameters as the SET clause; a bind-order regression there
								// would let the atomic consume admit or reject on mismatched math.
								expect(whereLimit).toBe(limit);
								expect(whereNow).toBe(now);
								expect(whereWindowMs).toBe(windowMs);
								expect(whereRefillLimit).toBe(refillLimit);
								const row = db.rows.get(key);
								if (!row) return { success: true, meta: { changes: 0 } } as T;
								const tokens = Math.min(
									limit,
									row.tokens + ((Math.max(0, now - row.updated_at) * 1.0) / windowMs) * refillLimit,
								);
								if (tokens < 1) return { success: true, meta: { changes: 0 } } as T;
								db.rows.set(key, { tokens: tokens - 1, updated_at: updatedAt });
								return { success: true, meta: { changes: 1 } } as T;
							}

							const [limit, now, windowMs, refillLimit, updatedAt, key] = bindings as [
								number,
								number,
								number,
								number,
								number,
								string,
							];
							const row = db.rows.get(key);
							if (!row) return { success: true, meta: { changes: 0 } } as T;
							const tokens = Math.min(
								limit,
								row.tokens + ((Math.max(0, now - row.updated_at) * 1.0) / windowMs) * refillLimit,
							);
							db.rows.set(key, { tokens, updated_at: updatedAt });
							return { success: true, meta: { changes: 1 } } as T;
						}

						if (!sql.includes("INSERT")) {
							throw new Error(`unexpected run() for: ${sql}`);
						}
						throw new Error(`unexpected insert for: ${sql}`) as T;
					},
				};
			},
		};
	}

	peek(key: string): StoredBucket | undefined {
		return this.rows.get(key);
	}
}

const config: RateLimitConfig = { limit: 3, windowMs: 10_000 };

describe("consumeRateLimit", () => {
	it("allows up to `limit` requests then rejects within the window", async () => {
		const db = new FakeRateLimitDb() as unknown as D1Database;
		const fake = db as unknown as FakeRateLimitDb;
		const start = 1_000_000;

		expect(await consumeRateLimit(db, "k", config, start)).toBe(true);
		expect(await consumeRateLimit(db, "k", config, start)).toBe(true);
		expect(await consumeRateLimit(db, "k", config, start)).toBe(true);
		expect(await consumeRateLimit(db, "k", config, start)).toBe(false);

		// The rejected path still persisted the (refilled) bucket state.
		expect(fake.peek("k")?.updated_at).toBe(start);
	});

	it("banks partial refill credit on a rejected request rather than discarding it", async () => {
		const db = new FakeRateLimitDb() as unknown as D1Database;
		const fake = db as unknown as FakeRateLimitDb;
		const start = 1_500_000;

		for (let i = 0; i < config.limit; i += 1) {
			expect(await consumeRateLimit(db, "k", config, start)).toBe(true);
		}
		// Bucket is empty; a tenth of the window later refills 0.3 of a token —
		// still below 1, so the request is rejected.
		const later = start + config.windowMs / 10;
		expect(await consumeRateLimit(db, "k", config, later)).toBe(false);

		// The rejected request must persist the fractional credit it accrued so it
		// is not lost (no per-request credit leak, and no manufactured credit).
		const expectedCredit = (config.windowMs / 10 / config.windowMs) * config.limit;
		expect(fake.peek("k")?.tokens).toBeCloseTo(expectedCredit, 5);
		expect(fake.peek("k")?.updated_at).toBe(later);
	});

	it("refills over time and allows again after the window elapses", async () => {
		const db = new FakeRateLimitDb() as unknown as D1Database;
		const start = 2_000_000;

		for (let i = 0; i < config.limit; i += 1) {
			expect(await consumeRateLimit(db, "k", config, start)).toBe(true);
		}
		expect(await consumeRateLimit(db, "k", config, start)).toBe(false);

		// Just past one third of the window refills a little over one token.
		const later = start + Math.ceil(config.windowMs / config.limit) + 1;
		expect(await consumeRateLimit(db, "k", config, later)).toBe(true);
		expect(await consumeRateLimit(db, "k", config, later)).toBe(false);
	});

	it("caps refill at the bucket capacity", async () => {
		const db = new FakeRateLimitDb() as unknown as D1Database;
		const fake = db as unknown as FakeRateLimitDb;
		const start = 3_000_000;

		expect(await consumeRateLimit(db, "k", config, start)).toBe(true);
		// A long idle period must not let tokens exceed `limit`.
		const muchLater = start + config.windowMs * 100;
		expect(await consumeRateLimit(db, "k", config, muchLater)).toBe(true);
		expect(fake.peek("k")?.tokens).toBeCloseTo(config.limit - 1, 5);
	});

	it("keys buckets independently", async () => {
		const db = new FakeRateLimitDb() as unknown as D1Database;
		const start = 4_000_000;

		for (let i = 0; i < config.limit; i += 1) {
			expect(await consumeRateLimit(db, "a", config, start)).toBe(true);
		}
		expect(await consumeRateLimit(db, "a", config, start)).toBe(false);
		// A different key has its own fresh bucket.
		expect(await consumeRateLimit(db, "b", config, start)).toBe(true);
	});

	it("uses conditional updates so token consumption is atomic after bucket creation", async () => {
		const db = new FakeRateLimitDb() as unknown as D1Database;

		expect(await consumeRateLimit(db, "k", { limit: 1, windowMs: 10_000 }, 5_000_000)).toBe(true);
		expect(await consumeRateLimit(db, "k", { limit: 1, windowMs: 10_000 }, 5_000_000)).toBe(false);
	});
});
