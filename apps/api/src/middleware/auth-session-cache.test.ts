import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";

const createDbMock = vi.fn();
const getSessionMock = vi.fn();
const createAuthMock = vi.fn(() => ({
	handler: vi.fn(),
	api: {
		getSession: getSessionMock,
	},
}));

vi.mock("@pebbledesk/db", () => ({
	createDb: createDbMock,
	resolveConnectionString: (
		hyperdrive: { connectionString: string } | undefined,
		databaseUrl: string,
	) => hyperdrive?.connectionString ?? databaseUrl,
	assertProductionDbDriver: vi.fn(),
	memberships: {},
}));

vi.mock("@pebbledesk/auth", () => ({
	createAuth: createAuthMock,
}));

const { initMiddleware, requireAuth } = await import("./auth.js");

describe("requireAuth session resolution", () => {
	beforeEach(() => {
		createDbMock.mockReset();
		createAuthMock.mockClear();
		getSessionMock.mockReset();
	});

	it("returns 401 when getSession throws an APIError (invalid session)", async () => {
		// Build an error that matches @better-auth/core APIError shape:
		// APIError instances have a numeric status (401, 403, etc.) on them via better-call
		class FakeAPIError extends Error {
			status = 401;
			body = { message: "invalid session" };
			constructor(msg: string) {
				super(msg);
				this.name = "APIError";
			}
		}
		createDbMock.mockReturnValue({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
		});
		getSessionMock.mockRejectedValue(new FakeAPIError("invalid session"));

		const app = new Hono<AppEnv>();
		app.use("*", initMiddleware);
		app.use("/protected", requireAuth);
		app.get("/protected", (c) => c.json({ userId: c.get("userId") }));

		const res = await app.request(
			"http://localhost/protected",
			{ headers: { Cookie: "better-auth.session_token=bad-token" } },
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

		expect(res.status).toBe(401);
		expect(getSessionMock).toHaveBeenCalledTimes(1);
	});

	it("returns 401 when getSession throws a named APIError without a numeric status field", async () => {
		class LooseAPIError extends Error {
			body = { message: "invalid session" };
			constructor(msg: string) {
				super(msg);
				this.name = "APIError";
			}
		}

		createDbMock.mockReturnValue({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
		});
		getSessionMock.mockRejectedValue(new LooseAPIError("invalid session"));

		const app = new Hono<AppEnv>();
		app.use("*", initMiddleware);
		app.use("/protected", requireAuth);
		app.get("/protected", (c) => c.json({ userId: c.get("userId") }));

		const res = await app.request(
			"http://localhost/protected",
			{ headers: { Cookie: "better-auth.session_token=stale-token" } },
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

		expect(res.status).toBe(401);
		expect(getSessionMock).toHaveBeenCalledTimes(1);
	});

	it("propagates non-APIError exceptions from getSession as 500", async () => {
		createDbMock.mockReturnValue({
			select: vi.fn(),
		});
		getSessionMock.mockRejectedValue(new Error("DB connection refused"));

		const app = new Hono<AppEnv>();
		app.use("*", initMiddleware);
		app.use("/protected", requireAuth);
		app.get("/protected", (c) => c.json({ userId: c.get("userId") }));
		app.onError((_err, c) => c.json({ error: "internal" }, 500));

		const res = await app.request(
			"http://localhost/protected",
			{ headers: { Cookie: "better-auth.session_token=dev-token" } },
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

		expect(res.status).toBe(500);
		expect(getSessionMock).toHaveBeenCalledTimes(1);
	});

	it("does not trust unsigned cookie data when the server session resolves unauthenticated", async () => {
		createDbMock.mockReturnValue({
			select: vi.fn(),
		});
		getSessionMock.mockResolvedValue(null);

		const app = new Hono<AppEnv>();
		app.use("*", initMiddleware);
		app.use("/protected", requireAuth);
		app.get("/protected", (c) => c.json({ userId: c.get("userId") }));

		// Provide a base64-encoded cookie that previously could have been used as a fallback
		const sessionCookie = Buffer.from(
			JSON.stringify({
				session: { session: { userId: "user-1" }, user: { id: "user-1" } },
				signature: "dev-only",
			}),
		).toString("base64url");

		const res = await app.request(
			"http://localhost/protected",
			{
				headers: {
					Cookie: `better-auth.session_data=${sessionCookie}; better-auth.session_token=dev-token`,
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

		expect(res.status).toBe(401);
		expect(getSessionMock).toHaveBeenCalledTimes(1);
	});

	it("authenticates successfully when getSession returns a valid user", async () => {
		createDbMock.mockReturnValue({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							id: "membership-1",
							centerId: "center-1",
							role: "owner",
							acceptedAt: new Date("2026-04-10T00:00:00.000Z"),
							createdAt: new Date("2026-04-10T00:00:00.000Z"),
						},
					]),
				}),
			}),
		});
		getSessionMock.mockResolvedValue({ user: { id: "user-1" } });

		const app = new Hono<AppEnv>();
		app.use("*", initMiddleware);
		app.use("/protected", requireAuth);
		app.get("/protected", (c) =>
			c.json({
				userId: c.get("userId"),
				centerId: c.get("centerId"),
			}),
		);

		const res = await app.request(
			"http://localhost/protected",
			{ headers: { Cookie: "better-auth.session_token=valid-token" } },
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
		await expect(res.json()).resolves.toEqual({
			userId: "user-1",
			centerId: "center-1",
		});
		expect(getSessionMock).toHaveBeenCalledTimes(1);
	});
});
