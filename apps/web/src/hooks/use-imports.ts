import { ANALYTICS_EVENTS, type ImportResultPayload, importResultSchema } from "@pebbledesk/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

/**
 * Import hooks: post bulk rows to /api/imports/{children,guardians,invoices,enroll}
 * and surface the server-reported insert/update/skip/error counts.
 *
 * Toast policy (audit cycle 1, P0-001/P0-002):
 *   - `onSuccess` toasts the counts (relief-oriented "warm, sturdy, practical" UX).
 *   - `onError` toasts the extracted error message so non-2xx failures are
 *     never silent.
 *   - Row-level partial failures (errors[] populated on a 2xx body) are
 *     surfaced via a follow-up info toast so the caller's UI can still
 *     render a detailed errors table.
 */
export type ImportResult = ImportResultPayload;

export interface ImportRowError {
	rowIndex: number;
	message: string;
}

export interface ImportPayload {
	rows: unknown[];
	dedupeStrategy: "skip";
}

type ImportType = "children" | "guardians" | "invoices" | "enrollment";

function getRowCountBucket(count: number): string {
	if (count <= 0) return "0";
	if (count === 1) return "1";
	if (count <= 10) return "2-10";
	if (count <= 50) return "11-50";
	if (count <= 100) return "51-100";
	if (count <= 500) return "101-500";
	return "501+";
}

function trackImportCompleted(
	importType: ImportType,
	result: ImportResult,
	payload: ImportPayload,
) {
	track(ANALYTICS_EVENTS.importCompleted, {
		feature_name: "imports",
		action: `import_${importType}`,
		result: "success",
		import_type: importType,
		dedupe_strategy: payload.dedupeStrategy,
		inserted_count: result.inserted,
		updated_count: result.updated,
		skipped_count: result.skipped,
		error_count: result.errors.length,
		row_count_bucket: getRowCountBucket(payload.rows.length),
	});
}

function trackImportFailed(importType: ImportType, payload: ImportPayload) {
	track(ANALYTICS_EVENTS.importFailed, {
		feature_name: "imports",
		action: `import_${importType}`,
		result: "failed",
		import_type: importType,
		dedupe_strategy: payload.dedupeStrategy,
		row_count_bucket: getRowCountBucket(payload.rows.length),
		error_code: "response_error",
	});
}

function describeCounts(result: ImportResult, label: string): string {
	const parts: string[] = [];
	if (result.inserted > 0) parts.push(`${result.inserted} added`);
	if (result.updated > 0) parts.push(`${result.updated} updated`);
	if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
	if (parts.length === 0) parts.push("no changes");
	return `${label} import: ${parts.join(", ")}.`;
}

function announceResult(result: ImportResult, label: string): void {
	toast.success(describeCounts(result, label));
	if (result.errors.length > 0) {
		toast.info(
			`${result.errors.length} row${result.errors.length === 1 ? "" : "s"} could not be imported. Review the errors below.`,
		);
	}
}

async function postImport(path: string, payload: ImportPayload, errorMessage: string) {
	const res = await apiFetch(path, {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return parseJsonResponse(res, importResultSchema, errorMessage);
}

export function useImportChildren() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation<ImportResult, Error, ImportPayload>({
		mutationFn: (payload) =>
			postImport("/api/imports/children", payload, "Failed to import children"),
		onSuccess: (result, payload) => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			announceResult(result, "Children");
			trackImportCompleted("children", result, payload);
		},
		onError: (err, payload) => {
			toast.error(extractErrorMessage(err));
			trackImportFailed("children", payload);
		},
	});
}

export function useImportGuardians() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation<ImportResult, Error, ImportPayload>({
		mutationFn: (payload) =>
			postImport("/api/imports/guardians", payload, "Failed to import guardians"),
		onSuccess: (result, payload) => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
			announceResult(result, "Guardians");
			trackImportCompleted("guardians", result, payload);
		},
		onError: (err, payload) => {
			toast.error(extractErrorMessage(err));
			trackImportFailed("guardians", payload);
		},
	});
}

export function useImportInvoices() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation<ImportResult, Error, ImportPayload>({
		mutationFn: (payload) =>
			postImport("/api/imports/invoices", payload, "Failed to import invoices"),
		onSuccess: (result, payload) => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoices"] });
			// Imported rows can carry status "overdue" (createInvoiceSchema), which the dashboard
			// overdue badge reads from the invoiceSummary query — refresh it too, matching every
			// other invoice mutation (invalidateInvoiceQueries in use-finance.ts).
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoiceSummary"] });
			announceResult(result, "Invoices");
			trackImportCompleted("invoices", result, payload);
		},
		onError: (err, payload) => {
			toast.error(extractErrorMessage(err));
			trackImportFailed("invoices", payload);
		},
	});
}

export function useImportEnroll() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation<ImportResult, Error, ImportPayload>({
		mutationFn: (payload) =>
			postImport("/api/imports/enroll", payload, "Failed to import enrollment"),
		onSuccess: (result, payload) => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			announceResult(result, "Enrollment");
			trackImportCompleted("enrollment", result, payload);
		},
		onError: (err, payload) => {
			toast.error(extractErrorMessage(err));
			trackImportFailed("enrollment", payload);
		},
	});
}
