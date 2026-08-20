import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createRateLimit } from "./rate-limit.js";

// ---------------------------------------------------------------------------
// In-memory DO stub — simulates the Durable Object storage per-key state
// ---------------------------------------------------------------------------

interface RateLimitState {
	count: number;
	windowStart: number;
}

function makeMockRateLimiterNamespace(): DurableObjectNamespace {
	// Each DO instance gets its own storage Map keyed by the DO name
	const instances = new Map<string, Map<string, RateLimitState>>();

	function getStorage(name: string): Map<string, RateLimitState> {
		if (!instances.has(name)) instances.set(name, new Map());
		return instances.get(name) as Map<string, RateLimitState>;
	}

	const makeStub = (name: string) => ({
		checkLimit: async (
			key: string,
			limit: number,
			windowMs: number,
		): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
			const storage = getStorage(name);
			const now = Date.now();
			const stored = storage.get(key);
			const windowStart = stored?.windowStart ?? now;
			const count = stored?.count ?? 0;

			if (now - windowStart > windowMs) {
				storage.set(key, { count: 1, windowStart: now });
				return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
			}

			const resetAt = windowStart + windowMs;

			if (count >= limit) {
				return { allowed: false, remaining: 0, resetAt };
			}

			storage.set(key, { count: count + 1, windowStart });
			return { allowed: true, remaining: limit - count - 1, resetAt };
		},
	});

	return {
		newUniqueId: () => ({ toString: () => "unique-id" }) as DurableObjectId,
		idFromName: (name: string) => ({ toString: () => name, name }) as DurableObjectId,
		idFromString: (id: string) => ({ toString: () => id }) as DurableObjectId,
		get: (id: DurableObjectId) => makeStub(id.toString()) as unknown as DurableObjectStub,
		jurisdiction: () => ({}) as DurableObjectNamespace,
	} as unknown as DurableObjectNamespace;
}

// ---------------------------------------------------------------------------
// Helper to build a test Hono app with the DO-backed rate limiter
// ---------------------------------------------------------------------------

type TestEnv = AppEnv & { Bindings: AppEnv["Bindings"] & { RATE_LIMITER: DurableObjectNamespace } };

function buildApp(
	windowMs: number,
	max: number,
	_namespace: DurableObjectNamespace,
): Hono<TestEnv> {
	const app = new Hono<TestEnv>();
	app.use("*", createRateLimit({ windowMs, max }));
	app.get("/ping", (c) => c.json({ ok: true }));
	return app;
}

function makeEnv(namespace: DurableObjectNamespace) {
	return {
		RATE_LIMITER: namespace as unknown as TestEnv["Bindings"]["RATE_LIMITER"],
		DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
		BETTER_AUTH_SECRET: "secret",
		BETTER_AUTH_URL: "http://localhost:8790",
		GOOGLE_CLIENT_ID: "id",
		GOOGLE_CLIENT_SECRET: "secret",
		APP_URL: "http://localhost:3040",
		PUBLIC_LINK_SECRET: "secret",
		RESEND_API_KEY: "re_test",
		RESEND_FROM_EMAIL: "test@test.com",
		MARKETING_FROM_EMAIL: "hello@test.com",
		R2_PUBLIC_URL: "https://cdn.test.com",
		UNSUBSCRIBE_SECRET: "secret",
		QB_TOKEN_ENC_KEY: "a-valid-32-char-enc-key-padded!!",
		STRIPE_PUBLISHABLE_KEY: "pk_test",
		STRIPE_SECRET_KEY: "sk_test",
		STRIPE_WEBHOOK_SECRET: "whsec_test",
		STRIPE_PRICE_HOME_MONTHLY: "price_test",
		STRIPE_PRICE_HOME_ANNUAL: "price_test",
		STRIPE_PRICE_CENTER_STARTER_MONTHLY: "price_test",
		STRIPE_PRICE_CENTER_STARTER_ANNUAL: "price_test",
		STRIPE_PRICE_CENTER_PRO_MONTHLY: "price_test",
		STRIPE_PRICE_CENTER_PRO_ANNUAL: "price_test",
		STRIPE_PRICE_GROUP_MONTHLY: "price_test",
		STRIPE_PRICE_GROUP_ANNUAL: "price_test",
		STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: "whsec_test",
		QUICKBOOKS_CLIENT_ID: "qb_id",
		QUICKBOOKS_CLIENT_SECRET: "qb_secret",
		QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
	} as unknown as TestEnv["Bindings"];
}

