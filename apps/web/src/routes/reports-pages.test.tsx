import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogPage } from "./_auth/reports/audit-log";
import { ReportsPage } from "./_auth/reports/index";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
	};
});

vi.mock("../hooks/use-reports", () => ({
	useReports: vi.fn(),
	useAuditLog: vi.fn(),
	useGenerateReport: vi.fn(),
	useReportDownload: vi.fn(),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

import { useAuthSession } from "../hooks/use-auth-session";
import {
	useAuditLog,
	useGenerateReport,
	useReportDownload,
	useReports,
} from "../hooks/use-reports";

const mockedUseReports = vi.mocked(useReports);
const mockedUseAuditLog = vi.mocked(useAuditLog);
const mockedUseGenerateReport = vi.mocked(useGenerateReport);
const mockedUseReportDownload = vi.mocked(useReportDownload);
const mockedUseAuthSession = vi.mocked(useAuthSession);

function mockSessionTimezone(timezone: string | undefined): void {
	mockedUseAuthSession.mockReturnValue({
		data: timezone ? { center: { timezone } } : undefined,
	} as never);
}

describe("reports pages", () => {
	beforeEach(() => {
		mockSessionTimezone("America/Los_Angeles");
	});

	it("renders the reports page and generates a report", () => {
		const mutate = vi.fn();
		mockedUseReports.mockReturnValue({
			data: [
				{
					id: "report-1",
					reportType: "attendance",
					fileName: "attendance.csv",
					generatedAt: "2026-04-08T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseGenerateReport.mockReturnValue({
			mutate,
			isPending: false,
		} as never);
		mockedUseReportDownload.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);

		render(<ReportsPage />);

		fireEvent.click(screen.getByRole("combobox"));
		fireEvent.click(screen.getByText("Licensing"));
		fireEvent.change(screen.getByLabelText("Period start"), {
			target: { value: "2026-04-01" },
		});
		fireEvent.change(screen.getByLabelText("Period end"), {
			target: { value: "2026-04-07" },
		});
		expect(screen.getByText("Reports")).toBeInTheDocument();
		expect(screen.getByText("attendance.csv")).toBeInTheDocument();
		expect(screen.getByText("Generated Apr 8, 2026")).toBeInTheDocument();
		expect(screen.getByText("Report type")).toBeInTheDocument();
		expect(screen.getByText("Period start")).toBeInTheDocument();
		expect(screen.getByText("Period end")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
		expect(mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		);
	});

	it("renders generated-at in the center timezone, not the browser zone", () => {
		mockSessionTimezone("America/Los_Angeles");
		mockedUseReports.mockReturnValue({
			data: [
				{
					id: "report-tz",
					reportType: "attendance",
					fileName: "attendance.csv",
					// 2026-04-11T02:00:00Z is Apr 10 in America/Los_Angeles (UTC-7 DST).
					generatedAt: "2026-04-11T02:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseGenerateReport.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedUseReportDownload.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<ReportsPage />);

		expect(screen.getByText("Generated Apr 10, 2026")).toBeInTheDocument();
	});

	it("links to the audit log from the reports page", () => {
		mockedUseReports.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGenerateReport.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedUseReportDownload.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<ReportsPage />);

		expect(screen.getByRole("link", { name: /View audit log/i })).toHaveAttribute(
			"href",
			"/reports/audit-log",
		);
	});

	it("places the report generator before guidance and help panels", () => {
		mockedUseReports.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGenerateReport.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedUseReportDownload.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<ReportsPage />);

		const generator = screen.getByText("Report type").closest("section");
		const guidance = screen.getByText("Need help downloading a report?");
		const help = screen.getByText("Reports plain-language guide");

		expect(generator).not.toBeNull();
		expect(generator?.compareDocumentPosition(guidance) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(generator?.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	it("shows state variant selector when licensing is selected", () => {
		mockedUseReports.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGenerateReport.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedUseReportDownload.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<ReportsPage />);

		// State variant selector should not appear for non-licensing types (default is attendance)
		expect(screen.queryByText("State Format (optional)")).not.toBeInTheDocument();

		// Switch to licensing
		fireEvent.click(screen.getByRole("combobox"));
		fireEvent.click(screen.getByText("Licensing"));

		// State variant selector should now appear
		expect(screen.getByText("State Format (optional)")).toBeInTheDocument();
		expect(screen.getByLabelText(/^State Format \(optional\)$/i)).toBeInTheDocument();
	});

	it("hides state variant selector for non-licensing report types", () => {
		mockedUseReports.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGenerateReport.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedUseReportDownload.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<ReportsPage />);

		// Switch to licensing first
		fireEvent.click(screen.getByRole("combobox"));
		fireEvent.click(screen.getByText("Licensing"));
		expect(screen.getByText("State Format (optional)")).toBeInTheDocument();

		// Switch to ratio — selector should disappear
		fireEvent.click(screen.getAllByRole("combobox")[0]);
		fireEvent.click(screen.getByText("Ratio"));
		expect(screen.queryByText("State Format (optional)")).not.toBeInTheDocument();
	});

	it("includes stateVariant in the request when a state is selected for licensing", () => {
		const mutate = vi.fn();
		mockedUseReports.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGenerateReport.mockReturnValue({ mutate, isPending: false } as never);
		mockedUseReportDownload.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<ReportsPage />);

		// Switch to licensing
		fireEvent.click(screen.getByRole("combobox"));
		fireEvent.click(screen.getByText("Licensing"));

		// Set dates
		fireEvent.change(screen.getByLabelText("Period start"), {
			target: { value: "2026-04-01" },
		});
		fireEvent.change(screen.getByLabelText("Period end"), {
			target: { value: "2026-04-07" },
		});

		// Select TX state variant
		fireEvent.click(screen.getByLabelText(/^State Format \(optional\)$/i));
		fireEvent.click(screen.getByText("Texas (HHSC 2936)"));

		fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

		expect(mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			}),
		);
	});

	it("omits stateVariant from the request when generic is selected", () => {
		const mutate = vi.fn();
		mockedUseReports.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGenerateReport.mockReturnValue({ mutate, isPending: false } as never);
		mockedUseReportDownload.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<ReportsPage />);

		// Switch to licensing
		fireEvent.click(screen.getByRole("combobox"));
		fireEvent.click(screen.getByText("Licensing"));

		// Set dates
		fireEvent.change(screen.getByLabelText("Period start"), {
			target: { value: "2026-04-01" },
		});
		fireEvent.change(screen.getByLabelText("Period end"), {
			target: { value: "2026-04-07" },
		});

		// Keep "generic" default — do not select a state
		fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

		// stateVariant should not be in the call
		expect(mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		);
		expect(mutate).toHaveBeenCalledWith(
			expect.not.objectContaining({ stateVariant: expect.anything() }),
		);
	});

	it("renders loading state and download fallback label on reports page", () => {
		const download = vi.fn();
		mockedUseReports.mockReturnValue({
			data: [{ id: "report-1", reportType: "attendance", fileName: null }],
			isLoading: false,
		} as never);
		mockedUseGenerateReport.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);
		mockedUseReportDownload.mockReturnValue({
			mutate: download,
			isPending: false,
		} as never);

		render(<ReportsPage />);

		expect(screen.getByText("Generated report")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Download" }));
		expect(download).toHaveBeenCalled();
	});

	it("renders the reports empty state", () => {
		mockedUseReports.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseGenerateReport.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);
		mockedUseReportDownload.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);

		render(<ReportsPage />);

		expect(screen.getByText("You're audit-ready")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Generate a compliance export above and we'll keep your audit history filed here.",
			),
		).toBeInTheDocument();
	});

	it("blocks report generation until both period dates are entered", () => {
		const mutate = vi.fn();
		mockedUseReports.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseGenerateReport.mockReturnValue({
			mutate,
			isPending: false,
		} as never);
		mockedUseReportDownload.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);

		render(<ReportsPage />);

		expect(
			screen.getByText("Choose a start and end date to generate this export."),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Generate report" })).toBeDisabled();

		fireEvent.change(screen.getByLabelText("Period start"), {
			target: { value: "2026-04-01" },
		});

		expect(screen.getByRole("button", { name: "Generate report" })).toBeDisabled();

		fireEvent.change(screen.getByLabelText("Period end"), {
			target: { value: "2026-04-07" },
		});

		expect(screen.getByRole("button", { name: "Generate report" })).toBeEnabled();
		expect(
			screen.queryByText("Choose a start and end date to generate this export."),
		).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

		expect(mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		);
	});

	it("blocks report generation when the end date is before the start date", () => {
		const mutate = vi.fn();
		mockedUseReports.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseGenerateReport.mockReturnValue({
			mutate,
			isPending: false,
		} as never);
		mockedUseReportDownload.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);

		render(<ReportsPage />);

		fireEvent.change(screen.getByLabelText("Period start"), {
			target: { value: "2026-04-07" },
		});
		fireEvent.change(screen.getByLabelText("Period end"), {
			target: { value: "2026-04-01" },
		});

		expect(
			screen.getByText("The end date must be the same day or later than the start date."),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Generate report" })).toBeDisabled();

		fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
		expect(mutate).not.toHaveBeenCalled();
	});

	it("renders reports loading skeletons", () => {
		mockedUseReports.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseGenerateReport.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);
		mockedUseReportDownload.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);

		render(<ReportsPage />);

		expect(screen.getByText("Report history")).toBeInTheDocument();
		expect(screen.queryByText("You're audit-ready")).not.toBeInTheDocument();
	});

	it("renders the audit log page with entries", () => {
		mockedUseAuditLog.mockReturnValue({
			data: {
				pages: [
					{
						entries: [
							{
								id: "log-1",
								action: "export",
								entityType: "reports",
								entityId: "report-1",
								changes: { changedFields: ["fileUrl"] },
							},
						],
						nextCursor: null,
					},
				],
			},
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		expect(screen.getByText("Audit Log")).toBeInTheDocument();
		expect(screen.getByText("Report exported")).toBeInTheDocument();
		expect(screen.getByText("Reference saved in system history")).toBeInTheDocument();
		expect(screen.getByText("Changed: File link")).toBeInTheDocument();
	});

	it("renders audit log entries without changed fields fallback text", () => {
		mockedUseAuditLog.mockReturnValue({
			data: {
				pages: [
					{
						entries: [
							{
								id: "log-1",
								action: "update",
								entityType: "children",
								entityId: "child-1",
								changes: {},
							},
						],
						nextCursor: null,
					},
				],
			},
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		expect(screen.getByText("No field-level details recorded")).toBeInTheDocument();
	});

	it("avoids showing placeholder entity IDs and raw field keys", () => {
		mockedUseAuditLog.mockReturnValue({
			data: {
				pages: [
					{
						entries: [
							{
								id: "log-1",
								action: "create",
								entityType: "staff-check-ins",
								entityId: "unknown",
								changes: { changedFields: ["classroomId", "periodStart"] },
							},
						],
						nextCursor: null,
					},
				],
			},
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		expect(screen.getByText("Staff check-in created")).toBeInTheDocument();
		expect(screen.getByText("No snapshot captured")).toBeInTheDocument();
		expect(screen.getByText("Changed: Classroom, Period start")).toBeInTheDocument();
		expect(screen.queryByText("classroomId, periodStart")).not.toBeInTheDocument();
	});

	it("renders visible labels for audit filters", () => {
		mockedUseAuditLog.mockReturnValue({
			data: { pages: [{ entries: [], nextCursor: null }] },
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		expect(screen.getByText("Action")).toBeInTheDocument();
		expect(screen.getByText("Entity")).toBeInTheDocument();
	});

	it("updates audit log filters", () => {
		mockedUseAuditLog.mockReturnValue({
			data: { pages: [{ entries: [], nextCursor: null }] },
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		fireEvent.click(screen.getByLabelText("Action filter"));
		fireEvent.click(screen.getByText("Export"));
		fireEvent.click(screen.getByLabelText("Entity filter"));
		fireEvent.click(screen.getByText("Reports"));

		expect(mockedUseAuditLog).toHaveBeenLastCalledWith({
			action: "export",
			entityType: "reports",
		});
	});

	it("renders actor and timestamp metadata for each audit entry", () => {
		mockedUseAuditLog.mockReturnValue({
			data: {
				pages: [
					{
						entries: [
							{
								id: "log-actor",
								action: "create",
								entityType: "children",
								entityId: "bbbbbbbb-1111-4111-8111-111111111111",
								userId: "cccccccc-2222-4222-8222-222222222222",
								createdAt: new Date().toISOString(),
								changes: { changedFields: ["name"] },
							},
						],
						nextCursor: null,
					},
				],
			},
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		expect(screen.getByText("User cccccccc")).toBeInTheDocument();
		expect(screen.getByText(/just now|m ago|h ago|d ago/)).toBeInTheDocument();
	});

	it("renders the absolute audit timestamp in the center timezone, not the browser zone", () => {
		mockSessionTimezone("America/Los_Angeles");
		// 2026-04-11T02:00:00Z is Apr 10 in America/Los_Angeles (UTC-7 in DST).
		mockedUseAuditLog.mockReturnValue({
			data: {
				pages: [
					{
						entries: [
							{
								id: "log-tz",
								action: "create",
								entityType: "children",
								entityId: "bbbbbbbb-1111-4111-8111-111111111111",
								userId: "cccccccc-2222-4222-8222-222222222222",
								createdAt: "2026-04-11T02:00:00.000Z",
								changes: { changedFields: ["name"] },
							},
						],
						nextCursor: null,
					},
				],
			},
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		const { container } = render(<AuditLogPage />);

		const time = container.querySelector("time");
		expect(time?.getAttribute("title")).toContain("Apr 10");
		expect(time?.getAttribute("title")).toContain("7:00 PM");
	});

	it("renders the audit log empty state", () => {
		mockedUseAuditLog.mockReturnValue({
			data: { pages: [{ entries: [], nextCursor: null }] },
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		expect(screen.getByText("Nothing to audit so far")).toBeInTheDocument();
		expect(
			screen.getByText(
				"System changes and exports will land here so you can answer any inspector question. Widen the filters to see more.",
			),
		).toBeInTheDocument();
	});

	it("renders the audit log loading state", () => {
		mockedUseAuditLog.mockReturnValue({
			data: undefined,
			isLoading: true,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		expect(screen.getByText("Audit Log")).toBeInTheDocument();
		expect(screen.queryByText("Nothing to audit so far")).not.toBeInTheDocument();
	});

	it("shows error box and Try again button instead of empty state when useAuditLog errors", () => {
		const refetch = vi.fn();
		mockedUseAuditLog.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
			refetch,
		} as never);

		render(<AuditLogPage />);

		expect(screen.queryByText("Nothing to audit so far")).not.toBeInTheDocument();
		expect(screen.getByText("Failed to load the audit log.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	it("shows Load more button when hasNextPage is true and calls fetchNextPage on click", () => {
		const fetchNextPage = vi.fn();
		mockedUseAuditLog.mockReturnValue({
			data: {
				pages: [
					{
						entries: [
							{
								id: "log-1",
								action: "export",
								entityType: "reports",
								entityId: "report-1",
								changes: { changedFields: [] },
							},
						],
						nextCursor: 50,
					},
				],
			},
			isLoading: false,
			hasNextPage: true,
			fetchNextPage,
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		const loadMoreButton = screen.getByRole("button", { name: "Load more" });
		expect(loadMoreButton).toBeInTheDocument();
		expect(loadMoreButton).not.toBeDisabled();

		fireEvent.click(loadMoreButton);
		expect(fetchNextPage).toHaveBeenCalledTimes(1);
	});

	it("hides Load more button when hasNextPage is false", () => {
		mockedUseAuditLog.mockReturnValue({
			data: {
				pages: [
					{
						entries: [
							{
								id: "log-1",
								action: "export",
								entityType: "reports",
								entityId: "report-1",
								changes: { changedFields: [] },
							},
						],
						nextCursor: null,
					},
				],
			},
			isLoading: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: false,
		} as never);

		render(<AuditLogPage />);

		expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
	});

	it("disables Load more button and shows Loading… while fetching next page", () => {
		mockedUseAuditLog.mockReturnValue({
			data: {
				pages: [
					{
						entries: [
							{
								id: "log-1",
								action: "export",
								entityType: "reports",
								entityId: "report-1",
								changes: { changedFields: [] },
							},
						],
						nextCursor: 50,
					},
				],
			},
			isLoading: false,
			hasNextPage: true,
			fetchNextPage: vi.fn(),
			isFetchingNextPage: true,
		} as never);

		render(<AuditLogPage />);

		const loadingButton = screen.getByRole("button", { name: "Loading…" });
		expect(loadingButton).toBeInTheDocument();
		expect(loadingButton).toBeDisabled();
	});
});
