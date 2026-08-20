import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSwitchCenter } from "../hooks/use-memberships";
import type { CenterOverview } from "../hooks/use-overview";
import { useMultiCenterOverview } from "../hooks/use-overview";
import { OverviewPage } from "./_auth/overview";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => (options: unknown) => options,
		Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
			<a href={to}>{children}</a>
		),
		useNavigate: () => mockNavigate,
	};
});

vi.mock("../hooks/use-overview", () => ({
	useMultiCenterOverview: vi.fn(),
}));

vi.mock("../hooks/use-memberships", () => ({
	useSwitchCenter: vi.fn(),
}));

const mockedUseMultiCenterOverview = vi.mocked(useMultiCenterOverview);
const mockedUseSwitchCenter = vi.mocked(useSwitchCenter);

const TWO_CENTERS: CenterOverview[] = [
	{
		centerId: "center-1",
		centerName: "Sunny Meadow",
		role: "owner",
		activeChildCount: 12,
		ratioStatus: "ok",
		openViolationCount: 0,
		unreadAlertCount: 0,
	},
	{
		centerId: "center-2",
		centerName: "Little Stars",
		role: "director",
		activeChildCount: 5,
		ratioStatus: "warning",
		openViolationCount: 1,
		unreadAlertCount: 0,
	},
];

function buildHookResult(overrides: Partial<ReturnType<typeof useMultiCenterOverview>>) {
	return {
		data: undefined,
		isLoading: false,
		isError: false,
		isPending: false,
		isSuccess: false,
		error: null,
		...overrides,
	} as unknown as ReturnType<typeof useMultiCenterOverview>;
}

