import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		Link: ({
			children,
			to,
			...rest
		}: {
			children: ReactNode;
			to: string;
			[k: string]: unknown;
		}) => (
			<a href={to as string} {...(rest as Record<string, unknown>)}>
				{children}
			</a>
		),
		useNavigate: () => mockNavigate,
	};
});

vi.mock("../../../hooks/use-children", () => ({
	useChildren: vi.fn(),
}));

vi.mock("../../../hooks/use-setup-progress", () => ({
	useSetupProgress: vi.fn(() => ({ allDone: false, isLoading: false, currentStep: null })),
}));

vi.mock("../../../components/guidance", () => ({
	GuidancePanel: ({ guideId }: { guideId: string }) => (
		<div data-testid={`guidance-panel-${guideId}`} />
	),
}));

vi.mock("@pebbledesk/ui/components/select", () => ({
	Select: ({
		value,
		onValueChange,
		children,
	}: {
		value?: string;
		onValueChange?: (value: string) => void;
		children: ReactNode;
	}) => (
		<select
			aria-label={
				value === "active_waitlist" ? "Filter by enrollment status" : "Filter by age group"
			}
			value={value}
			onChange={(event) => onValueChange?.(event.target.value)}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>,
}));

import { useChildren } from "../../../hooks/use-children";
import { useSetupProgress } from "../../../hooks/use-setup-progress";
import { ChildrenPage, formatDate } from "./index";

const mockedUseChildren = vi.mocked(useChildren);
const mockedUseSetupProgress = vi.mocked(useSetupProgress);

describe("ChildrenPage", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
	});

	it("shows record readiness and short visible row actions with full accessible labels", () => {
		mockedUseChildren.mockReturnValue({
			isLoading: false,
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2022-04-01",
					ageGroup: "preschool",
					enrollmentStatus: "active",
				},
				{
					id: "child-2",
					firstName: "Noah",
					lastName: "Kim",
					dateOfBirth: "2021-02-01",
					ageGroup: "pre_k",
					enrollmentStatus: "waitlist",
				},
			],
		} as never);

		render(<ChildrenPage />);

		expect(screen.getByRole("region", { name: "Record readiness" })).toBeInTheDocument();
		expect(screen.getByText("Total records")).toBeInTheDocument();
		expect(screen.getByText("Active records")).toBeInTheDocument();
		expect(screen.getByText("Waitlist records")).toBeInTheDocument();
		expect(screen.getByText("Withdrawn records")).toBeInTheDocument();
		// View action is now a semantic link (Button asChild + Link) — accessible name from aria-label
		expect(screen.getByRole("link", { name: "View details for Mia Lopez" })).toHaveTextContent(
			"View",
		);
	});

	it("exposes an accessible name for child search", () => {
		mockedUseChildren.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);

		render(<ChildrenPage />);

		expect(screen.getByRole("textbox", { name: "Search children" })).toBeInTheDocument();
	});

	it("ties the child search input to an explicit label via id/htmlFor", () => {
		mockedUseChildren.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);

		render(<ChildrenPage />);

		const input = screen.getByRole("textbox", { name: "Search children" });
		expect(input).toHaveAttribute("id", "children-search");
		// A <label htmlFor="children-search"> must exist and point at the input.
		const label = document.querySelector('label[for="children-search"]');
		expect(label).not.toBeNull();
	});

	it("passes search and filter values to useChildren", () => {
		mockedUseChildren.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);

		render(<ChildrenPage />);

		fireEvent.change(screen.getByRole("textbox", { name: "Search children" }), {
			target: { value: "Mia" },
		});
		const filters = screen.getAllByRole("combobox");
		fireEvent.change(filters[0], {
			target: { value: "withdrawn" },
		});
		fireEvent.change(filters[1], {
			target: { value: "infant" },
		});

		expect(mockedUseChildren).toHaveBeenLastCalledWith({
			search: "Mia",
			status: "withdrawn",
			ageGroup: "infant",
		});
	});

	it("renders loading and empty states, then clears active filters", () => {
		mockedUseChildren.mockReturnValueOnce({
			isLoading: true,
			data: undefined,
		} as never);
		const { rerender } = render(<ChildrenPage />);

		expect(document.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);

		mockedUseChildren.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);
		rerender(<ChildrenPage />);
		fireEvent.change(screen.getByRole("textbox", { name: "Search children" }), {
			target: { value: "Missing" },
		});

		expect(screen.getByText("No children match your search")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

		expect(screen.getByRole("textbox", { name: "Search children" })).toHaveValue("");
	});

	it("shows all status counts and view links point to child detail pages", () => {
		mockedUseChildren.mockReturnValue({
			isLoading: false,
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2022-04-01",
					ageGroup: "preschool",
					enrollmentStatus: "active",
				},
				{
					id: "child-2",
					firstName: "Noah",
					lastName: "Kim",
					dateOfBirth: "2021-02-01",
					ageGroup: "pre_k",
					enrollmentStatus: "withdrawn",
				},
			],
		} as never);

		render(<ChildrenPage />);

		expect(screen.getByText("1 active · 1 withdrawn")).toBeInTheDocument();
		// Rows no longer have onClick — navigation is via semantic links only
		// View link navigates to child detail; href is provided by the mock Link -> <a>
		const viewLink = screen.getByRole("link", { name: "View details for Mia Lopez" });
		expect(viewLink).toBeInTheDocument();
		expect(viewLink).toHaveTextContent("View");
		// Name link also navigates to the same destination
		const nameLink = screen.getByRole("link", { name: "Mia Lopez" });
		expect(nameLink).toBeInTheDocument();
	});
});

