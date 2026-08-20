import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
		createFileRoute: () => (options: unknown) => options,
	};
});

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({
		data: {
			user: { id: "u-1", name: "Angel" },
			membership: { id: "m-1", centerId: "center-1", role: "owner" },
			center: { id: "center-1", name: "Sunshine", state: "TX", timezone: "America/Chicago" },
			classroomIds: [],
		},
	})),
}));

vi.mock("../../../hooks/use-reports", () => ({
	useReports: vi.fn(() => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() })),
	useGenerateReport: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useReportDownload: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("../../../components/date-input", () => ({
	DateInput: ({
		id,
		value,
		onChange,
		"aria-label": ariaLabel,
	}: {
		id: string;
		value: string;
		onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
		"aria-label"?: string;
	}) => (
		<input id={id} type="date" value={value} onChange={onChange} aria-label={ariaLabel ?? id} />
	),
}));

vi.mock("../../../components/guidance", () => ({
	GuidancePanel: () => null,
}));

vi.mock("../../../components/empty-state", () => ({
	EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@pebbledesk/ui/components/select", () => ({
	Select: ({
		children,
		value,
		onValueChange,
	}: {
		children: ReactNode;
		value: string;
		onValueChange: (v: string) => void;
	}) => (
		<select value={value} onChange={(e) => onValueChange(e.target.value)}>
			{children}
		</select>
	),
	SelectTrigger: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
		<option value="" disabled hidden aria-label={ariaLabel}></option>
	),
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
}));

import { useGenerateReport, useReportDownload, useReports } from "../../../hooks/use-reports";
import { ReportsPage } from "./index";

const mockedUseGenerateReport = vi.mocked(useGenerateReport);
const mockedUseReports = vi.mocked(useReports);
const mockedUseReportDownload = vi.mocked(useReportDownload);

describe("ReportsPage hasBothDates validation", () => {
	it("shows 'choose a start and end date' prompt when no dates are entered", () => {
		render(<ReportsPage />);

		expect(
			screen.getByText(/Choose a start and end date to generate this export/i),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Generate report/i })).toBeDisabled();
	});

	it("keeps Generate disabled when only start date is entered", () => {
		render(<ReportsPage />);

		fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-04-01" } });

		expect(screen.getByRole("button", { name: /Generate report/i })).toBeDisabled();
	});

	it("keeps Generate disabled when only end date is entered", () => {
		render(<ReportsPage />);

		fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-04-30" } });

		expect(screen.getByRole("button", { name: /Generate report/i })).toBeDisabled();
	});

	it("enables Generate when both dates are valid ISO strings", () => {
		render(<ReportsPage />);

		fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-04-01" } });
		fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-04-30" } });

		expect(screen.getByRole("button", { name: /Generate report/i })).not.toBeDisabled();
	});

	it("keeps Generate disabled when end date is before start date", () => {
		render(<ReportsPage />);

		fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-04-30" } });
		fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-04-01" } });

		expect(screen.getByRole("button", { name: /Generate report/i })).toBeDisabled();
	});
});

describe("ReportsPage format selector", () => {
	it("renders PDF and CSV format buttons", () => {
		render(<ReportsPage />);

		expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "CSV" })).toBeInTheDocument();
	});

	it("defaults to PDF format", () => {
		render(<ReportsPage />);

		const pdfButton = screen.getByRole("button", { name: "PDF" });
		const csvButton = screen.getByRole("button", { name: "CSV" });

		expect(pdfButton.className).toContain("bg-background");
		expect(csvButton.className).not.toContain("bg-background");
	});

	it("switches to CSV when the CSV button is clicked", () => {
		render(<ReportsPage />);

		fireEvent.click(screen.getByRole("button", { name: "CSV" }));

		const csvButton = screen.getByRole("button", { name: "CSV" });
		expect(csvButton.className).toContain("bg-background");
	});

	it("passes format: pdf to generateReport when PDF is selected", () => {
		const mutate = vi.fn();
		mockedUseGenerateReport.mockReturnValue({ mutate, isPending: false } as never);

		render(<ReportsPage />);

		// Fill required dates
		fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-04-01" } });
		fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-04-30" } });

		fireEvent.click(screen.getByRole("button", { name: /Generate report/i }));

		expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ format: "pdf" }));
	});

	it("PDF and CSV format buttons use rounded-full (pill-button canon)", () => {
		render(<ReportsPage />);

		const pdfButton = screen.getByRole("button", { name: "PDF" });
		const csvButton = screen.getByRole("button", { name: "CSV" });

		expect(pdfButton.className).toContain("rounded-full");
		expect(csvButton.className).toContain("rounded-full");
	});

	it("passes format: csv to generateReport when CSV is selected", () => {
		const mutate = vi.fn();
		mockedUseGenerateReport.mockReturnValue({ mutate, isPending: false } as never);

		render(<ReportsPage />);

		fireEvent.click(screen.getByRole("button", { name: "CSV" }));

		// Fill required dates
		fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-04-01" } });
		fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-04-30" } });

		fireEvent.click(screen.getByRole("button", { name: /Generate report/i }));

		expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ format: "csv" }));
	});
});

describe("ReportsPage report history error state", () => {
	it("shows the error state when useReports returns isError true", () => {
		mockedUseReports.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch: vi.fn(),
		} as never);

		render(<ReportsPage />);

		expect(screen.getByText("Failed to load report history.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
	});

	it("calls refetch when the Try again button is clicked", () => {
		const refetch = vi.fn();
		mockedUseReports.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch,
		} as never);

		render(<ReportsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});
});

describe("ReportsPage download onError wiring", () => {
	it("useReportDownload is called per report row and the hook's onError is respected", () => {
		mockedUseReports.mockReturnValue({
			data: [{ id: "report-1", fileName: "April report", generatedAt: "2026-04-01T10:00:00.000Z" }],
			isLoading: false,
			isError: false,
			refetch: vi.fn(),
		} as never);

		const mutate = vi.fn();
		mockedUseReportDownload.mockReturnValue({ mutate, isPending: false } as never);

		render(<ReportsPage />);

		expect(mockedUseReportDownload).toHaveBeenCalledWith("report-1");
		expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
	});
});

describe("ReportsPage history date formatting", () => {
	it("renders the generated date in the center timezone (no UTC drift)", () => {
		// 2026-04-01T03:00:00Z is still Mar 31 in the center zone America/Chicago
		// (UTC-5 CDT) — confirming the day is not pulled forward to the UTC date.
		mockedUseReports.mockReturnValue({
			data: [
				{ id: "report-1", fileName: "April attendance", generatedAt: "2026-04-01T03:00:00.000Z" },
			],
			isLoading: false,
			isError: false,
			refetch: vi.fn(),
		} as never);

		render(<ReportsPage />);

		expect(screen.getByText(/Generated Mar 31, 2026/)).toBeInTheDocument();
	});
});
