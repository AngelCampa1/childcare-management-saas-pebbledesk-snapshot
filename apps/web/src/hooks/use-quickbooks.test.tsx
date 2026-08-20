import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import {
	useApproveQuickBooksReconciliation,
	useDisconnectQuickBooks,
	useDismissQuickBooksReconciliation,
	useQuickBooksReconciliation,
	useQuickBooksStatus,
	useQuickBooksSyncHistory,
	useRunQuickBooksSync,
	useStartQuickBooksConnect,
} from "./use-quickbooks";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

const CENTER_ID = "center-test";
const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);

function createResponse<T>(payload: T) {
	return {
		ok: true,
		json: async () => payload,
	} as Response;
}

function createWrapperWithClient() {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
			mutations: {
				retry: false,
			},
		},
	});

	function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	}

	return { client, Wrapper };
}

describe("quickbooks hooks", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
	});

	it("loads quickbooks connection status", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				status: "connected",
				connection: {
					id: "connection-1",
					centerId: "center-1",
					realmId: "realm-1",
					companyName: "Pebble Books",
					status: "connected",
					syncDirection: "pull",
					tokenExpiresAt: "2026-05-10T00:00:00.000Z",
					connectedAt: "2026-05-01T09:00:00.000Z",
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:00:00.000Z",
				},
				openReconciliationCount: 1,
				lastSync: null,
				isConfigured: true,
				configurationIssue: null,
			}),
		);

		const { result } = renderHook(() => useQuickBooksStatus(), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/quickbooks/status");
		expect(result.current.data?.status).toBe("connected");
	});

	it("does not call QuickBooks APIs when queries are disabled by plan entitlement", async () => {
		const status = renderHook(() => useQuickBooksStatus({ enabled: false }), {
			wrapper: createWrapperWithClient().Wrapper,
		});
		const history = renderHook(() => useQuickBooksSyncHistory({ enabled: false }), {
			wrapper: createWrapperWithClient().Wrapper,
		});
		const reconciliation = renderHook(
			() => useQuickBooksReconciliation("open", { enabled: false }),
			{
				wrapper: createWrapperWithClient().Wrapper,
			},
		);

		expect(status.result.current.fetchStatus).toBe("idle");
		expect(history.result.current.fetchStatus).toBe("idle");
		expect(reconciliation.result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads quickbooks sync history and reconciliation items", async () => {
		mockedApiFetch
			.mockResolvedValueOnce(
				createResponse({
					history: [
						{
							id: "log-1",
							centerId: "center-1",
							connectionId: "connection-1",
							entityType: "invoice",
							entityId: "invoice-1",
							qbEntityId: "qb-invoice-1",
							status: "success",
							direction: "push",
							syncedAt: "2026-05-01T09:05:00.000Z",
							createdAt: "2026-05-01T09:05:00.000Z",
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				createResponse({
					items: [
						{
							id: "item-1",
							centerId: "center-1",
							connectionId: "connection-1",
							origin: "quickbooks",
							entityType: "invoice",
							entityId: "invoice-1",
							issueType: "status_mismatch",
							title: "Invoice status changed in QuickBooks",
							description: "Status differs from PebbleDesk.",
							status: "open",
							createdAt: "2026-05-01T09:00:00.000Z",
							updatedAt: "2026-05-01T09:00:00.000Z",
						},
					],
				}),
			);

		const history = renderHook(() => useQuickBooksSyncHistory(), {
			wrapper: createWrapperWithClient().Wrapper,
		});
		const reconciliation = renderHook(() => useQuickBooksReconciliation("open"), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(history.result.current.isSuccess).toBe(true));
		await waitFor(() => expect(reconciliation.result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/quickbooks/sync/history");
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/quickbooks/reconciliation?status=open");
		expect(history.result.current.data?.[0]?.id).toBe("log-1");
		expect(reconciliation.result.current.data?.[0]?.id).toBe("item-1");
	});

	it("starts the quickbooks oauth flow", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				url: "https://appcenter.intuit.com/connect/oauth2?state=signed-state",
			}),
		);

		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const start = renderHook(() => useStartQuickBooksConnect(), { wrapper: Wrapper });

		await act(async () => {
			await start.result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/quickbooks/connect/start", {
			method: "POST",
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "quickbooks"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "payments"] });
		expect(mockedTrack).toHaveBeenCalledWith("quickbooks_action_completed", {
			feature_name: "quickbooks",
			action: "connect_start",
			result: "success",
		});
	});

	it("disconnects quickbooks while invalidating cached queries", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ disconnected: true }));

		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const disconnect = renderHook(() => useDisconnectQuickBooks(), { wrapper: Wrapper });

		await act(async () => {
			await disconnect.result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/quickbooks/disconnect", {
			method: "POST",
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "quickbooks"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "payments"] });
		expect(mockedTrack).toHaveBeenCalledWith("quickbooks_action_completed", {
			feature_name: "quickbooks",
			action: "disconnect",
			result: "success",
		});
	});

	it("runs sync actions and reviews reconciliation items", async () => {
		mockedApiFetch
			.mockResolvedValueOnce(
				createResponse({
					sync: {
						action: "export",
						scannedEntities: 2,
						createdSyncLogs: 2,
						createdReconciliationItems: 1,
						connection: {
							id: "connection-1",
							centerId: "center-1",
							realmId: "realm-1",
							companyName: "Pebble Books",
							status: "connected",
							syncDirection: "pull",
							tokenExpiresAt: "2026-05-10T00:00:00.000Z",
							connectedAt: "2026-05-01T09:00:00.000Z",
							createdAt: "2026-05-01T09:00:00.000Z",
							updatedAt: "2026-05-01T09:00:00.000Z",
						},
					},
				}),
			)
			.mockResolvedValueOnce(
				createResponse({
					item: {
						id: "item-1",
						centerId: "center-1",
						connectionId: "conn-1",
						origin: "local",
						entityType: "customer",
						entityId: "entity-1",
						issueType: "missing_link",
						title: "Missing link",
						description: "Local record has no QuickBooks link",
						status: "approved",
						createdAt: "2026-05-01T09:00:00.000Z",
						updatedAt: "2026-05-01T09:00:00.000Z",
					},
				}),
			)
			.mockResolvedValueOnce(
				createResponse({
					item: {
						id: "item-2",
						centerId: "center-1",
						connectionId: "conn-1",
						origin: "local",
						entityType: "customer",
						entityId: "entity-2",
						issueType: "missing_link",
						title: "Missing link",
						description: "Local record has no QuickBooks link",
						status: "dismissed",
						createdAt: "2026-05-01T09:00:00.000Z",
						updatedAt: "2026-05-01T09:00:00.000Z",
					},
				}),
			);

		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const sync = renderHook(() => useRunQuickBooksSync(), { wrapper: Wrapper });
		const approve = renderHook(() => useApproveQuickBooksReconciliation(), {
			wrapper: Wrapper,
		});
		const dismiss = renderHook(() => useDismissQuickBooksReconciliation(), {
			wrapper: Wrapper,
		});

		await act(async () => {
			await sync.result.current.mutateAsync("export");
		});
		await act(async () => {
			await approve.result.current.mutateAsync({
				id: "item-1",
				qbEntityId: "qb-invoice-1",
				qbEntityType: "invoice",
			});
		});
		await act(async () => {
			await dismiss.result.current.mutateAsync("item-2");
		});

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/quickbooks/sync/export", {
			method: "POST",
		});
		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			2,
			"/api/quickbooks/reconciliation/item-1/approve",
			{
				method: "POST",
				body: JSON.stringify({
					qbEntityId: "qb-invoice-1",
					qbEntityType: "invoice",
				}),
			},
		);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			3,
			"/api/quickbooks/reconciliation/item-2/dismiss",
			{
				method: "POST",
			},
		);
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "quickbooks"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "payments"] });
		expect(mockedTrack).toHaveBeenCalledWith("quickbooks_action_completed", {
			feature_name: "quickbooks",
			action: "sync",
			result: "success",
			sync_action: "export",
			scanned_count: 2,
			sync_log_count: 2,
			reconciliation_count: 1,
		});
		expect(mockedTrack).toHaveBeenCalledWith("quickbooks_action_completed", {
			feature_name: "quickbooks",
			action: "reconciliation_approve",
			result: "success",
			entity_type: "customer",
			issue_type: "missing_link",
		});
		expect(mockedTrack).toHaveBeenCalledWith("quickbooks_action_completed", {
			feature_name: "quickbooks",
			action: "reconciliation_dismiss",
			result: "success",
			entity_type: "customer",
			issue_type: "missing_link",
		});
	});

	it("throws when quickbooks queries or mutations fail", async () => {
		mockedApiFetch
			.mockResolvedValueOnce({ ok: false } as Response)
			.mockResolvedValueOnce({ ok: false } as Response);

		const status = renderHook(() => useQuickBooksStatus(), {
			wrapper: createWrapperWithClient().Wrapper,
		});
		const sync = renderHook(() => useRunQuickBooksSync(), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(status.result.current.isError).toBe(true));
		await expect(sync.result.current.mutateAsync("full")).rejects.toThrow(
			"Failed to run QuickBooks full sync",
		);
		expect(mockedTrack).toHaveBeenCalledWith("quickbooks_action_failed", {
			feature_name: "quickbooks",
			action: "sync",
			result: "failed",
			sync_action: "full",
			error_code: "response_error",
		});
	});

	it("uses structured QuickBooks API error messages when available", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Invalid QuickBooks reconciliation status" }),
		} as Response);

		const reconciliation = renderHook(() => useQuickBooksReconciliation("open"), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(reconciliation.result.current.isError).toBe(true));
		await expect(reconciliation.result.current.error).toEqual(
			new Error("Invalid QuickBooks reconciliation status"),
		);
	});

	it("falls back to local QuickBooks error messages when error responses are unstructured", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ message: "different shape" }),
		} as Response);

		const reconciliation = renderHook(() => useQuickBooksReconciliation(), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(reconciliation.result.current.isError).toBe(true));
		await expect(reconciliation.result.current.error).toEqual(
			new Error("Failed to fetch QuickBooks reconciliation items"),
		);
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/quickbooks/reconciliation");
	});

	it("falls back to local QuickBooks error messages when error bodies are not JSON", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => {
				throw new SyntaxError("not json");
			},
		} as Response);

		const status = renderHook(() => useQuickBooksStatus(), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(status.result.current.isError).toBe(true));
		await expect(status.result.current.error).toEqual(
			new Error("Failed to fetch QuickBooks status"),
		);
	});
});
