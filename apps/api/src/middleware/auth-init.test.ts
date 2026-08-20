import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";

const createDbMock = vi.fn(() => ({ name: "db" }));
const createAuthMock = vi.fn(() => ({ handler: vi.fn() }));
const assertProductionDbDriverMock = vi.fn();
const renderSignupEmailConfirmationMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock("@pebbledesk/db", () => ({
	createDb: createDbMock,
	resolveConnectionString: (
		hyperdrive: { connectionString: string } | undefined,
		databaseUrl: string,
	) => hyperdrive?.connectionString ?? databaseUrl,
	assertProductionDbDriver: assertProductionDbDriverMock,
	memberships: {},
}));

vi.mock("@pebbledesk/auth", () => ({
	createAuth: createAuthMock,
}));

vi.mock("@pebbledesk/emails", () => ({
	renderSignupEmailConfirmation: renderSignupEmailConfirmationMock,
}));

vi.mock("../lib/email.js", () => ({
	sendEmail: sendEmailMock,
}));

const { initMiddleware } = await import("./auth.js");

describe("initMiddleware", () => {
	beforeEach(() => {
		createDbMock.mockClear();
		createAuthMock.mockClear();
		assertProductionDbDriverMock.mockClear();
		renderSignupEmailConfirmationMock.mockReset();
		sendEmailMock.mockReset();
		renderSignupEmailConfirmationMock.mockResolvedValue({
			html: "<p>Confirm</p>",
			text: "Confirm",
			subject: "Confirm",
		});
		sendEmailMock.mockResolvedValue(undefined);
	});

	it("uses the incoming loopback origin for auth when the configured auth URL is loopback", async () => {
		const app = new Hono<AppEnv>();

		app.use("*", initMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		const res = await app.request(
			"http://127.0.0.1:6501/test",
			{
				headers: {
					origin: "http://127.0.0.1:6501",
				},
			},
			{
				DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
				BETTER_AUTH_SECRET: "test-secret",
				BETTER_AUTH_URL: "http://localhost:8790",
				APP_URL: "http://localhost:3040",
				GOOGLE_CLIENT_ID: "",
				GOOGLE_CLIENT_SECRET: "",
				HYPERDRIVE: undefined,
			},
		);

		expect(res.status).toBe(200);
		expect(createDbMock).toHaveBeenCalledWith("REPLACE_WITH_DATABASE_URL", {
			hyperdriveBound: false,
		});
		expect(createAuthMock).toHaveBeenCalledWith(
			expect.objectContaining({
				baseURL: "http://127.0.0.1:6501",
				trustedOrigins: ["http://localhost:3040", "http://127.0.0.1:3040", "http://[::1]:3040"],
			}),
		);
	});

	it("leaves non-loopback auth configuration unchanged", async () => {
		const app = new Hono<AppEnv>();

		app.use("*", initMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		const res = await app.request(
			"https://api.pebbledesk.app/test",
			{
				headers: {
					origin: "http://localhost:6501",
				},
			},
			{
				DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
				BETTER_AUTH_SECRET: "test-secret",
				BETTER_AUTH_URL: "https://auth.pebbledesk.app",
				APP_URL: "https://app.pebbledesk.app",
				GOOGLE_CLIENT_ID: "",
				GOOGLE_CLIENT_SECRET: "",
				HYPERDRIVE: undefined,
			},
		);

		expect(res.status).toBe(200);
		expect(createDbMock).toHaveBeenCalledWith("REPLACE_WITH_DATABASE_URL", {
			hyperdriveBound: false,
		});
		expect(createAuthMock).toHaveBeenCalledWith(
			expect.objectContaining({
				baseURL: "https://auth.pebbledesk.app",
				trustedOrigins: ["https://app.pebbledesk.app"],
			}),
		);
	});

	it("tags verification email sends and does not throw when Resend fails", async () => {
		const app = new Hono<AppEnv>();
		app.use("*", initMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));
		sendEmailMock.mockRejectedValueOnce(new Error("resend down"));

		const res = await app.request(
			"http://127.0.0.1:6501/test",
			{},
			{
				DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
				BETTER_AUTH_SECRET: "test-secret",
				BETTER_AUTH_URL: "http://localhost:8790",
				APP_URL: "http://localhost:3040",
				GOOGLE_CLIENT_ID: "",
				GOOGLE_CLIENT_SECRET: "",
				HYPERDRIVE: undefined,
				RESEND_FROM_EMAIL: "hello@pebbledesk.test",
				RESEND_API_KEY: "re_test_key",
			},
		);

		expect(res.status).toBe(200);
		const createAuthCalls = createAuthMock.mock.calls as unknown[][];
		const config = createAuthCalls.at(-1)?.[0] as {
			sendVerificationEmail?: (data: {
				user: { email: string; name?: string | null };
				url: string;
			}) => Promise<void>;
		};
		await expect(
			config.sendVerificationEmail?.({
				user: { email: "owner@example.com", name: "Mia Alvarez" },
				url: "https://api.pebbledesk.app/api/auth/verify-email?token=abc",
			}),
		).resolves.toBeUndefined();
		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "owner@example.com",
				tags: [
					{ name: "campaign", value: "signup-trial" },
					{ name: "template", value: "signup-email-confirmation" },
				],
			}),
		);
	});
});

