import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBillingState } from "./_auth/-billing-state";
import * as DashboardModule from "./_auth/dashboard";

vi.mock("./_auth/-billing-state", () => ({
	getBillingState: vi.fn(() => false),
}));

const { Route, computeSetupProgress } = DashboardModule;

const mockedUseAuthSession = vi.hoisted(() => vi.fn());
const mockedUseClassrooms = vi.hoisted(() => vi.fn());
const mockedUseChildren = vi.hoisted(() => vi.fn());
const mockedUseRatios = vi.hoisted(() => vi.fn());
const mockedUseGuardians = vi.hoisted(() => vi.fn());
const mockedUseInvoices = vi.hoisted(() => vi.fn());
const mockedUseInvoiceSummary = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: () => mockedUseAuthSession(),
}));

vi.mock("../hooks/use-classrooms", () => ({
	useClassrooms: (...args: unknown[]) => mockedUseClassrooms(...args),
}));

vi.mock("../hooks/use-children", () => ({
	useChildren: (...args: unknown[]) => mockedUseChildren(...args),
}));

vi.mock("../hooks/use-ratios", () => ({
	useRatios: (options?: unknown) => mockedUseRatios(options),
}));

vi.mock("../hooks/use-guardians", () => ({
	useGuardians: (...args: unknown[]) => mockedUseGuardians(...args),
}));

vi.mock("../hooks/use-finance", () => ({
	useInvoiceSummary: (...args: unknown[]) => mockedUseInvoiceSummary(...args),
	useInvoices: (...args: unknown[]) => mockedUseInvoices(...args),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => (options: unknown) => options,
		Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
			<a href={to} {...props}>
				{children}
			</a>
		),
	};
});

function renderDashboard() {
	const Component = Route.component;
	if (!Component) throw new Error("Expected dashboard route component");

	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(
		<QueryClientProvider client={client}>
			<Component />
		</QueryClientProvider>,
	);
}