it("shows error state and not empty state when useChildren returns isError true", () => {
	mockedUseChildren.mockReturnValue({
		isLoading: false,
		isError: true,
		data: undefined,
		refetch: vi.fn(),
	} as never);

	render(<ChildrenPage />);

	expect(screen.getByText("Failed to load children.")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
	expect(
		screen.queryByText("Your roster is empty — let's start enrolling"),
	).not.toBeInTheDocument();
});

it("calls refetch when Try again is clicked in the error state", () => {
	const refetch = vi.fn();
	mockedUseChildren.mockReturnValue({
		isLoading: false,
		isError: true,
		data: undefined,
		refetch,
	} as never);

	render(<ChildrenPage />);

	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(refetch).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// formatDate unit tests — date-only-safe parser (TZ boundary coverage)
// ---------------------------------------------------------------------------

describe("formatDate — date-only parser", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders a YYYY-MM-DD date without UTC shift regardless of local timezone", () => {
		// "2023-01-15" should always format as "Jan 15, 2023" regardless of UTC offset
		const result = formatDate("2023-01-15");
		expect(result).toContain("Jan");
		expect(result).toContain("15");
		expect(result).toContain("2023");
	});

	it("formats a DST spring-forward date (Mar 12, 2023) correctly", () => {
		// US clocks spring forward on Mar 12, 2023.
		// Parsing as UTC midnight would give Mar 11 for UTC-1 and beyond.
		// The local-noon parser (T12:00:00) keeps the date stable.
		const result = formatDate("2023-03-12");
		expect(result).toContain("Mar");
		expect(result).toContain("12");
		expect(result).toContain("2023");
	});

	it("formats a leap-year date (Feb 29) correctly", () => {
		const result = formatDate("2024-02-29");
		expect(result).toContain("Feb");
		expect(result).toContain("29");
		expect(result).toContain("2024");
	});

	it("falls back to new Date() for non-YYYY-MM-DD strings", () => {
		// ISO timestamps should not trigger the date-only path
		const result = formatDate("2023-01-15T00:00:00.000Z");
		// Should still produce a formatted date string (exact output is TZ-dependent)
		expect(result).toMatch(/\d{4}/);
	});
});

// ---------------------------------------------------------------------------
// GuidancePanel visibility — setup checklist gate
// ---------------------------------------------------------------------------

describe("ChildrenPage GuidancePanel visibility", () => {
	beforeEach(() => {
		mockedUseChildren.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);
	});

	it("renders the owner-start-here guidance panel when setup is NOT complete", () => {
		mockedUseSetupProgress.mockReturnValue({
			allDone: false,
			isLoading: false,
			currentStep: null,
		});

		render(<ChildrenPage />);

		expect(screen.getByTestId("guidance-panel-owner-start-here")).toBeInTheDocument();
	});

	it("hides the owner-start-here guidance panel when setup IS complete", () => {
		mockedUseSetupProgress.mockReturnValue({
			allDone: true,
			isLoading: false,
			currentStep: null,
		});

		render(<ChildrenPage />);

		expect(screen.queryByTestId("guidance-panel-owner-start-here")).not.toBeInTheDocument();
	});

	it("hides the owner-start-here guidance panel while setup status is loading", () => {
		mockedUseSetupProgress.mockReturnValue({
			allDone: false,
			isLoading: true,
			currentStep: null,
		});

		render(<ChildrenPage />);

		expect(screen.queryByTestId("guidance-panel-owner-start-here")).not.toBeInTheDocument();
	});
});
