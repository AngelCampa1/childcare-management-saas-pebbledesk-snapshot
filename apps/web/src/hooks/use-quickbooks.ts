import type {
	QuickBooksConnectStartResponse,
	QuickBooksDisconnectResponse,
	QuickBooksReconciliationItem,
	QuickBooksReviewReconciliationResponse,
	QuickBooksStatusSnapshot,
	QuickBooksSyncAction,
	QuickBooksSyncResult,
} from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	quickBooksConnectStartResponseSchema,
	quickBooksDisconnectResponseSchema,
	quickBooksHistoryResponseSchema,
	quickBooksReconciliationResponseSchema,
	quickBooksReviewReconciliationResponseSchema,
	quickBooksStatusSchema,
	quickBooksSyncResponseSchema,
} from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

/**
 * QuickBooks hooks.
 *
 * Audit cycle 1 (P0-001/P0-004) policy:
 *   - All GETs/POSTs flow through `parseJsonResponse(res, schema, msg)` from
 *     `lib/parse-json-response.ts`. The schema parameter is REQUIRED so a
 *     backend shape regression surfaces as a parse error instead of silent
 *     `undefined` propagation.
 *   - Mutation hooks attach `onError: toast.error(extractErrorMessage(...))`
 *     so failures are never silent.
 */

type ApproveQuickBooksInput = {
	id: string;
	qbEntityId?: string;
	qbEntityType?: QuickBooksReconciliationItem["qbEntityType"];
	localTargetId?: string;
};

type QuickBooksQueryOptions = {
	enabled?: boolean;
};

type QuickBooksTrackedAction =
	| "connect_start"
	| "disconnect"
	| "sync"
	| "reconciliation_approve"
	| "reconciliation_dismiss";

interface QuickBooksMutationAnalytics<TInput, TOutput> {
	action: QuickBooksTrackedAction;
	getProperties?: (output: TOutput, input: TInput) => Record<string, unknown>;
	getFailureProperties?: (input: TInput) => Record<string, unknown>;
}

function quickBooksQueryKey(activeCenterId: string | undefined, scope: string) {
	return [activeCenterId, "quickbooks", scope] as const;
}

function quickBooksBaseProperties(action: QuickBooksTrackedAction, result: "failed" | "success") {
	return {
		feature_name: "quickbooks",
		action,
		result,
	};
}

function useQuickBooksMutation<TInput, TOutput>(
	mutationFn: (input: TInput) => Promise<TOutput>,
	analytics: QuickBooksMutationAnalytics<TInput, TOutput>,
) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn,
		onSuccess: (output, input) => {
			track(ANALYTICS_EVENTS.quickBooksActionCompleted, {
				...quickBooksBaseProperties(analytics.action, "success"),
				...analytics.getProperties?.(output, input),
			});
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "quickbooks"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoices"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "payments"] });
		},
		onError: (err, input) => {
			track(ANALYTICS_EVENTS.quickBooksActionFailed, {
				...quickBooksBaseProperties(analytics.action, "failed"),
				...analytics.getFailureProperties?.(input),
				error_code: "response_error",
			});
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useQuickBooksStatus(options: QuickBooksQueryOptions = {}) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: quickBooksQueryKey(activeCenterId, "status"),
		enabled: options.enabled ?? true,
		queryFn: async () => {
			const res = await apiFetch("/api/quickbooks/status");
			return (await parseJsonResponse(
				res,
				quickBooksStatusSchema,
				"Failed to fetch QuickBooks status",
			)) as QuickBooksStatusSnapshot;
		},
	});
}

export function useQuickBooksSyncHistory(options: QuickBooksQueryOptions = {}) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: quickBooksQueryKey(activeCenterId, "history"),
		enabled: options.enabled ?? true,
		queryFn: async () => {
			const res = await apiFetch("/api/quickbooks/sync/history");
			const data = await parseJsonResponse(
				res,
				quickBooksHistoryResponseSchema,
				"Failed to fetch QuickBooks sync history",
			);
			return data.history;
		},
	});
}

