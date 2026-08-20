import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getVisibleNavGroups, Sidebar } from "./sidebar";

// PlanGate uses useAuthSession (react-query) - stub it so sidebar tests
// don't need a QueryClientProvider. Default: render children (allowed).
const mockUsePlanCheck = vi.hoisted(() =>
	vi.fn(() => ({ allowed: true, currentPlan: "enterprise" as const })),
);

vi.mock("../lib/plan-gate", () => ({
	PlanGate: ({ children }: { children: ReactNode }) => <>{children}</>,
	usePlanCheck: mockUsePlanCheck,
}));

// Mock useMultiCenterOverview so sidebar tests don't need a QueryClientProvider.
// Default: no unread alerts.
const mockUseMultiCenterOverview = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-overview", () => ({
	useMultiCenterOverview: mockUseMultiCenterOverview,
}));

// Default: hook returns no data (no unread alerts)
mockUseMultiCenterOverview.mockReturnValue({ data: undefined, isLoading: false, isError: false });

const routerState = vi.hoisted(() => ({
	currentPath: "/dashboard",
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		Link: ({
			children,
			to,
			className,
		}: {
			children: ReactNode;
			to: string;
			className?: string;
		}) => (
			<a href={to} className={className}>
				{children}
			</a>
		),
		useRouterState: () => ({ location: { pathname: routerState.currentPath } }),
	};
});

