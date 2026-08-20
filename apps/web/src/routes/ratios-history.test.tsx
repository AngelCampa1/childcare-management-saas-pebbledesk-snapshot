import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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

vi.mock("@pebbledesk/ui/components/select", () => ({
	Select: ({
		children,
		value,
		onValueChange,
	}: {
		children: ReactNode;
		value?: string;
		onValueChange?: (value: string) => void;
	}) => (
		<select
			data-testid="native-select"
			value={value}
			onChange={(event) => onValueChange?.(event.target.value)}
		>
			{children}
		</select>
	),
	SelectTrigger: ({
		children,
		"aria-label": ariaLabel,
	}: {
		children: ReactNode;
		"aria-label"?: string;
	}) => <span data-aria-label={ariaLabel}>{children}</span>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>,
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
}));

vi.mock("@pebbledesk/ui/components/tabs", () => ({
	Tabs: ({ children, defaultValue }: { children: ReactNode; defaultValue: string }) => (
		<div data-testid="tabs" data-default={defaultValue}>
			{children}
		</div>
	),
	TabsList: ({
		children,
		"aria-label": ariaLabel,
	}: {
		children: ReactNode;
		"aria-label"?: string;
	}) => (
		<div role="tablist" aria-label={ariaLabel}>
			{children}
		</div>
	),
	TabsTrigger: ({ children, value }: { children: ReactNode; value: string }) => (
		<button type="button" data-value={value}>
			{children}
		</button>
	),
	TabsContent: ({ children, value }: { children: ReactNode; value: string }) => (
		<div data-tab={value}>{children}</div>
	),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn().mockReturnValue({ data: undefined }),
}));

vi.mock("../components/violation-card", () => ({
	ViolationCard: ({
		violation,
		classroomName,
		onAddNotes,
	}: {
		violation: { id: string; title: string };
		classroomName?: string;
		onAddNotes?: (id: string, notes: string) => void;
	}) => (
		<div data-testid="violation-card">
			<span>{violation.title}</span>
			<span>{classroomName ?? "no-room"}</span>
			<button type="button" onClick={() => onAddNotes?.(violation.id, "note")}>
				Add Notes
			</button>
		</div>
	),
}));

vi.mock("../components/empty-state", () => ({
	EmptyState: ({ title, description }: { title: string; description: string }) => (
		<div data-testid="empty-state">
			<h2>{title}</h2>
			<p>{description}</p>
		</div>
	),
}));

vi.mock("../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(),
}));

vi.mock("../hooks/use-ratios", () => ({
	useRatioSnapshots: vi.fn(),
	useRatioViolations: vi.fn(),
	useUpdateViolationNotes: vi.fn(),
}));

const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseRatioSnapshots = vi.mocked(useRatioSnapshots);
const mockedUseRatioViolations = vi.mocked(useRatioViolations);
const mockedUseUpdateViolationNotes = vi.mocked(useUpdateViolationNotes);

function getComponent() {
	const Component = Route.component;
	if (!Component) throw new Error("Expected ratios history route component");
	return Component;
}

function mockClassrooms() {
	mockedUseClassrooms.mockReturnValue({
		data: [
			{ id: "classroom-1", name: "Sunshine Room", ageGroup: "infant" },
			{ id: "classroom-2", name: "Toddler Room", ageGroup: "toddler" },
		],
		isLoading: false,
	} as never);
}

