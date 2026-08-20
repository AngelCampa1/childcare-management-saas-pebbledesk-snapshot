import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RootErrorBoundary, RootNotFound } from "./__root";
import { AuthRouteBoundary, AuthRouteErrorBoundary } from "./_auth";

const captureException = vi.fn();

vi.mock("../lib/sentry", () => ({
	captureException: (...args: unknown[]) => captureException(...args),
}));

function createTestRouter(pathname: string) {
	const rootRoute = createRootRoute({
		component: () => <Outlet />,
		errorComponent: RootErrorBoundary,
		notFoundComponent: RootNotFound,
	});

	const publicBoomRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/boom",
		component: () => {
			throw new Error("public boom");
		},
	});

	const authLayoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: "_auth",
		errorComponent: AuthRouteBoundary,
		component: () => (
			<div>
				<nav aria-label="Sidebar">Sidebar</nav>
				<header>Header</header>
				<Outlet />
			</div>
		),
	});

	const dashboardRoute = createRoute({
		getParentRoute: () => authLayoutRoute,
		path: "/dashboard",
		component: () => <div>Dashboard</div>,
	});

	const authBoomRoute = createRoute({
		getParentRoute: () => authLayoutRoute,
		path: "/ratios",
		component: () => {
			throw new Error("auth boom");
		},
	});

	const routeTree = rootRoute.addChildren([
		publicBoomRoute,
		authLayoutRoute.addChildren([dashboardRoute, authBoomRoute]),
	]);

	return createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [pathname] }),
	});
}

describe("route error boundaries", () => {
	beforeEach(() => {
		captureException.mockClear();
	});

	it("renders the root error boundary for public route failures", async () => {
		render(<RouterProvider router={createTestRouter("/boom")} />);

		expect(
			await screen.findByRole("heading", { name: "PebbleDesk hit a snag" }),
		).toBeInTheDocument();
		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
		expect(
			screen.getByText("Refresh and try again. If the issue sticks around, head back to sign in."),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login",
		);
		expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { component: "RouteRootErrorBoundary", route: "/boom", surface: "app" },
		});
	});

	it("captures root boundary component stacks when React provides them", async () => {
		const reset = vi.fn();
		const rootRoute = createRootRoute({
			component: () => (
				<RootErrorBoundary
					error={new Error("public boom")}
					info={{ componentStack: "Root > BoomRoute" }}
					reset={reset}
				/>
			),
		});
		const router = createRouter({
			routeTree: rootRoute,
			history: createMemoryHistory({ initialEntries: ["/boom"] }),
		});

		render(<RouterProvider router={router} />);

		expect(
			await screen.findByRole("heading", { name: "PebbleDesk hit a snag" }),
		).toBeInTheDocument();
		expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { component: "RouteRootErrorBoundary", route: "/boom", surface: "app" },
			extra: { componentStack: "Root > BoomRoute" },
		});
	});

	it("renders the auth error boundary inside the workspace shell", async () => {
		render(<RouterProvider router={createTestRouter("/ratios")} />);

		expect(await screen.findByRole("navigation", { name: "Primary" })).toBeInTheDocument();
		expect(screen.getByText("PebbleDesk workspace")).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "This workspace view needs to reload" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
			"href",
			"/dashboard",
		);
		expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { component: "AuthRouteErrorBoundary", route: "/ratios", surface: "app" },
		});
	});

	it("retries the auth error boundary by invalidating the router", async () => {
		const invalidate = vi.fn();
		const reset = vi.fn();

		render(
			<AuthRouteErrorBoundary
				error={new Error("boom")}
				reset={reset}
				info={{ componentStack: "" }}
				currentPath="/dashboard"
				router={{ invalidate } as never}
			/>,
		);

		const retryButton = screen.getByRole("button", { name: "Try again" });
		fireEvent.click(retryButton);

		expect(reset).toHaveBeenCalledTimes(1);
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it("retries the root error boundary by resetting and reloading the page", async () => {
		const reload = vi.fn();
		const originalLocation = window.location;

		Object.defineProperty(window, "location", {
			configurable: true,
			value: { ...originalLocation, reload },
		});

		try {
			render(<RouterProvider router={createTestRouter("/boom")} />);

			fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

			expect(reload).toHaveBeenCalledTimes(1);
		} finally {
			Object.defineProperty(window, "location", {
				configurable: true,
				value: originalLocation,
			});
		}
	});
});
