import { HTTPException } from "hono/http-exception";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sentrySpies = vi.hoisted(() => ({
	captureException: vi.fn(),
	setTag: vi.fn(),
	setContext: vi.fn(),
}));

const dbSpies = vi.hoisted(() => ({
	createDb: vi.fn(),
	execute: vi.fn(),
	resolveConnectionString: vi.fn((_h: unknown, url: string) => url),
	assertProductionDbDriver: vi.fn(),
}));

const posthogSpies = vi.hoisted(() => ({
	analyticsDistinctId: vi.fn(async (kind: string) => `${kind}:${"a".repeat(64)}`),
	schedulePostHogEvent: vi.fn(),
	getExecutionContext: vi.fn(() => undefined),
}));

const retrySpies = vi.hoisted(() => ({
	retryOnTransientDbError: vi.fn(),
}));

vi.mock("@sentry/cloudflare", () => ({
	captureException: sentrySpies.captureException,
	withScope: vi.fn(
		(
			callback: (scope: {
				setTag: typeof sentrySpies.setTag;
				setContext: typeof sentrySpies.setContext;
			}) => void,
		) => {
			callback({ setTag: sentrySpies.setTag, setContext: sentrySpies.setContext });
		},
	),
	withSentry: vi.fn((_options: unknown, worker: unknown) => worker),
}));

vi.mock("./lib/db-retry.js", () => {
	function hasTransientSignature(error: unknown): boolean {
		let current = error;
		for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
			if (
				current.message.includes("Timed out while creating a new server connection") ||
				current.message.includes("ECONNRESET") ||
				current.message.includes("CONNECTION_CLOSED") ||
				current.message.includes("CONNECTION_ENDED")
			) {
				return true;
			}
			current = (current as { cause?: unknown }).cause;
		}
		return false;
	}

	return {
		isTransientDbError: hasTransientSignature,
		retryOnTransientDbError: retrySpies.retryOnTransientDbError.mockImplementation(
			async <T>(
				fn: () => Promise<T>,
				options: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
			): Promise<T> => {
				const attempts = Math.max(1, options.attempts ?? 3);
				for (let attempt = 1; attempt <= attempts; attempt += 1) {
					try {
						return await fn();
					} catch (error) {
						if (attempt >= attempts || !hasTransientSignature(error)) {
							throw error;
						}
						if (options.sleep) {
							await options.sleep(0);
						}
					}
				}
				throw new Error("unreachable retry mock state");
			},
		),
	};
});

vi.mock("./lib/posthog.js", () => ({
	analyticsDistinctId: posthogSpies.analyticsDistinctId,
	getExecutionContext: posthogSpies.getExecutionContext,
	schedulePostHogEvent: posthogSpies.schedulePostHogEvent,
}));

vi.mock("./middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireRole: (..._roles: string[]) =>
			createMiddleware(async (_c, next) => {
				await next();
			}),
		requirePermission: (_permission: string) =>
			createMiddleware(async (_c, next) => {
				await next();
			}),
		initMiddleware: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireCenter: createMiddleware(async (_c, next) => {
			await next();
		}),
	};
});

vi.mock("./middleware/audit.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	return {
		auditMiddleware: createMiddleware(async (_c, next) => {
			await next();
		}),
	};
});

vi.mock("./lib/env.js", () => ({
	validateEnv: vi.fn(() => undefined),
}));

vi.mock("@pebbledesk/emails", () => ({
	MAGNET_TRACKS: {
		"licensing-compliance-checklist": "compliance",
		"ratio-tracking-cheatsheet": "compliance",
		"state-audit-preparation-toolkit": "compliance",
		"parent-handbook-template": "compliance",
		"ccdf-billing-error-prevention": "billing",
		"state-subsidy-billing-guide": "billing",
		"childcare-software-pricing-comparison": "buying",
		"childcare-software-scorecard": "buying",
		"brightwheel-cost-calculator": "buying",
	},
	getTrackForMagnet: vi.fn(() => "compliance"),
	renderTemplate: vi.fn().mockResolvedValue({
		html: "<p>Welcome!</p>",
		text: "Welcome!",
		subject: "Welcome to PebbleDesk",
	}),
}));