function req(ip: string, path = "/ping") {
	return new Request(`http://localhost${path}`, {
		headers: { "x-forwarded-for": ip },
	});
}

function cfReq(cfIp: string, path = "/ping") {
	return new Request(`http://localhost${path}`, {
		headers: { "cf-connecting-ip": cfIp },
	});
}

function bothReq(cfIp: string, xfwdIp: string, path = "/ping") {
	return new Request(`http://localhost${path}`, {
		headers: { "cf-connecting-ip": cfIp, "x-forwarded-for": xfwdIp },
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRateLimit (Durable Object-backed)", () => {
	it("allows requests under the limit", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 5, ns);
		const env = makeEnv(ns);

		const res = await app.request(req("10.0.0.1"), {}, env);
		expect(res.status).toBe(200);
	});

	it("returns 429 when the limit is exceeded", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 2, ns);
		const env = makeEnv(ns);

		await app.request(req("10.0.0.2"), {}, env);
		await app.request(req("10.0.0.2"), {}, env);

		const res = await app.request(req("10.0.0.2"), {}, env);
		expect(res.status).toBe(429);
	});

	it("includes Retry-After header on 429 response", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 1, ns);
		const env = makeEnv(ns);

		await app.request(req("10.0.0.3"), {}, env);
		const res = await app.request(req("10.0.0.3"), {}, env);

		expect(res.status).toBe(429);
		const retryAfter = Number(res.headers.get("retry-after"));
		expect(retryAfter).toBeGreaterThan(0);
	});

	it("returns 429 error body with default JSON message", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 1, ns);
		const env = makeEnv(ns);

		await app.request(req("10.0.0.4"), {}, env);
		const res = await app.request(req("10.0.0.4"), {}, env);

		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Rate limit exceeded");
	});

	it("returns custom message when message option is provided", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = new Hono<TestEnv>();
		app.use("*", createRateLimit({ windowMs: 60_000, max: 1, message: "too_many_requests" }));
		app.get("/ping", (c) => c.json({ ok: true }));
		const env = makeEnv(ns);

		await app.request(req("10.0.0.41"), {}, env);
		const res = await app.request(req("10.0.0.41"), {}, env);

		expect(res.status).toBe(429);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("too_many_requests");
	});

	it("tracks clients separately by IP address", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 1, ns);
		const env = makeEnv(ns);

		await app.request(req("10.0.0.5"), {}, env);
		const clientA = await app.request(req("10.0.0.5"), {}, env);
		expect(clientA.status).toBe(429);

		const clientB = await app.request(req("10.0.0.6"), {}, env);
		expect(clientB.status).toBe(200);
	});

	it("uses CF-Connecting-IP header when X-Forwarded-For is absent", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 1, ns);
		const env = makeEnv(ns);

		await app.request(cfReq("10.0.0.7"), {}, env);
		const res = await app.request(cfReq("10.0.0.7"), {}, env);
		expect(res.status).toBe(429);
	});

	it("prefers CF-Connecting-IP over X-Forwarded-For when both are present", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 1, ns);
		const env = makeEnv(ns);

		await app.request(bothReq("10.0.0.8", "10.0.0.99"), {}, env);
		// Second request with same CF IP should be rate-limited
		const res = await app.request(bothReq("10.0.0.8", "10.0.0.99"), {}, env);
		expect(res.status).toBe(429);
	});

	it("extracts the first IP from comma-separated X-Forwarded-For list", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 1, ns);
		const env = makeEnv(ns);

		const multiReq = (path = "/ping") =>
			new Request(`http://localhost${path}`, {
				headers: { "x-forwarded-for": "10.0.0.9, 192.168.1.1" },
			});

		await app.request(multiReq(), {}, env);
		const res = await app.request(multiReq(), {}, env);
		expect(res.status).toBe(429);
	});

	it("falls back to 'unknown' key when no IP headers are present", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(60_000, 1, ns);
		const env = makeEnv(ns);

		await app.request(new Request("http://localhost/ping"), {}, env);
		const res = await app.request(new Request("http://localhost/ping"), {}, env);
		expect(res.status).toBe(429);
	});

	it("resets the counter after the window expires", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = buildApp(50, 1, ns);
		const env = makeEnv(ns);

		await app.request(req("10.0.0.10"), {}, env);
		const limited = await app.request(req("10.0.0.10"), {}, env);
		expect(limited.status).toBe(429);

		// Wait for the window to expire
		await new Promise((r) => setTimeout(r, 60));

		const res = await app.request(req("10.0.0.10"), {}, env);
		expect(res.status).toBe(200);
	});

	it("allows exactly `max` requests before blocking", async () => {
		const ns = makeMockRateLimiterNamespace();
		const max = 3;
		const app = buildApp(60_000, max, ns);
		const env = makeEnv(ns);
		const ip = "10.1.0.1";

		for (let i = 0; i < max; i++) {
			const r = await app.request(req(ip), {}, env);
			expect(r.status).toBe(200);
		}

		const blocked = await app.request(req(ip), {}, env);
		expect(blocked.status).toBe(429);
	});

	it("returns correct Retry-After value that reflects remaining window time", async () => {
		const ns = makeMockRateLimiterNamespace();
		const windowMs = 10_000;
		const app = buildApp(windowMs, 1, ns);
		const env = makeEnv(ns);

		const before = Date.now();
		await app.request(req("10.1.0.2"), {}, env);
		const res = await app.request(req("10.1.0.2"), {}, env);
		const after = Date.now();

		expect(res.status).toBe(429);
		const retryAfter = Number(res.headers.get("retry-after"));
		const maxExpectedSeconds = Math.ceil(windowMs / 1000);
		const minExpectedSeconds = Math.floor((windowMs - (after - before)) / 1000);
		expect(retryAfter).toBeGreaterThanOrEqual(minExpectedSeconds);
		expect(retryAfter).toBeLessThanOrEqual(maxExpectedSeconds);
	});

	it("two separate rate limiters with distinct namespaces operate independently", async () => {
		const nsA = makeMockRateLimiterNamespace();
		const nsB = makeMockRateLimiterNamespace();

		const appA = new Hono<TestEnv>();
		appA.use("*", createRateLimit({ windowMs: 60_000, max: 1 }));
		appA.get("/ping", (c) => c.json({ ok: true }));

		const appB = new Hono<TestEnv>();
		appB.use("*", createRateLimit({ windowMs: 60_000, max: 5 }));
		appB.get("/ping", (c) => c.json({ ok: true }));

		const ip = "10.1.0.3";

		await appA.request(req(ip), {}, makeEnv(nsA));
		const resA = await appA.request(req(ip), {}, makeEnv(nsA));
		expect(resA.status).toBe(429);

		const resB = await appB.request(req(ip), {}, makeEnv(nsB));
		expect(resB.status).toBe(200);
	});

	it("passes through when RATE_LIMITER binding is absent", async () => {
		const app = new Hono<TestEnv>();
		app.use("*", createRateLimit({ windowMs: 60_000, max: 10 }));
		app.get("/", (c) => c.text("ok"));

		const request = new Request("http://localhost/", {
			headers: { "CF-Connecting-IP": "1.2.3.4" },
		});
		// Pass env without RATE_LIMITER — middleware must fall through to next()
		const env = {} as TestEnv["Bindings"];
		const res = await app.fetch(request, env);
		expect(res.status).toBe(200);
	});

	it("two separate rate limiters sharing the same DO namespace stay isolated by limit settings", async () => {
		const ns = makeMockRateLimiterNamespace();

		const appA = new Hono<TestEnv>();
		appA.use("*", createRateLimit({ windowMs: 60_000, max: 1 }));
		appA.get("/ping", (c) => c.json({ ok: true }));

		const appB = new Hono<TestEnv>();
		appB.use("*", createRateLimit({ windowMs: 60_000, max: 5 }));
		appB.get("/ping", (c) => c.json({ ok: true }));

		const ip = "10.1.0.4";
		const envA = makeEnv(ns);
		const envB = makeEnv(ns);

		await appA.request(req(ip), {}, envA);
		const resA = await appA.request(req(ip), {}, envA);
		expect(resA.status).toBe(429);

		// App B has max=5, so even with shared namespace it should still be allowed
		const resB = await appB.request(req(ip), {}, envB);
		expect(resB.status).toBe(200);
	});

	it("keeps named buckets isolated when they share the same limit settings and IP", async () => {
		const ns = makeMockRateLimiterNamespace();

		const appA = new Hono<TestEnv>();
		appA.use("*", createRateLimit({ windowMs: 60_000, max: 1, bucket: "signup-e2e" }));
		appA.get("/ping", (c) => c.json({ ok: true }));

		const appB = new Hono<TestEnv>();
		appB.use("*", createRateLimit({ windowMs: 60_000, max: 1, bucket: "public-invoices" }));
		appB.get("/ping", (c) => c.json({ ok: true }));

		const ip = "10.1.0.5";
		const env = makeEnv(ns);

		await appA.request(req(ip), {}, env);
		const blockedA = await appA.request(req(ip), {}, env);
		expect(blockedA.status).toBe(429);

		const stillAllowedB = await appB.request(req(ip), {}, env);
		expect(stillAllowedB.status).toBe(200);
	});
});