describe("sidebar navigation", () => {
	beforeEach(() => {
		mockUseMultiCenterOverview.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: false,
		});
		mockUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "enterprise" as const });
	});
	it("hides finance items for staff and billing for non-owners", () => {
		const staffGroups = getVisibleNavGroups("staff");
		const staffItems = staffGroups.flatMap((group) => group.items.map((item) => item.href));

		expect(staffItems).toContain("/dashboard");
		expect(staffItems).toContain("/attendance");
		expect(staffItems).toContain("/scheduling");
		expect(staffItems).toContain("/help");
		expect(staffItems).not.toContain("/children");
		expect(staffItems).not.toContain("/subsidies");
		expect(staffItems).not.toContain("/billing");
		expect(staffItems).not.toContain("/billing/payments");

		const directorGroups = getVisibleNavGroups("director");
		const directorItems = directorGroups.flatMap((group) => group.items.map((item) => item.href));

		expect(directorItems).toContain("/children");

		expect(directorItems).toContain("/subsidies");
		expect(directorItems).toContain("/billing/payments");
		expect(directorItems).not.toContain("/billing");

		const ownerGroups = getVisibleNavGroups("owner");
		const ownerItems = ownerGroups.flatMap((group) => group.items.map((item) => item.href));

		expect(ownerItems).toContain("/billing");
		expect(ownerItems).toContain("/billing/payments");
	});

	it("renders nested routes as active for staff and omits owner-only settings", () => {
		routerState.currentPath = "/messages/inbox";
		const props = {
			role: "staff" as const,
			centerName: "Pebble Verify Center",
			centerState: "TX",
		};

		render(<Sidebar {...props} />);

		expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/messages");
		expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
	});

	it("renders the owner sidebar with inactive settings when the route does not match", () => {
		routerState.currentPath = "/dashboard";
		const props = {
			role: "owner" as const,
			centerName: "Pebble Verify Center",
			centerState: "TX",
		};

		render(<Sidebar {...props} />);

		expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
		expect(screen.getByRole("link", { name: "Help Center" })).toHaveAttribute("href", "/help");
	});

	it("renders the owner sidebar with settings and active states", () => {
		routerState.currentPath = "/settings";
		const props = {
			role: "owner" as const,
			centerName: "Pebble Verify Center",
			centerState: "TX",
		};

		render(<Sidebar {...props} />);

		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
		expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("href", "/billing");
		expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute(
			"href",
			"/billing/payments",
		);
	});

	it("omits the center-state separator when no state is available", () => {
		routerState.currentPath = "/dashboard";

		// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="director" centerName="Pebble Verify Center" centerState="" />);

		expect(screen.getByText("Director")).toBeInTheDocument();
		expect(screen.queryByText(String.fromCharCode(0x00b7))).not.toBeInTheDocument();
	});

	it("uses design-system tokens instead of raw palette classes in the nav chrome", () => {
		routerState.currentPath = "/dashboard";

		// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="owner" centerName="Pebble Verify Center" centerState="TX" />);

		const sidebar = screen.getByText("PebbleDesk").closest("aside");
		expect(sidebar).toHaveClass("bg-sidebar-background", "text-sidebar-foreground");
		expect(screen.getByText("Today")).toHaveClass("text-sidebar-foreground/75");
		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
			"bg-sidebar-primary",
			"text-sidebar-primary-foreground",
		);
		expect(screen.getByRole("link", { name: "Attendance" })).toHaveClass(
			"text-sidebar-foreground/80",
			"hover:bg-sidebar-accent",
			"hover:text-sidebar-accent-foreground",
		);
		expect(screen.getByRole("link", { name: "Settings" })).toHaveClass(
			"text-sidebar-foreground/80",
		);
	});

	it("contains horizontal overflow in the scrollable nav so no stray x-scrollbar appears", () => {
		routerState.currentPath = "/dashboard";

		// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="owner" centerName="Pebble Verify Center" centerState="TX" />);

		// The scrollable nav group region intends vertical scroll only; without
		// overflow-x containment a ~21px content overflow renders a horizontal
		// scrollbar across every authenticated page (see campaign finding F-006).
		const navScroll = screen.getByText("Today").closest("nav");
		expect(navScroll).not.toBeNull();
		expect(navScroll).toHaveClass("overflow-y-auto", "overflow-x-hidden");
	});

	it("adds motion-safe transition and shadow classes to the active nav item", () => {
		routerState.currentPath = "/dashboard";

		// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="owner" centerName="Pebble Verify Center" centerState="TX" />);

		const dashboard = screen.getByRole("link", { name: "Dashboard" });
		expect(dashboard.className).toContain("motion-safe:transition-all");
		expect(dashboard.className).toContain("motion-safe:duration-200");
		expect(dashboard.className).toContain("motion-safe:ease-out");
		expect(dashboard.className).toContain("motion-safe:active:scale-[0.98]");
		expect(dashboard.className).toContain("motion-safe:shadow-sm");

		const inactive = screen.getByRole("link", { name: "Attendance" });
		expect(inactive.className).toContain("motion-safe:active:scale-[0.98]");
		expect(inactive.className).not.toContain("motion-safe:shadow-sm");
	});

	it("shows All Locations link with active style when on /overview route", () => {
		routerState.currentPath = "/overview";

		// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="owner" centerName="Pebble Verify Center" centerState="TX" />);

		const allLocationsLink = screen.getByRole("link", { name: "All Locations" });
		expect(allLocationsLink).toHaveAttribute("href", "/overview");
		expect(allLocationsLink.className).toContain("bg-sidebar-primary");
		expect(allLocationsLink.className).toContain("text-sidebar-primary-foreground");
	});

	describe("unreadAlertCount badge on Ratios nav item", () => {
		it("renders a badge with the count next to Ratios when unreadAlertCount > 0", () => {
			routerState.currentPath = "/dashboard";
			mockUseMultiCenterOverview.mockReturnValue({
				data: [
					{
						centerId: "c1",
						centerName: "Sunny Meadow",
						role: "owner",
						activeChildCount: 5,
						ratioStatus: "violation",
						openViolationCount: 2,
						unreadAlertCount: 2,
					},
				],
				isLoading: false,
				isError: false,
			});

			// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
			render(<Sidebar role="owner" centerName="Pebble Verify Center" centerState="TX" />);

			const ratiosLink = screen.getByRole("link", { name: /ratios/i });
			expect(ratiosLink).toBeInTheDocument();
			expect(ratiosLink.className).toContain("min-h-11");
			const badge = screen.getByTestId("ratios-alert-badge");
			expect(badge).toBeInTheDocument();
			expect(badge.textContent).toBe("2");
			expect(badge).toHaveAttribute("aria-label", "2 unread alerts");
		});

		it("does not render a badge when unreadAlertCount is 0", () => {
			routerState.currentPath = "/dashboard";
			mockUseMultiCenterOverview.mockReturnValue({
				data: [
					{
						centerId: "c1",
						centerName: "Sunny Meadow",
						role: "owner",
						activeChildCount: 5,
						ratioStatus: "ok",
						openViolationCount: 0,
						unreadAlertCount: 0,
					},
				],
				isLoading: false,
				isError: false,
			});

			// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
			render(<Sidebar role="owner" centerName="Pebble Verify Center" centerState="TX" />);

			expect(screen.queryByTestId("ratios-alert-badge")).not.toBeInTheDocument();
		});

		it("does not render a badge when overview data is loading", () => {
			routerState.currentPath = "/dashboard";
			mockUseMultiCenterOverview.mockReturnValue({
				data: undefined,
				isLoading: true,
				isError: false,
			});

			// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
			render(<Sidebar role="owner" centerName="Pebble Verify Center" centerState="TX" />);

			expect(screen.queryByTestId("ratios-alert-badge")).not.toBeInTheDocument();
		});

		it("sums unreadAlertCount across multiple centers", () => {
			routerState.currentPath = "/dashboard";
			mockUseMultiCenterOverview.mockReturnValue({
				data: [
					{
						centerId: "c1",
						centerName: "Center One",
						role: "owner",
						activeChildCount: 5,
						ratioStatus: "violation",
						openViolationCount: 1,
						unreadAlertCount: 1,
					},
					{
						centerId: "c2",
						centerName: "Center Two",
						role: "owner",
						activeChildCount: 3,
						ratioStatus: "violation",
						openViolationCount: 2,
						unreadAlertCount: 2,
					},
				],
				isLoading: false,
				isError: false,
			});

			// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
			render(<Sidebar role="owner" centerName="Pebble Verify Center" centerState="TX" />);

			expect(screen.getByTestId("ratios-alert-badge").textContent).toBe("3");
		});
	});

	it("renders the current center context inside the nav shell", () => {
		routerState.currentPath = "/dashboard";

		// biome-ignore lint/a11y/useValidAriaRole: `role` here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="director" centerName="Pebble Verify Center" centerState="TX" />);

		expect(screen.getByText("Pebble Verify Center")).toBeInTheDocument();
		expect(screen.getByText("Director")).toBeInTheDocument();
		expect(screen.getByText("Texas")).toBeInTheDocument();
		expect(screen.getByText("/")).toBeInTheDocument();
		expect(screen.queryByText(String.fromCharCode(0x00c2, 0x00b7))).not.toBeInTheDocument();
	});

	it("places Classrooms under Operations", () => {
		const ownerGroups = getVisibleNavGroups("owner");
		const operationsGroup = ownerGroups.find((g) => g.title === "Operations");
		expect(operationsGroup).toBeDefined();
		const operationsItems = operationsGroup?.items.map((i) => i.href);
		expect(operationsItems).toContain("/classrooms");

		const familiesGroup = ownerGroups.find((g) => g.title === "Families");
		const familiesItems = familiesGroup?.items.map((i) => i.href);
		expect(familiesItems).not.toContain("/classrooms");
	});

	it("places Import under Compliance", () => {
		const ownerGroups = getVisibleNavGroups("owner");
		const complianceGroup = ownerGroups.find((g) => g.title === "Compliance");
		expect(complianceGroup).toBeDefined();
		const complianceItems = complianceGroup?.items.map((i) => i.href);
		expect(complianceItems).toContain("/import");
		expect(complianceItems).toContain("/reports");

		const hasDataGroup = ownerGroups.some((g) => g.title === "Data");
		expect(hasDataGroup).toBe(false);
	});

	it("surfaces implemented time approval and audit log routes in navigation", () => {
		const directorGroups = getVisibleNavGroups("director");
		const operationsGroup = directorGroups.find((g) => g.title === "Operations");
		const complianceGroup = directorGroups.find((g) => g.title === "Compliance");

		expect(operationsGroup?.items.map((i) => i.href)).toContain("/scheduling/time");
		expect(complianceGroup?.items.map((i) => i.href)).toContain("/reports/audit-log");
	});

	it("renders direct links for Time Entries and Audit Log", () => {
		routerState.currentPath = "/dashboard";

		// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="director" centerName="Test Center" centerState="TX" />);

		expect(screen.getByRole("link", { name: "Time Entries" })).toHaveAttribute(
			"href",
			"/scheduling/time",
		);
		expect(screen.getByRole("link", { name: "Audit Log" })).toHaveAttribute(
			"href",
			"/reports/audit-log",
		);
	});

	it("only marks the exact discovered child route active when it has a direct nav item", () => {
		routerState.currentPath = "/reports/audit-log";

		// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="director" centerName="Test Center" centerState="TX" />);

		expect(screen.getByRole("link", { name: "Audit Log" }).className).toContain(
			"bg-sidebar-primary",
		);
		expect(screen.getByRole("link", { name: "Reports" }).className).not.toContain(
			"bg-sidebar-primary",
		);
	});

	it("does not include Messages in NAV_GROUPS", () => {
		const ownerGroups = getVisibleNavGroups("owner");
		const allItems = ownerGroups.flatMap((g) => g.items.map((i) => i.href));
		expect(allItems).not.toContain("/messages");
	});

	it("renders Messages link at the bottom for all roles including staff", () => {
		routerState.currentPath = "/dashboard";
		// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="staff" centerName="Test Center" centerState="TX" />);
		const messagesLink = screen.getByRole("link", { name: "Messages" });
		expect(messagesLink).toHaveAttribute("href", "/messages");
	});

	it("applies active styles to the Messages link when on the /messages route", () => {
		routerState.currentPath = "/messages";
		// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="staff" centerName="Test Center" centerState="TX" />);
		const link = screen.getByRole("link", { name: "Messages" });
		expect(link.className).toContain("bg-sidebar-primary");
		expect(link.className).toContain("text-sidebar-primary-foreground");
	});

	it("applies active styles to the Messages link for nested /messages routes", () => {
		routerState.currentPath = "/messages/inbox";
		// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="staff" centerName="Test Center" centerState="TX" />);
		const link = screen.getByRole("link", { name: "Messages" });
		expect(link.className).toContain("bg-sidebar-primary");
	});

	it("shows violation dot on Compliance group when a center has ratioStatus violation", () => {
		mockUseMultiCenterOverview.mockReturnValue({
			data: [
				{
					centerId: "c-1",
					centerName: "Test Center",
					role: "director" as const,
					activeChildCount: 5,
					ratioStatus: "violation" as const,
					openViolationCount: 1,
					unreadAlertCount: 0,
				},
			],
			isLoading: false,
			isError: false,
		});
		// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="director" centerName="Test Center" centerState="TX" />);
		expect(screen.getByTestId("compliance-violation-dot")).toBeInTheDocument();
	});

	it("does not show violation dot when no center has a violation", () => {
		mockUseMultiCenterOverview.mockReturnValue({
			data: [
				{
					centerId: "c-1",
					centerName: "Test Center",
					role: "director" as const,
					activeChildCount: 5,
					ratioStatus: "ok" as const,
					openViolationCount: 0,
					unreadAlertCount: 0,
				},
			],
			isLoading: false,
			isError: false,
		});
		// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
		render(<Sidebar role="director" centerName="Test Center" centerState="TX" />);
		expect(screen.queryByTestId("compliance-violation-dot")).not.toBeInTheDocument();
	});

	describe("PlanRequirementBadge in nav items", () => {
		it("shows plan requirement badges for gated nav items when on trial plan", () => {
			mockUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "trial" as const });
			routerState.currentPath = "/dashboard";
			// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
			render(<Sidebar role="director" centerName="Test Center" centerState="TX" />);
			// Director sees subsidies (center_starter) and import (center_starter); both show same label
			const badges = screen.getAllByText("Center Starter feature");
			expect(badges.length).toBeGreaterThanOrEqual(2);
		});

		it("does not show plan requirement badges when not on trial plan", () => {
			mockUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "home" as const });
			routerState.currentPath = "/dashboard";
			// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
			render(<Sidebar role="director" centerName="Test Center" centerState="TX" />);
			expect(screen.queryByText(/feature$/)).not.toBeInTheDocument();
		});

		it("does not show badges for nav items without a feature gate", () => {
			mockUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "trial" as const });
			routerState.currentPath = "/dashboard";
			// biome-ignore lint/a11y/useValidAriaRole: role here is the Sidebar's own prop (membership role), not an ARIA role attribute
			render(<Sidebar role="director" centerName="Test Center" centerState="TX" />);
			// "Dashboard" and "Attendance" have no feature gate; no badge near their links
			const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
			expect(dashboardLink).not.toHaveTextContent("feature");
		});
	});
});