vi.mock("./scheduled/subscription-notification-dispatcher.js", () => ({
	runSubscriptionNotificationDispatcher: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./scheduled/subsidy-auto-draft.js", () => ({
	runSubsidyAutoDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./scheduled/trial-expirer.js", () => ({
	runTrialExpirer: vi.fn().mockResolvedValue({ expiredCount: 0, expiredCenterIds: [] }),
}));

vi.mock("./services/webhook-events-cleanup.js", () => ({
	deleteExpiredWebhookEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/ai-cs-session-owners-cleanup.js", () => ({
	deleteExpiredAiCsSessionOwners: vi.fn().mockResolvedValue(0),
}));

vi.mock("@pebbledesk/db", async () => {
	const actual = await vi.importActual<typeof import("@pebbledesk/db")>("@pebbledesk/db");
	return {
		...actual,
		createDb: dbSpies.createDb,
		resolveConnectionString: dbSpies.resolveConnectionString,
		assertProductionDbDriver: dbSpies.assertProductionDbDriver,
	};
});

const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

const { app, worker } = await import("./index.js");
const { validateEnv } = await import("./lib/env.js");
const defaultExport = await import("./index.js").then((m) => m.default);
const MOCK_SCHEDULED_CONTROLLER: ScheduledController = {
	scheduledTime: Date.now(),
	cron: "0 8 * * *",
	noRetry: () => undefined,
};

function scheduledController(cron: string): ScheduledController {
	return {
		...MOCK_SCHEDULED_CONTROLLER,
		cron,
	};
}

beforeAll(() => {
	app.get("/api/test/http-exception", () => {
		throw new HTTPException(418, { message: "teapot" });
	});

	app.get("/api/test/unexpected-error", () => {
		throw new Error("boom");
	});

	app.get("/api/test/upstream-error", () => {
		throw new HTTPException(502, { message: "Email delivery failed" });
	});

	app.get("/api/public/invoices/token_abc123/payment-intent", () => {
		throw new Error("payment intent failed");
	});
});

const MOCK_ENV = {
	APP_URL: "http://localhost:3040",
	DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
	HYPERDRIVE: undefined,
	MARKETING_DB: { prepare: vi.fn() },
};

function makeMockRateLimiterNamespace(): DurableObjectNamespace {
	const counters = new Map<string, number>();
	return {
		idFromName: (name: string) => name,
		get: (id: DurableObjectId) => ({
			checkLimit: async (
				key: string,
				max: number,
				_windowMs: number,
			): Promise<{ allowed: boolean; resetAt: number }> => {
				const counterKey = `${String(id)}:${key}`;
				const count = (counters.get(counterKey) ?? 0) + 1;
				counters.set(counterKey, count);
				return {
					allowed: count <= max,
					resetAt: Date.now() + 60_000,
				};
			},
		}),
	} as unknown as DurableObjectNamespace;
}

