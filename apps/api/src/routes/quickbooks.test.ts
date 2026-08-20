import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createTestApp, jsonBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requirePermission: (...permissions: string[]) =>
			createMiddleware(async (c, next) => {
				const role = c.get("role");
				if (role !== "owner" || permissions.length === 0) {
					throw new HTTPException(403, { message: "Insufficient permissions" });
				}
				await next();
			}),
		requireRole: (...roles: string[]) =>
			createMiddleware(async (c, next) => {
				const role = c.get("role");
				if (!role || !roles.includes(role)) {
					throw new HTTPException(403, { message: "Insufficient permissions" });
				}
				await next();
			}),
		requireCenter: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
			await next();
		}),
	};
});

vi.mock("../middleware/plan.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	return {
		requireEntitlement: () =>
			createMiddleware(async (_c, next) => {
				await next();
			}),
	};
});

vi.mock("../services/quickbooks.js", () => ({
	startQuickBooksConnect: vi.fn().mockResolvedValue({
		state: "signed-state",
		url: "https://appcenter.intuit.com/connect/oauth2?state=signed-state",
	}),
	decodeQuickBooksStateWithFallback: vi.fn().mockReturnValue({
		centerId: "center-1",
		membershipId: "membership-1",
		userId: "user-1",
		issuedAt: Date.now(),
	}),
	completeQuickBooksConnectCallback: vi.fn().mockResolvedValue({
		redirectUrl: "http://localhost:3040/settings?quickbooks=connected",
	}),
	disconnectQuickBooks: vi.fn().mockResolvedValue({ disconnected: true }),
	getQuickBooksStatus: vi.fn().mockResolvedValue({
		connected: true,
		connection: {
			id: "connection-1",
			realmId: "realm-1",
			companyName: "Pebble Books",
		},
		openReconciliationCount: 1,
	}),
	runQuickBooksSync: vi.fn().mockResolvedValue({
		scannedEntities: 2,
		createdSyncLogs: 2,
		createdReconciliationItems: 1,
	}),
	listQuickBooksSyncHistory: vi.fn().mockResolvedValue([
		{
			id: "log-1",
			centerId: "center-1",
			connectionId: "connection-1",
			entityType: "invoice",
			entityId: "invoice-1",
			qbEntityId: "qb-invoice-1",
			direction: "push",
			status: "success",
			syncedAt: "2026-05-01T09:05:00.000Z",
			createdAt: "2026-05-01T09:05:00.000Z",
		},
	]),
	listQuickBooksReconciliationItems: vi.fn().mockResolvedValue([
		{
			id: "1a1a1234-0000-0000-0000-000000000001",
			centerId: "center-1",
			entityType: "invoice",
			entityId: "invoice-1",
			issueType: "missing_link",
			status: "open",
			createdAt: "2026-05-01T09:00:00.000Z",
			updatedAt: "2026-05-01T09:00:00.000Z",
		},
	]),
	approveQuickBooksReconciliation: vi.fn().mockResolvedValue({
		item: {
			id: "1a1a1234-0000-0000-0000-000000000001",
			status: "approved",
		},
		link: {
			id: "link-1",
			entityType: "invoice",
			entityId: "invoice-1",
			qbEntityId: "qb-invoice-1",
		},
	}),
	dismissQuickBooksReconciliation: vi.fn().mockResolvedValue({
		id: "1a1a1234-0000-0000-0000-000000000001",
		status: "dismissed",
	}),
}));

const {
	approveQuickBooksReconciliation,
	completeQuickBooksConnectCallback,
	dismissQuickBooksReconciliation,
	disconnectQuickBooks,
	getQuickBooksStatus,
	listQuickBooksReconciliationItems,
	listQuickBooksSyncHistory,
	runQuickBooksSync,
	startQuickBooksConnect,
} = await import("../services/quickbooks.js");
const { quickbooksRoutes } = await import("./quickbooks");

function mountQuickBooks(app: Hono<AppEnv>) {
	app.route("/api/quickbooks", quickbooksRoutes);
}