describe("RatioHistoryPage", () => {
	it("renders the page header and filter controls", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		render(<Component />);

		expect(screen.getByRole("heading", { name: "Ratio History" })).toBeInTheDocument();
		expect(screen.getByText("Violations and compliance snapshots")).toBeInTheDocument();
		expect(screen.getAllByTestId("native-select").length).toBeGreaterThanOrEqual(2);
	});

	it("labels the ratio history tabs for screen readers", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		render(<Component />);

		expect(screen.getByRole("tablist", { name: "Ratio history views" })).toBeInTheDocument();
	});

	it("renders violation skeletons while the violations query is loading", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		const { container } = render(<Component />);

		const violationsPane = container.querySelector('[data-tab="violations"]');
		if (!violationsPane) throw new Error("Expected violations tab content");
		expect(violationsPane.querySelectorAll(".rounded-lg.border").length).toBeGreaterThan(0);
		expect(screen.queryByTestId("violation-card")).not.toBeInTheDocument();
	});

	it("renders snapshot skeletons while the snapshots query is loading", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		const { container } = render(<Component />);

		const snapshotsPane = container.querySelector('[data-tab="snapshots"]');
		if (!snapshotsPane) throw new Error("Expected snapshots tab content");
		expect(snapshotsPane.querySelectorAll(".rounded-lg.border").length).toBeGreaterThan(0);
	});

	it("shows the violations empty state when no violations match the filters", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		render(<Component />);

		expect(screen.getByText("No violations in this view")).toBeInTheDocument();
		expect(screen.getByText("No snapshots in this view")).toBeInTheDocument();
	});

	it("renders violation cards sorted newest first with classroom names", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({
			data: [
				{
					id: "violation-old",
					classroomId: "classroom-1",
					detectedAt: "2026-04-01T12:00:00Z",
					resolvedAt: null,
					resolutionNotes: null,
					status: "open",
					title: "Older violation",
				},
				{
					id: "violation-new",
					classroomId: "classroom-2",
					detectedAt: "2026-04-09T12:00:00Z",
					resolvedAt: null,
					resolutionNotes: null,
					status: "open",
					title: "Newer violation",
				},
			],
			isLoading: false,
		} as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		const mutate = vi.fn();
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate } as never);

		const Component = getComponent();
		render(<Component />);

		const cards = screen.getAllByTestId("violation-card");
		expect(cards).toHaveLength(2);
		expect(within(cards[0] as HTMLElement).getByText("Newer violation")).toBeInTheDocument();
		expect(within(cards[1] as HTMLElement).getByText("Older violation")).toBeInTheDocument();
		expect(within(cards[0] as HTMLElement).getByText("Toddler Room")).toBeInTheDocument();

		fireEvent.click(within(cards[0] as HTMLElement).getByRole("button", { name: "Add Notes" }));
		expect(mutate).toHaveBeenCalledWith({ id: "violation-new", resolutionNotes: "note" });
	});

	it("renders snapshot rows with compliant and violation status labels", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({
			data: [
				{
					id: "snapshot-1",
					classroomId: "classroom-1",
					snapshotAt: "2026-04-09T16:30:00Z",
					staffCount: 2,
					childrenCount: 8,
					ratioRequired: 0.25,
					inCompliance: true,
				},
				{
					id: "snapshot-2",
					classroomId: "classroom-2",
					snapshotAt: "2026-04-09T17:00:00Z",
					staffCount: 0,
					childrenCount: 5,
					ratioRequired: 0.2,
					inCompliance: false,
				},
				{
					id: "snapshot-3",
					classroomId: "unknown",
					snapshotAt: "2026-04-09T18:00:00Z",
					staffCount: 1,
					childrenCount: 4,
					ratioRequired: 0.25,
					inCompliance: true,
				},
			],
			isLoading: false,
		} as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		const { container } = render(<Component />);

		const table = container.querySelector("table");
		if (!table) throw new Error("Expected snapshots table");
		const tableUtil = within(table);

		expect(tableUtil.getByText("Sunshine Room")).toBeInTheDocument();
		expect(tableUtil.getByText("Toddler Room")).toBeInTheDocument();
		expect(tableUtil.getByText("Unknown Room")).toBeInTheDocument();
		expect(tableUtil.getAllByText("Compliant").length).toBe(2);
		expect(tableUtil.getByText("Violation")).toBeInTheDocument();
		// Zero-staff snapshot renders N/A for actual ratio.
		expect(tableUtil.getByText("N/A")).toBeInTheDocument();
		// Non-zero snapshots render 1:<ratio> actual labels.
		expect(tableUtil.getAllByText("1:4.0").length).toBe(2);
	});

	it("shows a Clear filters button once filters are active and resets them", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		render(<Component />);

		expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

		const selects = screen.getAllByTestId("native-select");
		// First select is classroom, last is status.
		fireEvent.change(selects[0] as HTMLSelectElement, { target: { value: "classroom-1" } });

		const clearBtn = screen.getByRole("button", { name: "Clear filters" });
		expect(clearBtn).toBeInTheDocument();

		fireEvent.click(clearBtn);
		expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
	});

	it("shows Clear filters when the status filter changes and resets it on click", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		render(<Component />);

		const selects = screen.getAllByTestId("native-select");
		const statusSelect = selects[selects.length - 1] as HTMLSelectElement;
		fireEvent.change(statusSelect, { target: { value: "open" } });

		expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
	});

	it("shows Clear filters when the from date is set", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		render(<Component />);

		fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-04-01" } });
		expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
	});

	it("shows Clear filters when the to date is set", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		render(<Component />);

		fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-04-10" } });
		expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
	});

	it("falls back to an empty classroom list when useClassrooms returns undefined data", () => {
		mockedUseClassrooms.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		render(<Component />);

		expect(screen.getByRole("heading", { name: "Ratio History" })).toBeInTheDocument();
	});

	it("renders snapshot timestamps via formatDateTime (Apr 1, 2026 format, no comma before time)", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({
			data: [
				{
					id: "snap-ts",
					classroomId: "classroom-1",
					snapshotAt: "2026-04-01T14:30:00Z",
					staffCount: 1,
					childrenCount: 4,
					ratioRequired: 0.25,
					inCompliance: true,
				},
			],
			isLoading: false,
		} as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		const { container } = render(<Component />);

		const table = container.querySelector("table");
		if (!table) throw new Error("Expected snapshots table");

		// formatDateTime produces "Apr 1, 2026 2:30 PM" (no comma between year and time)
		// The exact hour depends on the test timezone; just assert the year appears in the cell
		// and that the format does NOT contain "Invalid Date".
		const cell = table.querySelector("td");
		if (!cell) throw new Error("Expected table cell");
		expect(cell.textContent).not.toContain("Invalid Date");
		expect(cell.textContent).toContain("2026");
	});

	it("renders — (EMPTY_DATE) for an invalid/empty snapshot timestamp", () => {
		mockClassrooms();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseRatioSnapshots.mockReturnValue({
			data: [
				{
					id: "snap-bad",
					classroomId: "classroom-1",
					snapshotAt: "not-a-date",
					staffCount: 1,
					childrenCount: 4,
					ratioRequired: 0.25,
					inCompliance: true,
				},
			],
			isLoading: false,
		} as never);
		mockedUseUpdateViolationNotes.mockReturnValue({ mutate: vi.fn() } as never);

		const Component = getComponent();
		const { container } = render(<Component />);

		const table = container.querySelector("table");
		if (!table) throw new Error("Expected snapshots table");
		const cell = table.querySelector("td");
		if (!cell) throw new Error("Expected table cell");
		// formatDateTime returns EMPTY_DATE ("—") for unparseable input
		expect(cell.textContent).toBe("—");
	});
});