describe("scheduled handler", () => {
	beforeEach(async () => {
		const { runSubscriptionNotificationDispatcher } = await import(
			"./scheduled/subscription-notification-dispatcher.js"
		);
		const { runSubsidyAutoDraft } = await import("./scheduled/subsidy-auto-draft.js");
		const { runTrialExpirer } = await import("./scheduled/trial-expirer.js");
		const { deleteExpiredWebhookEvents } = await import("./services/webhook-events-cleanup.js");
		const { deleteExpiredAiCsSessionOwners } = await import(
			"./services/ai-cs-session-owners-cleanup.js"
		);

		vi.mocked(runSubscriptionNotificationDispatcher).mockReset();
		vi.mocked(runSubsidyAutoDraft).mockReset();
		vi.mocked(runTrialExpirer).mockReset();
		vi.mocked(deleteExpiredWebhookEvents).mockReset();
		vi.mocked(deleteExpiredAiCsSessionOwners).mockReset();
		vi.mocked(runSubscriptionNotificationDispatcher).mockResolvedValue(undefined);
		vi.mocked(runSubsidyAutoDraft).mockResolvedValue(undefined);
		vi.mocked(runTrialExpirer).mockResolvedValue({ expiredCount: 0, expiredCenterIds: [] });
		vi.mocked(deleteExpiredWebhookEvents).mockResolvedValue(0);
		vi.mocked(deleteExpiredAiCsSessionOwners).mockResolvedValue(0);
		consoleError.mockClear();
		consoleWarn.mockClear();
		sentrySpies.captureException.mockClear();
		sentrySpies.setTag.mockClear();
		sentrySpies.setContext.mockClear();
		posthogSpies.schedulePostHogEvent.mockClear();
		retrySpies.retryOnTransientDbError.mockClear();
		dbSpies.createDb.mockClear();
		dbSpies.resolveConnectionString.mockClear();
		dbSpies.assertProductionDbDriver.mockClear();
		dbSpies.createDb.mockReturnValue({ execute: dbSpies.execute });
		dbSpies.assertProductionDbDriver.mockImplementation(() => undefined);
		dbSpies.resolveConnectionString.mockImplementation((h: unknown, url: string) =>
			typeof h === "object" && h !== null && "connectionString" in h
				? String(h.connectionString)
				: url,
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("runs all scheduled tasks when none fail", async () => {
		const { runSubscriptionNotificationDispatcher } = await import(
			"./scheduled/subscription-notification-dispatcher.js"
		);
		const { runSubsidyAutoDraft } = await import("./scheduled/subsidy-auto-draft.js");
		const { runTrialExpirer } = await import("./scheduled/trial-expirer.js");
		const { deleteExpiredWebhookEvents } = await import("./services/webhook-events-cleanup.js");

		for (const cron of ["0 8 * * *", "0 2 * * *", "0 3 * * *", "0 9 * * 1"]) {
			await worker.scheduled(
				scheduledController(cron),
				MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
				{} as ExecutionContext,
			);
		}

		expect(runSubsidyAutoDraft).toHaveBeenCalledTimes(1);
		expect(runTrialExpirer).toHaveBeenCalledTimes(1);
		expect(deleteExpiredWebhookEvents).toHaveBeenCalledTimes(1);
		expect(runSubscriptionNotificationDispatcher).toHaveBeenCalledTimes(1);
		expect(consoleError).not.toHaveBeenCalled();
	});

	it("logs failed subscription notification tasks", async () => {
		const { runSubscriptionNotificationDispatcher } = await import(
			"./scheduled/subscription-notification-dispatcher.js"
		);
		vi.mocked(runSubscriptionNotificationDispatcher).mockRejectedValueOnce(
			new Error("subscription task failed"),
		);

		await worker.scheduled(
			scheduledController("0 8 * * *"),
			MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			{} as ExecutionContext,
		);

		expect(consoleError).toHaveBeenCalledWith("[scheduled] task failed:", expect.any(Error));
		expect(sentrySpies.captureException).toHaveBeenCalledWith(expect.any(Error));
		expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "subscription-notification-dispatcher");
		expect(runSubscriptionNotificationDispatcher).toHaveBeenCalledTimes(1);
	});

	it("retries a task that fails with a transient DB connection error and suppresses Sentry on success", async () => {
		const { deleteExpiredWebhookEvents } = await import("./services/webhook-events-cleanup.js");

		const cause = new Error("Timed out while creating a new server connection.");
		const wrapped = new Error('Failed query: delete from "webhook_events"', { cause });
		vi.mocked(deleteExpiredWebhookEvents).mockRejectedValueOnce(wrapped).mockResolvedValueOnce(0);

		await worker.scheduled(
			scheduledController("0 3 * * *"),
			MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			{} as ExecutionContext,
		);

		expect(deleteExpiredWebhookEvents).toHaveBeenCalledTimes(2);
		expect(sentrySpies.captureException).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
	});

	it("uses the scheduled retry profile for DB cron work", async () => {
		await worker.scheduled(
			scheduledController("0 3 * * *"),
			MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			{} as ExecutionContext,
		);

		expect(retrySpies.retryOnTransientDbError).toHaveBeenCalledWith(expect.any(Function), {
			attempts: 5,
			maxBackoffMs: 2_000,
		});
	});

	it("asserts the production DB driver before scheduled DB work", async () => {
		const { runTrialExpirer } = await import("./scheduled/trial-expirer.js");
		const driverError = new Error("Hyperdrive binding is required in production");
		dbSpies.assertProductionDbDriver.mockImplementationOnce(() => {
			throw driverError;
		});

		await worker.scheduled(
			scheduledController("0 2 * * *"),
			{
				...MOCK_ENV,
				APP_URL: "https://my.pebbledesk.app",
			} as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			{} as ExecutionContext,
		);

		expect(dbSpies.assertProductionDbDriver).toHaveBeenCalledWith(undefined, true);
		expect(dbSpies.resolveConnectionString).not.toHaveBeenCalled();
		expect(dbSpies.createDb).not.toHaveBeenCalled();
		expect(runTrialExpirer).not.toHaveBeenCalled();
		expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "trial-expirer");
		expect(sentrySpies.captureException).toHaveBeenCalledWith(driverError);
	});

	it("schedules PostHog events after a successful retried trial expiration", async () => {
		const { runTrialExpirer } = await import("./scheduled/trial-expirer.js");
		const cause = new Error("Timed out while creating a new server connection.");
		const wrapped = new Error('Failed query: update "centers"', { cause });
		const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
		vi.mocked(runTrialExpirer)
			.mockRejectedValueOnce(wrapped)
			.mockResolvedValueOnce({ expiredCount: 1, expiredCenterIds: ["center-1"] });

		await worker.scheduled(
			scheduledController("0 2 * * *"),
			MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			ctx,
		);

		expect(runTrialExpirer).toHaveBeenCalledTimes(2);
		expect(dbSpies.createDb).toHaveBeenCalledTimes(2);
		expect(sentrySpies.captureException).not.toHaveBeenCalled();
		expect(posthogSpies.schedulePostHogEvent).toHaveBeenCalledWith(MOCK_ENV, ctx, {
			event: "trial_expired",
			distinctId: expect.stringMatching(/^center:[a-f0-9]{64}$/),
			properties: { subscription_status: "canceled" },
		});
		expect(JSON.stringify(posthogSpies.schedulePostHogEvent.mock.calls)).not.toContain("center-1");
	});

	it("captures trial-expirer failures once after exhausting the scheduled retry profile", async () => {
		const { runTrialExpirer } = await import("./scheduled/trial-expirer.js");
		const cause = new Error("Timed out while creating a new server connection.");
		const wrapped = new Error('Failed query: update "centers"', { cause });
		vi.mocked(runTrialExpirer).mockRejectedValue(wrapped);

		await worker.scheduled(
			scheduledController("0 2 * * *"),
			MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			{} as ExecutionContext,
		);

		expect(runTrialExpirer).toHaveBeenCalledTimes(5);
		expect(consoleError).toHaveBeenCalledWith("[scheduled] task failed:", wrapped);
		expect(sentrySpies.captureException).toHaveBeenCalledTimes(1);
		expect(sentrySpies.captureException).toHaveBeenCalledWith(wrapped);
		expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "trial-expirer");
		expect(posthogSpies.schedulePostHogEvent).not.toHaveBeenCalled();
	});

	it("does not page Sentry when the ai-cs-session-owners cleanup exhausts retries on a transient DB outage", async () => {
		const { deleteExpiredAiCsSessionOwners } = await import(
			"./services/ai-cs-session-owners-cleanup.js"
		);
		const cause = new Error("Timed out while creating a new server connection.");
		const wrapped = new Error('Failed query: delete from "ai_cs_session_owners"', { cause });
		vi.mocked(deleteExpiredAiCsSessionOwners).mockRejectedValue(wrapped);

		await worker.scheduled(
			scheduledController("0 4 * * *"),
			MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			{} as ExecutionContext,
		);

		expect(deleteExpiredAiCsSessionOwners).toHaveBeenCalledTimes(5);
		expect(sentrySpies.captureException).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleWarn).toHaveBeenCalledWith(
			expect.stringContaining("ai-cs-session-owners-cleanup"),
		);
	});

	it("does not page Sentry when the webhook-events cleanup exhausts retries on a transient DB outage", async () => {
		const { deleteExpiredWebhookEvents } = await import("./services/webhook-events-cleanup.js");
		const cause = new Error("Timed out while creating a new server connection.");
		const wrapped = new Error('Failed query: delete from "webhook_events"', { cause });
		vi.mocked(deleteExpiredWebhookEvents).mockRejectedValue(wrapped);

		await worker.scheduled(
			scheduledController("0 3 * * *"),
			MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			{} as ExecutionContext,
		);

		expect(deleteExpiredWebhookEvents).toHaveBeenCalledTimes(5);
		expect(sentrySpies.captureException).not.toHaveBeenCalled();
		expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("webhook-events-cleanup"));
	});

	it("still pages Sentry when a best-effort cleanup fails with a non-transient error", async () => {
		const { deleteExpiredAiCsSessionOwners } = await import(
			"./services/ai-cs-session-owners-cleanup.js"
		);
		const fatal = new Error('Failed query: delete from "ai_cs_session_owners": column missing');
		vi.mocked(deleteExpiredAiCsSessionOwners).mockRejectedValue(fatal);

		await worker.scheduled(
			scheduledController("0 4 * * *"),
			MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
			{} as ExecutionContext,
		);

		expect(deleteExpiredAiCsSessionOwners).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledWith("[scheduled] task failed:", fatal);
		expect(sentrySpies.captureException).toHaveBeenCalledTimes(1);
		expect(sentrySpies.captureException).toHaveBeenCalledWith(fatal);
		expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "ai-cs-session-owners-cleanup");
	});

	it("ignores unrecognised cron schedules", async () => {
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await worker.scheduled(
				scheduledController("* * * * *"),
				MOCK_ENV as unknown as Parameters<NonNullable<typeof worker.scheduled>>[1],
				{} as ExecutionContext,
			);

			expect(consoleWarn).toHaveBeenCalledWith("[scheduled] Unrecognised cron: * * * * *");
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			consoleWarn.mockRestore();
		}
	});
});

