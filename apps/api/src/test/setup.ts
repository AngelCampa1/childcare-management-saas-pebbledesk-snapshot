import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Bindings, Variables } from "../lib/context.js";

type MockDb = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	transaction: ReturnType<typeof vi.fn>;
};

/**
 * Default bindings injected into every test request so that route handlers
 * can access `c.env.XYZ` without optional-chaining. Individual tests may
 * override specific fields by passing the third `env` argument to
 * `app.request(url, init, overrides)`.
 */
export const testBindings: Bindings = {
	BETTER_AUTH_SECRET: "test-secret",
	BETTER_AUTH_URL: "http://localhost:8790",
	APP_URL: "http://localhost:3040",
	PUBLIC_LINK_SECRET: "test-public-link-secret",
	GOOGLE_CLIENT_ID: "test-google-client-id",
	GOOGLE_CLIENT_SECRET: "test-google-client-secret",
	RESEND_API_KEY: "re_test_key",
	RESEND_FROM_EMAIL: "test@pebbledesk.test",
	RESEND_WEBHOOK_SECRET: "whsec_dGVzdF9zZWNyZXQ=",
	RESEND_INBOUND_REPLY_DOMAIN: "pebbledesk.test",
	STRIPE_SECRET_KEY: "sk_test_key",
	STRIPE_PUBLISHABLE_KEY: "pk_test_key",
	STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
	STRIPE_PRICE_HOME_MONTHLY: "price_test_home_monthly",
	STRIPE_PRICE_HOME_ANNUAL: "price_test_home_annual",
	STRIPE_PRICE_CENTER_STARTER_MONTHLY: "price_test_center_starter_monthly",
	STRIPE_PRICE_CENTER_STARTER_ANNUAL: "price_test_center_starter_annual",
	STRIPE_PRICE_CENTER_PRO_MONTHLY: "price_test_center_pro_monthly",
	STRIPE_PRICE_CENTER_PRO_ANNUAL: "price_test_center_pro_annual",
	STRIPE_PRICE_GROUP_MONTHLY: "price_test_group_monthly",
	STRIPE_PRICE_GROUP_ANNUAL: "price_test_group_annual",
	STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: "whsec_test_sub_secret",
	QB_TOKEN_ENC_KEY: "test-enc-key-padded-to-32-chars!!",
	QUICKBOOKS_CLIENT_ID: "test-qb-client-id",
	QUICKBOOKS_CLIENT_SECRET: "test-qb-client-secret",
	QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
	DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
	MARKETING_DB: undefined as unknown as D1Database,
	RATE_LIMITER: undefined as unknown as DurableObjectNamespace,
	MARKETING_FROM_EMAIL: "hello@pebbledesk.test",
	R2_PUBLIC_URL: "https://cdn.pebbledesk.test",
	R2_SIGNING_SECRET: "test-r2-signing-secret",
	UNSUBSCRIBE_SECRET: "test-unsubscribe-secret",
} as unknown as Bindings;

function createMockChain(terminal: unknown = []) {
	const chain: Record<string, ReturnType<typeof vi.fn>> = {};
	const proxy: Record<string, unknown> = new Proxy(chain, {
		get(target, prop: string) {
			// Make the proxy itself awaitable so `await proxy` resolves to terminal.
			if (prop === "then") {
				return (resolve: (v: unknown) => void) => resolve(terminal);
			}
			if (!target[prop]) {
				target[prop] = vi.fn().mockImplementation((..._args: unknown[]) => {
					if (prop === "returning" || prop === "execute") {
						return Promise.resolve(terminal);
					}
					return proxy;
				});
			}
			return target[prop];
		},
	});
	return proxy;
}

export function createMockDb(overrides?: Partial<MockDb>): MockDb {
	return {
		select: vi.fn().mockReturnValue(createMockChain([])),
		insert: vi.fn().mockReturnValue(createMockChain([])),
		update: vi.fn().mockReturnValue(createMockChain([])),
		delete: vi.fn().mockReturnValue(createMockChain([])),
		transaction: vi.fn().mockImplementation(async (fn: (tx: MockDb) => Promise<unknown>) => {
			const txDb = createMockDb();
			return fn(txDb as unknown as MockDb);
		}),
		...overrides,
	} as MockDb;
}

export interface TestContext {
	userId: string;
	centerId: string;
	membershipId: string;
	role: Variables["role"];
}

const defaultContext: TestContext = {
	userId: "user-1",
	centerId: "center-1",
	membershipId: "membership-1",
	role: "owner",
};

export function createTestApp(
	mountRoutes: (app: Hono<AppEnv>) => void,
	db: MockDb,
	ctx?: Partial<TestContext>,
	preMount?: (app: Hono<AppEnv>) => void,
): Hono<AppEnv> {
	const context = { ...defaultContext, ...ctx };
	const app = new Hono<AppEnv>();

	// Optional pre-mount hook — lets tests attach app-level middleware (e.g. rate
	// limiters) that in production live in index.ts BEFORE the auth/context
	// injection below. This mirrors the pre-auth ordering in index.ts where
	// rate limits run ahead of initMiddleware.
	if (preMount) {
		preMount(app);
	}

	// Inject mock db + auth context
	app.use("*", async (c, next) => {
		c.set("db", db as unknown as Variables["db"]);
		c.set("auth", {} as unknown as Variables["auth"]);
		c.set("userId", context.userId);
		c.set("centerId", context.centerId);
		c.set("membershipId", context.membershipId);
		c.set("role", context.role);
		await next();
	});

	mountRoutes(app);
	app.onError((err, c) => {
		const maybe = err as { status?: number; message?: string };
		if (err instanceof HTTPException || typeof maybe.status === "number") {
			const status = (maybe.status ?? 500) as 400 | 401 | 403 | 404 | 500 | 502;
			return c.json({ error: maybe.message ?? "Error" }, status);
		}
		return c.json({ error: "Internal server error" }, 500);
	});

	// Override request() to inject testBindings as the default env so route
	// handlers can safely access c.env.XYZ without optional-chaining. Callers
	// may still pass their own env overrides as the third argument, which take
	// precedence over these defaults.
	const originalRequest = app.request.bind(app);
	app.request = (
		input: string | Request | URL,
		requestInit?: RequestInit,
		env?: unknown,
		executionCtx?: ExecutionContext,
	) => {
		const mergedEnv = env ? { ...testBindings, ...(env as Partial<Bindings>) } : testBindings;
		return originalRequest(input, requestInit, mergedEnv, executionCtx);
	};

	return app;
}

export function jsonBody(data: unknown) {
	return {
		method: "POST" as const,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	};
}

export function patchBody(data: unknown) {
	return {
		method: "PATCH" as const,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	};
}
