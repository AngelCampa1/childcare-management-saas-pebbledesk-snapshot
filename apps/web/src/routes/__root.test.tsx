import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RouterContext } from "../router";
import { routeTree } from "../routeTree.gen";

const testContext: RouterContext = {
	queryClient: {
		getQueryData: () => undefined,
	} as unknown as RouterContext["queryClient"],
};

function renderUnknownRoute(pathname = "/definitely-not-a-real-page") {
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

function createRouterAt(pathname: string) {
	const history = createMemoryHistory({ initialEntries: [pathname] });
	return createRouter({ routeTree, history, context: testContext });
}

describe("root not-found route", () => {
	it("renders a warm not-found state for unknown paths", async () => {
		renderUnknownRoute();

		expect(
			await screen.findByRole("heading", { name: "We couldn't find that page" }),
		).toBeInTheDocument();
		expect(screen.getByText("Let's get you back to your center.")).toBeInTheDocument();
		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
		const link = screen.getByRole("link", { name: "Return to dashboard" });
		expect(link).toHaveAttribute("href", "/dashboard");
	});

	it("does not use an alarming alert-triangle icon", async () => {
		const { container } = renderUnknownRoute();
		await screen.findByRole("heading", { name: "We couldn't find that page" });
		// Triangle icons render with a class name reference; ensure none present.
		expect(container.querySelector("svg.lucide-triangle-alert")).toBeNull();
		expect(container.querySelector("svg.lucide-circle-alert")).toBeNull();
	});

	it("redirects `/` to /dashboard instead of rendering not-found", async () => {
		const router = createRouterAt("/");
		render(<RouterProvider router={router} />);

		await vi.waitFor(() => {
			expect(router.state.location.pathname).toBe("/dashboard");
		});
	});
});