describe("initMiddleware — assertProductionDbDriver", () => {
	// The dbDriverAsserted flag is a module-level singleton. Reset all modules so auth.ts is
	// re-imported with a fresh flag, then re-register mocks before the dynamic import.
	it("calls assertProductionDbDriver(undefined, true) when APP_URL is https and HYPERDRIVE is absent", async () => {
		const localAssertMock = vi.fn();

		vi.resetModules();

		vi.doMock("@pebbledesk/db", () => ({
			createDb: vi.fn(() => ({ name: "db" })),
			resolveConnectionString: (_h: { connectionString: string } | undefined, url: string) => url,
			assertProductionDbDriver: localAssertMock,
			memberships: {},
		}));

		vi.doMock("@pebbledesk/auth", () => ({
			createAuth: vi.fn(() => ({ handler: vi.fn() })),
		}));

		const { initMiddleware: freshMiddleware } = await import("./auth.js");
		const app = new Hono<AppEnv>();

		app.use("*", freshMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		await app.request(
			"https://my.pebbledesk.app/test",
			{},
			{
				DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
				BETTER_AUTH_SECRET: "test-secret",
				BETTER_AUTH_URL: "https://api.pebbledesk.app",
				APP_URL: "https://my.pebbledesk.app",
				GOOGLE_CLIENT_ID: "",
				GOOGLE_CLIENT_SECRET: "",
				HYPERDRIVE: undefined,
			},
		);

		expect(localAssertMock).toHaveBeenCalledWith(undefined, true);
	});
});

describe("initMiddleware — WeakMap-based env assertion cache", () => {
	function makeEnv(overrides: Record<string, unknown> = {}) {
		return {
			DATABASE_URL: "REPLACE_WITH_DATABASE_URL",
			BETTER_AUTH_SECRET: "test-secret",
			BETTER_AUTH_URL: "https://api.pebbledesk.app",
			// Use https so isProduction=true and the assertOnce path is exercised.
			APP_URL: "https://test.pebbledesk.app",
			GOOGLE_CLIENT_ID: "",
			GOOGLE_CLIENT_SECRET: "",
			HYPERDRIVE: undefined,
			...overrides,
		};
	}

	it("assertion runs on first request", async () => {
		const localAssertMock = vi.fn();
		vi.resetModules();

		vi.doMock("@pebbledesk/db", () => ({
			createDb: vi.fn(() => ({ name: "db" })),
			resolveConnectionString: (_h: { connectionString: string } | undefined, url: string) => url,
			assertProductionDbDriver: localAssertMock,
			memberships: {},
		}));
		vi.doMock("@pebbledesk/auth", () => ({
			createAuth: vi.fn(() => ({ handler: vi.fn() })),
		}));

		const { initMiddleware: freshMiddleware } = await import("./auth.js");
		const app = new Hono<AppEnv>();
		app.use("*", freshMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		const env = makeEnv();
		await app.request("http://localhost/test", {}, env);

		expect(localAssertMock).toHaveBeenCalledTimes(1);
	});

	it("assertion does NOT run again on subsequent requests with the same env object", async () => {
		const localAssertMock = vi.fn();
		vi.resetModules();

		vi.doMock("@pebbledesk/db", () => ({
			createDb: vi.fn(() => ({ name: "db" })),
			resolveConnectionString: (_h: { connectionString: string } | undefined, url: string) => url,
			assertProductionDbDriver: localAssertMock,
			memberships: {},
		}));
		vi.doMock("@pebbledesk/auth", () => ({
			createAuth: vi.fn(() => ({ handler: vi.fn() })),
		}));

		const { initMiddleware: freshMiddleware } = await import("./auth.js");
		const app = new Hono<AppEnv>();
		app.use("*", freshMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		// Use the same env object reference for both requests (same isolate context)
		const env = makeEnv();
		await app.request("http://localhost/test", {}, env);
		await app.request("http://localhost/test", {}, env);

		// Assertion should only fire once — the WeakMap prevents re-running
		expect(localAssertMock).toHaveBeenCalledTimes(1);
	});

	it("assertion DOES run again when a different env object is provided", async () => {
		const localAssertMock = vi.fn();
		vi.resetModules();

		vi.doMock("@pebbledesk/db", () => ({
			createDb: vi.fn(() => ({ name: "db" })),
			resolveConnectionString: (_h: { connectionString: string } | undefined, url: string) => url,
			assertProductionDbDriver: localAssertMock,
			memberships: {},
		}));
		vi.doMock("@pebbledesk/auth", () => ({
			createAuth: vi.fn(() => ({ handler: vi.fn() })),
		}));

		const { initMiddleware: freshMiddleware } = await import("./auth.js");
		const app = new Hono<AppEnv>();
		app.use("*", freshMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		// Two distinct env objects — different isolate binding contexts
		const env1 = makeEnv();
		const env2 = makeEnv(); // same shape, different object reference

		await app.request("http://localhost/test", {}, env1);
		await app.request("http://localhost/test", {}, env2);

		// Should run once per unique env object
		expect(localAssertMock).toHaveBeenCalledTimes(2);
	});
});
