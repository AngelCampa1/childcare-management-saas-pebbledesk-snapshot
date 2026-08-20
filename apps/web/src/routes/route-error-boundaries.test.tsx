import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterContext } from "../router";

const captureException = vi.fn();

const routeThrowState = vi.hoisted(() => ({
	loginShouldThrow: false,
	dashboardShouldThrow: false,
}));

vi.mock("../lib/sentry", () => ({
	captureException: (...args: unknown[]) => captureException(...args),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
			<a href={to}>{children}</a>
		),
	};
});

vi.mock("./login", async () => {
	const { createFileRoute } =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	function LoginPage() {
		if (routeThrowState.loginShouldThrow) {
			throw new Error("Login route failed");
		}

		return <div>Login route</div>;
	}

	return {
		LoginPage,
		Route: createFileRoute("/login")({
			component: LoginPage,
		}),
	};
});

vi.mock("./_auth/dashboard", async () => {
	const { createFileRoute } =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	function DashboardPage() {
		if (routeThrowState.dashboardShouldThrow) {
			throw new Error("Dashboard route failed");
		}

		return <div>Dashboard route</div>;
	}

	return {
		DashboardPage,
		Route: createFileRoute("/_auth/dashboard")({
			component: DashboardPage,
		}),
	};
});

vi.mock("../components/header", () => ({
	Header: ({
		centerName,
		centerState,
		onOpenNavigation,
	}: {
		centerName: string;
		centerState: string;
		onOpenNavigation?: () => void;
	}) => (
		<header data-testid="header" data-center={centerName} data-state={centerState}>
			{onOpenNavigation ? (
				<button type="button" onClick={onOpenNavigation}>
					Open navigation
				</button>
			) : null}
		</header>
	),
}));

vi.mock("../components/sidebar", () => ({
	Sidebar: ({ role }: { role: string }) => <aside data-testid="sidebar" data-role={role} />,
}));

vi.mock("../components/feedback-widget", () => ({
	FeedbackWidget: () => <div data-testid="feedback-widget" />,
}));

vi.mock("../hooks/use-auth-status", () => ({
	useAuthStatus: vi.fn(() => ({
		data: { status: "authenticated" },
		isLoading: false,
	})),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({
		data: {
			user: { id: "user-1", name: "Taylor Reed", email: "taylor@example.com" },
			membership: { id: "membership-1", centerId: "center-1", role: "director" },
			center: { id: "center-1", name: "Pebble Center", state: "TX" },
		},
		isLoading: false,
	})),
}));

vi.mock("../hooks/use-ratios", () => ({
	useRatios: vi.fn(() => ({
		data: [],
		isLoading: false,
		dataUpdatedAt: 0,
	})),
}));

vi.mock("../hooks/use-subscription", () => ({
	useSubscriptionStatus: vi.fn(() => ({
		data: undefined,
		isLoading: false,
		refetch: vi.fn(),
	})),
}));

const { routeTree } = await import("../routeTree.gen");

const testContext: RouterContext = {
	queryClient: {
		getQueryData: () => undefined,
	} as unknown as RouterContext["queryClient"],
};

function renderAt(pathname: string) {
	const history = createMemoryHistory({
		initialEntries: [pathname],
	});

	const router = createRouter({
		routeTree,
		history,
		context: testContext,
	});

	return render(<RouterProvider router={router} />);
}

describe("route error boundaries", () => {
	beforeEach(() => {
		routeThrowState.loginShouldThrow = false;
		routeThrowState.dashboardShouldThrow = false;
		captureException.mockClear();
	});

	it("shows a full-page recovery UI when a public route throws", async () => {
		routeThrowState.loginShouldThrow = true;

		renderAt("/login");

		expect(
			await screen.findByRole("heading", { name: "PebbleDesk hit a snag" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Refresh and try again. If the issue sticks around, head back to sign in."),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
		// The mocked Sidebar and Header are not rendered in the root error boundary
		expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("header")).not.toBeInTheDocument();
		expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { component: "RouteRootErrorBoundary", route: "/login", surface: "app" },
		});
	});

	it("keeps the auth shell visible when an _auth child route throws", async () => {
		routeThrowState.dashboardShouldThrow = true;

		renderAt("/dashboard");

		// AuthRouteErrorBoundary renders WorkspaceShellFrame (its own sidebar markup, not the
		// mocked Sidebar component) alongside the recovery state.
		expect(
			await screen.findByRole("heading", { name: "This workspace view needs to reload" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Try the page again or head back to the dashboard while we restore this screen.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
		expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { component: "AuthRouteErrorBoundary", route: "/dashboard", surface: "app" },
		});
	});
});