export function useQuickBooksReconciliation(
	status?: QuickBooksReconciliationItem["status"],
	options: QuickBooksQueryOptions = {},
) {
	const activeCenterId = useActiveCenterId();
	const query = status ? `?status=${encodeURIComponent(status)}` : "";

	return useQuery({
		queryKey: [activeCenterId, "quickbooks", "reconciliation", status ?? "all"],
		enabled: options.enabled ?? true,
		queryFn: async () => {
			const res = await apiFetch(`/api/quickbooks/reconciliation${query}`);
			const data = await parseJsonResponse(
				res,
				quickBooksReconciliationResponseSchema,
				"Failed to fetch QuickBooks reconciliation items",
			);
			return data.items as unknown as QuickBooksReconciliationItem[];
		},
	});
}

export function useStartQuickBooksConnect() {
	return useQuickBooksMutation<void, QuickBooksConnectStartResponse>(
		async () => {
			const res = await apiFetch("/api/quickbooks/connect/start", {
				method: "POST",
			});
			return (await parseJsonResponse(
				res,
				quickBooksConnectStartResponseSchema,
				"Failed to start QuickBooks connect flow",
			)) as QuickBooksConnectStartResponse;
		},
		{ action: "connect_start" },
	);
}

export function useDisconnectQuickBooks() {
	return useQuickBooksMutation<void, QuickBooksDisconnectResponse>(
		async () => {
			const res = await apiFetch("/api/quickbooks/disconnect", {
				method: "POST",
			});
			return (await parseJsonResponse(
				res,
				quickBooksDisconnectResponseSchema,
				"Failed to disconnect QuickBooks",
			)) as QuickBooksDisconnectResponse;
		},
		{ action: "disconnect" },
	);
}

export function useRunQuickBooksSync() {
	return useQuickBooksMutation<QuickBooksSyncAction, QuickBooksSyncResult>(
		async (action) => {
			const path = action === "full" ? "/api/quickbooks/sync" : `/api/quickbooks/sync/${action}`;
			const res = await apiFetch(path, {
				method: "POST",
			});
			const data = await parseJsonResponse(
				res,
				quickBooksSyncResponseSchema,
				`Failed to run QuickBooks ${action} sync`,
			);
			return data.sync as unknown as QuickBooksSyncResult;
		},
		{
			action: "sync",
			getProperties: (sync, action) => ({
				sync_action: action,
				scanned_count: sync.scannedEntities,
				sync_log_count: sync.createdSyncLogs,
				reconciliation_count: sync.createdReconciliationItems,
			}),
			getFailureProperties: (action) => ({ sync_action: action }),
		},
	);
}

export function useApproveQuickBooksReconciliation() {
	return useQuickBooksMutation<ApproveQuickBooksInput, QuickBooksReviewReconciliationResponse>(
		async ({ id, ...input }) => {
			const res = await apiFetch(`/api/quickbooks/reconciliation/${id}/approve`, {
				method: "POST",
				body: JSON.stringify(input),
			});
			return (await parseJsonResponse(
				res,
				quickBooksReviewReconciliationResponseSchema,
				"Failed to approve QuickBooks reconciliation item",
			)) as QuickBooksReviewReconciliationResponse;
		},
		{
			action: "reconciliation_approve",
			getProperties: (output) => ({
				entity_type: output.item.entityType,
				issue_type: output.item.issueType,
			}),
		},
	);
}

export function useDismissQuickBooksReconciliation() {
	return useQuickBooksMutation<string, QuickBooksReviewReconciliationResponse>(
		async (id) => {
			const res = await apiFetch(`/api/quickbooks/reconciliation/${id}/dismiss`, {
				method: "POST",
			});
			return (await parseJsonResponse(
				res,
				quickBooksReviewReconciliationResponseSchema,
				"Failed to dismiss QuickBooks reconciliation item",
			)) as QuickBooksReviewReconciliationResponse;
		},
		{
			action: "reconciliation_dismiss",
			getProperties: (output) => ({
				entity_type: output.item.entityType,
				issue_type: output.item.issueType,
			}),
		},
	);
}
