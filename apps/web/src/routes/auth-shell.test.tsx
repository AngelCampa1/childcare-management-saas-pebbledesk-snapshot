import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { AuthSessionError, AuthVerificationError, useAuthSession } from "../hooks/use-auth-session";
import { useAuthStatus } from "../hooks/use-auth-status";
import { useRatios } from "../hooks/use-ratios";
import { useSubscriptionStatus } from "../hooks/use-subscription";
import { AuthLayout, buildLoginHref } from "./_auth";

const routerState = vi.hoisted(() => ({
	currentPath: "/dashboard",
	currentSearch: {} as Record<string, unknown>,
	currentSearchStr: "",
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		Outlet: () => <div data-testid="outlet" />,
		useRouterState: ({
			select,
		}: {
			select?: (state: {
				location: { pathname: string; search: Record<string, unknown>; searchStr: string };
			}) => unknown;
		}) => {
			const state = {
				location: {
					pathname: routerState.currentPath,
					search: routerState.currentSearch,
					searchStr: routerState.currentSearchStr,
				},
			};
			return select ? select(state) : state;
		},
	};
});

vi.mock("../components/sidebar", () => ({
	Sidebar: ({ role, onNavigate }: { role: string; onNavigate?: () => void }) => (
		<div data-testid="sidebar" data-role={role}>
			<button type="button" onClick={onNavigate}>
				Navigate
			</button>
		</div>
	),
}));

vi.mock("../components/header", () => ({
	Header: ({
		centerName,
		centerState,
		ratioStatus,
		userName,
		onOpenNavigation,
		navigationButtonRef,
	}: {
		centerName: string;
		centerState: string;
		ratioStatus?: string;
		userName: string;
		onOpenNavigation?: () => void;
		navigationButtonRef?: React.RefObject<HTMLButtonElement | null>;
	}) => (
		<div
			data-testid="header"
			data-center={centerName}
			data-ratio-status={ratioStatus}
			data-state={centerState}
			data-user={userName}
		>
			{onOpenNavigation ? (
				<button type="button" ref={navigationButtonRef} onClick={onOpenNavigation}>
					Open navigation
				</button>
			) : null}
		</div>
	),
}));

vi.mock("../hooks/use-auth-session", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../hooks/use-auth-session")>();

	return {
		...actual,
		useAuthSession: vi.fn(() => ({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		})),
	};
});

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../hooks/use-ratios", () => ({
	useRatios: vi.fn(() => ({
		data: [],
		isLoading: false,
	})),
}));

vi.mock("../hooks/use-auth-status", () => ({
	useAuthStatus: vi.fn(() => ({
		data: { status: "authenticated" },
		isLoading: false,
	})),
}));

vi.mock("../hooks/use-subscription", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../hooks/use-subscription")>();
	return {
		...actual,
		useSubscriptionStatus: vi.fn(() => ({
			data: undefined,
			isLoading: false,
			refetch: vi.fn().mockResolvedValue({ data: undefined }),
		})),
	};
});

const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedUseAuthStatus = vi.mocked(useAuthStatus);
const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseRatios = vi.mocked(useRatios);
const mockedUseSubscriptionStatus = vi.mocked(useSubscriptionStatus);

function renderAuthLayout() {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(
		<QueryClientProvider client={client}>
			<AuthLayout />
		</QueryClientProvider>,
	);
}

