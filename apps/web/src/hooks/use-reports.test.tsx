import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
import { useAuditLog, useGenerateReport, useReportDownload, useReports } from "./use-reports";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const CENTER_ID = "center-test";
const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);
const mockedToast = vi.mocked(toast);

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

function createWrapperWithClient() {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return {
		client,
		Wrapper({ children }: { children: ReactNode }) {
			return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
		},
	};
}

describe("use-reports hooks", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("loads report history with filters", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ reports: [{ id: "report-1", reportType: "attendance" }] }),
		} as Response);

		const { result } = renderHook(
			() => useReports({ reportType: "attendance", generatedFrom: "2026-04-01" }),
			{ wrapper: createWrapper() },
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/reports?reportType=attendance&generatedFrom=2026-04-01",
		);
	});

	it("loads report history without filters", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ reports: [] }),
		} as Response);

		const { result } = renderHook(() => useReports(), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/reports");
	});

	it("omits empty filter values from the query string", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ reports: [] }),
		} as Response);

		const { result } = renderHook(
			() =>
				useReports({
					reportType: "",
					periodStartFrom: "",
					periodEndTo: "2026-04-07",
					generatedTo: "2026-04-07",
				}),
			{ wrapper: createWrapper() },
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/reports?periodEndTo=2026-04-07&generatedTo=2026-04-07",
		);
	});

	it("loads the audit log with filters", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ entries: [{ id: "log-1", action: "export" }], nextCursor: null }),
		} as Response);

		const { result } = renderHook(() => useAuditLog({ action: "export", entityType: "reports" }), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/audit-log?action=export&entityType=reports&cursor=0",
		);
	});

	it("loads the audit log without filters", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ entries: [], nextCursor: null }),
		} as Response);

		const { result } = renderHook(() => useAuditLog(), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/audit-log?cursor=0");
	});

	it("exposes hasNextPage true when nextCursor is a number", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ entries: [{ id: "log-1", action: "export" }], nextCursor: 50 }),
		} as Response);

		const { result } = renderHook(() => useAuditLog(), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.hasNextPage).toBe(true);
	});

	it("exposes hasNextPage false when nextCursor is null", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ entries: [], nextCursor: null }),
		} as Response);

		const { result } = renderHook(() => useAuditLog(), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(result.current.hasNextPage).toBe(false);
	});

	it("fetchNextPage appends entries from the second page", async () => {
		mockedApiFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ entries: [{ id: "log-1", action: "export" }], nextCursor: 50 }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ entries: [{ id: "log-2", action: "create" }], nextCursor: null }),
			} as Response);

		const { result } = renderHook(() => useAuditLog(), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.pages[0].entries).toHaveLength(1);

		await act(async () => {
			await result.current.fetchNextPage();
		});
		await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

		const allEntries = result.current.data?.pages.flatMap((p) => p.entries) ?? [];
		expect(allEntries).toHaveLength(2);
		expect(allEntries[0].id).toBe("log-1");
		expect(allEntries[1].id).toBe("log-2");
		expect(result.current.hasNextPage).toBe(false);

		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/audit-log?cursor=50");
	});

	it("generates reports", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ report: { id: "report-1", reportType: "attendance" } }),
		} as Response);
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useGenerateReport(), {
			wrapper: Wrapper,
		});

		await act(async () => {
			await result.current.mutateAsync({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			});
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "reports"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "auditLog"] });
		expect(mockedToast.success).toHaveBeenCalled();
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/reports/generate", {
			method: "POST",
			body: JSON.stringify({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		});
	});

	it("throws on failed report and audit log fetches", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
		} as Response);
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
		} as Response);

		const reports = renderHook(() => useReports(), {
			wrapper: createWrapper(),
		});
		const audit = renderHook(() => useAuditLog(), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(reports.result.current.isError).toBe(true));
		await waitFor(() => expect(audit.result.current.isError).toBe(true));
	});

	it("downloads a report artifact", async () => {
		const originalCreateElement = document.createElement.bind(document);
		const createObjectURL = vi.fn(() => "blob:report");
		const revokeObjectURL = vi.fn();
		const click = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		Object.assign(URL, {
			createObjectURL,
			revokeObjectURL,
		});
		const createElementSpy = vi.spyOn(document, "createElement").mockImplementation(((
			tagName: string,
		) => {
			if (tagName === "a") {
				return {
					click,
					set href(_value: string) {},
					set download(_value: string) {},
				} as unknown as HTMLAnchorElement;
			}
			return originalCreateElement(tagName);
		}) as typeof document.createElement);
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			blob: async () => new Blob(["header\nvalue"], { type: "text/csv" }),
			headers: new Headers({
				"content-disposition": 'attachment; filename="attendance.csv"',
			}),
		} as Response);

		const { result } = renderHook(() => useReportDownload("report-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/reports/report-1/download", {
			headers: {
				Accept: "application/octet-stream",
			},
		});
		expect(createObjectURL).toHaveBeenCalled();
		expect(click).toHaveBeenCalled();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
		createElementSpy.mockRestore();
		Object.assign(URL, {
			createObjectURL: originalCreateObjectURL,
			revokeObjectURL: originalRevokeObjectURL,
		});
	});

	it("throws on failed generate and download actions", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
		} as Response);
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
		} as Response);

		const generate = renderHook(() => useGenerateReport(), {
			wrapper: createWrapper(),
		});
		const download = renderHook(() => useReportDownload("report-1"), {
			wrapper: createWrapper(),
		});

		await expect(
			generate.result.current.mutateAsync({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		).rejects.toThrow("Failed to generate report");
		await expect(download.result.current.mutateAsync()).rejects.toThrow(
			"Failed to download report",
		);
		await waitFor(() => expect(mockedToast.error).toHaveBeenCalled());
	});

	it("tracks report_downloaded with format derived from filename on success", async () => {
		const originalCreateElement = document.createElement.bind(document);
		const createObjectURL = vi.fn(() => "blob:report");
		const revokeObjectURL = vi.fn();
		const click = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		Object.assign(URL, { createObjectURL, revokeObjectURL });
		const createElementSpy = vi.spyOn(document, "createElement").mockImplementation(((
			tagName: string,
		) => {
			if (tagName === "a") {
				return {
					click,
					set href(_value: string) {},
					set download(_value: string) {},
				} as unknown as HTMLAnchorElement;
			}
			return originalCreateElement(tagName);
		}) as typeof document.createElement);

		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			blob: async () => new Blob(["x"], { type: "text/csv" }),
			headers: new Headers({ "content-disposition": 'attachment; filename="report.csv"' }),
		} as Response);

		const { result } = renderHook(() => useReportDownload("report-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).toHaveBeenCalledWith("report_downloaded", { format: "csv" });
		createElementSpy.mockRestore();
		Object.assign(URL, {
			createObjectURL: originalCreateObjectURL,
			revokeObjectURL: originalRevokeObjectURL,
		});
	});

	it("tracks report_downloaded with pdf format when filename ends in .pdf", async () => {
		const originalCreateElement = document.createElement.bind(document);
		const createObjectURL = vi.fn(() => "blob:report");
		const revokeObjectURL = vi.fn();
		const click = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		Object.assign(URL, { createObjectURL, revokeObjectURL });
		const createElementSpy = vi.spyOn(document, "createElement").mockImplementation(((
			tagName: string,
		) => {
			if (tagName === "a") {
				return {
					click,
					set href(_value: string) {},
					set download(_value: string) {},
				} as unknown as HTMLAnchorElement;
			}
			return originalCreateElement(tagName);
		}) as typeof document.createElement);

		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			blob: async () => new Blob(["x"], { type: "application/pdf" }),
			headers: new Headers({ "content-disposition": 'attachment; filename="report.pdf"' }),
		} as Response);

		const { result } = renderHook(() => useReportDownload("report-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).toHaveBeenCalledWith("report_downloaded", { format: "pdf" });
		createElementSpy.mockRestore();
		Object.assign(URL, {
			createObjectURL: originalCreateObjectURL,
			revokeObjectURL: originalRevokeObjectURL,
		});
	});

	it("rejects a reports response that fails schema validation", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ reports: [{ reportType: "attendance" }] }),
		} as Response);

		const { result } = renderHook(() => useReports(), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("surfaces a success toast after downloading a report", async () => {
		const originalCreateElement = document.createElement.bind(document);
		const createObjectURL = vi.fn(() => "blob:report");
		const revokeObjectURL = vi.fn();
		const click = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		Object.assign(URL, { createObjectURL, revokeObjectURL });
		const createElementSpy = vi.spyOn(document, "createElement").mockImplementation(((
			tagName: string,
		) => {
			if (tagName === "a") {
				return {
					click,
					set href(_value: string) {},
					set download(_value: string) {},
				} as unknown as HTMLAnchorElement;
			}
			return originalCreateElement(tagName);
		}) as typeof document.createElement);
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			blob: async () => new Blob(["x"], { type: "text/csv" }),
			headers: new Headers({ "content-disposition": 'attachment; filename="r.csv"' }),
		} as Response);

		const { result } = renderHook(() => useReportDownload("report-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedToast.success).toHaveBeenCalled();
		createElementSpy.mockRestore();
		Object.assign(URL, {
			createObjectURL: originalCreateObjectURL,
			revokeObjectURL: originalRevokeObjectURL,
		});
	});
});