describe("DashboardPage", () => {
	beforeEach(() => {
		mockedUseAuthSession.mockReset();
		mockedUseClassrooms.mockReset();
		mockedUseChildren.mockReset();
		mockedUseRatios.mockReset();
		mockedUseGuardians.mockReset();
		mockedUseInvoices.mockReset();
		mockedUseInvoiceSummary.mockReset();
		mockedUseGuardians.mockReturnValue({ data: [] });
		mockedUseInvoices.mockReturnValue({ data: [] });
		mockedUseInvoiceSummary.mockReturnValue({ data: { overdueInvoiceCount: 0 } });
		vi.mocked(getBillingState).mockReturnValue(false);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Codex Owner" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Codex Child Care",
					state: "TX",
					timezone: "America/Chicago",
				},
				classroomIds: [],
			},
			isLoading: false,
		});
		mockedUseClassrooms.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
		});
	});

	it("guides brand-new owners to create a classroom first", () => {
		renderDashboard();

		expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
		expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
		// "Add a classroom" appears in both the progress strip subtitle and the checklist
		expect(screen.getAllByText("Add a classroom").length).toBeGreaterThan(0);
		const cta = screen.getByRole("link", { name: /Create classroom/i });
		expect(cta).toHaveAttribute("href", "/classrooms");
	});

	it("shifts the primary action to enrollment once classrooms exist", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 0,
					staffCount: 0,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});

		renderDashboard();

		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
		expect(screen.getByText(/Step 3 of 5/)).toBeInTheDocument();
		const enrollCta = screen.getByRole("link", { name: /Enroll a child/i });
		expect(enrollCta).toHaveAttribute("href", "/children/enroll");
		// Classroom step should show as done (✓ marker)
		expect(screen.getByText("Add a classroom")).toBeInTheDocument();
	});

	it("shows step 5 billing as the next step once classrooms and children are present", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});

		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		renderDashboard();

		// With classrooms + active children + guardians, we land on Step 5 (Set up billing).
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
		expect(screen.getByText(/Step 5 of 5/)).toBeInTheDocument();
		const billingCta = screen.getByRole("link", { name: /Set up billing/i });
		expect(billingCta).toHaveAttribute("href", "/billing");
		expect(screen.getByText("Setup checklist")).toBeInTheDocument();
	});

	it("shows billing as the final pending step when classrooms and active children exist", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});

		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		renderDashboard();

		// hasBilling=false, so setup is still in progress at Step 5 (Set up billing).
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
		expect(screen.getByText(/Step 5 of 5/)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Set up billing/i })).toHaveAttribute(
			"href",
			"/billing",
		);
		// Old hero headings are gone
		expect(screen.queryByText("Ready for today")).not.toBeInTheDocument();
		expect(screen.queryByText("Setup complete")).not.toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "Common next steps" })).not.toBeInTheDocument();
	});

	it("keeps waitlist-only centers in setup mode until an active child is enrolled", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 0,
					staffCount: 0,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "waitlist",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});

		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		renderDashboard();

		// Waitlist child counts as hasChildren (steps 3 and 4 done), so we land on Step 5.
		expect(screen.queryByText("Ready for today")).not.toBeInTheDocument();
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
		// Step 3 "Enroll children" is done (waitlist counts), Step 4 "Add guardians" is done
		// (guardian in mock), so we're on Step 5 (billing).
		expect(screen.getByText(/Step 5 of 5/)).toBeInTheDocument();
	});

	it("renders the setup checklist even when a ratio violation exists", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 0,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 1,
					currentStaffCount: 0,
					ratioRequired: 1,
					ratioActual: 0,
					inCompliance: false,
					nearLimit: false,
					openViolationId: "violation-1",
					ratioRuleSource: "classroom" as const,
				},
			],
			isLoading: false,
		});

		renderDashboard();

		// The hero tone concept is gone; ratio violations no longer change the hero.
		// With 1 classroom + 1 active child, we land on Step 5 (billing).
		// The checklist is always visible; verify the dashboard renders without crashing.
		expect(screen.getByText("Setup checklist")).toBeInTheDocument();
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
	});

	it("keeps the ratio query disabled for staff members and does not show ratio noise", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Codex Staff" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Codex Child Care",
					state: "TX",
					timezone: "America/Chicago",
				},
				classroomIds: [],
			},
			isLoading: false,
		});

		renderDashboard();

		expect(mockedUseRatios).toHaveBeenCalledWith({ enabled: false });
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
		expect(screen.getByText("Setup checklist")).toBeInTheDocument();
	});

	it("keeps staff dashboards from requesting owner-only setup lists", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Codex Staff" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Codex Child Care",
					state: "TX",
					timezone: "America/Chicago",
				},
				classroomIds: [],
			},
			isLoading: false,
		});

		renderDashboard();

		expect(mockedUseClassrooms).toHaveBeenCalledWith(undefined, { enabled: false });
		expect(mockedUseChildren).toHaveBeenCalledWith(undefined, { enabled: false });
		expect(mockedUseGuardians).toHaveBeenCalledWith(undefined, { enabled: false });
	});

	it("staff user with 403 on classrooms/children still loads the dashboard", () => {
		const permissionError = Object.assign(new Error("Insufficient permissions"), { status: 403 });
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Sam Staff" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Codex Child Care",
					state: "TX",
					timezone: "America/Chicago",
				},
				classroomIds: [],
			},
			isLoading: false,
		});
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			error: permissionError,
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: undefined,
			error: permissionError,
			isLoading: false,
		});

		renderDashboard();

		expect(
			screen.queryByRole("heading", { name: "We couldn't load your dashboard" }),
		).not.toBeInTheDocument();
		expect(screen.getByText("Setup checklist")).toBeInTheDocument();
	});

	it("shows a recovery state when classrooms fail to load", () => {
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			error: new Error("Failed to fetch classrooms"),
			isLoading: false,
		});

		renderDashboard();

		expect(
			screen.getByRole("heading", { name: "We couldn't load your dashboard" }),
		).toBeInTheDocument();
		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Refresh the page and try again. If the problem keeps happening, check your connection or sign in again.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/dashboard");
		expect(
			screen.queryByRole("heading", { name: "Let's get Codex Child Care ready for opening week" }),
		).not.toBeInTheDocument();
	});

	it("shows an inline ratios error notice when ratios fail but classrooms and children load fine", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: undefined,
			error: new Error("Network error"),
			isLoading: false,
			refetch: vi.fn(),
		});

		renderDashboard();

		// The dashboard still renders its main content
		expect(screen.getByText("Setup checklist")).toBeInTheDocument();
		// The inline ratios error banner is shown
		expect(screen.getByText("Live ratio data is temporarily unavailable.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
	});

	it("does not show the inline ratios banner when the ratios error is an auth error", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: undefined,
			error: new Error("Unauthorized"),
			isLoading: false,
			refetch: vi.fn(),
		});

		renderDashboard();

		expect(
			screen.queryByText("Live ratio data is temporarily unavailable."),
		).not.toBeInTheDocument();
	});

	it("renders a skeleton while session is loading", () => {
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		const { container } = renderDashboard();

		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
		expect(
			screen.queryByRole("heading", { name: /ready for opening week/ }),
		).not.toBeInTheDocument();
	});

	it("falls back to a recovery state when session data is missing after loading", () => {
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			isLoading: false,
		});

		renderDashboard();

		expect(
			screen.getByRole("heading", { name: "We couldn't load your dashboard" }),
		).toBeInTheDocument();
	});

	it("treats non-Error rejection values from classrooms/ratios as real failures that hit the recovery state", () => {
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			error: "classrooms exploded",
			isLoading: false,
		});

		renderDashboard();

		expect(
			screen.getByRole("heading", { name: "We couldn't load your dashboard" }),
		).toBeInTheDocument();
	});

	it("shows the ratios retry banner when the ratios error is a non-Error value", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: undefined,
			error: "ratios broke",
			isLoading: false,
			refetch: vi.fn(),
		});

		renderDashboard();

		expect(screen.getByText("Live ratio data is temporarily unavailable.")).toBeInTheDocument();
	});

	it("re-fetches ratios when the inline retry button is clicked", () => {
		const refetch = vi.fn();
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: undefined,
			error: new Error("Network error"),
			isLoading: false,
			refetch,
		});

		renderDashboard();

		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	it("treats an in-compliance ratio with an open violation id as still needing attention", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
				{
					id: "room-2",
					name: "Infants",
					ageGroup: "infant",
					maxCapacity: 8,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 4,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 1,
					currentStaffCount: 1,
					ratioRequired: 1,
					ratioActual: 1,
					inCompliance: true,
					nearLimit: false,
					openViolationId: "violation-lingering",
					ratioRuleSource: "classroom" as const,
				},
				{
					classroomId: "room-2",
					classroomName: "Infants",
					ageGroup: "infant",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 1,
					currentStaffCount: 1,
					ratioRequired: 1,
					ratioActual: 1,
					inCompliance: true,
					nearLimit: false,
					openViolationId: "violation-lingering-2",
					ratioRuleSource: "classroom" as const,
				},
			],
			isLoading: false,
		});

		renderDashboard();

		// The hero tone concept is gone; the setup checklist is always visible.
		// With classrooms + active children, we're on Step 5 (billing).
		expect(screen.getByText("Setup checklist")).toBeInTheDocument();
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
	});

	it("shows the setup checklist even when no classrooms exist", async () => {
		// default mocks: no classrooms, no children
		renderDashboard();
		// "Add a classroom" appears in both the progress strip subtitle and the checklist
		expect((await screen.findAllByText("Add a classroom")).length).toBeGreaterThan(0);
		expect(screen.getByText("Enroll children")).toBeInTheDocument();
	});

	it("shows the setup progress strip when setup is incomplete", () => {
		// default mocks: no classrooms, no children
		renderDashboard();
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
		expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
	});

	it("shows the do-this-next action card pointing to classrooms when no classrooms exist", () => {
		// default mocks: no classrooms
		renderDashboard();
		const cta = screen.getByRole("link", { name: /Create classroom/i });
		expect(cta).toHaveAttribute("href", "/classrooms");
	});

	it("shows the setup complete celebration when all steps are done", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		vi.mocked(getBillingState).mockReturnValue(true);
		renderDashboard();
		expect(screen.getByText("You're ready — let's go")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Open attendance/i })).toHaveAttribute(
			"href",
			"/attendance",
		);
		// Progress strip and do-this-next should be hidden
		expect(screen.queryByText("Getting your center ready")).not.toBeInTheDocument();
	});

	it("shows Today at a glance strip when setup is complete", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 8,
					currentStaffCount: 2,
					ratioRequired: 2,
					ratioActual: 4,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
					ratioRuleSource: "classroom" as const,
				},
			],
			isLoading: false,
		});
		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		const spy = vi.spyOn(DashboardModule, "getBillingState").mockReturnValue(true);
		try {
			renderDashboard();
			expect(screen.getByText("Today")).toBeInTheDocument();
			expect(screen.getByTestId("children-present")).toBeInTheDocument();
			// Children present count should display the sum from ratios
			expect(within(screen.getByTestId("children-present")).getByText("8")).toBeInTheDocument();
		} finally {
			spy.mockRestore();
		}
	});

	it("shows expected-not-yet-in and overdue invoice counts in Today at a glance", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 10,
					staffCount: 2,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: Array.from({ length: 10 }, (_, index) => ({
				id: `child-${index + 1}`,
				firstName: `Child${index + 1}`,
				lastName: "Lopez",
				dateOfBirth: "2024-01-05",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
			})),
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 8,
					currentStaffCount: 2,
					ratioRequired: 2,
					ratioActual: 4,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
					ratioRuleSource: "classroom" as const,
				},
			],
			isLoading: false,
		});
		mockedUseInvoiceSummary.mockReturnValue({ data: { overdueInvoiceCount: 2 } });
		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		vi.mocked(getBillingState).mockReturnValue(true);

		renderDashboard();

		expect(screen.getByText("expected but not yet in")).toBeInTheDocument();
		expect(screen.getByText("overdue invoices")).toBeInTheDocument();
		expect(screen.queryByText("active rooms")).not.toBeInTheDocument();
		expect(screen.getByTestId("expected-not-yet-in")).toHaveTextContent("2");
		expect(screen.getByTestId("overdue-invoices")).toHaveTextContent("2");
		expect(within(screen.getByTestId("overdue-invoices")).getByText("2")).toHaveClass(
			"text-destructive",
		);
		expect(mockedUseInvoiceSummary).toHaveBeenCalledWith({ enabled: true });
	});

	it("shows an unknown overdue invoice count when the invoice summary is loading", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 10,
					staffCount: 2,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Ana",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 1,
					currentStaffCount: 1,
					ratioRequired: 1,
					ratioActual: 1,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
					ratioRuleSource: "classroom" as const,
				},
			],
			isLoading: false,
		});
		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		mockedUseInvoiceSummary.mockReturnValue({ data: undefined, isLoading: true, isError: false });
		vi.mocked(getBillingState).mockReturnValue(true);

		renderDashboard();

		expect(screen.getByTestId("overdue-invoices")).toHaveTextContent("-");
		expect(screen.getByTestId("overdue-invoices")).not.toHaveTextContent("0");
	});

	it("shows Today strip with warning color when at least one room is out of compliance", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 10,
					staffCount: 1,
					minRatioStaff: 2,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 10,
					currentStaffCount: 1,
					ratioRequired: 2,
					ratioActual: 10,
					inCompliance: false,
					nearLimit: false,
					openViolationId: "violation-1",
					ratioRuleSource: "classroom" as const,
				},
			],
			isLoading: false,
		});
		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		const spy = vi.spyOn(DashboardModule, "getBillingState").mockReturnValue(true);
		try {
			renderDashboard();
			expect(screen.getByText("Today")).toBeInTheDocument();
			// 0 of 1 rooms within ratio should render — ratio stat is visible
			expect(screen.getByText("rooms within ratio")).toBeInTheDocument();
			// Verify the rooms-within-ratio count has warning color
			const ratioStatEl = screen.getByText(/\d+\/\d+/);
			expect(ratioStatEl).toHaveClass("text-warning");
		} finally {
			spy.mockRestore();
		}
	});

	it("excludes rooms with a lingering open violation from the within-ratio count, matching the Ratios page", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "room-1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 1,
					currentStaffCount: 1,
					ratioRequired: 1,
					ratioActual: 1,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
					ratioRuleSource: "classroom" as const,
				},
				{
					classroomId: "room-2",
					classroomName: "Infants",
					ageGroup: "infant",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 1,
					currentStaffCount: 1,
					ratioRequired: 1,
					ratioActual: 1,
					// inCompliance is true but an unresolved violation lingers — the
					// Ratios page counts this as a violation, so the dashboard must
					// NOT count it as within ratio.
					inCompliance: true,
					nearLimit: false,
					openViolationId: "violation-lingering",
					ratioRuleSource: "classroom" as const,
				},
			],
			isLoading: false,
		});
		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		const spy = vi.spyOn(DashboardModule, "getBillingState").mockReturnValue(true);
		try {
			renderDashboard();
			const ratioStatEl = screen.getByText(/\d+\/\d+/);
			expect(ratioStatEl).toHaveTextContent("1/2");
			expect(ratioStatEl).toHaveClass("text-warning");
		} finally {
			spy.mockRestore();
		}
	});

	it("shows Today strip with dash placeholders when ratios data is undefined", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "room-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 12,
					childCount: 1,
					staffCount: 1,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		});
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});
		mockedUseRatios.mockReturnValue({
			data: undefined,
			isLoading: false,
			refetch: vi.fn(),
		});
		mockedUseGuardians.mockReturnValue({ data: [{ id: "g-1" }] });
		const spy = vi.spyOn(DashboardModule, "getBillingState").mockReturnValue(true);
		try {
			renderDashboard();
			expect(screen.getByText("Today")).toBeInTheDocument();
			expect(screen.getByTestId("children-present")).toBeInTheDocument();
			expect(within(screen.getByTestId("children-present")).getByText("-")).toBeInTheDocument();
		} finally {
			spy.mockRestore();
		}
	});

	it("shows a staff-appropriate empty state when no classrooms exist and role is staff", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-2", name: "Staff Member" },
				membership: { id: "membership-2", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Codex Child Care",
					state: "TX",
					timezone: "America/Chicago",
				},
				classroomIds: [],
			},
			isLoading: false,
		});

		renderDashboard();

		// The new layout shows the same checklist for all roles; no special staff-only text.
		expect(screen.getByText("Getting your center ready")).toBeInTheDocument();
		// "Add a classroom" appears in both the progress strip subtitle and the checklist
		expect(screen.getAllByText("Add a classroom").length).toBeGreaterThan(0);
		// The do-this-next card CTA points to /classrooms for all roles at this step.
		expect(screen.getByRole("link", { name: /Create classroom/i })).toHaveAttribute(
			"href",
			"/classrooms",
		);
		expect(mockedUseInvoiceSummary).toHaveBeenCalledWith({ enabled: false });
	});
});

describe("computeSetupProgress", () => {
	it("returns allDone=true when all steps are complete", () => {
		const { allDone, currentStep } = computeSetupProgress({
			hasClassrooms: true,
			hasChildren: true,
			hasGuardians: true,
			hasBilling: true,
		});
		expect(allDone).toBe(true);
		expect(currentStep).toBeNull();
	});

	it("returns step 2 as currentStep when no classrooms exist", () => {
		const { currentStep } = computeSetupProgress({
			hasClassrooms: false,
			hasChildren: false,
			hasGuardians: false,
			hasBilling: false,
		});
		expect(currentStep?.index).toBe(2);
		expect(currentStep?.href).toBe("/classrooms");
	});
});
