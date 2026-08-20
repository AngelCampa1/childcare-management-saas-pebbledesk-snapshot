import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { createSignUpRateLimit } from "../middleware/signup-rate-limit.js";

interface RateLimitState {
	count: number;
	windowStart: number;
}

function makeMockRateLimiterNamespace(): DurableObjectNamespace {
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

function buildSignUpApp(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("/api/auth/sign-up/*", createRateLimit({ windowMs: 60_000, max: 5 }));
	app.all("/api/auth/sign-up/email", (c) => c.json({ ok: true }));
	return app;
}

function buildConfiguredSignUpApp(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("/api/auth/sign-up/*", createSignUpRateLimit());
	app.all("/api/auth/sign-up/email", (c) => c.json({ ok: true }));
	return app;
}

function buildAuthReadRateLimitApp(): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	const authReadRateLimit = createRateLimit({ windowMs: 60_000, max: 300 });
	const globalRateLimit = createRateLimit({ windowMs: 60_000, max: 180 });

	app.use("/api/auth/me", authReadRateLimit);
	app.use("/api/auth/status", authReadRateLimit);
	app.use("*", async (c, next) => {
		if (c.req.path === "/api/auth/me" || c.req.path === "/api/auth/status") {
			return next();
		}

		return globalRateLimit(c, next);
	});

	app.get("/api/auth/me", (c) => c.json({ ok: true, route: "me" }));
	app.get("/api/auth/status", (c) => c.json({ ok: true, route: "status" }));
	app.get("/api/other", (c) => c.json({ ok: true, route: "other" }));

	return app;
}