describe("public-invoice-pi limiter (10/min/IP)", () => {
	it("allows up to 10 payment-intent requests before blocking", async () => {
		const ns = makeMockRateLimiterNamespace();
		const app = new Hono<TestEnv>();
		app.use(
			"/api/public/invoices/:token/payment-intent",
			createRateLimit({ windowMs: 60_000, max: 10, bucket: "public-invoice-pi" }),
		);
		app.post("/api/public/invoices/:token/payment-intent", (c) => c.json({ ok: true }));
		const env = makeEnv(ns);
		const ip = "10.2.0.1";
		const piReq = () =>
			new Request("http://localhost/api/public/invoices/tok123/payment-intent", {
				method: "POST",
				headers: { "x-forwarded-for": ip },
			});

		for (let i = 0; i < 10; i++) {
			const r = await app.request(piReq(), {}, env);
			expect(r.status).toBe(200);
		}

		const blocked = await app.request(piReq(), {}, env);
		expect(blocked.status).toBe(429);
	});

	it("does not affect GET requests on the broader invoices path with its own bucket", async () => {
		const ns = makeMockRateLimiterNamespace();

		const piApp = new Hono<TestEnv>();
		piApp.use(
			"/api/public/invoices/:token/payment-intent",
			createRateLimit({ windowMs: 60_000, max: 10, bucket: "public-invoice-pi" }),
		);
		piApp.post("/api/public/invoices/:token/payment-intent", (c) => c.json({ ok: true }));

		const broadApp = new Hono<TestEnv>();
		broadApp.use(
			"/api/public/invoices/*",
			createRateLimit({ windowMs: 60_000, max: 30, bucket: "public-invoices" }),
		);
		broadApp.get("/api/public/invoices/:token", (c) => c.json({ ok: true }));

		const env = makeEnv(ns);
		const ip = "10.2.0.2";

		// Exhaust payment-intent limit
		for (let i = 0; i < 10; i++) {
			await piApp.request(
				new Request("http://localhost/api/public/invoices/tok/payment-intent", {
					method: "POST",
					headers: { "x-forwarded-for": ip },
				}),
				{},
				env,
			);
		}

		// Broad GET path uses separate bucket and must remain unblocked
		const getRes = await broadApp.request(
			new Request("http://localhost/api/public/invoices/tok", {
				headers: { "x-forwarded-for": ip },
			}),
			{},
			env,
		);
		expect(getRes.status).toBe(200);
	});
});
