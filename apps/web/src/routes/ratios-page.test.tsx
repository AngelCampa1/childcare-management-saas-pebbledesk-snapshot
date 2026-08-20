import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRatios, useRatioViolations } from "../hooks/use-ratios";
import { Route } from "./_auth/ratios/index";

const mockedNavigate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => (options: unknown) => options,
		Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
		useNavigate: () => mockedNavigate,
	};
});

vi.mock("../hooks/use-ratios", () => ({
	useRatioViolations: vi.fn(),
	useRatios: vi.fn(),
}));

vi.mock("../components/ratio-card", () => ({
	RatioCard: ({ ratio, onClick }: { ratio: { classroomName: string }; onClick?: () => void }) => (
		<button type="button" data-testid="ratio-card" onClick={onClick}>
			{ratio.classroomName}
		</button>
	),
}));

vi.mock("../components/empty-state", () => ({
	EmptyState: ({
		title,
		description,
		action,
	}: {
		action?: ReactNode;
		description: string;
		title: string;
	}) => (
		<div data-testid="empty-state">
			<h2>{title}</h2>
			<p>{description}</p>
			{action}
		</div>
	),
}));

const mockedUseRatios = vi.mocked(useRatios);
const mockedUseRatioViolations = vi.mocked(useRatioViolations);