describe("OverviewPage", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
		mockedUseSwitchCenter.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue(undefined),
		} as unknown as ReturnType<typeof useSwitchCenter>);
	});

	it("shows skeleton cards while loading", () => {
		mockedUseMultiCenterOverview.mockReturnValue(buildHookResult({ isLoading: true }));

		render(<OverviewPage />);

		// Skeleton cards are present — look for the skeleton container structure
		const skeletons = document.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]');
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("shows single-location empty state when only 1 center is returned", () => {
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({
				isSuccess: true,
				data: [TWO_CENTERS[0]] as CenterOverview[],
			}),
		);

		render(<OverviewPage />);

		expect(screen.getByText("You have one location.")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Go to your dashboard" })).toBeInTheDocument();
	});

	it("shows single-location empty state when 0 centers are returned", () => {
		mockedUseMultiCenterOverview.mockReturnValue(buildHookResult({ isSuccess: true, data: [] }));

		render(<OverviewPage />);

		expect(screen.getByText("You have one location.")).toBeInTheDocument();
	});

	it("renders a card for each center when 2+ centers are returned", () => {
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		expect(screen.getByText("Sunny Meadow")).toBeInTheDocument();
		expect(screen.getByText("Little Stars")).toBeInTheDocument();
	});

	it("summarizes exceptions and lists violations before warnings before ok centers", () => {
		const centers: CenterOverview[] = [
			{ ...TWO_CENTERS[0], centerName: "All Good", ratioStatus: "ok", openViolationCount: 0 },
			{
				...TWO_CENTERS[1],
				centerName: "Watch Room",
				ratioStatus: "warning",
				openViolationCount: 0,
				unreadAlertCount: 2,
			},
			{
				...TWO_CENTERS[0],
				centerId: "center-3",
				centerName: "Needs Staff",
				ratioStatus: "violation",
				openViolationCount: 3,
			},
		];
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: centers }),
		);

		render(<OverviewPage />);

		expect(screen.getByRole("region", { name: "Location exceptions" })).toBeInTheDocument();
		expect(screen.getByText("Active violations")).toBeInTheDocument();
		expect(screen.getByText("Needs attention")).toBeInTheDocument();
		expect(screen.getByText("Unread alerts")).toBeInTheDocument();

		const violation = screen.getByText("Needs Staff");
		const warning = screen.getByText("Watch Room");
		const ok = screen.getByText("All Good");

		expect(violation.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(warning.compareDocumentPosition(ok) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	it("displays active child count on each card", () => {
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		expect(screen.getByText("12 active children")).toBeInTheDocument();
		expect(screen.getByText("5 active children")).toBeInTheDocument();
	});

	it("shows 'All Ratios OK' pill for ok status", () => {
		const centers: CenterOverview[] = [
			{ ...TWO_CENTERS[0], ratioStatus: "ok" },
			{ ...TWO_CENTERS[1], ratioStatus: "ok" },
		];
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: centers }),
		);

		render(<OverviewPage />);

		const pills = screen.getAllByText("All Ratios OK");
		expect(pills).toHaveLength(2);
	});

	it("shows 'Ratio Warning' pill for warning status", () => {
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		expect(screen.getByText("Ratio Warning")).toBeInTheDocument();
	});

	it("shows 'Active Violation' pill for violation status", () => {
		const centers: CenterOverview[] = [
			{ ...TWO_CENTERS[0], ratioStatus: "violation" },
			{ ...TWO_CENTERS[1], ratioStatus: "ok" },
		];
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: centers }),
		);

		render(<OverviewPage />);

		expect(screen.getByText("Active Violation")).toBeInTheDocument();
	});

	it("shows 'Unknown' pill for unknown status", () => {
		const centers: CenterOverview[] = [
			{ ...TWO_CENTERS[0], ratioStatus: "unknown" },
			{ ...TWO_CENTERS[1], ratioStatus: "ok" },
		];
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: centers }),
		);

		render(<OverviewPage />);

		expect(screen.getByText("Unknown")).toBeInTheDocument();
	});

	it("calls useSwitchCenter with the correct centerId when card is clicked", async () => {
		const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseSwitchCenter.mockReturnValue({
			mutateAsync: mockMutateAsync,
		} as unknown as ReturnType<typeof useSwitchCenter>);

		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		const card = screen.getByRole("button", { name: "Switch to Sunny Meadow" });
		fireEvent.click(card);

		await waitFor(() => {
			expect(mockMutateAsync).toHaveBeenCalledWith("center-1");
		});
	});

	it("navigates to /dashboard after switching center", async () => {
		const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseSwitchCenter.mockReturnValue({
			mutateAsync: mockMutateAsync,
		} as unknown as ReturnType<typeof useSwitchCenter>);

		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		const card = screen.getByRole("button", { name: "Switch to Sunny Meadow" });
		fireEvent.click(card);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});

	it("shows error state when data fails to load", () => {
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isError: true, error: new Error("Failed") }),
		);

		render(<OverviewPage />);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("We couldn't load your locations")).toBeInTheDocument();
		expect(screen.getByText(/Your data is safe/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Refresh page/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Contact support/i })).toBeInTheDocument();
	});

	it("shows singular 'child' label when activeChildCount is 1", () => {
		const centers: CenterOverview[] = [
			{ ...TWO_CENTERS[0], activeChildCount: 1 },
			{ ...TWO_CENTERS[1], activeChildCount: 0 },
		];
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: centers }),
		);

		render(<OverviewPage />);

		expect(screen.getByText("1 active child")).toBeInTheDocument();
		expect(screen.getByText("0 active children")).toBeInTheDocument();
	});

	it("shows page title when multiple centers are present", () => {
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		expect(screen.getByText("All Locations")).toBeInTheDocument();
	});

	it("triggers switch and navigation on Enter key press", async () => {
		const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseSwitchCenter.mockReturnValue({
			mutateAsync: mockMutateAsync,
		} as unknown as ReturnType<typeof useSwitchCenter>);

		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		const card = screen.getByRole("button", { name: "Switch to Sunny Meadow" });
		fireEvent.keyDown(card, { key: "Enter" });

		await waitFor(() => {
			expect(mockMutateAsync).toHaveBeenCalledWith("center-1");
		});
	});

	it("triggers switch and navigation on Space key press", async () => {
		const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseSwitchCenter.mockReturnValue({
			mutateAsync: mockMutateAsync,
		} as unknown as ReturnType<typeof useSwitchCenter>);

		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		const card = screen.getByRole("button", { name: "Switch to Sunny Meadow" });
		fireEvent.keyDown(card, { key: " " });

		await waitFor(() => {
			expect(mockMutateAsync).toHaveBeenCalledWith("center-1");
		});
	});

	it("prevents the browser default when Space activates a center card", () => {
		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		const card = screen.getByRole("button", { name: "Switch to Sunny Meadow" });
		const event = createEvent.keyDown(card, { key: " " });
		fireEvent(card, event);

		expect(event.defaultPrevented).toBe(true);
	});

	it("shows inline error on center card when switchCenter fails", async () => {
		const mockMutateAsync = vi.fn().mockRejectedValue(new Error("Switch failed"));
		mockedUseSwitchCenter.mockReturnValue({
			mutateAsync: mockMutateAsync,
		} as unknown as ReturnType<typeof useSwitchCenter>);

		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		const card = screen.getByRole("button", { name: "Switch to Sunny Meadow" });
		fireEvent.click(card);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Switch failed");
		});
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("falls back to generic message when switchCenter rejects with a non-Error value", async () => {
		const mockMutateAsync = vi.fn().mockRejectedValue("boom");
		mockedUseSwitchCenter.mockReturnValue({
			mutateAsync: mockMutateAsync,
		} as unknown as ReturnType<typeof useSwitchCenter>);

		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		const card = screen.getByRole("button", { name: "Switch to Sunny Meadow" });
		fireEvent.click(card);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Could not switch center.");
		});
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("does not trigger switch on other key press", async () => {
		const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseSwitchCenter.mockReturnValue({
			mutateAsync: mockMutateAsync,
		} as unknown as ReturnType<typeof useSwitchCenter>);

		mockedUseMultiCenterOverview.mockReturnValue(
			buildHookResult({ isSuccess: true, data: TWO_CENTERS }),
		);

		render(<OverviewPage />);

		const card = screen.getByRole("button", { name: "Switch to Sunny Meadow" });
		fireEvent.keyDown(card, { key: "Tab" });

		// Tab key should NOT trigger switch
		expect(mockMutateAsync).not.toHaveBeenCalled();
	});
});
