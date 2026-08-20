import { guardians, invoices } from "@pebbledesk/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	approveQuickBooksReconciliation,
	completeQuickBooksConnectCallback,
	decryptQuickBooksToken,
	disconnectQuickBooks,
	dismissQuickBooksReconciliation,
	encryptQuickBooksToken,
	getQuickBooksStatus,
	listQuickBooksReconciliationItems,
	listQuickBooksSyncHistory,
	runQuickBooksSync,
	startQuickBooksConnect,
	syncInvoicePaymentState,
	upsertQuickBooksConnection,
} from "./quickbooks.js";

function collectStringValues(value: unknown, seen = new Set<object>()): string[] {
	if (typeof value === "string") return [value];
	if (!value || typeof value !== "object") return [];
	if (seen.has(value)) return [];
	seen.add(value);

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectStringValues(item, seen));
	}

	return Object.values(value).flatMap((item) => collectStringValues(item, seen));
}

describe("quickbooks service", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-01T09:00:00.000Z"));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("builds a signed quickbooks authorize url for the current center owner", async () => {
		const result = await startQuickBooksConnect("center-1", "membership-1", "user-1", {
			clientId: "client-id",
			redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
			appUrl: "http://localhost:3040",
			secret: "test-secret",
		});

		expect(result.url).toContain("https://appcenter.intuit.com/connect/oauth2");
		expect(result.url).toContain("client_id=client-id");
		expect(result.url).toContain(
			"redirect_uri=http%3A%2F%2Flocalhost%3A8790%2Fapi%2Fquickbooks%2Fconnect%2Fcallback",
		);
		expect(result.url).toContain("scope=com.intuit.quickbooks.accounting");
		expect(result.url).toContain("response_type=code");
		expect(result.url).toContain("state=");
	});

	it("rejects quickbooks connect when placeholder credentials are still configured", async () => {
		await expect(
			startQuickBooksConnect("center-1", "membership-1", "user-1", {
				clientId: "qb_client_id_replace_me",
				clientSecret: "qb_client_secret_replace_me",
				redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
				appUrl: "http://localhost:3040",
				secret: "test-secret",
			}),
		).rejects.toThrow("QuickBooks isn't configured in this environment yet.");
	});

	it("encrypts and decrypts tokens with the application secret", () => {
		const encrypted = encryptQuickBooksToken("access-token", "test-secret");

		expect(encrypted).not.toBe("access-token");
		expect(decryptQuickBooksToken(encrypted, "test-secret")).toBe("access-token");
	});

	it("keeps legacy-encrypted tokens readable after switching to QB_TOKEN_ENC_KEY", () => {
		const encrypted = encryptQuickBooksToken("access-token", "legacy-secret");

		expect(decryptQuickBooksToken(encrypted, "new-secret", "legacy-secret")).toBe("access-token");
	});

	it("rejects malformed encrypted tokens", () => {
		expect(() => decryptQuickBooksToken("invalid-token", "test-secret")).toThrow(
			"Invalid QuickBooks token",
		);
	});

	it("exchanges an oauth callback code for quickbooks tokens and stores the connection", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				access_token: "access-token",
				refresh_token: "refresh-token",
				expires_in: 3600,
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "membership-1",
									centerId: "center-1",
									userId: "user-1",
									role: "owner",
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "guardian-9",
									centerId: "center-1",
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "guardian-9",
									centerId: "center-1",
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoUpdate: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								companyName: null,
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		const { url } = await startQuickBooksConnect("center-1", "membership-1", "user-1", {
			clientId: "client-id",
			redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
			appUrl: "http://localhost:3040",
			secret: "test-secret",
		});
		const state = new URL(url).searchParams.get("state");

		const result = await completeQuickBooksConnectCallback(
			db as never,
			{
				code: "oauth-code",
				realmId: "realm-1",
				state: state ?? "",
			},
			{
				clientId: "client-id",
				clientSecret: "client-secret",
				redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
				appUrl: "http://localhost:3040",
				secret: "test-secret",
			},
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
			expect.objectContaining({
				method: "POST",
			}),
		);
		expect(result.redirectUrl).toBe("http://localhost:3040/settings?quickbooks=connected");
		expect(result.connection).toEqual(expect.objectContaining({ realmId: "realm-1" }));
		vi.unstubAllGlobals();
	});

	it("rejects quickbooks callback requests with invalid oauth state", async () => {
		await expect(
			completeQuickBooksConnectCallback(
				{} as never,
				{
					code: "oauth-code",
					realmId: "realm-1",
					state: "invalid-state",
				},
				{
					clientId: "client-id",
					clientSecret: "client-secret",
					redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
					appUrl: "http://localhost:3040",
					secret: "test-secret",
				},
			),
		).rejects.toThrow("Invalid QuickBooks OAuth state");
	});

	it("returns an error redirect when quickbooks returns an oauth error", async () => {
		await expect(
			completeQuickBooksConnectCallback(
				{} as never,
				{
					error: "access_denied",
					errorDescription: "The owner cancelled access.",
				},
				{
					clientId: "client-id",
					clientSecret: "client-secret",
					redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
					appUrl: "http://localhost:3040",
					secret: "test-secret",
				},
			),
		).resolves.toEqual({
			redirectUrl:
				"http://localhost:3040/settings?quickbooks=error&reason=The+owner+cancelled+access.",
		});
	});

	it("rejects quickbooks callback requests with missing callback params", async () => {
		await expect(
			completeQuickBooksConnectCallback(
				{} as never,
				{
					state: "state-only",
				},
				{
					clientId: "client-id",
					clientSecret: "client-secret",
					redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
					appUrl: "http://localhost:3040",
					secret: "test-secret",
				},
			),
		).rejects.toThrow("Missing QuickBooks OAuth callback parameters");
	});

	it("rejects quickbooks callback requests when the client secret is missing", async () => {
		const { url } = await startQuickBooksConnect("center-1", "membership-1", "user-1", {
			clientId: "client-id",
			redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
			appUrl: "http://localhost:3040",
			secret: "test-secret",
		});
		const state = new URL(url).searchParams.get("state");

		await expect(
			completeQuickBooksConnectCallback(
				{} as never,
				{
					code: "oauth-code",
					realmId: "realm-1",
					state: state ?? "",
				},
				{
					clientId: "client-id",
					redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
					appUrl: "http://localhost:3040",
					secret: "test-secret",
				},
			),
		).rejects.toThrow("QuickBooks client secret is not configured");
	});

	it("rejects quickbooks callback requests when the originating owner membership is gone", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				access_token: "access-token",
				refresh_token: "refresh-token",
				expires_in: 3600,
			}),
		});
		vi.stubGlobal("fetch", fetchMock);
		const { url } = await startQuickBooksConnect("center-1", "membership-1", "user-1", {
			clientId: "client-id",
			redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
			appUrl: "http://localhost:3040",
			secret: "test-secret",
		});
		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		};

		await expect(
			completeQuickBooksConnectCallback(
				db as never,
				{
					code: "oauth-code",
					realmId: "realm-1",
					state: new URL(url).searchParams.get("state") ?? "",
				},
				{
					clientId: "client-id",
					clientSecret: "client-secret",
					redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
					appUrl: "http://localhost:3040",
					secret: "test-secret",
				},
			),
		).rejects.toThrow("QuickBooks OAuth session is no longer valid");
		vi.unstubAllGlobals();
	});

	it("rejects expired quickbooks oauth state payloads", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-01T09:00:00.000Z"));
		const { url } = await startQuickBooksConnect("center-1", "membership-1", "user-1", {
			clientId: "client-id",
			redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
			appUrl: "http://localhost:3040",
			secret: "test-secret",
		});
		vi.setSystemTime(new Date("2026-05-01T09:15:00.000Z"));

		await expect(
			completeQuickBooksConnectCallback(
				{} as never,
				{
					code: "oauth-code",
					realmId: "realm-1",
					state: new URL(url).searchParams.get("state") ?? "",
				},
				{
					clientId: "client-id",
					clientSecret: "client-secret",
					redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
					appUrl: "http://localhost:3040",
					secret: "test-secret",
				},
			),
		).rejects.toThrow("Expired QuickBooks OAuth state");

		vi.useRealTimers();
	});

	it("rejects failed quickbooks token exchanges", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
		});
		vi.stubGlobal("fetch", fetchMock);
		const { url } = await startQuickBooksConnect("center-1", "membership-1", "user-1", {
			clientId: "client-id",
			redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
			appUrl: "http://localhost:3040",
			secret: "test-secret",
		});

		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "membership-1",
								centerId: "center-1",
								userId: "user-1",
								role: "owner",
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			completeQuickBooksConnectCallback(
				db as never,
				{
					code: "oauth-code",
					realmId: "realm-1",
					state: new URL(url).searchParams.get("state") ?? "",
				},
				{
					clientId: "client-id",
					clientSecret: "client-secret",
					redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
					appUrl: "http://localhost:3040",
					secret: "test-secret",
				},
			),
		).rejects.toThrow("Failed to exchange QuickBooks OAuth code");
		vi.unstubAllGlobals();
	});

	it("rejects incomplete quickbooks token responses", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				access_token: "access-token",
			}),
		});
		vi.stubGlobal("fetch", fetchMock);
		const { url } = await startQuickBooksConnect("center-1", "membership-1", "user-1", {
			clientId: "client-id",
			redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
			appUrl: "http://localhost:3040",
			secret: "test-secret",
		});

		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "membership-1",
								centerId: "center-1",
								userId: "user-1",
								role: "owner",
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			completeQuickBooksConnectCallback(
				db as never,
				{
					code: "oauth-code",
					realmId: "realm-1",
					state: new URL(url).searchParams.get("state") ?? "",
				},
				{
					clientId: "client-id",
					clientSecret: "client-secret",
					redirectUri: "http://localhost:8790/api/quickbooks/connect/callback",
					appUrl: "http://localhost:3040",
					secret: "test-secret",
				},
			),
		).rejects.toThrow("QuickBooks OAuth token response was incomplete");
		vi.unstubAllGlobals();
	});

	it("upserts a new connection with encrypted credentials", async () => {
		const returning = vi.fn().mockResolvedValue([
			{
				id: "connection-1",
				centerId: "center-1",
				realmId: "realm-1",
				companyName: "Pebble Books",
				scopes: ["com.intuit.quickbooks.accounting"],
				syncDirection: "pull",
				status: "connected",
				connectedAt: new Date("2026-05-01T09:00:00.000Z"),
				updatedAt: new Date("2026-05-01T09:00:00.000Z"),
			},
		]);
		const onConflictDoUpdate = vi.fn().mockReturnValue({
			returning,
		});
		const values = vi.fn().mockReturnValue({
			onConflictDoUpdate,
		});
		const db = {
			insert: vi.fn().mockReturnValue({ values }),
		};

		await expect(
			upsertQuickBooksConnection(
				db as never,
				"center-1",
				{
					realmId: "realm-1",
					accessToken: "access-token",
					refreshToken: "refresh-token",
					tokenExpiresAt: "2026-05-10T00:00:00.000Z",
					companyName: "Pebble Books",
					scopes: ["com.intuit.quickbooks.accounting"],
					syncDirection: "pull",
				},
				"test-secret",
			),
		).resolves.toEqual(
			expect.objectContaining({
				realmId: "realm-1",
				companyName: "Pebble Books",
			}),
		);

		const insertedValues = values.mock.calls[0]?.[0] as {
			accessToken: string;
			refreshToken: string;
			realmId: string;
		};
		expect(insertedValues.realmId).toBe("realm-1");
		expect(insertedValues.accessToken).not.toBe("access-token");
		expect(insertedValues.refreshToken).not.toBe("refresh-token");
		expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
	});

	it("upserts an existing connection instead of issuing a separate update", async () => {
		const returning = vi.fn().mockResolvedValue([
			{
				id: "connection-1",
				centerId: "center-1",
				realmId: "realm-1",
				companyName: "Pebble Books",
				scopes: ["com.intuit.quickbooks.accounting"],
				syncDirection: "pull",
				status: "connected",
				tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
				connectedAt: new Date("2026-05-02T09:00:00.000Z"),
				updatedAt: new Date("2026-05-02T09:00:00.000Z"),
			},
		]);
		const onConflictDoUpdate = vi.fn().mockReturnValue({
			returning,
		});
		const values = vi.fn().mockReturnValue({
			onConflictDoUpdate,
		});
		const db = {
			insert: vi.fn().mockReturnValue({ values }),
			select: vi.fn(),
			update: vi.fn(),
		};

		await expect(
			upsertQuickBooksConnection(
				db as never,
				"center-1",
				{
					realmId: "realm-1",
					accessToken: "access-token",
					refreshToken: "refresh-token",
					tokenExpiresAt: "2026-05-10T00:00:00.000Z",
					companyName: "Pebble Books",
					scopes: ["com.intuit.quickbooks.accounting"],
					syncDirection: "pull",
				},
				"test-secret",
			),
		).resolves.toEqual(expect.objectContaining({ realmId: "realm-1", syncDirection: "pull" }));
		expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
		expect(db.select).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
	});

	it("reports status and sync history for a connected center", async () => {
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									companyName: "Pebble Books",
									scopes: ["com.intuit.quickbooks.accounting"],
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "log-1",
										centerId: "center-1",
										connectionId: "connection-1",
										entityType: "invoice",
										entityId: "invoice-1",
										qbEntityId: "qb-invoice-1",
										direction: "push",
										status: "success",
										errorMessage: null,
										syncedAt: new Date("2026-05-01T09:05:00.000Z"),
										createdAt: new Date("2026-05-01T09:05:00.000Z"),
									},
								]),
							}),
						}),
					}),
				}),
		};

		await expect(getQuickBooksStatus(db as never, "center-1")).resolves.toEqual(
			expect.objectContaining({
				status: "connected",
				openReconciliationCount: 0,
				connection: expect.objectContaining({
					realmId: "realm-1",
					companyName: "Pebble Books",
				}),
				lastSync: expect.objectContaining({
					status: "success",
					direction: "push",
				}),
			}),
		);
	});

	it("exports guardians to quickbooks customers and keeps advisory items for unlinked invoices and payments", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Customer: {
						Id: "qb-customer-1",
						SyncToken: "0",
					},
				}),
			});
		vi.stubGlobal("fetch", fetchMock);

		const insertCustomerLink = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "link-1",
						centerId: "center-1",
						connectionId: "connection-1",
						entityType: "customer",
						entityId: "guardian-1",
						qbEntityType: "customer",
						qbEntityId: "qb-customer-1",
						syncStatus: "success",
						lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
						createdAt: new Date("2026-05-01T09:10:00.000Z"),
						updatedAt: new Date("2026-05-01T09:10:00.000Z"),
					},
				]),
			}),
		};

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									companyName: "Pebble Books",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "guardian-1",
								centerId: "center-1",
								firstName: "Jane",
								lastName: "Doe",
								email: "family@example.com",
								phone: "555-1111",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "invoice-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "payment-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce(insertCustomerLink)
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", undefined, {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "full",
				scannedEntities: 6,
				createdSyncLogs: 6,
				createdReconciliationItems: 2,
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"https://quickbooks.api.intuit.com/v3/company/realm-1/query?query=select%20*%20from%20Customer%20where%20DisplayName%20%3D%20'Jane%20Doe'",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer access-token",
				}),
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"https://quickbooks.api.intuit.com/v3/company/realm-1/customer",
			expect.objectContaining({
				method: "POST",
			}),
		);
		expect(db.insert).toHaveBeenCalledTimes(4);
		vi.unstubAllGlobals();
	});

	it("exports linked invoices and payments to QuickBooks entities", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Invoice: {
						Id: "qb-invoice-1",
						SyncToken: "0",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Payment: {
						Id: "qb-payment-1",
						SyncToken: "0",
					},
				}),
			});
		vi.stubGlobal("fetch", fetchMock);

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "invoice-1",
								centerId: "center-1",
								guardianId: "guardian-1",
								periodStart: "2026-05-01",
								periodEnd: "2026-05-31",
								subtotal: 1200,
								subsidyCredit: 100,
								amountDue: 1100,
								status: "sent",
								dueDate: "2026-05-15",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "payment-1",
								centerId: "center-1",
								invoiceId: "invoice-1",
								amount: 1100,
								method: "ach",
								provider: "manual",
								status: "posted",
								reference: "PAY-1",
								paidAt: new Date("2026-05-05T09:00:00.000Z"),
								createdAt: new Date("2026-05-05T09:00:00.000Z"),
								updatedAt: new Date("2026-05-05T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "customer-link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "customer",
								entityId: "guardian-1",
								qbEntityType: "customer",
								qbEntityId: "qb-customer-1",
								syncStatus: "success",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "line-1",
								invoiceId: "invoice-1",
								description: "Weekly tuition",
								quantity: 1,
								unitPrice: 1200,
								amount: 1200,
								childId: null,
							},
						]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "invoice-link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "invoice",
								entityId: "invoice-1",
								qbEntityType: "invoice",
								qbEntityId: "qb-invoice-1",
								syncStatus: "success",
								lastSyncedAt: new Date("2026-05-10T09:00:00.000Z"),
								createdAt: new Date("2026-05-10T09:00:00.000Z"),
								updatedAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "payment-link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "payment",
								entityId: "payment-1",
								qbEntityType: "payment",
								qbEntityId: "qb-payment-1",
								syncStatus: "success",
								lastSyncedAt: new Date("2026-05-10T09:00:00.000Z"),
								createdAt: new Date("2026-05-10T09:00:00.000Z"),
								updatedAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "export", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "export",
				createdReconciliationItems: 0,
				createdSyncLogs: 2,
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"https://quickbooks.api.intuit.com/v3/company/realm-1/invoice",
			expect.objectContaining({ method: "POST" }),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"https://quickbooks.api.intuit.com/v3/company/realm-1/payment",
			expect.objectContaining({ method: "POST" }),
		);
		vi.unstubAllGlobals();
	});

	it("does not export draft or void invoices to QuickBooks receivables", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "invoice-draft",
								centerId: "center-1",
								guardianId: "guardian-1",
								periodStart: "2026-05-01",
								periodEnd: "2026-05-31",
								subtotal: 1200,
								subsidyCredit: 0,
								amountDue: 1200,
								status: "draft",
								dueDate: "2026-05-15",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
							{
								id: "invoice-void",
								centerId: "center-1",
								guardianId: "guardian-1",
								periodStart: "2026-05-01",
								periodEnd: "2026-05-31",
								subtotal: 1200,
								subsidyCredit: 0,
								amountDue: 1200,
								status: "void",
								dueDate: "2026-05-15",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "reconciliation-item-1",
							status: "open",
						},
					]),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "export", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "export",
				scannedEntities: 0,
				createdReconciliationItems: 0,
				createdSyncLogs: 0,
			}),
		);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("reuses an existing quickbooks customer when a guardian link is missing locally", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				QueryResponse: {
					Customer: [
						{
							Id: "qb-customer-mismatch",
							SyncToken: "0",
							DisplayName: "Jane Doe",
							PrimaryEmailAddr: {
								Address: "other-family@example.com",
							},
						},
						{
							Id: "qb-customer-1",
							SyncToken: "0",
							DisplayName: "Jane Doe",
							PrimaryEmailAddr: {
								Address: "family@example.com",
							},
						},
					],
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const insertCustomerLink = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "link-1",
						centerId: "center-1",
						connectionId: "connection-1",
						entityType: "customer",
						entityId: "guardian-1",
						qbEntityType: "customer",
						qbEntityId: "qb-customer-1",
						syncStatus: "success",
						lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
						createdAt: new Date("2026-05-01T09:10:00.000Z"),
						updatedAt: new Date("2026-05-01T09:10:00.000Z"),
					},
				]),
			}),
		};

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									companyName: "Pebble Books",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "guardian-1",
								centerId: "center-1",
								firstName: "Jane",
								lastName: "Doe",
								email: "family@example.com",
								phone: "555-1111",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce(insertCustomerLink)
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "export", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "export",
				createdSyncLogs: 1,
				createdReconciliationItems: 0,
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(db.insert).toHaveBeenCalledTimes(2);
		vi.unstubAllGlobals();
	});

	it("creates a new quickbooks customer when a same-name match has different contact details", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {
						Customer: [
							{
								Id: "qb-customer-existing",
								SyncToken: "0",
								DisplayName: "Jane Doe",
								PrimaryEmailAddr: {
									Address: "other-family@example.com",
								},
								PrimaryPhone: {
									FreeFormNumber: "555-9999",
								},
							},
						],
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Customer: {
						Id: "qb-customer-new",
						SyncToken: "0",
					},
				}),
			});
		vi.stubGlobal("fetch", fetchMock);

		const insertCustomerLink = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "link-1",
						centerId: "center-1",
						connectionId: "connection-1",
						entityType: "customer",
						entityId: "guardian-1",
						qbEntityType: "customer",
						qbEntityId: "qb-customer-new",
						syncStatus: "success",
						lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
						createdAt: new Date("2026-05-01T09:10:00.000Z"),
						updatedAt: new Date("2026-05-01T09:10:00.000Z"),
					},
				]),
			}),
		};

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									companyName: "Pebble Books",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "guardian-1",
								centerId: "center-1",
								firstName: "Jane",
								lastName: "Doe",
								email: "family@example.com",
								phone: "555-1111",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce(insertCustomerLink)
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "export", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "export",
				createdSyncLogs: 1,
				createdReconciliationItems: 0,
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"https://quickbooks.api.intuit.com/v3/company/realm-1/customer",
			expect.objectContaining({
				method: "POST",
			}),
		);
		expect(db.insert).toHaveBeenCalledTimes(2);
		vi.unstubAllGlobals();
	});

	it("creates a new quickbooks customer when the matched customer is already linked to another guardian", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {
						Customer: [
							{
								Id: "qb-customer-linked",
								SyncToken: "0",
								DisplayName: "Jane Doe",
								PrimaryEmailAddr: {
									Address: "family@example.com",
								},
							},
						],
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Customer: {
						Id: "qb-customer-new",
						SyncToken: "0",
					},
				}),
			});
		vi.stubGlobal("fetch", fetchMock);

		const insertCustomerLink = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "link-2",
						centerId: "center-1",
						connectionId: "connection-1",
						entityType: "customer",
						entityId: "guardian-1",
						qbEntityType: "customer",
						qbEntityId: "qb-customer-new",
						syncStatus: "success",
						lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
						createdAt: new Date("2026-05-01T09:10:00.000Z"),
						updatedAt: new Date("2026-05-01T09:10:00.000Z"),
					},
				]),
			}),
		};

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									companyName: "Pebble Books",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "guardian-1",
								centerId: "center-1",
								firstName: "Jane",
								lastName: "Doe",
								email: "family@example.com",
								phone: "555-1111",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "link-existing",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "customer",
								entityId: "guardian-2",
								qbEntityType: "customer",
								qbEntityId: "qb-customer-linked",
								syncStatus: "success",
								lastSyncedAt: new Date("2026-05-01T09:00:00.000Z"),
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce(insertCustomerLink)
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "export", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "export",
				createdSyncLogs: 1,
				createdReconciliationItems: 0,
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"https://quickbooks.api.intuit.com/v3/company/realm-1/customer",
			expect.objectContaining({
				method: "POST",
			}),
		);
		vi.unstubAllGlobals();
	});

	it("reuses a single unlinked same-name customer when neither side has contact details", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				QueryResponse: {
					Customer: [
						{
							Id: "qb-customer-1",
							SyncToken: "0",
							DisplayName: "Jane Doe",
						},
					],
				},
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const insertCustomerLink = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "link-1",
						centerId: "center-1",
						connectionId: "connection-1",
						entityType: "customer",
						entityId: "guardian-1",
						qbEntityType: "customer",
						qbEntityId: "qb-customer-1",
						syncStatus: "success",
						lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
						createdAt: new Date("2026-05-01T09:10:00.000Z"),
						updatedAt: new Date("2026-05-01T09:10:00.000Z"),
					},
				]),
			}),
		};

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									companyName: "Pebble Books",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "guardian-1",
								centerId: "center-1",
								firstName: "Jane",
								lastName: "Doe",
								email: null,
								phone: null,
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce(insertCustomerLink)
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "export", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "export",
				createdSyncLogs: 1,
				createdReconciliationItems: 0,
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(db.insert).toHaveBeenCalledTimes(2);
		vi.unstubAllGlobals();
	});

	it("reports approved reconciliation updates with an entity link", async () => {
		const insert = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "link-1",
							centerId: "center-1",
							connectionId: "connection-1",
							entityType: "invoice",
							entityId: "invoice-1",
							qbEntityType: "invoice",
							qbEntityId: "qb-invoice-1",
							syncStatus: "success",
							lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
							createdAt: new Date("2026-05-01T09:10:00.000Z"),
							updatedAt: new Date("2026-05-01T09:10:00.000Z"),
						},
					]),
				}),
			})
			.mockReturnValueOnce({
				values: vi.fn().mockResolvedValue(undefined),
			});

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-1",
									issueType: "missing_link",
									title: "Invoice needs a QuickBooks link",
									description: "Invoice invoice-1 still needs a manual QuickBooks link.",
									proposedChanges: null,
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			insert,
			update: vi
				.fn()
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-1",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-1",
									issueType: "missing_link",
									title: "Invoice needs a QuickBooks link",
									description: "Invoice invoice-1 still needs a manual QuickBooks link.",
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-01T09:10:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
									lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-10",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 1000,
									subsidyCredit: 0,
									amountDue: 1000,
									status: "sent",
									dueDate: "2026-05-15",
									publicLinkToken: "existing-token",
									publicLinkVersion: 2,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-1", {
				qbEntityId: "qb-invoice-1",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				item: expect.objectContaining({ status: "approved" }),
				link: expect.objectContaining({ qbEntityId: "qb-invoice-1" }),
				connection: expect.objectContaining({ status: "connected" }),
			}),
		);
	});

	it("approves a quickbooks-origin customer reconciliation against a local guardian", async () => {
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof db) => Promise<unknown>) => fn(db)),
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-customer-1",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "customer",
									entityId: "qb-customer-2",
									qbEntityType: "customer",
									qbEntityId: "qb-customer-2",
									issueType: "missing_link",
									title: "QuickBooks customer needs a PebbleDesk guardian",
									description:
										"Match this QuickBooks customer to a local PebbleDesk guardian before applying imported contact changes.",
									proposedChanges: {
										email: "updated@example.com",
										phone: "555-2222",
									},
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "guardian-9",
									centerId: "center-1",
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "link-customer-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "customer",
								entityId: "guardian-9",
								qbEntityType: "customer",
								qbEntityId: "qb-customer-2",
								syncStatus: "success",
								lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
								createdAt: new Date("2026-05-01T09:10:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi
				.fn()
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue(undefined),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-customer-1",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "customer",
									entityId: "qb-customer-2",
									qbEntityType: "customer",
									qbEntityId: "qb-customer-2",
									issueType: "missing_link",
									title: "QuickBooks customer needs a PebbleDesk guardian",
									description:
										"Match this QuickBooks customer to a local PebbleDesk guardian before applying imported contact changes.",
									proposedChanges: {
										email: "updated@example.com",
									},
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-01T09:10:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
									lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-customer-1", {
				localTargetId: "guardian-9",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				link: expect.objectContaining({ entityId: "guardian-9", qbEntityId: "qb-customer-2" }),
				item: expect.objectContaining({ status: "approved" }),
			}),
		);
	});

	it("rejects quickbooks-origin customer approvals for guardians outside the center", async () => {
		const targetFromSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue([]),
			}),
		});
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof db) => Promise<unknown>) => fn(db)),
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-customer-cross-center",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "customer",
									entityId: "qb-customer-cross-center",
									qbEntityType: "customer",
									qbEntityId: "qb-customer-cross-center",
									issueType: "missing_link",
									title: "QuickBooks customer needs a PebbleDesk guardian",
									description: "Match this QuickBooks customer to a local guardian.",
									proposedChanges: { email: "updated@example.com" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: targetFromSpy,
				}),
			insert: vi.fn(),
			update: vi.fn(),
		};

		await expect(
			approveQuickBooksReconciliation(
				db as never,
				"center-1",
				"membership-1",
				"item-customer-cross-center",
				{
					localTargetId: "guardian-from-center-2",
				},
			),
		).rejects.toThrow("Selected local target does not belong to this center");

		expect(targetFromSpy).toHaveBeenCalledWith(guardians);
		expect(db.insert).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects reconciliation approvals that force a mismatched quickbooks entity type", async () => {
		const db = {
			transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "item-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "customer",
								entityId: "guardian-1",
								qbEntityType: "customer",
								qbEntityId: "qb-customer-1",
								issueType: "status_mismatch",
								title: "Guardian contact info differs from QuickBooks",
								description: "Review imported guardian contact updates before applying them.",
								proposedChanges: { email: "family@example.com" },
								status: "open",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-1", {
				qbEntityId: "qb-invoice-1",
				qbEntityType: "invoice",
			}),
		).rejects.toThrow("QuickBooks entity type does not match the reconciliation item");
	});

	it("imports linked quickbooks customers into reconciliation items when contact details differ", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Customer: {
						Id: "qb-customer-1",
						SyncToken: "1",
						GivenName: "Jane",
						FamilyName: "Doe",
						PrimaryEmailAddr: {
							Address: "new-family@example.com",
						},
						PrimaryPhone: {
							FreeFormNumber: "555-2222",
						},
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {
						Customer: [
							{
								Id: "qb-customer-1",
								GivenName: "Jane",
								FamilyName: "Doe",
								PrimaryEmailAddr: {
									Address: "new-family@example.com",
								},
								PrimaryPhone: {
									FreeFormNumber: "555-2222",
								},
							},
						],
					},
				}),
			});
		vi.stubGlobal("fetch", fetchMock);

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "guardian-1",
								centerId: "center-1",
								firstName: "Jane",
								lastName: "Doe",
								email: "old-family@example.com",
								phone: "555-1111",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "invoice-1",
								centerId: "center-1",
								guardianId: "guardian-1",
								periodStart: "2026-05-01",
								periodEnd: "2026-05-31",
								subtotal: 100,
								subsidyCredit: 0,
								amountDue: 100,
								status: "sent",
								dueDate: "2026-05-10",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "payment-1",
								centerId: "center-1",
								invoiceId: "invoice-1",
								amount: 100,
								method: "ach",
								provider: "manual",
								status: "posted",
								paidAt: new Date("2026-05-02T09:00:00.000Z"),
								createdAt: new Date("2026-05-02T09:00:00.000Z"),
								updatedAt: new Date("2026-05-02T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "customer",
								entityId: "guardian-1",
								qbEntityType: "customer",
								qbEntityId: "qb-customer-1",
								syncStatus: "success",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "import", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "import",
				scannedEntities: 3,
				createdSyncLogs: 1,
				createdReconciliationItems: 1,
			}),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://quickbooks.api.intuit.com/v3/company/realm-1/customer/qb-customer-1",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer access-token",
				}),
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(db.insert).toHaveBeenCalledTimes(2);
		vi.unstubAllGlobals();
	});

	it("creates orphaned customer reconciliation items when a linked guardian is missing locally", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {},
				}),
			});
		vi.stubGlobal("fetch", fetchMock);

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "customer-link-missing",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "customer",
								entityId: "guardian-missing",
								qbEntityType: "customer",
								qbEntityId: "qb-customer-missing",
								syncStatus: "success",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "import", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "import",
				createdReconciliationItems: 1,
			}),
		);
		expect(db.insert).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});

	it("imports linked invoice and payment drift plus unmatched QuickBooks records into reconciliation", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Customer: {
						Id: "qb-customer-1",
						SyncToken: "1",
						GivenName: "Jane",
						FamilyName: "Doe",
						PrimaryEmailAddr: {
							Address: "family@example.com",
						},
						PrimaryPhone: {
							FreeFormNumber: "555-1111",
						},
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {
						Customer: [
							{
								Id: "qb-customer-1",
								GivenName: "Jane",
								FamilyName: "Doe",
								PrimaryEmailAddr: {
									Address: "family@example.com",
								},
								PrimaryPhone: {
									FreeFormNumber: "555-1111",
								},
							},
							{
								Id: "qb-customer-unmatched",
								GivenName: "Sam",
								FamilyName: "Taylor",
								PrimaryEmailAddr: {
									Address: "sam@example.com",
								},
							},
						],
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Invoice: {
						Id: "qb-invoice-1",
						SyncToken: "2",
						CustomerRef: { value: "qb-customer-1" },
						TxnDate: "2026-05-01",
						DueDate: "2026-05-20",
						Balance: 0,
						Line: [
							{
								Description: "Weekly tuition",
								Amount: 900,
								DetailType: "SalesItemLineDetail",
								SalesItemLineDetail: {
									Qty: 1,
									UnitPrice: 900,
								},
							},
							{
								Description: "PebbleDesk Subsidy Credit",
								Amount: -100,
								DetailType: "SalesItemLineDetail",
								SalesItemLineDetail: {
									Qty: 1,
									UnitPrice: -100,
								},
							},
						],
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					Payment: {
						Id: "qb-payment-1",
						SyncToken: "1",
						CustomerRef: { value: "qb-customer-1" },
						TotalAmt: 800,
						TxnDate: "2026-05-08",
						PaymentRefNum: "QB-REF-1",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {
						Invoice: [
							{
								Id: "qb-invoice-unmatched",
								SyncToken: "1",
								CustomerRef: { value: "qb-customer-1" },
								TxnDate: "2026-05-01",
								DueDate: "2026-05-25",
								Balance: 500,
								Line: [
									{
										Description: "Drop-in care",
										Amount: 500,
										DetailType: "SalesItemLineDetail",
										SalesItemLineDetail: {
											Qty: 1,
											UnitPrice: 500,
										},
									},
								],
							},
						],
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					QueryResponse: {
						Payment: [
							{
								Id: "qb-payment-unmatched",
								SyncToken: "1",
								CustomerRef: { value: "qb-customer-1" },
								TotalAmt: 500,
								TxnDate: "2026-05-09",
								PaymentRefNum: "QB-REF-2",
							},
						],
					},
				}),
			});
		vi.stubGlobal("fetch", fetchMock);

		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									scopes: ["com.intuit.quickbooks.accounting"],
									accessToken: encryptQuickBooksToken("access-token", "test-secret"),
									refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
									tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "guardian-1",
								centerId: "center-1",
								firstName: "Jane",
								lastName: "Doe",
								email: "family@example.com",
								phone: "555-1111",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "invoice-1",
								centerId: "center-1",
								guardianId: "guardian-1",
								periodStart: "2026-05-01",
								periodEnd: "2026-05-31",
								subtotal: 1000,
								subsidyCredit: 0,
								amountDue: 1000,
								status: "sent",
								dueDate: "2026-05-15",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "payment-1",
								centerId: "center-1",
								invoiceId: "invoice-1",
								amount: 1000,
								method: "ach",
								provider: "manual",
								status: "posted",
								reference: "LOCAL-REF-1",
								paidAt: new Date("2026-05-06T09:00:00.000Z"),
								createdAt: new Date("2026-05-06T09:00:00.000Z"),
								updatedAt: new Date("2026-05-06T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "customer-link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "customer",
								entityId: "guardian-1",
								qbEntityType: "customer",
								qbEntityId: "qb-customer-1",
								syncStatus: "success",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
							{
								id: "invoice-link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "invoice",
								entityId: "invoice-1",
								qbEntityType: "invoice",
								qbEntityId: "qb-invoice-1",
								syncStatus: "success",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
							{
								id: "payment-link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "payment",
								entityId: "payment-1",
								qbEntityType: "payment",
								qbEntityId: "qb-payment-1",
								syncStatus: "success",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "line-1",
								invoiceId: "invoice-1",
								description: "Weekly tuition",
								quantity: 1,
								unitPrice: 1000,
								amount: 1000,
								childId: null,
							},
						]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								scopes: ["com.intuit.quickbooks.accounting"],
								syncDirection: "pull",
								status: "connected",
								accessToken: encryptQuickBooksToken("access-token", "test-secret"),
								refreshToken: encryptQuickBooksToken("refresh-token", "test-secret"),
								tokenExpiresAt: new Date("2026-05-10T00:00:00.000Z"),
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};

		await expect(
			runQuickBooksSync(db as never, "center-1", "import", {
				secret: "test-secret",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				action: "import",
				scannedEntities: 5,
				createdSyncLogs: 3,
				createdReconciliationItems: 5,
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(6);
		vi.unstubAllGlobals();
	});

	it("dismisses reconciliation items without creating a link", async () => {
		const updateWhereConditions: unknown[] = [];
		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "item-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "invoice",
								entityId: "invoice-1",
								issueType: "missing_link",
								title: "Invoice needs a QuickBooks link",
								description: "Invoice invoice-1 still needs a manual QuickBooks link.",
								status: "open",
								createdAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockImplementation((condition: unknown) => {
						updateWhereConditions.push(condition);
						return {
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									status: "dismissed",
								},
							]),
						};
					}),
				}),
			}),
		};

		await expect(
			dismissQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-1"),
		).resolves.toEqual(expect.objectContaining({ status: "dismissed" }));
		expect(updateWhereConditions).toHaveLength(1);
		expect(collectStringValues(updateWhereConditions[0])).toContain("center-1");
	});

	it("applies customer reconciliation changes back to PebbleDesk guardians", async () => {
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "customer",
									entityId: "guardian-1",
									qbEntityType: "customer",
									qbEntityId: "qb-customer-1",
									issueType: "status_mismatch",
									title: "Guardian contact details changed in QuickBooks",
									description: "Billing contact details differ from PebbleDesk.",
									proposedChanges: { billingEmail: "family@example.com" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "payment-1",
									centerId: "center-1",
									invoiceId: "invoice-1",
									amount: 150,
									method: "ach",
									provider: "manual",
									status: "posted",
									paidAt: new Date("2026-05-01T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 150,
									subsidyCredit: 0,
									amountDue: 150,
									status: "sent",
									dueDate: "2026-05-10",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								amount: 150,
								paidAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "customer",
								entityId: "guardian-1",
								qbEntityType: "customer",
								qbEntityId: "qb-customer-1",
								syncStatus: "success",
								lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
								createdAt: new Date("2026-05-01T09:10:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi
				.fn()
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "invoice-10",
									centerId: "center-1",
									guardianId: "guardian-10",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "paid",
									subtotal: 900,
									subsidyCredit: 0,
									amountDue: 900,
									paidAt: new Date("2026-05-10T09:00:00.000Z"),
									publicLinkToken: "public-token-10-next",
									publicLinkVersion: 4,
									publicLinkRotatedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "customer",
									entityId: "guardian-1",
									qbEntityType: "customer",
									qbEntityId: "qb-customer-1",
									issueType: "status_mismatch",
									title: "Guardian contact details changed in QuickBooks",
									description: "Billing contact details differ from PebbleDesk.",
									proposedChanges: { billingEmail: "family@example.com" },
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-01T09:10:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
									lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 1000,
									subsidyCredit: 0,
									amountDue: 1000,
									status: "sent",
									dueDate: "2026-05-10",
									publicLinkVersion: 1,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-1", {
				qbEntityId: "qb-customer-1",
				qbEntityType: "customer",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				item: expect.objectContaining({ status: "approved" }),
				link: expect.objectContaining({ qbEntityType: "customer" }),
			}),
		);
	});

	it("applies payment reconciliation changes without guardian or invoice timestamps", async () => {
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "payment",
									entityId: "payment-1",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-1",
									issueType: "status_mismatch",
									title: "Payment status changed in QuickBooks",
									description: "Payment details differ from PebbleDesk.",
									proposedChanges: { status: "posted" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "payment-1",
									centerId: "center-1",
									invoiceId: "invoice-1",
									amount: 150,
									method: "ach",
									provider: "manual",
									status: "posted",
									paidAt: new Date("2026-05-01T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 150,
									subsidyCredit: 0,
									amountDue: 150,
									status: "sent",
									dueDate: "2026-05-10",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								amount: 150,
								paidAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "link-1",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "payment",
								entityId: "payment-1",
								qbEntityType: "payment",
								qbEntityId: "qb-payment-1",
								syncStatus: "success",
								lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
								createdAt: new Date("2026-05-01T09:10:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi
				.fn()
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "paid",
									subtotal: 100,
									subsidyCredit: 0,
									amountDue: 100,
									paidAt: new Date("2026-05-01T09:10:00.000Z"),
									publicLinkToken: "public-token-1",
									publicLinkVersion: 2,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 150,
									subsidyCredit: 0,
									amountDue: 150,
									status: "paid",
									dueDate: "2026-05-10",
									paidAt: new Date("2026-05-01T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "payment",
									entityId: "payment-1",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-1",
									issueType: "status_mismatch",
									title: "Payment status changed in QuickBooks",
									description: "Payment details differ from PebbleDesk.",
									proposedChanges: { status: "posted" },
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-01T09:10:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
									lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-1", {
				qbEntityId: "qb-payment-1",
				qbEntityType: "payment",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				item: expect.objectContaining({ status: "approved" }),
				link: expect.objectContaining({ qbEntityType: "payment" }),
			}),
		);
	});

	it("rejects local-origin payment approvals that would overpay the invoice", async () => {
		const setPaymentSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		const setInvoiceSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "invoice-overpay",
						centerId: "center-1",
						guardianId: "guardian-1",
						periodStart: "2026-05-01",
						periodEnd: "2026-05-31",
						subtotal: 200,
						subsidyCredit: 0,
						amountDue: 200,
						status: "paid",
						dueDate: "2026-05-10",
						paidAt: new Date("2026-05-01T09:00:00.000Z"),
						createdAt: new Date("2026-05-01T09:00:00.000Z"),
						updatedAt: new Date("2026-05-01T09:10:00.000Z"),
					},
				]),
			}),
		});
		const setItemSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "item-overpay",
						centerId: "center-1",
						connectionId: "connection-1",
						origin: "local",
						entityType: "payment",
						entityId: "payment-overpay",
						qbEntityType: "payment",
						qbEntityId: "qb-payment-overpay",
						issueType: "amount_mismatch",
						title: "Payment changed in QuickBooks",
						description: "Payment fields differ from PebbleDesk.",
						proposedChanges: { amount: 300, status: "posted" },
						status: "approved",
						reviewedByMembershipId: "membership-1",
						reviewedAt: new Date("2026-05-01T09:10:00.000Z"),
						createdAt: new Date("2026-05-01T09:00:00.000Z"),
						updatedAt: new Date("2026-05-01T09:10:00.000Z"),
					},
				]),
			}),
		});
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-overpay",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "local",
									entityType: "payment",
									entityId: "payment-overpay",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-overpay",
									issueType: "amount_mismatch",
									title: "Payment changed in QuickBooks",
									description: "Payment fields differ from PebbleDesk.",
									proposedChanges: { amount: 300, status: "posted" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "payment-overpay",
									centerId: "center-1",
									invoiceId: "invoice-overpay",
									amount: 100,
									method: "ach",
									provider: "quickbooks",
									status: "posted",
									paidAt: new Date("2026-05-01T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-overpay",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 200,
									subsidyCredit: 0,
									amountDue: 200,
									status: "sent",
									dueDate: "2026-05-10",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "payment-overpay",
								amount: 300,
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-overpay",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 200,
									subsidyCredit: 0,
									amountDue: 200,
									status: "sent",
									dueDate: "2026-05-10",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								amount: 300,
								paidAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "link-overpay",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "payment",
								entityId: "payment-overpay",
								qbEntityType: "payment",
								qbEntityId: "qb-payment-overpay",
								syncStatus: "success",
								lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
								createdAt: new Date("2026-05-01T09:10:00.000Z"),
								updatedAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi
				.fn()
				.mockReturnValueOnce({ set: setPaymentSpy })
				.mockReturnValueOnce({ set: setInvoiceSpy })
				.mockReturnValueOnce({ set: setItemSpy })
				.mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-overpay", {
				qbEntityId: "qb-payment-overpay",
			}),
		).rejects.toThrow("QuickBooks payment exceeds invoice balance");

		expect(setPaymentSpy).not.toHaveBeenCalled();
		expect(setItemSpy).not.toHaveBeenCalled();
	});

	it("applies approved invoice reconciliation changes by replacing line items and rotating the public link", async () => {
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-10",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "local",
									entityType: "invoice",
									entityId: "invoice-10",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-10",
									issueType: "status_mismatch",
									title: "Invoice changed in QuickBooks",
									description: "Invoice totals differ from PebbleDesk.",
									proposedChanges: {
										status: "paid",
										dueDate: "2026-05-15",
										paidAt: "2026-05-10T09:00:00.000Z",
										subtotal: 900,
										subsidyCredit: 100,
										amountDue: 800,
										lineItems: [
											{
												description: "Weekly tuition",
												quantity: 1,
												unitPrice: 900,
												amount: 900,
											},
										],
									},
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "link-10",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-10",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-10",
									syncStatus: "success",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-10",
									centerId: "center-1",
									guardianId: "guardian-10",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "open",
									subtotal: 900,
									subsidyCredit: 0,
									amountDue: 900,
									paidAt: null,
									publicLinkToken: "public-token-10",
									publicLinkVersion: 3,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-10",
									centerId: "center-1",
									guardianId: "guardian-10",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "paid",
									subtotal: 900,
									subsidyCredit: 0,
									amountDue: 900,
									paidAt: new Date("2026-05-10T09:00:00.000Z"),
									publicLinkToken: "public-token-10-next",
									publicLinkVersion: 4,
									publicLinkRotatedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								amount: 900,
								paidAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				}),
			update: vi
				.fn()
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "link-10",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-10",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-10",
									syncStatus: "success",
									lastSyncedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "invoice-10",
									centerId: "center-1",
									guardianId: "guardian-10",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "paid",
									subtotal: 900,
									subsidyCredit: 0,
									amountDue: 900,
									paidAt: new Date("2026-05-10T09:00:00.000Z"),
									publicLinkToken: "public-token-10-next",
									publicLinkVersion: 4,
									publicLinkRotatedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "invoice-10",
									centerId: "center-1",
									guardianId: "guardian-10",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "paid",
									subtotal: 900,
									subsidyCredit: 0,
									amountDue: 900,
									paidAt: new Date("2026-05-10T09:00:00.000Z"),
									publicLinkToken: "public-token-10-next",
									publicLinkVersion: 4,
									publicLinkRotatedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-10",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "local",
									entityType: "invoice",
									entityId: "invoice-10",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-10",
									issueType: "status_mismatch",
									title: "Invoice changed in QuickBooks",
									description: "Invoice totals differ from PebbleDesk.",
									proposedChanges: {
										status: "paid",
									},
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
									lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				}),
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined),
			}),
		};
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-10", {
				qbEntityId: "qb-invoice-10",
				qbEntityType: "invoice",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				item: expect.objectContaining({ status: "approved" }),
				link: expect.objectContaining({ qbEntityId: "qb-invoice-10" }),
			}),
		);

		expect(tx.delete).toHaveBeenCalled();
		expect(tx.insert).toHaveBeenCalledTimes(2);
	});

	it("looks up approved local invoice reconciliation targets within the item center", async () => {
		const invoiceLookupWhere = vi.fn().mockReturnValue({
			limit: vi.fn().mockResolvedValue([
				{
					id: "invoice-10",
					centerId: "center-1",
					status: "sent",
					amountDue: 100,
					publicLinkVersion: 1,
				},
			]),
		});
		const updateWhereConditions: unknown[] = [];
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-10",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "local",
									entityType: "invoice",
									entityId: "invoice-10",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-10",
									issueType: "status_mismatch",
									title: "Invoice changed in QuickBooks",
									description: "Invoice status differs from PebbleDesk.",
									proposedChanges: { status: "paid" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "link-10",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-10",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-10",
									syncStatus: "success",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: invoiceLookupWhere,
					}),
				})
				.mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockReturnValueOnce({
								limit: vi.fn().mockResolvedValue([
									{
										id: "invoice-10",
										centerId: "center-1",
										status: "paid",
										amountDue: 100,
										paidAt: new Date("2026-05-01T09:00:00.000Z"),
									},
								]),
							})
							.mockResolvedValue([]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockImplementation((condition: unknown) => {
						updateWhereConditions.push(condition);
						return {
							returning: vi.fn().mockResolvedValue([
								{
									id: "updated",
									centerId: "center-1",
									status: "approved",
								},
							]),
						};
					}),
				}),
			}),
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined),
			}),
		};
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
		};

		await approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-10", {
			qbEntityId: "qb-invoice-10",
			qbEntityType: "invoice",
		});

		expect(collectStringValues(invoiceLookupWhere.mock.calls[0]?.[0])).toContain("center-1");
		expect(
			updateWhereConditions.every((condition) =>
				collectStringValues(condition).includes("center-1"),
			),
		).toBe(true);
	});

	it("does not write a disallowed status (void) from QB reconciliation to the invoice", async () => {
		const updateSets: Array<Record<string, unknown>> = [];
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-void",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "local",
									entityType: "invoice",
									entityId: "invoice-void",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-void",
									issueType: "status_mismatch",
									title: "Invoice voided in QuickBooks",
									description: "Invoice status differs.",
									// "void" is outside the QB reconciliation whitelist
									proposedChanges: { status: "void" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "link-void",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-void",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-void",
									syncStatus: "success",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-void",
									centerId: "center-1",
									guardianId: "guardian-1",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "sent",
									subtotal: 500,
									subsidyCredit: 0,
									amountDue: 500,
									paidAt: null,
									publicLinkToken: "token-void",
									publicLinkVersion: 1,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-void",
									centerId: "center-1",
									status: "sent",
									amountDue: 500,
									paidAt: null,
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockImplementation((value: Record<string, unknown>) => {
					updateSets.push(value);
					return {
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "updated",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
									lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					};
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined),
			}),
		};
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
		};

		await approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-void", {
			qbEntityId: "qb-invoice-void",
			qbEntityType: "invoice",
		});

		// "void" is not in the QB reconciliation whitelist — no set() call should carry status:"void"
		expect(updateSets).not.toContainEqual(expect.objectContaining({ status: "void" }));
	});

	it("does not write a disallowed status (draft) from QB reconciliation to the invoice", async () => {
		const updateSets: Array<Record<string, unknown>> = [];
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-draft",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "local",
									entityType: "invoice",
									entityId: "invoice-draft",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-draft",
									issueType: "status_mismatch",
									title: "Invoice set to draft in QuickBooks",
									description: "Invoice status differs.",
									// "draft" is outside the QB reconciliation whitelist
									proposedChanges: { status: "draft" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "link-draft",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-draft",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-draft",
									syncStatus: "success",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-draft",
									centerId: "center-1",
									guardianId: "guardian-1",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "sent",
									subtotal: 300,
									subsidyCredit: 0,
									amountDue: 300,
									paidAt: null,
									publicLinkToken: "token-draft",
									publicLinkVersion: 1,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-draft",
									centerId: "center-1",
									status: "sent",
									amountDue: 300,
									paidAt: null,
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockImplementation((value: Record<string, unknown>) => {
					updateSets.push(value);
					return {
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "updated",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
									lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					};
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined),
			}),
		};
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
		};

		await approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-draft", {
			qbEntityId: "qb-invoice-draft",
			qbEntityType: "invoice",
		});

		// "draft" is not in the QB reconciliation whitelist — no set() call should carry status:"draft"
		expect(updateSets).not.toContainEqual(expect.objectContaining({ status: "draft" }));
	});

	it("does not undo a QuickBooks paid invoice approval when local payments are not posted yet", async () => {
		const updateSets: Array<Record<string, unknown>> = [];
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-paid",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "local",
									entityType: "invoice",
									entityId: "invoice-paid",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-paid",
									issueType: "status_mismatch",
									title: "Invoice status changed in QuickBooks",
									description: "Invoice status differs from PebbleDesk.",
									proposedChanges: {
										status: "paid",
										paidAt: "2026-05-10T09:00:00.000Z",
									},
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "link-paid",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-paid",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-paid",
									syncStatus: "success",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-paid",
									centerId: "center-1",
									guardianId: "guardian-1",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "sent",
									subtotal: 900,
									subsidyCredit: 0,
									amountDue: 900,
									paidAt: null,
									publicLinkToken: "public-token-paid",
									publicLinkVersion: 1,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-paid",
									centerId: "center-1",
									status: "paid",
									amountDue: 900,
									paidAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockImplementation((value: Record<string, unknown>) => {
					updateSets.push(value);
					return {
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "updated",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
									lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					};
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined),
			}),
		};
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-paid", {
				qbEntityId: "qb-invoice-paid",
				qbEntityType: "invoice",
			}),
		).resolves.toEqual(expect.objectContaining({ item: expect.any(Object) }));

		expect(updateSets).toContainEqual(expect.objectContaining({ status: "paid" }));
		expect(updateSets).not.toContainEqual(expect.objectContaining({ status: "sent" }));
	});

	it("approves a quickbooks-origin payment reconciliation by creating a local QuickBooks payment", async () => {
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-20",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "payment",
									entityId: "qb-payment-20",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-20",
									issueType: "missing_link",
									title: "QuickBooks payment needs a PebbleDesk invoice",
									description: "Match this payment to a local invoice before applying it.",
									proposedChanges: {
										amount: 200,
										method: "ach",
										paidAt: "2026-05-10T09:00:00.000Z",
										reference: "QB-200",
										qbInvoiceId: "qb-invoice-20",
									},
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-20",
									centerId: "center-1",
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-link-20",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-20",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-20",
									syncStatus: "success",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-20",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 200,
									subsidyCredit: 0,
									amountDue: 200,
									status: "sent",
									dueDate: "2026-05-15",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-20",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 200,
									subsidyCredit: 0,
									amountDue: 200,
									status: "sent",
									dueDate: "2026-05-15",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								amount: 200,
								paidAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			insert: vi
				.fn()
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "payment-20",
								centerId: "center-1",
								invoiceId: "invoice-20",
								amount: 200,
								method: "ach",
								provider: "quickbooks",
								status: "posted",
								providerTransactionId: "qb-payment-20",
								reference: "QB-200",
								paidAt: new Date("2026-05-10T09:00:00.000Z"),
								createdAt: new Date("2026-05-10T09:00:00.000Z"),
								updatedAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "link-20",
								centerId: "center-1",
								connectionId: "connection-1",
								entityType: "payment",
								entityId: "payment-20",
								qbEntityType: "payment",
								qbEntityId: "qb-payment-20",
								syncStatus: "success",
								lastSyncedAt: new Date("2026-05-10T09:00:00.000Z"),
								createdAt: new Date("2026-05-10T09:00:00.000Z"),
								updatedAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			update: vi
				.fn()
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "invoice-20",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 200,
									subsidyCredit: 0,
									amountDue: 200,
									status: "paid",
									dueDate: "2026-05-15",
									paidAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-20",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "payment",
									entityId: "qb-payment-20",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-20",
									issueType: "missing_link",
									title: "QuickBooks payment needs a PebbleDesk invoice",
									description: "Match this payment to a local invoice before applying it.",
									proposedChanges: {
										amount: 200,
									},
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
									lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				}),
		};
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-20", {
				localTargetId: "invoice-20",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				item: expect.objectContaining({ status: "approved" }),
				link: expect.objectContaining({ entityType: "payment", qbEntityId: "qb-payment-20" }),
			}),
		);

		expect(tx.insert).toHaveBeenCalledTimes(3);
	});

	it("rejects quickbooks-origin payment approvals that would overpay the local invoice", async () => {
		const insertSpy = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "payment-overpay",
							centerId: "center-1",
							invoiceId: "invoice-overpay",
							amount: 300,
							method: "ach",
							provider: "quickbooks",
							status: "posted",
							providerTransactionId: "qb-payment-overpay",
							paidAt: new Date("2026-05-10T09:00:00.000Z"),
							createdAt: new Date("2026-05-10T09:00:00.000Z"),
							updatedAt: new Date("2026-05-10T09:00:00.000Z"),
						},
					]),
				}),
			})
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "link-overpay",
							centerId: "center-1",
							connectionId: "connection-1",
							entityType: "payment",
							entityId: "payment-overpay",
							qbEntityType: "payment",
							qbEntityId: "qb-payment-overpay",
							syncStatus: "success",
							lastSyncedAt: new Date("2026-05-10T09:00:00.000Z"),
							createdAt: new Date("2026-05-10T09:00:00.000Z"),
							updatedAt: new Date("2026-05-10T09:00:00.000Z"),
						},
					]),
				}),
			})
			.mockReturnValueOnce({
				values: vi.fn().mockResolvedValue(undefined),
			});
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-overpay",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "payment",
									entityId: "qb-payment-overpay",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-overpay",
									issueType: "missing_link",
									title: "QuickBooks payment needs a PebbleDesk invoice",
									description: "Match this payment to a local invoice before applying it.",
									proposedChanges: {
										amount: 300,
										method: "ach",
										paidAt: "2026-05-10T09:00:00.000Z",
									},
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-overpay",
									centerId: "center-1",
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-overpay",
									centerId: "center-1",
									guardianId: "guardian-1",
									periodStart: "2026-05-01",
									periodEnd: "2026-05-31",
									subtotal: 200,
									subsidyCredit: 0,
									amountDue: 200,
									status: "sent",
									dueDate: "2026-05-15",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								amount: 300,
								paidAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			insert: insertSpy,
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								syncDirection: "pull",
								status: "connected",
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								lastSyncAt: new Date("2026-05-10T09:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
		};
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-overpay", {
				localTargetId: "invoice-overpay",
			}),
		).rejects.toThrow("QuickBooks payment exceeds invoice balance");

		expect(insertSpy).not.toHaveBeenCalled();
	});

	it("rejects quickbooks-origin invoice approvals for invoices outside the center", async () => {
		const targetFromSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue([]),
			}),
		});
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof db) => Promise<unknown>) => fn(db)),
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-invoice-cross-center",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "invoice",
									entityId: "qb-invoice-cross-center",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-cross-center",
									issueType: "missing_link",
									title: "QuickBooks invoice needs a PebbleDesk match",
									description: "Match this QuickBooks invoice to a local invoice.",
									proposedChanges: { status: "sent" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: targetFromSpy,
				}),
			insert: vi.fn(),
			update: vi.fn(),
		};

		await expect(
			approveQuickBooksReconciliation(
				db as never,
				"center-1",
				"membership-1",
				"item-invoice-cross-center",
				{
					localTargetId: "invoice-from-center-2",
				},
			),
		).rejects.toThrow("Selected local target does not belong to this center");

		expect(targetFromSpy).toHaveBeenCalledWith(invoices);
		expect(db.insert).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects quickbooks-origin payment approvals for selected invoices outside the center", async () => {
		const targetFromSpy = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue([]),
			}),
		});
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof db) => Promise<unknown>) => fn(db)),
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-payment-cross-center",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "payment",
									entityId: "qb-payment-cross-center",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-cross-center",
									issueType: "missing_link",
									title: "QuickBooks payment needs a PebbleDesk invoice",
									description: "Match this payment to a local invoice before applying it.",
									proposedChanges: { amount: 200 },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: targetFromSpy,
				}),
			insert: vi.fn(),
			update: vi.fn(),
		};

		await expect(
			approveQuickBooksReconciliation(
				db as never,
				"center-1",
				"membership-1",
				"item-payment-cross-center",
				{
					localTargetId: "invoice-from-center-2",
				},
			),
		).rejects.toThrow("Selected local target does not belong to this center");

		expect(targetFromSpy).toHaveBeenCalledWith(invoices);
		expect(db.insert).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
	});

	it("reuses an existing local payment link when a quickbooks-origin payment approval is retried", async () => {
		const tx = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-21",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "payment",
									entityId: "qb-payment-21",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-21",
									issueType: "missing_link",
									title: "QuickBooks payment needs a PebbleDesk invoice",
									description: "Match this payment to a local invoice before applying it.",
									proposedChanges: {
										amount: 200,
										method: "ach",
										paidAt: "2026-05-10T09:00:00.000Z",
										reference: "QB-201",
									},
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "payment-link-21",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "payment",
									entityId: "payment-21",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-21",
									syncStatus: "success",
									lastSyncedAt: new Date("2026-05-10T09:00:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:00:00.000Z"),
								},
							]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined),
			}),
			update: vi
				.fn()
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "payment-link-21",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "payment",
									entityId: "payment-21",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-21",
									syncStatus: "success",
									lastSyncedAt: new Date("2026-05-10T09:05:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:05:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-21",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "payment",
									entityId: "qb-payment-21",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-21",
									issueType: "missing_link",
									title: "QuickBooks payment needs a PebbleDesk invoice",
									description: "Match this payment to a local invoice before applying it.",
									proposedChanges: {
										amount: 200,
									},
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-10T09:05:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:05:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-10T09:05:00.000Z"),
									lastSyncAt: new Date("2026-05-10T09:05:00.000Z"),
								},
							]),
						}),
					}),
				}),
		};
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-2", "item-21", {
				qbEntityId: "qb-payment-21",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				link: expect.objectContaining({ id: "payment-link-21", entityId: "payment-21" }),
				item: expect.objectContaining({ status: "approved" }),
			}),
		);

		expect(tx.insert).toHaveBeenCalledTimes(1);
	});

	it("rejects quickbooks-origin payment approvals when the selected invoice link does not match", async () => {
		const db = {
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (transaction: typeof db) => Promise<unknown>) => fn(db)),
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-30",
									centerId: "center-1",
									connectionId: "connection-1",
									origin: "quickbooks",
									entityType: "payment",
									entityId: "qb-payment-30",
									qbEntityType: "payment",
									qbEntityId: "qb-payment-30",
									issueType: "missing_link",
									title: "QuickBooks payment needs a PebbleDesk invoice",
									description: "Match this payment to a local invoice before applying it.",
									proposedChanges: {
										amount: 200,
										qbInvoiceId: "qb-invoice-expected",
									},
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-30",
									centerId: "center-1",
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-link-30",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-30",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-other",
									syncStatus: "success",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-30", {
				localTargetId: "invoice-30",
			}),
		).rejects.toThrow("Selected invoice does not match the QuickBooks payment target");
	});

	it("uses string paidAt values when syncing invoice payment state", async () => {
		const invoiceUpdateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "invoice-1",
						centerId: "center-1",
						status: "paid",
						paidAt: new Date("2026-05-10T09:00:00.000Z"),
					},
				]),
			}),
		});
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									amountDue: "200",
									status: "sent",
									paidAt: null,
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{ amount: "100", paidAt: "2026-05-01T09:00:00.000Z" },
							{ amount: "100", paidAt: "2026-05-10T09:00:00.000Z" },
						]),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: invoiceUpdateSet,
			}),
		};

		await syncInvoicePaymentState(db as never, "center-1", "invoice-1");

		expect(invoiceUpdateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "paid",
				paidAt: new Date("2026-05-10T09:00:00.000Z"),
			}),
		);
	});

	it("lists sync history and reconciliation items with simple queries", async () => {
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "log-1",
										centerId: "center-1",
										connectionId: "connection-1",
										entityType: "invoice",
										entityId: "invoice-1",
										qbEntityId: "qb-invoice-1",
										direction: "push",
										status: "success",
										syncedAt: new Date("2026-05-01T09:05:00.000Z"),
										createdAt: new Date("2026-05-01T09:05:00.000Z"),
									},
								]),
							}),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "item-1",
										centerId: "center-1",
										connectionId: "connection-1",
										entityType: "invoice",
										entityId: "invoice-1",
										issueType: "missing_link",
										title: "Invoice needs a QuickBooks link",
										description: "Invoice invoice-1 still needs a manual QuickBooks link.",
										status: "open",
										createdAt: new Date("2026-05-01T09:00:00.000Z"),
										updatedAt: new Date("2026-05-01T09:00:00.000Z"),
									},
								]),
							}),
						}),
					}),
				}),
		};

		await expect(listQuickBooksSyncHistory(db as never, "center-1")).resolves.toEqual([
			expect.objectContaining({ id: "log-1" }),
		]);
		await expect(listQuickBooksReconciliationItems(db as never, "center-1")).resolves.toEqual([
			expect.objectContaining({ id: "item-1" }),
		]);
	});

	it("disconnects a center connection", async () => {
		const updateWhereConditions: unknown[] = [];
		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "connection-1",
								centerId: "center-1",
								realmId: "realm-1",
								status: "connected",
								connectedAt: new Date("2026-05-01T09:00:00.000Z"),
								updatedAt: new Date("2026-05-01T09:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockImplementation((condition: unknown) => {
						updateWhereConditions.push(condition);
						return {
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									status: "disconnected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									disconnectedAt: new Date("2026-05-02T09:00:00.000Z"),
									updatedAt: new Date("2026-05-02T09:00:00.000Z"),
								},
							]),
						};
					}),
				}),
			}),
		};

		await expect(disconnectQuickBooks(db as never, "center-1")).resolves.toEqual(
			expect.objectContaining({
				disconnected: true,
				connection: expect.objectContaining({ status: "disconnected" }),
			}),
		);
		expect(updateWhereConditions).toHaveLength(1);
		expect(collectStringValues(updateWhereConditions[0])).toContain("center-1");
	});

	it("returns a disconnected result when no quickbooks connection exists", async () => {
		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		};

		await expect(disconnectQuickBooks(db as never, "center-1")).resolves.toEqual({
			disconnected: true,
		});
	});

	it("throws when running sync without an active connection", async () => {
		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		};

		await expect(runQuickBooksSync(db as never, "center-1", "export")).rejects.toThrow(
			"QuickBooks is not connected",
		);
	});

	it("reuses an existing entity link when approving the same reconciliation twice", async () => {
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-1",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-1",
									issueType: "status_mismatch",
									title: "Invoice status changed in QuickBooks",
									description: "Status differs from PebbleDesk.",
									proposedChanges: { status: "paid" },
									status: "open",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "link-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-1",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-1",
									syncStatus: "success",
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "open",
									subtotal: 100,
									subsidyCredit: 0,
									amountDue: 100,
									paidAt: null,
									publicLinkToken: "public-token-1",
									publicLinkVersion: 2,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:00:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "paid",
									subtotal: 100,
									subsidyCredit: 0,
									amountDue: 100,
									paidAt: new Date("2026-05-01T09:10:00.000Z"),
									publicLinkToken: "public-token-1",
									publicLinkVersion: 2,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								amount: 100,
								paidAt: new Date("2026-05-01T09:10:00.000Z"),
							},
						]),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined),
			}),
			update: vi
				.fn()
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "link-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-1",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-1",
									syncStatus: "success",
									lastSyncedAt: new Date("2026-05-01T09:10:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "paid",
									subtotal: 100,
									subsidyCredit: 0,
									amountDue: 100,
									paidAt: new Date("2026-05-01T09:10:00.000Z"),
									publicLinkToken: "public-token-1",
									publicLinkVersion: 2,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "invoice-1",
									centerId: "center-1",
									guardianId: "guardian-1",
									issueDate: "2026-05-01",
									dueDate: "2026-05-08",
									status: "paid",
									subtotal: 100,
									subsidyCredit: 0,
									amountDue: 100,
									paidAt: new Date("2026-05-01T09:10:00.000Z"),
									publicLinkToken: "public-token-1",
									publicLinkVersion: 2,
									publicLinkRotatedAt: null,
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "item-1",
									centerId: "center-1",
									connectionId: "connection-1",
									entityType: "invoice",
									entityId: "invoice-1",
									qbEntityType: "invoice",
									qbEntityId: "qb-invoice-1",
									issueType: "status_mismatch",
									title: "Invoice status changed in QuickBooks",
									description: "Status differs from PebbleDesk.",
									proposedChanges: { status: "paid" },
									status: "approved",
									reviewedByMembershipId: "membership-1",
									reviewedAt: new Date("2026-05-01T09:10:00.000Z"),
									createdAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "connection-1",
									centerId: "center-1",
									realmId: "realm-1",
									syncDirection: "pull",
									status: "connected",
									connectedAt: new Date("2026-05-01T09:00:00.000Z"),
									updatedAt: new Date("2026-05-01T09:10:00.000Z"),
									lastSyncAt: new Date("2026-05-01T09:10:00.000Z"),
								},
							]),
						}),
					}),
				}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "item-1", {
				qbEntityId: "qb-invoice-1",
			}),
		).resolves.toEqual(
			expect.objectContaining({
				link: expect.objectContaining({ id: "link-1" }),
				item: expect.objectContaining({ status: "approved" }),
			}),
		);
		expect(db.insert).toHaveBeenCalledTimes(1);
	});

	it("throws when approving or dismissing unknown reconciliation items", async () => {
		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		};

		await expect(
			approveQuickBooksReconciliation(db as never, "center-1", "membership-1", "missing-item", {
				qbEntityId: "qb-invoice-1",
			}),
		).rejects.toThrow("QuickBooks reconciliation item not found");
		await expect(
			dismissQuickBooksReconciliation(db as never, "center-1", "membership-1", "missing-item"),
		).rejects.toThrow("QuickBooks reconciliation item not found");
	});
});