describe("quickbooks routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("starts the quickbooks oauth flow for the current owner", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/connect/start",
			{ method: "POST" },
			{
				QUICKBOOKS_CLIENT_ID: "client-id",
				QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
				BETTER_AUTH_SECRET: "test-secret",
				APP_URL: "http://localhost:3040",
			},
		);

		expect(res.status).toBe(200);
		expect(startQuickBooksConnect).toHaveBeenCalledWith(
			"center-1",
			"membership-1",
			"user-1",
			expect.objectContaining({
				clientId: "client-id",
				redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
				appUrl: "http://localhost:3040",
				secret: "test-enc-key-padded-to-32-chars!!",
			}),
		);
		await expect(res.json()).resolves.toEqual({
			url: "https://appcenter.intuit.com/connect/oauth2?state=signed-state",
		});
		expect(res.headers.get("set-cookie")).toContain("qb_connect_state=signed-state");
	});

	it("starts the quickbooks oauth flow through the documented connect route", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/connect",
			{ method: "POST" },
			{
				QUICKBOOKS_CLIENT_ID: "client-id",
				QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
				BETTER_AUTH_SECRET: "test-secret",
				APP_URL: "http://localhost:3040",
			},
		);

		expect(res.status).toBe(200);
		expect(startQuickBooksConnect).toHaveBeenCalledWith(
			"center-1",
			"membership-1",
			"user-1",
			expect.objectContaining({
				clientId: "client-id",
				redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
			}),
		);
		expect(res.headers.get("set-cookie")).toContain("qb_connect_state=signed-state");
	});

	it("prefers QB_TOKEN_ENC_KEY for quickbooks oauth and sync secrets when it is configured", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);

		const [connectRes, syncRes] = await Promise.all([
			app.request(
				"/api/quickbooks/connect/start",
				{ method: "POST" },
				{
					QUICKBOOKS_CLIENT_ID: "client-id",
					QUICKBOOKS_CLIENT_SECRET: "client-secret",
					QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
					QB_TOKEN_ENC_KEY: "qb-token-enc-key-padded-to-32-bytes!",
					BETTER_AUTH_SECRET: "test-secret",
					APP_URL: "http://localhost:3040",
				},
			),
			app.request(
				"/api/quickbooks/sync",
				{ method: "POST" },
				{
					QB_TOKEN_ENC_KEY: "qb-token-enc-key-padded-to-32-bytes!",
					BETTER_AUTH_SECRET: "test-secret",
				},
			),
		]);

		expect(connectRes.status).toBe(200);
		expect(syncRes.status).toBe(200);
		expect(startQuickBooksConnect).toHaveBeenCalledWith(
			"center-1",
			"membership-1",
			"user-1",
			expect.objectContaining({
				secret: "qb-token-enc-key-padded-to-32-bytes!",
				legacySecret: "test-secret",
			}),
		);
		expect(runQuickBooksSync).toHaveBeenCalledWith(
			expect.anything(),
			"center-1",
			undefined,
			expect.objectContaining({
				secret: "qb-token-enc-key-padded-to-32-bytes!",
				legacySecret: "test-secret",
			}),
		);
	});

	it("rejects connect start when the client secret is missing and callback would fail", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/connect/start",
			{ method: "POST" },
			{
				QUICKBOOKS_CLIENT_ID: "client-id",
				QUICKBOOKS_CLIENT_SECRET: "",
				QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
				BETTER_AUTH_SECRET: "test-secret",
				APP_URL: "http://localhost:3040",
			},
		);

		expect(res.status).toBe(400);
		expect(startQuickBooksConnect).not.toHaveBeenCalledWith(
			"center-1",
			"membership-1",
			"user-1",
			expect.objectContaining({
				clientId: "client-id",
			}),
		);
		await expect(res.text()).resolves.toContain(
			"QuickBooks isn't configured in this environment yet.",
		);
	});

	it("rejects quickbooks connect start when the environment is not configured", async () => {
		vi.mocked(startQuickBooksConnect).mockRejectedValueOnce(
			new Error("QuickBooks isn't configured in this environment yet."),
		);
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/connect/start",
			{ method: "POST" },
			{
				QUICKBOOKS_CLIENT_ID: "qb_client_id_replace_me",
				QUICKBOOKS_CLIENT_SECRET: "qb_client_secret_replace_me",
				QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
				BETTER_AUTH_SECRET: "test-secret",
				APP_URL: "http://localhost:3040",
			},
		);

		expect(res.status).toBe(400);
		expect(startQuickBooksConnect).toHaveBeenCalledWith(
			"center-1",
			"membership-1",
			"user-1",
			expect.objectContaining({
				clientId: "qb_client_id_replace_me",
			}),
		);
		await expect(res.text()).resolves.toContain(
			"QuickBooks isn't configured in this environment yet.",
		);
	});

	it("completes the quickbooks oauth callback and redirects back to settings", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/connect/callback?code=oauth-code&realmId=realm-1&state=signed-state",
			{
				headers: {
					Cookie: "qb_connect_state=signed-state",
				},
			},
			{
				QUICKBOOKS_CLIENT_ID: "client-id",
				QUICKBOOKS_CLIENT_SECRET: "client-secret",
				QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
				BETTER_AUTH_SECRET: "test-secret",
				APP_URL: "http://localhost:3040",
			},
		);

		expect(res.status).toBe(302);
		expect(completeQuickBooksConnectCallback).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				code: "oauth-code",
				realmId: "realm-1",
				state: "signed-state",
			}),
			expect.objectContaining({
				clientId: "client-id",
				clientSecret: "client-secret",
				redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
				appUrl: "http://localhost:3040",
				secret: "test-enc-key-padded-to-32-chars!!",
			}),
		);
		expect(res.headers.get("location")).toBe("http://localhost:3040/settings?quickbooks=connected");
	});

	it("redirects oauth callback failures back to settings with an error", async () => {
		vi.mocked(completeQuickBooksConnectCallback).mockRejectedValueOnce(
			new Error("Invalid QuickBooks OAuth state"),
		);
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/connect/callback?state=invalid-state",
			{
				headers: {
					Cookie: "qb_connect_state=invalid-state",
				},
			},
			{
				QUICKBOOKS_CLIENT_ID: "client-id",
				QUICKBOOKS_CLIENT_SECRET: "client-secret",
				QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
				BETTER_AUTH_SECRET: "test-secret",
				APP_URL: "http://localhost:3040",
			},
		);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("/settings?quickbooks=error");
		expect(res.headers.get("location")).toContain("reason=Invalid+QuickBooks+OAuth+state");
	});

	it("rejects callback requests that do not present the one-time state cookie", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/connect/callback?state=signed-state",
			undefined,
			{
				QUICKBOOKS_CLIENT_ID: "client-id",
				QUICKBOOKS_CLIENT_SECRET: "client-secret",
				QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
				BETTER_AUTH_SECRET: "test-secret",
				APP_URL: "http://localhost:3040",
			},
		);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("reason=Invalid+QuickBooks+OAuth+state");
	});

	it("does not consume the one-time state cookie when the callback state does not match", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/connect/callback?state=unexpected-state",
			{
				headers: {
					Cookie: "qb_connect_state=signed-state",
				},
			},
			{
				QUICKBOOKS_CLIENT_ID: "client-id",
				QUICKBOOKS_CLIENT_SECRET: "client-secret",
				QUICKBOOKS_REDIRECT_URI: "http://localhost:8790/api/quickbooks/connect/callback",
				BETTER_AUTH_SECRET: "test-secret",
				APP_URL: "http://localhost:3040",
			},
		);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("reason=Invalid+QuickBooks+OAuth+state");
		expect(res.headers.get("set-cookie")).toBeNull();
	});

	it("returns status, sync history, reconciliation items, and manual sync counts", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);

		const [statusRes, historyRes, reconciliationRes, syncRes] = await Promise.all([
			app.request("/api/quickbooks/status"),
			app.request("/api/quickbooks/sync/history"),
			app.request("/api/quickbooks/reconciliation"),
			app.request(
				"/api/quickbooks/sync",
				{ method: "POST" },
				{ BETTER_AUTH_SECRET: "test-secret" },
			),
		]);

		expect(statusRes.status).toBe(200);
		expect(historyRes.status).toBe(200);
		expect(reconciliationRes.status).toBe(200);
		expect(syncRes.status).toBe(200);
		expect(getQuickBooksStatus).toHaveBeenCalledWith(
			expect.anything(),
			"center-1",
			expect.objectContaining({
				clientId: "test-qb-client-id",
			}),
		);
		expect(listQuickBooksSyncHistory).toHaveBeenCalledWith(expect.anything(), "center-1");
		expect(listQuickBooksReconciliationItems).toHaveBeenCalledWith(expect.anything(), "center-1");
		expect(runQuickBooksSync).toHaveBeenCalledWith(
			expect.anything(),
			"center-1",
			undefined,
			expect.objectContaining({
				secret: "test-enc-key-padded-to-32-chars!!",
			}),
		);
	});

	it("supports explicit sync actions and reconciliation filters", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);

		const [syncRes, reconciliationRes] = await Promise.all([
			app.request(
				"/api/quickbooks/sync/import",
				{ method: "POST" },
				{ BETTER_AUTH_SECRET: "test-secret" },
			),
			app.request("/api/quickbooks/reconciliation?status=open"),
		]);

		expect(syncRes.status).toBe(200);
		expect(reconciliationRes.status).toBe(200);
		expect(runQuickBooksSync).toHaveBeenCalledWith(
			expect.anything(),
			"center-1",
			"import",
			expect.objectContaining({
				secret: "test-enc-key-padded-to-32-chars!!",
			}),
		);
		expect(listQuickBooksReconciliationItems).toHaveBeenCalledWith(
			expect.anything(),
			"center-1",
			"open",
		);
	});

	it("rejects invalid reconciliation status filters with a client error", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);

		const res = await app.request("/api/quickbooks/reconciliation?status=bogus");

		expect(res.status).toBe(400);
		expect(listQuickBooksReconciliationItems).not.toHaveBeenCalled();
	});

	it("rejects invalid quickbooks sync actions with a client error", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request(
			"/api/quickbooks/sync/exports",
			{ method: "POST" },
			{ BETTER_AUTH_SECRET: "test-secret" },
		);

		expect(res.status).toBe(400);
		expect(runQuickBooksSync).not.toHaveBeenCalledWith(
			expect.anything(),
			"center-1",
			"exports",
			expect.anything(),
		);
	});

	it("approves and dismisses reconciliation items", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);

		const approveRes = await app.request(
			"/api/quickbooks/reconciliation/1a1a1234-0000-0000-0000-000000000001/approve",
			jsonBody({
				qbEntityId: "qb-invoice-1",
			}),
		);
		const dismissRes = await app.request(
			"/api/quickbooks/reconciliation/1a1a1234-0000-0000-0000-000000000001/dismiss",
			{
				method: "POST",
			},
		);

		expect(approveRes.status).toBe(200);
		expect(dismissRes.status).toBe(200);
		expect(approveQuickBooksReconciliation).toHaveBeenCalledWith(
			expect.anything(),
			"center-1",
			"membership-1",
			"1a1a1234-0000-0000-0000-000000000001",
			expect.objectContaining({
				qbEntityId: "qb-invoice-1",
			}),
		);
		expect(dismissQuickBooksReconciliation).toHaveBeenCalledWith(
			expect.anything(),
			"center-1",
			"membership-1",
			"1a1a1234-0000-0000-0000-000000000001",
		);
	});

	it("rejects invalid local reconciliation target ids before approval", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);

		const res = await app.request(
			"/api/quickbooks/reconciliation/1a1a1234-0000-0000-0000-000000000001/approve",
			jsonBody({
				localTargetId: "not-a-uuid",
			}),
		);

		expect(res.status).toBe(400);
		expect(approveQuickBooksReconciliation).not.toHaveBeenCalled();
	});

	it("disconnects the connected QuickBooks account", async () => {
		const app = createTestApp(mountQuickBooks, {} as never);
		const res = await app.request("/api/quickbooks/disconnect", { method: "POST" });

		expect(res.status).toBe(200);
		expect(disconnectQuickBooks).toHaveBeenCalledWith(expect.anything(), "center-1");
	});

	it("rejects access for directors", async () => {
		const app = createTestApp(mountQuickBooks, {} as never, { role: "director" });
		const res = await app.request("/api/quickbooks/status");

		expect(res.status).toBe(403);
	});

	it("rejects requests when the current user has no center membership", async () => {
		const app = createTestApp(mountQuickBooks, {} as never, { centerId: "" });

		const [
			connectRes,
			statusRes,
			disconnectRes,
			syncRes,
			syncActionRes,
			historyRes,
			reconciliationRes,
		] = await Promise.all([
			app.request("/api/quickbooks/connect/start", { method: "POST" }),
			app.request("/api/quickbooks/status"),
			app.request("/api/quickbooks/disconnect", { method: "POST" }),
			app.request("/api/quickbooks/sync", { method: "POST" }),
			app.request("/api/quickbooks/sync/export", { method: "POST" }),
			app.request("/api/quickbooks/sync/history"),
			app.request("/api/quickbooks/reconciliation"),
		]);

		expect(connectRes.status).toBe(403);
		expect(statusRes.status).toBe(403);
		expect(disconnectRes.status).toBe(403);
		expect(syncRes.status).toBe(403);
		expect(syncActionRes.status).toBe(403);
		expect(historyRes.status).toBe(403);
		expect(reconciliationRes.status).toBe(403);
	});

	it("rejects review actions without a membership id", async () => {
		const app = createTestApp(mountQuickBooks, {} as never, { membershipId: "" });

		const [approveRes, dismissRes] = await Promise.all([
			app.request(
				"/api/quickbooks/reconciliation/1a1a1234-0000-0000-0000-000000000001/approve",
				jsonBody({
					qbEntityId: "qb-invoice-1",
				}),
			),
			app.request("/api/quickbooks/reconciliation/1a1a1234-0000-0000-0000-000000000001/dismiss", {
				method: "POST",
			}),
		]);

		expect(approveRes.status).toBe(403);
		expect(dismissRes.status).toBe(403);
	});
});