describe("RatioDashboardPage", () => {
	beforeEach(() => {
		mockedNavigate.mockReset();
		mockedUseRatioViolations.mockReturnValue({ data: [], isLoading: false } as never);
	});

	it("navigates to attendance with the clicked room selected", async () => {
		mockedNavigate.mockResolvedValue(undefined);
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddler Room",
					inCompliance: true,
					openViolationId: null,
					nearLimit: false,
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");
		render(<Component />);

		fireEvent.click(screen.getByTestId("ratio-card"));

		await waitFor(() => {
			expect(mockedNavigate).toHaveBeenCalledWith({
				to: "/attendance",
				search: { room: "room-1" },
			});
		});
	});

	it("swallows navigate rejections from clicking a ratio card (no unhandled rejection)", async () => {
		mockedNavigate.mockRejectedValue(new Error("navigation aborted"));
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddler Room",
					inCompliance: true,
					openViolationId: null,
					nearLimit: false,
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		const unhandled = vi.fn();
		const handler = (e: PromiseRejectionEvent) => {
			unhandled(e.reason);
			e.preventDefault();
		};
		window.addEventListener("unhandledrejection", handler);

		try {
			const Component = Route.component;
			if (!Component) throw new Error("Expected ratios route component");
			render(<Component />);

			fireEvent.click(screen.getByTestId("ratio-card"));

			await waitFor(() => {
				expect(mockedNavigate).toHaveBeenCalledWith({
					to: "/attendance",
					search: { room: "room-1" },
				});
			});
			// Give the microtask queue a chance to surface any unhandled rejection
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener("unhandledrejection", handler);
		}
	});

	it("renders the compliance readiness card when rooms exist", () => {
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "c1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 4,
					currentStaffCount: 1,
					ratioRequired: 0.25,
					ratioActual: 0.25,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");
		render(<Component />);

		expect(screen.getByText(/Compliance Readiness/i)).toBeInTheDocument();
		expect(screen.getByText(/All room ratios within/i)).toBeInTheDocument();
	});

	it("bases the active-violation readiness check on every open violation", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));
		mockedUseRatioViolations.mockReturnValue({
			data: [
				{
					id: "v-historical-open",
					centerId: "center-1",
					classroomId: "c1",
					classroomName: "Toddlers",
					severity: "violation",
					status: "open",
					startedAt: "2026-05-10T15:00:00.000Z",
					endedAt: null,
					currentChildCount: 5,
					currentStaffCount: 0,
					requiredStaffCount: 1,
					resolutionNotes: null,
					createdAt: "2026-05-10T15:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "c1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 4,
					currentStaffCount: 1,
					ratioRequired: 0.25,
					ratioActual: 0.25,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		try {
			const Component = Route.component;
			if (!Component) throw new Error("Expected ratios route component");
			render(<Component />);

			expect(mockedUseRatioViolations).toHaveBeenCalledWith({ status: "open" });
			expect(screen.getByText("1/2")).toBeInTheDocument();
			expect(
				screen.getByRole("link", { name: "No active violations in the last 30 days" }),
			).toHaveAttribute("href", "/ratios/history");
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not pass active-violation readiness while violation history is unavailable", () => {
		mockedUseRatioViolations.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "c1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 4,
					currentStaffCount: 1,
					ratioRequired: 0.25,
					ratioActual: 0.25,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");
		render(<Component />);

		expect(screen.getByText("1/2")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "No active violations in the last 30 days" }),
		).toHaveAttribute("href", "/ratios/history");
	});

	it("marks the ratios check as failed when a violation exists", () => {
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "c1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 5,
					currentStaffCount: 0,
					ratioRequired: 0.25,
					ratioActual: 0,
					inCompliance: false,
					nearLimit: false,
					openViolationId: "v1",
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");
		render(<Component />);

		expect(screen.getByText(/Compliance Readiness/i)).toBeInTheDocument();
		// The ratio check should be failing
		expect(screen.getByText(/All room ratios within/i)).toBeInTheDocument();
		// Score should show less than perfect
		expect(screen.getByText(/need attention/i)).toBeInTheDocument();
	});

	it("shows rooms needing action before readiness and help content", () => {
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "c1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 5,
					currentStaffCount: 0,
					ratioRequired: 0.25,
					ratioActual: 0,
					inCompliance: false,
					nearLimit: false,
					openViolationId: "v1",
				},
				{
					classroomId: "c2",
					classroomName: "Preschool",
					ageGroup: "preschool",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 8,
					currentChildCount: 8,
					currentStaffCount: 1,
					ratioRequired: 0.125,
					ratioActual: 0.125,
					inCompliance: true,
					nearLimit: true,
					openViolationId: undefined,
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");
		render(<Component />);

		const firstRoom = screen.getByText("Toddlers");
		const readiness = screen.getByText(/Compliance Readiness/i);
		const guide = screen.getByText("What do the ratio colors mean?");

		expect(firstRoom.compareDocumentPosition(readiness) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(firstRoom.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	it("displays the correct score fraction in the readiness gauge", () => {
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "c1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 4,
					currentStaffCount: 1,
					ratioRequired: 0.25,
					ratioActual: 0.25,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");
		render(<Component />);

		// All 2 checks pass → score shows 2/2
		expect(screen.getByText("2/2")).toBeInTheDocument();
		expect(screen.getByText("Ready for inspection")).toBeInTheDocument();
	});

	it("renders failing check label as a link when href is provided", () => {
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "c1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 5,
					currentStaffCount: 0,
					ratioRequired: 0.25,
					ratioActual: 0,
					inCompliance: false,
					nearLimit: false,
					openViolationId: "v1",
				},
			],
			isLoading: false,
			isFetching: false,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");
		render(<Component />);

		const failingLink = screen.getByRole("link", { name: /All room ratios within/i });
		expect(failingLink).toHaveAttribute("href", "/classrooms");
	});

	it("renders an empty state CTA that sends the user to classrooms setup", () => {
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
			isFetching: false,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");

		const { container } = render(<Component />);

		expect(screen.getByText("You're audit-ready")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Once you add your first classroom we'll start tracking staff-to-child ratios here automatically.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Add a classroom" })).toHaveAttribute(
			"href",
			"/classrooms",
		);
		expect(container.innerHTML).not.toMatch(
			/\b(?:bg|text|border)-(?:green|amber|blue|gray|red)-\d{2,3}\b/,
		);
	});

	it("shows error box and Try again button instead of empty state when useRatios errors", () => {
		const refetch = vi.fn();
		mockedUseRatios.mockReturnValue({
			data: undefined,
			isLoading: false,
			isFetching: false,
			isError: true,
			refetch,
		} as never);

		const Component = Route.component;
		if (!Component) throw new Error("Expected ratios route component");
		render(<Component />);

		expect(screen.queryByText("You're audit-ready")).not.toBeInTheDocument();
		expect(screen.getByText("Failed to load ratios.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});
});