describe("POST /api/auth/sign-up rate limiting", () => {
	it("allows five requests from one IP and rate-limits the sixth", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.55";
		const env = { RATE_LIMITER: ns } as unknown as Record<string, unknown>;
		const requestInit = {
			method: "POST",
			headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
			body: JSON.stringify({ email: "new@example.com", password: "hunter22hunter22" }),
		} satisfies RequestInit;

		for (let i = 0; i < 5; i++) {
			const app = buildSignUpApp();
			const res = await app.request("/api/auth/sign-up/email", requestInit, env);
			expect(res.status).toBe(200);
		}

		const app = buildSignUpApp();
		const res = await app.request("/api/auth/sign-up/email", requestInit, env);
		expect(res.status).toBe(429);
	});

	it("tracks sign-up limits independently per IP", async () => {
		const ns = makeMockRateLimiterNamespace();
		const env = { RATE_LIMITER: ns } as unknown as Record<string, unknown>;
		const ipA = "198.51.100.60";
		const ipB = "198.51.100.61";

		const makeInit = (ip: string) =>
			({
				method: "POST",
				headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
				body: JSON.stringify({ email: "a@example.com", password: "hunter22hunter22" }),
			}) satisfies RequestInit;

		for (let i = 0; i < 5; i++) {
			const app = buildSignUpApp();
			await app.request("/api/auth/sign-up/email", makeInit(ipA), env);
		}

		const blockedApp = buildSignUpApp();
		const blocked = await blockedApp.request("/api/auth/sign-up/email", makeInit(ipA), env);
		expect(blocked.status).toBe(429);

		const allowedApp = buildSignUpApp();
		const allowed = await allowedApp.request("/api/auth/sign-up/email", makeInit(ipB), env);
		expect(allowed.status).toBe(200);
	});

	it("uses a separate capped bucket for configured disposable E2E email domains", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.62";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_EMAIL_DOMAINS: "pebbledesk.test",
			E2E_SIGNUP_RATE_LIMIT_TOKEN: "test-token",
		} as unknown as Record<string, unknown>;
		const makeInit = (email: string) =>
			({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"CF-Connecting-IP": ip,
					"X-PebbleDesk-E2E-Signup": "test-token",
				},
				body: JSON.stringify({ email, password: "hunter22hunter22" }),
			}) satisfies RequestInit;

		for (let i = 0; i < 5; i++) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request(
				"/api/auth/sign-up/email",
				makeInit(`normal-${i}@example.com`),
				env,
			);
			expect(res.status).toBe(200);
		}

		const normalBlockedApp = buildConfiguredSignUpApp();
		const normalBlocked = await normalBlockedApp.request(
			"/api/auth/sign-up/email",
			makeInit("normal-blocked@example.com"),
			env,
		);
		expect(normalBlocked.status).toBe(429);

		for (let i = 0; i < 30; i++) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request(
				"/api/auth/sign-up/email",
				makeInit(`role-${i}@pebbledesk.test`),
				env,
			);
			expect(res.status).toBe(200);
		}

		const e2eBlockedApp = buildConfiguredSignUpApp();
		const e2eBlocked = await e2eBlockedApp.request(
			"/api/auth/sign-up/email",
			makeInit("role-blocked@pebbledesk.test"),
			env,
		);
		expect(e2eBlocked.status).toBe(429);
	});

	it("keeps configured disposable E2E domains in the normal bucket without the E2E token", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.67";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_EMAIL_DOMAINS: "pebbledesk.test",
			E2E_SIGNUP_RATE_LIMIT_TOKEN: "test-token",
		} as unknown as Record<string, unknown>;
		const makeInit = (token?: string) =>
			({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"CF-Connecting-IP": ip,
					...(token ? { "X-PebbleDesk-E2E-Signup": token } : {}),
				},
				body: JSON.stringify({ email: "role@pebbledesk.test", password: "hunter22hunter22" }),
			}) satisfies RequestInit;

		for (const token of [undefined, "wrong-token", undefined, "wrong-token", undefined]) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request("/api/auth/sign-up/email", makeInit(token), env);
			expect(res.status).toBe(200);
		}

		const app = buildConfiguredSignUpApp();
		const blocked = await app.request("/api/auth/sign-up/email", makeInit(), env);
		expect(blocked.status).toBe(429);
	});

	it("keeps configured disposable E2E domains in the normal bucket when the token is blank", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.69";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_EMAIL_DOMAINS: "pebbledesk.test",
			E2E_SIGNUP_RATE_LIMIT_TOKEN: " ",
		} as unknown as Record<string, unknown>;
		const requestInit = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"CF-Connecting-IP": ip,
				"X-PebbleDesk-E2E-Signup": "anything",
			},
			body: JSON.stringify({ email: "role@pebbledesk.test", password: "hunter22hunter22" }),
		} satisfies RequestInit;

		for (let i = 0; i < 5; i++) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request("/api/auth/sign-up/email", requestInit, env);
			expect(res.status).toBe(200);
		}

		const app = buildConfiguredSignUpApp();
		const blocked = await app.request("/api/auth/sign-up/email", requestInit, env);
		expect(blocked.status).toBe(429);
	});

	it("uses the E2E bucket for configured form-encoded signup emails with the E2E token", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.68";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_EMAIL_DOMAINS: "pebbledesk.test",
			E2E_SIGNUP_RATE_LIMIT_TOKEN: "test-token",
		} as unknown as Record<string, unknown>;
		const makeInit = (email: string) =>
			({
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"CF-Connecting-IP": ip,
					"X-PebbleDesk-E2E-Signup": "test-token",
				},
				body: new URLSearchParams({ email, password: "hunter22hunter22" }).toString(),
			}) satisfies RequestInit;

		for (let i = 0; i < 30; i++) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request(
				"/api/auth/sign-up/email",
				makeInit(`role-form-${i}@pebbledesk.test`),
				env,
			);
			expect(res.status).toBe(200);
		}

		const app = buildConfiguredSignUpApp();
		const blocked = await app.request(
			"/api/auth/sign-up/email",
			makeInit("role-form-blocked@pebbledesk.test"),
			env,
		);
		expect(blocked.status).toBe(429);
	});

	it("matches configured E2E domains case-insensitively after trimming email whitespace", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.71";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_EMAIL_DOMAINS: " PebbleDesk.Test ",
			E2E_SIGNUP_RATE_LIMIT_TOKEN: "test-token",
		} as unknown as Record<string, unknown>;
		const makeInit = (email: string) =>
			({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"CF-Connecting-IP": ip,
					"X-PebbleDesk-E2E-Signup": "test-token",
				},
				body: JSON.stringify({ email, password: "hunter22hunter22" }),
			}) satisfies RequestInit;

		for (let i = 0; i < 30; i++) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request(
				"/api/auth/sign-up/email",
				makeInit(` Role-${i}@PEBBLEDESK.TEST `),
				env,
			);
			expect(res.status).toBe(200);
		}

		const app = buildConfiguredSignUpApp();
		const blocked = await app.request(
			"/api/auth/sign-up/email",
			makeInit(" Role-Blocked@PEBBLEDESK.TEST "),
			env,
		);
		expect(blocked.status).toBe(429);
	});

	it("keeps disposable-looking domains in the normal bucket when no E2E domain is configured", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.63";
		const env = { RATE_LIMITER: ns } as unknown as Record<string, unknown>;
		const makeInit = (email: string) =>
			({
				method: "POST",
				headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
				body: JSON.stringify({ email, password: "hunter22hunter22" }),
			}) satisfies RequestInit;

		for (let i = 0; i < 5; i++) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request(
				"/api/auth/sign-up/email",
				makeInit(`role-${i}@pebbledesk.test`),
				env,
			);
			expect(res.status).toBe(200);
		}

		const app = buildConfiguredSignUpApp();
		const blocked = await app.request(
			"/api/auth/sign-up/email",
			makeInit("role-blocked@pebbledesk.test"),
			env,
		);
		expect(blocked.status).toBe(429);
	});

	it("keeps invalid sign-up payloads in the normal bucket even when E2E domains are configured", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.64";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_RATE_LIMIT_TOKEN: "test-token",
			E2E_SIGNUP_EMAIL_DOMAINS: " pebbledesk.test , ",
		} as unknown as Record<string, unknown>;
		const requestInit = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"CF-Connecting-IP": ip,
				"X-PebbleDesk-E2E-Signup": "test-token",
			},
			body: "{not-json",
		} satisfies RequestInit;

		for (let i = 0; i < 5; i++) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request("/api/auth/sign-up/email", requestInit, env);
			expect(res.status).toBe(200);
		}

		const app = buildConfiguredSignUpApp();
		const blocked = await app.request("/api/auth/sign-up/email", requestInit, env);
		expect(blocked.status).toBe(429);
	});

	it("keeps non-object JSON sign-up payloads in the normal bucket", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.65";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_EMAIL_DOMAINS: "pebbledesk.test",
			E2E_SIGNUP_RATE_LIMIT_TOKEN: "test-token",
		} as unknown as Record<string, unknown>;
		const requestInit = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"CF-Connecting-IP": ip,
				"X-PebbleDesk-E2E-Signup": "test-token",
			},
			body: JSON.stringify(["role@pebbledesk.test"]),
		} satisfies RequestInit;

		for (let i = 0; i < 5; i++) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request("/api/auth/sign-up/email", requestInit, env);
			expect(res.status).toBe(200);
		}

		const app = buildConfiguredSignUpApp();
		const blocked = await app.request("/api/auth/sign-up/email", requestInit, env);
		expect(blocked.status).toBe(429);
	});

	it("keeps unsupported content types and form payloads without email in the normal bucket", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.70";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_EMAIL_DOMAINS: "pebbledesk.test",
			E2E_SIGNUP_RATE_LIMIT_TOKEN: "test-token",
		} as unknown as Record<string, unknown>;
		const makeInit = (contentType: string | null, body: string) =>
			({
				method: "POST",
				headers: {
					...(contentType ? { "Content-Type": contentType } : {}),
					"CF-Connecting-IP": ip,
					"X-PebbleDesk-E2E-Signup": "test-token",
				},
				body,
			}) satisfies RequestInit;

		for (const requestInit of [
			makeInit("text/plain", "email=role@pebbledesk.test"),
			makeInit(
				"application/x-www-form-urlencoded",
				new URLSearchParams({ name: "E2E" }).toString(),
			),
			makeInit("text/plain", "role@pebbledesk.test"),
			makeInit(
				"application/x-www-form-urlencoded",
				new URLSearchParams({ password: "x" }).toString(),
			),
			makeInit(null, ""),
		]) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request("/api/auth/sign-up/email", requestInit, env);
			expect(res.status).toBe(200);
		}

		const app = buildConfiguredSignUpApp();
		const blocked = await app.request(
			"/api/auth/sign-up/email",
			makeInit("text/plain", "blocked"),
			env,
		);
		expect(blocked.status).toBe(429);
	});

	it("keeps malformed email values in the normal bucket", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.66";
		const env = {
			RATE_LIMITER: ns,
			E2E_SIGNUP_EMAIL_DOMAINS: "pebbledesk.test",
			E2E_SIGNUP_RATE_LIMIT_TOKEN: "test-token",
		} as unknown as Record<string, unknown>;
		const makeInit = (email: unknown) =>
			({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"CF-Connecting-IP": ip,
					"X-PebbleDesk-E2E-Signup": "test-token",
				},
				body: JSON.stringify({ email, password: "hunter22hunter22" }),
			}) satisfies RequestInit;

		for (const email of [
			123,
			"role-without-domain",
			"role@",
			"@pebbledesk.test",
			"attacker@pebbledesk.test@example.com",
		]) {
			const app = buildConfiguredSignUpApp();
			const res = await app.request("/api/auth/sign-up/email", makeInit(email), env);
			expect(res.status).toBe(200);
		}

		const blockedApp = buildConfiguredSignUpApp();
		const blocked = await blockedApp.request(
			"/api/auth/sign-up/email",
			makeInit("blocked@other.test"),
			env,
		);
		expect(blocked.status).toBe(429);
	});
});