describe("AuthLayout", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedUseAuthStatus.mockReset();
		mockedUseAuthStatus.mockReturnValue({
			data: { status: "authenticated" },
			isLoading: false,
		} as never);
		mockedUseAuthSession.mockReset();
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseRatios.mockReset();
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseSubscriptionStatus.mockReset();
		mockedUseSubscriptionStatus.mockReturnValue({
			data: undefined,
			isLoading: false,
			refetch: vi.fn().mockResolvedValue({ data: undefined }),
		} as never);
		routerState.currentSearch = {};
		routerState.currentSearchStr = "";
		window.sessionStorage.clear();
		window.history.replaceState(null, "", "/dashboard");
	});

	it("renders the authenticated shell with the shared role type", () => {
		routerState.currentPath = "/dashboard";
		renderAuthLayout();

		expect(mockedUseAuthSession).toHaveBeenCalledWith({ enabled: true });
		expect(screen.getByTestId("sidebar")).toHaveAttribute("data-role", "director");
		expect(screen.getByTestId("header")).toHaveAttribute("data-center", "Pebble Center");
		expect(screen.getByTestId("outlet")).toBeInTheDocument();
	});

	it("does not add redirect parameters for public auth routes", () => {
		expect(buildLoginHref("/login", "")).toBe("/login");
		expect(buildLoginHref("/signup", "?plan=center_starter")).toBe("/login");
		expect(buildLoginHref("/onboarding", "")).toBe("/login");
	});

	it("passes a violation ratio summary into the shared header", () => {
		routerState.currentPath = "/attendance";
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "classroom-1",
					classroomName: "Toddlers",
					ageGroup: "Toddlers",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 1,
					currentStaffCount: 0,
					ratioRequired: 6,
					ratioActual: Number.POSITIVE_INFINITY,
					inCompliance: false,
					nearLimit: false,
					openViolationId: "violation-1",
				},
			],
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByTestId("header")).toHaveAttribute("data-ratio-status", "violation");
	});

	it("passes a warning ratio summary into the shared header when a classroom is near limit", () => {
		routerState.currentPath = "/attendance";
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "classroom-1",
					classroomName: "Toddlers",
					ageGroup: "Toddlers",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 5,
					currentStaffCount: 1,
					ratioRequired: 5,
					ratioActual: 5,
					inCompliance: true,
					nearLimit: true,
				},
			],
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByTestId("header")).toHaveAttribute("data-ratio-status", "warning");
	});

	it("disables live ratio polling for staff shells", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseRatios.mockImplementation(
			(options?: { enabled?: boolean }) =>
				({
					data: options?.enabled === false ? undefined : [],
					isLoading: false,
				}) as never,
		);

		renderAuthLayout();

		expect(mockedUseRatios).toHaveBeenCalledWith({ enabled: false });
		expect(screen.getByTestId("header")).toHaveAttribute("data-ratio-status", "unknown");
	});

	it("opens and closes the mobile navigation drawer from the shared header", () => {
		routerState.currentPath = "/attendance";

		renderAuthLayout();

		expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

		const dialog = screen.getByRole("dialog", { name: "Navigation" });
		expect(within(dialog).getByTestId("sidebar")).toHaveAttribute("data-role", "director");

		fireEvent.click(within(dialog).getByRole("button", { name: "Navigate" }));

		expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
	});

	it("uses sidebar design tokens in the mobile navigation drawer", () => {
		routerState.currentPath = "/attendance";

		renderAuthLayout();
		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

		const dialog = screen.getByRole("dialog", { name: "Navigation" });
		expect(dialog).toHaveClass("bg-sidebar-background", "text-sidebar-foreground");

		const closeButton = within(dialog).getByRole("button", { name: "Close" });
		expect(closeButton).toHaveClass(
			"border-sidebar-border",
			"text-sidebar-foreground",
			"hover:bg-sidebar-accent",
			"hover:text-sidebar-accent-foreground",
		);
	});

	it("closes the mobile navigation drawer from the close button", () => {
		routerState.currentPath = "/attendance";

		renderAuthLayout();
		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
	});

	it("closes the mobile navigation drawer via Escape key", () => {
		routerState.currentPath = "/attendance";

		renderAuthLayout();
		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
		expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();

		fireEvent.keyDown(document.activeElement ?? document.body, {
			key: "Escape",
			code: "Escape",
			keyCode: 27,
		});

		expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
	});

	it("returns focus to the mobile navigation trigger after Escape closes the drawer", async () => {
		routerState.currentPath = "/attendance";

		renderAuthLayout();
		const trigger = screen.getByRole("button", { name: "Open navigation" });
		fireEvent.click(trigger);
		expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();

		fireEvent.keyDown(document.activeElement ?? document.body, {
			key: "Escape",
			code: "Escape",
			keyCode: 27,
		});

		await waitFor(() => {
			expect(trigger).toHaveFocus();
		});
	});

	it("renders a full-page workspace loading state while the session is still loading", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthStatus.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);

		renderAuthLayout();

		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
		expect(screen.getByText("Loading your workspace...")).toBeInTheDocument();
	});

	it("does not render the shell when session data is missing", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthStatus.mockReturnValue({
			data: { status: "unauthenticated" },
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(mockedUseAuthSession).toHaveBeenCalledWith({ enabled: false });
		const wordmark = screen.getByText("PebbleDesk");
		expect(wordmark.closest("div")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
		expect(screen.getByText("Sign in required")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login?redirect=%2Fdashboard",
		);
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("routes signed-in users without a center into onboarding guidance", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthStatus.mockReturnValue({
			data: { status: "onboarding_required" },
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(mockedUseAuthSession).toHaveBeenCalledWith({ enabled: false });
		expect(screen.getByText("Finish setting up your center")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Continue onboarding" })).toHaveAttribute(
			"href",
			"/onboarding",
		);
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("routes multi-center users into the center chooser recovery state", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthStatus.mockReturnValue({
			data: {
				status: "center_selection_required",
				centers: [{ centerId: "center-1", membershipId: "membership-1", role: "owner" }],
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(mockedUseAuthSession).toHaveBeenCalledWith({ enabled: false });
		expect(screen.getByText("Choose your center")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Choose a center" })).toHaveAttribute(
			"href",
			"/overview",
		);
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("allows the center chooser route to render without a current center session", () => {
		routerState.currentPath = "/overview";
		mockedUseAuthStatus.mockReturnValue({
			data: {
				status: "center_selection_required",
				centers: [{ centerId: "center-1", membershipId: "membership-1", role: "owner" }],
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(mockedUseAuthSession).toHaveBeenCalledWith({ enabled: false });
		expect(screen.getByTestId("outlet")).toBeInTheDocument();
		expect(screen.queryByText("Sign in required")).not.toBeInTheDocument();
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("shows a session recovery state when auth status fails", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthStatus.mockReturnValue({
			data: undefined,
			error: new Error("status failed"),
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("We couldn't verify your session")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login",
		);
		expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/dashboard");
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it.each([
		"/billing",
		"/reports",
		"/settings",
	])("keeps protected route auth verification failures on %s in the shared recovery UI", (pathname) => {
		routerState.currentPath = pathname;
		mockedUseAuthStatus.mockReturnValue({
			data: { status: "authenticated" },
			isLoading: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			error: new AuthVerificationError("Failed to verify auth session", 429),
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("We couldn't verify your session")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login",
		);
		expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", pathname);
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("shows invited users an invitation acceptance state instead of onboarding", async () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthStatus.mockReturnValue({
			data: {
				status: "invite_pending",
				invitation: {
					membershipId: "membership-2",
					centerId: "center-2",
					centerName: "Pebble North",
					role: "staff",
				},
			},
			isLoading: false,
		} as never);
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ membership: { id: "membership-2" } }),
		} as Response);

		renderAuthLayout();

		expect(mockedUseAuthSession).toHaveBeenCalledWith({ enabled: false });
		expect(screen.getByText("Accept your invitation")).toBeInTheDocument();
		expect(
			screen.getByText("You've been invited to join Pebble North as staff."),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

		await waitFor(() =>
			expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/invitations/membership-2/accept", {
				method: "POST",
			}),
		);
	});

	it("shows a pending invitation inline while keeping the active shell available", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
				classroomIds: [],
				pendingInvitation: {
					membershipId: "membership-2",
					centerId: "center-2",
					centerName: "Pebble North",
					role: "staff",
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByTestId("sidebar")).toHaveAttribute("data-role", "director");
		expect(screen.getByTestId("header")).toHaveAttribute("data-center", "Pebble Center");
		expect(
			screen.getByRole("heading", { level: 2, name: "Accept your invitation" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("You've been invited to join Pebble North as staff."),
		).toBeInTheDocument();
		expect(screen.getByTestId("outlet")).toBeInTheDocument();
	});

	it("shows a pending invitation when the authenticated session returns an invite-pending error", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			error: {
				code: "invite_pending",
				invitation: {
					membershipId: "membership-2",
					centerId: "center-2",
					centerName: "Pebble North",
					role: "staff",
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Accept your invitation")).toBeInTheDocument();
		expect(
			screen.getByText("You've been invited to join Pebble North as staff."),
		).toBeInTheDocument();
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("handles invite-pending AuthSessionError instances from the authenticated session hook", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			error: new AuthSessionError("invite_pending", "Invitation pending", {
				membershipId: "membership-2",
				centerId: "center-2",
				centerName: "Pebble North",
				role: "staff",
			}),
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Accept your invitation")).toBeInTheDocument();
		expect(
			screen.getByText("You've been invited to join Pebble North as staff."),
		).toBeInTheDocument();
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("routes authenticated users with an onboarding-required session error into onboarding guidance", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			error: { code: "onboarding_required" },
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Finish setting up your center")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Continue onboarding" })).toHaveAttribute(
			"href",
			"/onboarding",
		);
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("falls back to sign-in guidance when the authenticated session returns no data and no special error", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			error: new Error("session missing"),
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Sign in required")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login?redirect=%2Fdashboard",
		);
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
	});

	it("blocks non-owners from deep-linking into settings", () => {
		routerState.currentPath = "/settings";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Owner access required")).toBeInTheDocument();
		expect(screen.getByTestId("sidebar")).toBeInTheDocument();
		expect(screen.getByTestId("header")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
			"href",
			"/dashboard",
		);
		expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
	});

	it("allows staff to deep-link into personal account security", () => {
		routerState.currentPath = "/account";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.queryByText("Owner access required")).not.toBeInTheDocument();
		expect(screen.queryByText("Director access required")).not.toBeInTheDocument();
		expect(screen.getByTestId("outlet")).toBeInTheDocument();
	});

	it("keeps personal account security available when billing is blocked", () => {
		routerState.currentPath = "/account";
		mockedUseSubscriptionStatus.mockReturnValue({
			data: { subscriptionStatus: "canceled" },
			isLoading: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "TX",
					subscriptionStatus: "canceled",
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.queryByText("Billing setup required")).not.toBeInTheDocument();
		expect(screen.getByTestId("outlet")).toBeInTheDocument();
	});

	it("keeps personal account security available after checkout polling is exhausted", async () => {
		routerState.currentPath = "/account";
		routerState.currentSearch = { checkout: "success" };
		mockedUseSubscriptionStatus.mockReturnValue({
			data: { subscriptionStatus: "none" },
			isLoading: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "TX",
					subscriptionStatus: "none",
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		const lastCall = mockedUseSubscriptionStatus.mock.calls.at(-1)?.[0];
		const refetchInterval = lastCall?.refetchInterval;
		if (typeof refetchInterval === "function") {
			for (let i = 0; i < 30; i++) {
				act(() => {
					refetchInterval({ state: { data: { subscriptionStatus: "none" } } });
				});
			}
		}

		await waitFor(() => {
			expect(screen.queryByText("Your payment is processing")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("outlet")).toBeInTheDocument();
	});

	it("blocks non-owners from deep-linking into owner billing setup", () => {
		const pathname = "/billing";
		routerState.currentPath = pathname;
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Owner access required")).toBeInTheDocument();
		expect(screen.getByTestId("sidebar")).toBeInTheDocument();
		expect(screen.getByTestId("header")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
			"href",
			"/dashboard",
		);
		expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
	});

	it("allows directors to deep-link into payment history", () => {
		routerState.currentPath = "/billing/payments";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByTestId("outlet")).toBeInTheDocument();
		expect(screen.queryByText("Owner access required")).not.toBeInTheDocument();
	});

	it("allows directors to deep-link into billing templates", () => {
		routerState.currentPath = "/billing/templates";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByTestId("outlet")).toBeInTheDocument();
		expect(screen.queryByText("Owner access required")).not.toBeInTheDocument();
	});

	it("blocks staff from deep-linking into payment history", () => {
		routerState.currentPath = "/billing/payments";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Director access required")).toBeInTheDocument();
		expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
	});

	const ACTIVE_STATUSES = ["trialing", "active", "past_due"] as const;
	const BLOCKED_STATUSES = [
		"none",
		"canceled",
		"unpaid",
		"incomplete",
		"incomplete_expired",
	] as const;

	it.each(
		ACTIVE_STATUSES,
	)("renders the app outlet when subscriptionStatus is %s", (subscriptionStatus) => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "TX",
					subscriptionStatus,
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByTestId("outlet")).toBeInTheDocument();
		expect(screen.queryByText("Choose your PebbleDesk plan")).not.toBeInTheDocument();
	});

	it.each(
		BLOCKED_STATUSES,
	)("renders the plan picker for owners when subscriptionStatus is %s", (subscriptionStatus) => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "TX",
					subscriptionStatus,
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(
			screen.getByText(
				subscriptionStatus === "none" ? "Choose your PebbleDesk plan" : "Restore PebbleDesk access",
			),
		).toBeInTheDocument();
		expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
	});

	it("uses the live subscription status when it differs from the cached session value", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "TX",
					subscriptionStatus: "active",
				},
			},
			isLoading: false,
		} as never);
		mockedUseSubscriptionStatus.mockReturnValue({
			data: { subscriptionStatus: "canceled" },
			isLoading: false,
			refetch: vi.fn().mockResolvedValue({ data: { subscriptionStatus: "canceled" } }),
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Restore PebbleDesk access")).toBeInTheDocument();
		expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
	});

	it("enables refetchInterval on useSubscriptionStatus when ?checkout=success is present", () => {
		routerState.currentPath = "/dashboard";
		routerState.currentSearch = { checkout: "success" };
		mockedUseSubscriptionStatus.mockReturnValue({
			data: { subscriptionStatus: "none" },
			isLoading: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "TX",
					subscriptionStatus: "none",
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		// The AuthLayout passes refetchInterval to useSubscriptionStatus when checkout=success
		const lastCall = mockedUseSubscriptionStatus.mock.calls.at(-1)?.[0];
		expect(lastCall?.refetchInterval).toBeDefined();
		expect(typeof lastCall?.refetchInterval).toBe("function");
	});

	it("refreshes cached billing session data after checkout success", async () => {
		routerState.currentPath = "/dashboard";
		routerState.currentSearch = { checkout: "success" };
		routerState.currentSearchStr = "?checkout=success";
		window.history.replaceState(null, "", "/dashboard?checkout=success");
		const invalidateQueries = vi.spyOn(QueryClient.prototype, "invalidateQueries");

		renderAuthLayout();

		await waitFor(() => {
			expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["authSession"] });
			expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["subscriptionStatus"] });
		});
		expect(window.sessionStorage.getItem("pebbledesk.checkoutJustCompleted")).toBe("1");
		expect(window.location.search).toBe("");
	});

	it("stops checkout polling once the live subscription becomes active", () => {
		routerState.currentPath = "/dashboard";
		routerState.currentSearch = { checkout: "success" };

		renderAuthLayout();

		const lastCall = mockedUseSubscriptionStatus.mock.calls.at(-1)?.[0];
		expect(lastCall?.refetchInterval).toBeDefined();
		expect(
			lastCall?.refetchInterval?.({
				state: { data: { subscriptionStatus: "active" } },
			}),
		).toBe(false);
	});

	it("keeps checkout polling active while the live subscription is still blocked", () => {
		routerState.currentPath = "/dashboard";
		routerState.currentSearch = { checkout: "success" };

		renderAuthLayout();

		const lastCall = mockedUseSubscriptionStatus.mock.calls.at(-1)?.[0];
		expect(lastCall?.refetchInterval).toBeDefined();
		expect(
			lastCall?.refetchInterval?.({
				state: { data: { subscriptionStatus: "none" } },
			}),
		).toBe(1000);
	});

	it("shows payment processing recovery state after checkout polling is exhausted", async () => {
		routerState.currentPath = "/dashboard";
		routerState.currentSearch = { checkout: "success" };

		mockedUseSubscriptionStatus.mockReturnValue({
			data: { subscriptionStatus: "none" },
			isLoading: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "TX",
					subscriptionStatus: "none",
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		const lastCall = mockedUseSubscriptionStatus.mock.calls.at(-1)?.[0];
		const refetchInterval = lastCall?.refetchInterval;
		expect(typeof refetchInterval).toBe("function");

		// Exhaust the 30-attempt poll limit with a non-active subscription
		if (typeof refetchInterval === "function") {
			for (let i = 0; i < 30; i++) {
				act(() => {
					refetchInterval({ state: { data: { subscriptionStatus: "none" } } });
				});
			}
		}

		await waitFor(() => {
			expect(screen.getByText("Your payment is processing")).toBeInTheDocument();
		});
		expect(screen.getByRole("link", { name: "Refresh" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
			"href",
			`mailto:${PUBLIC_BRAND_KNOWLEDGE.supportEmail}`,
		);
	});

	it("does not force-close the mobile drawer when no pathname is available", () => {
		routerState.currentPath = "/attendance";

		renderAuthLayout();
		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
		expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();

		routerState.currentPath = "";
		renderAuthLayout();

		expect(screen.getAllByRole("dialog", { name: "Navigation" })).toHaveLength(1);
	});

	it("shows the non-owner message when a director hits a blocked subscription status", () => {
		routerState.currentPath = "/dashboard";
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "TX",
					subscriptionStatus: "canceled",
				},
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Billing setup required")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Ask your owner to complete billing setup to unlock PebbleDesk for your team.",
			),
		).toBeInTheDocument();
		expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
	});

	it.each([
		"/reports",
		"/reports/audit-log",
		"/ratios",
		"/children",
		"/children/enroll",
		"/guardians",
		"/classrooms",
		"/classrooms/room-1",
		"/scheduling/time",
		"/subsidies",
		"/import",
	])("blocks staff from deep-linking into %s", (pathname) => {
		routerState.currentPath = pathname;
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);

		renderAuthLayout();

		expect(screen.getByText("Director access required")).toBeInTheDocument();
		expect(screen.getByTestId("sidebar")).toBeInTheDocument();
		expect(screen.getByTestId("header")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
			"href",
			"/dashboard",
		);
		expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
	});
});
