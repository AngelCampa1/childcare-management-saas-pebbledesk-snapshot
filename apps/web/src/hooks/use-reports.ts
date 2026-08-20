import type { AuditLogRecord, ReportRecord } from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	auditLogListResponseSchema,
	reportsListResponseSchema,
} from "@pebbledesk/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

const generateReportResponseSchema = z
	.object({ report: z.object({ id: z.string() }).passthrough() })
	.passthrough();

interface ReportsFilters {
	reportType?: string;
	periodStartFrom?: string;
	periodEndTo?: string;
	generatedFrom?: string;
	generatedTo?: string;
}

interface AuditLogFilters {
	action?: string;
	entityType?: string;
	from?: string;
	to?: string;
}

interface GenerateReportInput {
	reportType: "attendance" | "ratio" | "subsidy" | "licensing";
	periodStart: string;
	periodEnd: string;
	format?: "pdf" | "csv";
	classroomId?: string;
	childId?: string;
	stateVariant?: "TX" | "CA" | "FL";
}

function buildQueryString(filters?: object) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(
		(filters ?? {}) as Record<string, string | undefined>,
	)) {
		if (value) params.set(key, value);
	}
	const query = params.toString();
	return query ? `?${query}` : "";
}

export function useReports(filters?: ReportsFilters) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "reports", filters],
		queryFn: async () => {
			const res = await apiFetch(`/api/reports${buildQueryString(filters)}`);
			const data = await parseJsonResponse(
				res,
				reportsListResponseSchema,
				"Failed to fetch reports",
			);
			return data.reports as unknown as ReportRecord[];
		},
	});
}

export function useAuditLog(filters?: AuditLogFilters) {
	const activeCenterId = useActiveCenterId();
	return useInfiniteQuery({
		queryKey: [activeCenterId, "auditLog", filters],
		initialPageParam: 0,
		queryFn: async ({ pageParam }) => {
			const params = new URLSearchParams();
			for (const [key, value] of Object.entries(
				(filters ?? {}) as Record<string, string | undefined>,
			)) {
				if (value) params.set(key, value);
			}
			params.set("cursor", String(pageParam));
			const res = await apiFetch(`/api/audit-log?${params.toString()}`);
			const data = await parseJsonResponse(
				res,
				auditLogListResponseSchema,
				"Failed to fetch audit log",
			);
			return {
				entries: data.entries as unknown as AuditLogRecord[],
				nextCursor: data.nextCursor ?? null,
			};
		},
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});
}

export function useGenerateReport() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: GenerateReportInput) => {
			const res = await apiFetch("/api/reports/generate", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				generateReportResponseSchema,
				"Failed to generate report",
			);
			track(ANALYTICS_EVENTS.reportGenerated, { report_type: input.reportType });
			return data.report as unknown as ReportRecord;
		},
		onSuccess: () => {
			toast.success("Report generated.");
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: [activeCenterId, "reports"] });
			await queryClient.invalidateQueries({ queryKey: [activeCenterId, "auditLog"] });
		},
	});
}

export function useReportDownload(reportId: string) {
	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/reports/${reportId}/download`, {
				headers: {
					Accept: "application/octet-stream",
				},
			});
			if (!res.ok) throw new Error("Failed to download report");
			const blob = await res.blob();
			const header = res.headers.get("content-disposition") ?? "";
			const fileName =
				header.match(/filename="(.+?)"/)?.[1] ??
				header.match(/filename=([^;]+)/)?.[1]?.trim() ??
				"report-export";
			const format = fileName.split(".").pop()?.toLowerCase() ?? undefined;
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = fileName;
			anchor.click();
			URL.revokeObjectURL(url);
			return { format };
		},
		onSuccess: (data) => {
			track(ANALYTICS_EVENTS.reportDownloaded, { format: data.format });
			toast.success("Report downloaded.");
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}