describe("app entrypoint", () => {
	beforeEach(() => {
		consoleError.mockClear();
		sentrySpies.captureException.mockClear();
		sentrySpies.setTag.mockClear();
		sentrySpies.setContext.mockClear();
		dbSpies.createDb.mockClear();
		dbSpies.execute.mockClear();
		dbSpies.resolveConnectionString.mockClear();
		dbSpies.assertProductionDbDriver.mockClear();
		dbSpies.createDb.mockReturnValue({ execute: dbSpies.execute });
		dbSpies.execute.mockResolvedValue([{ ok: 1 }]);
		dbSpies.assertProductionDbDriver.mockImplementation(() => undefined);
		dbSpies.resolveConnectionString.mockImplementation((h: unknown, url: string) =>
			typeof h === "object" && h !== null && "connectionString" in h
				? String(h.connectionString)
				: url,
		);
	});

	it("exports a Cloudflare worker fetch handler", () => {
		expect(defaultExport.fetch).toBeTypeOf("function");
	});

	it("serves the health check", async () => {
		const res = await app.request("/api/health");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: "ok" });
	});

	it("serves the root health alias", async () => {
		const res = await app.request("/health");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: "ok" });
	});

	it("proves database readiness with a non-mutating Worker query", async () => {
		const env = {
			API_READINESS_TOKEN: "readiness-secret",
			APP_URL: "http://localhost:3040",
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
			HYPERDRIVE: { connectionString: "REPLACE_WITH_DATABASE_URL" },
		};

		const res = await app.request(
			"/api/readiness/database",
			{ headers: { "x-pebbledesk-readiness-token": "readiness-secret" } },
			env,
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ status: "ok", database: "ok" });
		expect(dbSpies.assertProductionDbDriver).toHaveBeenCalledWith(env.HYPERDRIVE, false);
		expect(dbSpies.resolveConnectionString).toHaveBeenCalledWith(
			env.HYPERDRIVE,
			"REPLACE_WITH_DATABASE_URL",
		);
		expect(dbSpies.createDb).toHaveBeenCalledWith("REPLACE_WITH_DATABASE_URL", {
			hyperdriveBound: true,
		});
		expect(dbSpies.execute).toHaveBeenCalledTimes(1);
	});

	it("rejects database readiness without the deploy-only token before touching the database", async () => {
		const res = await app.request("/api/readiness/database", undefined, {
			API_READINESS_TOKEN: "readiness-secret",
			APP_URL: "http://localhost:3040",
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
		});

		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: "Not found" });
		expect(dbSpies.assertProductionDbDriver).not.toHaveBeenCalled();
		expect(dbSpies.resolveConnectionString).not.toHaveBeenCalled();
		expect(dbSpies.createDb).not.toHaveBeenCalled();
		expect(dbSpies.execute).not.toHaveBeenCalled();
	});

	it("returns a generic database readiness failure without leaking connection details", async () => {
		dbSpies.execute.mockRejectedValueOnce(new Error("password auth failed for REPLACE_WITH_DATABASE_URL"));

		const res = await app.request(
			"/api/readiness/database",
			{ headers: { "x-pebbledesk-readiness-token": "readiness-secret" } },
			{
				API_READINESS_TOKEN: "readiness-secret",
				APP_URL: "http://localhost:3040",
				DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
				SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
			},
		);

		expect(res.status).toBe(503);
		const body = await res.json<{ status: string; database: string; requestId: string }>();
		expect(body).toMatchObject({ status: "error", database: "unavailable" });
		expect(body.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
		expect(JSON.stringify(body)).not.toContain("secret");
		expect(sentrySpies.captureException).toHaveBeenCalledWith(expect.any(Error));
		const capturedError = sentrySpies.captureException.mock.calls.at(-1)?.[0];
		expect(capturedError).toBeInstanceOf(Error);
		expect((capturedError as Error).message).toBe("Database readiness query failed");
		expect((capturedError as Error).message).not.toContain("secret");
	});

	it("does not fall back to direct DATABASE_URL for production database readiness", async () => {
		dbSpies.assertProductionDbDriver.mockImplementationOnce(() => {
			throw new Error("Hyperdrive binding is required in production");
		});

		const res = await app.request(
			"/api/readiness/database",
			{ headers: { "x-pebbledesk-readiness-token": "readiness-secret" } },
			{
				API_READINESS_TOKEN: "readiness-secret",
				APP_URL: "https://my.pebbledesk.app",
				DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
				SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
			},
		);

		expect(res.status).toBe(503);
		await expect(res.json()).resolves.toMatchObject({
			status: "error",
			database: "unavailable",
		});
		expect(dbSpies.assertProductionDbDriver).toHaveBeenCalledWith(undefined, true);
		expect(dbSpies.resolveConnectionString).not.toHaveBeenCalled();
		expect(dbSpies.createDb).not.toHaveBeenCalled();
	});

	it("echoes allowed CORS origins and rejects unknown origins", async () => {
		const env = { APP_URL: "http://localhost:3040", DATABASE_URL: "REPLACE_WITH_DATABASE_URL" };

		const allowed = await app.request(
			"/api/health",
			{ headers: { origin: "http://127.0.0.1:3040" } },
			env,
		);
		const blocked = await app.request(
			"/api/health",
			{ headers: { origin: "https://evil.example" } },
			{ ...env, marker: "separate-env-object" },
		);

		expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3040");
		expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
	});

	it("skips the global body-size middleware branch for imports", async () => {
		const res = await app.request(
			"/api/imports",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ records: [] }),
			},
			{ APP_URL: "http://localhost:3040", DATABASE_URL: "REPLACE_WITH_DATABASE_URL" },
		);

		expect(res.status).not.toBe(413);
	});

	it("applies pre-auth POST rate-limit branches to guarded mutation routes", async () => {
		const env = { APP_URL: "http://localhost:3040", DATABASE_URL: "REPLACE_WITH_DATABASE_URL" };

		const guardians = await app.request(
			"/api/guardians",
			{ method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
			env,
		);
		const messages = await app.request(
			"/api/messages",
			{ method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
			{ ...env, route: "messages-root" },
		);
		const redelivery = await app.request(
			"/api/messages/00000000-0000-0000-0000-000000000001/redeliver",
			{ method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
			{ ...env, route: "messages-redelivery" },
		);

		expect([guardians.status, messages.status, redelivery.status]).not.toContain(429);
	});

	it("does not apply the message send rate limit to inbound Resend webhooks", async () => {
		const env = {
			APP_URL: "http://localhost:3040",
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
			RATE_LIMITER: makeMockRateLimiterNamespace(),
			RESEND_WEBHOOK_SECRET: "",
		};

		const responses: Response[] = [];
		for (let i = 0; i < 6; i += 1) {
			responses.push(
				await app.request(
					"/api/messages/inbound/resend",
					{
						method: "POST",
						headers: {
							"content-type": "application/json",
							"cf-connecting-ip": "203.0.113.20",
						},
						body: "{}",
					},
					env,
				),
			);
		}

		expect(responses.map((response) => response.status)).not.toContain(429);
		expect(responses.at(-1)?.status).toBe(503);
	});

	it("passes non-POST requests through route-specific mutation rate limits", async () => {
		const env = { APP_URL: "http://localhost:3040", DATABASE_URL: "REPLACE_WITH_DATABASE_URL" };

		const guardians = await app.request("/api/guardians", undefined, env);
		const messages = await app.request("/api/messages", undefined, {
			...env,
			route: "messages-get",
		});
		const redelivery = await app.request(
			"/api/messages/00000000-0000-0000-0000-000000000001/redeliver",
			undefined,
			{ ...env, route: "messages-redelivery-get" },
		);

		expect([guardians.status, messages.status, redelivery.status]).not.toContain(429);
	});

	it("applies a tight named reports rate limit before authenticated report handlers", async () => {
		const env = {
			APP_URL: "http://localhost:3040",
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
			RATE_LIMITER: makeMockRateLimiterNamespace(),
		};

		const responses: Response[] = [];
		for (let i = 0; i < 11; i += 1) {
			responses.push(
				await app.request("/api/reports", { headers: { "cf-connecting-ip": "203.0.113.10" } }, env),
			);
		}

		expect(responses.slice(0, 10).map((response) => response.status)).not.toContain(429);
		expect(responses[10]?.status).toBe(429);
		await expect(responses[10]?.json()).resolves.toEqual({
			error: "Too many report requests, please try again shortly.",
		});
	});

	it("applies the reports rate limit to nested report routes", async () => {
		const env = {
			APP_URL: "http://localhost:3040",
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
			RATE_LIMITER: makeMockRateLimiterNamespace(),
		};

		let lastResponse: Response | undefined;
		for (let i = 0; i < 11; i += 1) {
			lastResponse = await app.request(
				"/api/reports/00000000-0000-0000-0000-000000000001/download",
				{ headers: { "cf-connecting-ip": "203.0.113.11" } },
				env,
			);
		}

		expect(lastResponse?.status).toBe(429);
	});

	it("skips the global rate limiter for auth session reads", async () => {
		const res = await app.request(
			"/api/auth/me",
			{ headers: { "cf-connecting-ip": "203.0.113.12" } },
			{
				APP_URL: "http://localhost:3040",
				DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
				RATE_LIMITER: makeMockRateLimiterNamespace(),
			},
		);

		expect(res.status).not.toBe(429);
	});

	it("redirects legacy marketing lead capture and unsubscribe requests before DB init", async () => {
		const leads = await app.request(
			"/api/leads",
			{ method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
			{ APP_URL: "http://localhost:3040", DATABASE_URL: "REPLACE_WITH_DATABASE_URL" },
		);
		const unsubscribe = await app.request(
			"/api/unsubscribe?email=jane%40example.com&token=t",
			undefined,
			{ APP_URL: "http://localhost:3040", DATABASE_URL: "REPLACE_WITH_DATABASE_URL", route: "legacy" },
		);

		expect(leads.status).toBe(308);
		expect(leads.headers.get("location")).toBe("https://pebbledesk.app/api/leads");
		expect(unsubscribe.status).toBe(308);
		expect(unsubscribe.headers.get("location")).toBe(
			"https://pebbledesk.app/api/unsubscribe?email=jane%40example.com&token=t",
		);
	});

	it("returns a service-unavailable response when env validation fails", async () => {
		vi.mocked(validateEnv).mockImplementationOnce(() => {
			throw new Error("Missing or invalid environment variables: DATABASE_URL");
		});

		const res = await app.request("/api/health", undefined, { DATABASE_URL: "" });

		expect(res.status).toBe(503);
		await expect(res.json()).resolves.toEqual({
			error: "Missing or invalid environment variables: DATABASE_URL",
		});
	});

	it("validates each env binding object only once", async () => {
		vi.mocked(validateEnv).mockClear();
		const env = { DATABASE_URL: "REPLACE_WITH_DATABASE_URL" };

		await app.request("/api/health", undefined, env);
		await app.request("/api/health", undefined, env);

		expect(validateEnv).toHaveBeenCalledTimes(1);
	});

	it("serializes HTTP exceptions", async () => {
		const res = await app.request("/api/test/http-exception", undefined, {
			APP_URL: "https://app.pebbledesk.test",
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
			SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
		});

		expect(res.status).toBe(418);
		const body = await res.json<{ error: string; requestId: string }>();
		expect(body.error).toBe("teapot");
		expect(body.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
		expect(sentrySpies.captureException).not.toHaveBeenCalled();
	});

	it("captures HTTP 5xx exceptions when Sentry is configured", async () => {
		const res = await app.request("/api/test/upstream-error", undefined, {
			APP_URL: "https://app.pebbledesk.test",
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
			SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
		});

		expect(res.status).toBe(502);
		expect(sentrySpies.captureException).toHaveBeenCalledWith(expect.any(HTTPException));
	});

	it("serializes unexpected errors", async () => {
		const res = await app.request("/api/test/unexpected-error");

		expect(res.status).toBe(500);
		const body = await res.json<{ error: string; requestId: string }>();
		expect(body.error).toBe("Internal server error");
		expect(body.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
		expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
	});

	it("captures unexpected errors when Sentry is configured", async () => {
		const res = await app.request("/api/test/unexpected-error", undefined, {
			APP_URL: "https://app.pebbledesk.test",
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
			SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
		});

		expect(res.status).toBe(500);
		expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
		expect(sentrySpies.captureException).toHaveBeenCalledWith(expect.any(Error));
		expect(sentrySpies.setTag).toHaveBeenCalledWith("route", "/api/test/unexpected-error");
		expect(sentrySpies.setTag).toHaveBeenCalledWith("surface", "api");
	});

	it("captures env validation failures when Sentry is configured", async () => {
		vi.mocked(validateEnv).mockImplementationOnce(() => {
			throw new Error("Missing or invalid environment variables: DATABASE_URL");
		});

		const res = await app.request("/api/health", undefined, {
			APP_URL: "https://app.pebbledesk.test",
			DATABASE_URL: "",
			SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
		});

		expect(res.status).toBe(503);
		expect(sentrySpies.captureException).toHaveBeenCalledWith(expect.any(Error));
		expect(sentrySpies.setTag).toHaveBeenCalledWith("route", "/api/health");
	});

	it("sanitizes token-like route segments before adding Sentry context", async () => {
		const res = await app.request(
			"/api/public/invoices/token_abc123/payment-intent?client_secret=secret",
			undefined,
			{
				APP_URL: "https://app.pebbledesk.test",
				DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
				SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
			},
		);

		expect(res.status).toBe(500);
		expect(sentrySpies.setTag).toHaveBeenCalledWith(
			"route",
			"/api/public/invoices/:token/payment-intent",
		);
		expect(sentrySpies.setContext).toHaveBeenCalledWith("request", {
			path: "/api/public/invoices/:token/payment-intent",
			method: "GET",
		});
	});
});