describe("GET /api/auth session reads rate limiting", () => {
	it("allows auth session reads past the broader global bucket", async () => {
		const ns = makeMockRateLimiterNamespace();
		const env = { RATE_LIMITER: ns } as unknown as Record<string, unknown>;
		const requestInit = {
			method: "GET",
			headers: { "CF-Connecting-IP": "198.51.100.70" },
		} satisfies RequestInit;

		for (let i = 0; i < 181; i++) {
			const app = buildAuthReadRateLimitApp();
			const res = await app.request("/api/auth/me", requestInit, env);
			expect(res.status).toBe(200);
		}
	});

	it("still rate-limits auth session reads with the higher dedicated bucket", async () => {
		const ns = makeMockRateLimiterNamespace();
		const env = { RATE_LIMITER: ns } as unknown as Record<string, unknown>;
		const requestInit = {
			method: "GET",
			headers: { "CF-Connecting-IP": "198.51.100.71" },
		} satisfies RequestInit;

		for (let i = 0; i < 300; i++) {
			const app = buildAuthReadRateLimitApp();
			const res = await app.request("/api/auth/status", requestInit, env);
			expect(res.status).toBe(200);
		}

		const app = buildAuthReadRateLimitApp();
		const res = await app.request("/api/auth/status", requestInit, env);
		expect(res.status).toBe(429);
	});

	it("keeps the broader global bucket on non-auth routes", async () => {
		const ns = makeMockRateLimiterNamespace();
		const env = { RATE_LIMITER: ns } as unknown as Record<string, unknown>;
		const requestInit = {
			method: "GET",
			headers: { "CF-Connecting-IP": "198.51.100.72" },
		} satisfies RequestInit;

		for (let i = 0; i < 180; i++) {
			const app = buildAuthReadRateLimitApp();
			const res = await app.request("/api/other", requestInit, env);
			expect(res.status).toBe(200);
		}

		const app = buildAuthReadRateLimitApp();
		const res = await app.request("/api/other", requestInit, env);
		expect(res.status).toBe(429);
	});
});
