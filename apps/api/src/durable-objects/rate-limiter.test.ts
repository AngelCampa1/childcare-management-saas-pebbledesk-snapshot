import { describe, expect, it } from "vitest";
import { RateLimiterDO } from "./rate-limiter.js";

// ---------------------------------------------------------------------------
// In-memory storage mock for DurableObject ctx
// ---------------------------------------------------------------------------

function makeCtx() {
	const storage = new Map<string, unknown>();
	return {
		storage: {
			get: <T>(key: string): Promise<T | undefined> =>
				Promise.resolve(storage.get(key) as T | undefined),
			put: (key: string, value: unknown): Promise<void> => {
				storage.set(key, value);
				return Promise.resolve();
			},
			delete: (key: string): Promise<void> => {
				storage.delete(key);
				return Promise.resolve();
			},
		},
	};
}

function makeDO() {
	const ctx = makeCtx();
	// RateLimiterDO extends DurableObject — which is aliased to the stub class in
	// vitest (cloudflare:workers → src/__stubs__/cloudflare-workers.ts).
	// The stub constructor stores ctx on this.ctx, so we can pass our mock directly.
	const instance = new RateLimiterDO(ctx as never, {});
	return instance;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RateLimiterDO.checkLimit", () => {
	it("allows the first request (fresh key, no prior state)", async () => {
		const do_ = makeDO();
		const result = await do_.checkLimit("test-key", 5, 60_000);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(4);
		expect(result.resetAt).toBeGreaterThan(Date.now());
	});

	it("decrements remaining on each successive allowed request", async () => {
		const do_ = makeDO();
		const limit = 3;
		const window = 60_000;

		const r1 = await do_.checkLimit("key", limit, window);
		expect(r1.allowed).toBe(true);
		expect(r1.remaining).toBe(2);

		const r2 = await do_.checkLimit("key", limit, window);
		expect(r2.allowed).toBe(true);
		expect(r2.remaining).toBe(1);

		const r3 = await do_.checkLimit("key", limit, window);
		expect(r3.allowed).toBe(true);
		expect(r3.remaining).toBe(0);
	});

	it("blocks the request once limit is reached", async () => {
		const do_ = makeDO();
		const limit = 2;
		const window = 60_000;

		await do_.checkLimit("blocked-key", limit, window);
		await do_.checkLimit("blocked-key", limit, window);

		const result = await do_.checkLimit("blocked-key", limit, window);
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it("returns remaining=0 and allowed=false on every call past the limit", async () => {
		const do_ = makeDO();

		await do_.checkLimit("over-limit", 1, 60_000);
		// second call hits the limit
		const r2 = await do_.checkLimit("over-limit", 1, 60_000);
		expect(r2.allowed).toBe(false);
		expect(r2.remaining).toBe(0);

		// third call is also blocked
		const r3 = await do_.checkLimit("over-limit", 1, 60_000);
		expect(r3.allowed).toBe(false);
		expect(r3.remaining).toBe(0);
	});

	it("resets the counter after the window expires", async () => {
		const do_ = makeDO();

		// Use a very small window so we can expire it
		await do_.checkLimit("reset-key", 1, 1);
		const blocked = await do_.checkLimit("reset-key", 1, 1);
		expect(blocked.allowed).toBe(false);

		// Wait for window to expire
		await new Promise((r) => setTimeout(r, 10));

		const result = await do_.checkLimit("reset-key", 1, 1);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(0);
	});

	it("resets the window start and count when window has expired", async () => {
		const do_ = makeDO();
		const limit = 5;
		// 1ms window — expires almost immediately
		const tinyWindow = 1;

		// Make one call to establish a windowStart
		await do_.checkLimit("expire-key", limit, tinyWindow);
		// Wait long enough for that 1ms window to expire
		await new Promise((r) => setTimeout(r, 20));

		// Now call with the same tinyWindow — the check (now - windowStart > 1) fires
		// and the counter resets: count→1, remaining = limit-1 = 4
		const fresh = await do_.checkLimit("expire-key", limit, tinyWindow);
		expect(fresh.allowed).toBe(true);
		expect(fresh.remaining).toBe(limit - 1);
	});

	it("tracks different keys independently", async () => {
		const do_ = makeDO();
		const limit = 1;
		const window = 60_000;

		await do_.checkLimit("key-a", limit, window);
		const resultA = await do_.checkLimit("key-a", limit, window);
		expect(resultA.allowed).toBe(false);

		// key-b is independent — not exhausted yet
		const resultB = await do_.checkLimit("key-b", limit, window);
		expect(resultB.allowed).toBe(true);
	});

	it("returns a resetAt in the future equal to windowStart + windowMs", async () => {
		const do_ = makeDO();
		const windowMs = 10_000;
		const before = Date.now();
		const result = await do_.checkLimit("timing-key", 5, windowMs);
		const after = Date.now();

		expect(result.resetAt).toBeGreaterThanOrEqual(before + windowMs);
		expect(result.resetAt).toBeLessThanOrEqual(after + windowMs);
	});

	it("resetAt is consistent across calls in the same window", async () => {
		const do_ = makeDO();
		const windowMs = 60_000;

		const r1 = await do_.checkLimit("consistent-key", 5, windowMs);
		const r2 = await do_.checkLimit("consistent-key", 5, windowMs);

		// Both calls are in the same window so they share windowStart
		expect(r2.resetAt).toBe(r1.resetAt);
	});

	it("remaining is 0 when limit=1 and first call consumes it", async () => {
		const do_ = makeDO();
		const result = await do_.checkLimit("one-shot", 1, 60_000);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(0);
	});

	it("allowed=false and remaining=0 immediately when limit=0", async () => {
		const do_ = makeDO();
		// Edge case: a limit of 0 means every request is blocked.
		// count (0) >= limit (0) → blocked on the very first call.
		const result = await do_.checkLimit("zero-limit", 0, 60_000);
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});
});
