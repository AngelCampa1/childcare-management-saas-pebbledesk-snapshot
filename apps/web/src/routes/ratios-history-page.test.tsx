import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthSession } from "../hooks/use-auth-session";
import { useClassrooms } from "../hooks/use-classrooms";
import {
	useRatioSnapshots,
	useRatioViolations,
	useUpdateViolationNotes,
} from "../hooks/use-ratios";
import { Route } from "./_auth/ratios/history";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => (options: unknown) => options,
		Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
	};
});

vi.mock("../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

vi.mock("../hooks/use-ratios", () => ({
	useRatioSnapshots: vi.fn(),
	useRatioViolations: vi.fn(),
	useUpdateViolationNotes: vi.fn(),
}));

vi.mock("../components/violation-card", () => ({
	ViolationCard: ({ violation }: { violation: { title: string } }) => (
		<div data-testid="violation-card">{violation.title}</div>
	),
}));

const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseRatioSnapshots = vi.mocked(useRatioSnapshots);
const mockedUseRatioViolations = vi.mocked(useRatioViolations);
const mockedUseUpdateViolationNotes = vi.mocked(useUpdateViolationNotes);
const mockedUseAuthSession = vi.mocked(useAuthSession);

function mockSessionTimezone(timezone: string | undefined): void {
	mockedUseAuthSession.mockReturnValue({
		data: timezone ? { center: { timezone } } : undefined,
	} as never);
}

describe("RatioHistoryPage", () => {
	beforeEach(() => {
		mockSessionTimezone(undefined);
	});

	it("renders the history page without raw palette literals in route markup", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					ageGroup: "infant",
				},
			],
			isLoading: false,
		} as never);
		mockedUseRatioViolations.mockReturnValue({
			data: [
				{
					id: "violation-1",
					classroomId: "classroom-1",
					detectedAt: "2026-04-09T12:00:00Z",
					resolvedAt: null,
					resolutionNotes: null,
					status: "open",
					title: "Ratio violation",
				},
			],
			isLoading: false,
		} as never);
		mockedUseRatioSnapshots.mockReturnValue({
			data: [
				{
					id: "snapshot-1",
					classroomId: "classroom-1",
					snapshotAt: "2026-04-09T12:00:00Z",
					staffCount: 2,
					childrenCount: 8,
					ratioRequired: 0.25,
					inCompliance: true,
				},
			],
			isLoading: false,
		} as never);
		mockedUseUpdateViolationNotes.mockReturnValue({
			mutate: vi.fn(),
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios history route component");

		const { container } = render(<Component />);

		expect(screen.getByText("Ratio History")).toBeInTheDocument();
		expect(screen.getByTestId("violation-card")).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Snapshots" })).toBeInTheDocument();
		expect(container.innerHTML).not.toMatch(
			/\b(?:bg|text|border)-(?:green|amber|blue|gray|red)-\d{2,3}\b/,
		);
	});

	it("keeps filters and snapshot tables mobile-safe", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "classroom-1", name: "Sunshine Room", ageGroup: "infant" }],
			isLoading: false,
		} as never);
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({
			data: [
				{
					id: "snapshot-1",
					classroomId: "classroom-1",
					snapshotAt: "2026-04-09T12:00:00Z",
					staffCount: 2,
					childrenCount: 8,
					ratioRequired: 0.25,
					inCompliance: true,
				},
			],
			isLoading: false,
		} as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios history route component");
		render(<Component />);

		expect(screen.getByTestId("ratio-history-filters")).toHaveClass("grid");
		expect(screen.getByTestId("ratio-history-date-filters")).toHaveClass("grid");
		fireEvent.click(screen.getByRole("tab", { name: "Snapshots" }));
		expect(screen.getByTestId("ratio-snapshots-table")).toHaveClass("overflow-x-auto");
	});

	it("renders snapshot timestamps in the center timezone, not the browser zone", () => {
		mockSessionTimezone("America/Los_Angeles");
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "classroom-1", name: "Sunshine Room", ageGroup: "infant" }],
			isLoading: false,
		} as never);
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({
			data: [
				{
					id: "snapshot-1",
					classroomId: "classroom-1",
					// 2026-04-11T02:00:00Z is Apr 10, 7:00 PM in America/Los_Angeles (UTC-7 DST).
					snapshotAt: "2026-04-11T02:00:00.000Z",
					staffCount: 2,
					childrenCount: 8,
					ratioRequired: 0.25,
					inCompliance: true,
				},
			],
			isLoading: false,
		} as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios history route component");
		render(<Component />);

		fireEvent.click(screen.getByRole("tab", { name: "Snapshots" }));
		expect(screen.getByText(/Apr 10, 2026 7:00\s?PM/)).toBeInTheDocument();
	});

	it("shows violations error box and Try again button instead of empty state when useRatioViolations errors", () => {
		const refetchViolations = vi.fn();
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "classroom-1", name: "Sunshine Room", ageGroup: "infant" }],
			isLoading: false,
		} as never);
		mockedUseRatioViolations.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch: refetchViolations,
		} as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios history route component");
		render(<Component />);

		expect(screen.queryByText("No violations in this view")).not.toBeInTheDocument();
		expect(screen.getByText("Failed to load violations.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetchViolations).toHaveBeenCalledTimes(1);
	});

	it("shows snapshots error box and Try again button instead of empty state when useRatioSnapshots errors", () => {
		const refetchSnapshots = vi.fn();
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "classroom-1", name: "Sunshine Room", ageGroup: "infant" }],
			isLoading: false,
		} as never);
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch: refetchSnapshots,
		} as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios history route component");
		render(<Component />);

		fireEvent.click(screen.getByRole("tab", { name: "Snapshots" }));

		expect(screen.queryByText("No snapshots in this view")).not.toBeInTheDocument();
		expect(screen.getByText("Failed to load snapshots.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetchSnapshots).toHaveBeenCalledTimes(1);
	});
});
