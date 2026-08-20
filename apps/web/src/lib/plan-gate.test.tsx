import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { PlanGate, usePlanCheck } from "./plan-gate";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

function mockSessionWith(
	subscriptionPlan: string | null | undefined,
	subscriptionStatus = "active",
) {
	mockedApiFetch.mockResolvedValue({
		ok: true,
		json: async () => ({
			session: {
				user: { id: "user-1", name: "Jane Smith", email: "jane@example.com" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: {
					id: "center-1",
					name: "Sunshine Learning",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionStatus,
					subscriptionPlan,
				},
				classroomIds: [],
			},
		}),
	} as Response);
}

function mockSessionLoading() {
	mockedApiFetch.mockReturnValue(new Promise(() => {}));
}

describe("usePlanCheck", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
	});

	it("returns allowed: true when center_starter plan is in the allowed list", async () => {
		mockSessionWith("center_starter");

		const { result } = renderHook(() => usePlanCheck(["center_starter", "enterprise"]), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("center_starter"));
		expect(result.current.allowed).toBe(true);
	});

	it("returns allowed: false when center_starter plan is not in the allowed list", async () => {
		mockSessionWith("home");

		const { result } = renderHook(() => usePlanCheck(["center_starter", "enterprise"]), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("home"));
		expect(result.current.allowed).toBe(false);
	});

	it("returns allowed: true for trialing centers even when a paid plan is requested", async () => {
		mockSessionWith("trial", "trialing");

		const { result } = renderHook(() => usePlanCheck(["center_starter", "enterprise"]), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("trial"));
		expect(result.current.allowed).toBe(true);
	});

	it("returns allowed: false for selected paid-plan trials above their plan", async () => {
		mockSessionWith("home", "trialing");

		const { result } = renderHook(() => usePlanCheck(["center_starter", "enterprise"]), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("home"));
		expect(result.current.allowed).toBe(false);
	});

	it("returns allowed: false and currentPlan: null when session is loading", () => {
		mockSessionLoading();

		const { result } = renderHook(() => usePlanCheck(["home"]), {
			wrapper: createWrapper(),
		});

		expect(result.current.allowed).toBe(false);
		expect(result.current.currentPlan).toBeNull();
	});

	it("returns allowed: false when subscriptionPlan is null", async () => {
		mockSessionWith(null);

		const { result } = renderHook(() => usePlanCheck(["home", "center_starter", "enterprise"]), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBeNull());
		expect(result.current.allowed).toBe(false);
	});

	it("returns allowed: false when subscriptionPlan is undefined", async () => {
		mockSessionWith(undefined);

		const { result } = renderHook(() => usePlanCheck(["home", "center_starter", "enterprise"]), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
		expect(result.current.allowed).toBe(false);
		expect(result.current.currentPlan).toBeNull();
	});

	it("returns allowed: true when the current plan includes the requested feature", async () => {
		mockSessionWith("center_starter");

		const { result } = renderHook(() => usePlanCheck({ features: ["subsidies"] }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("center_starter"));
		expect(result.current.allowed).toBe(true);
	});

	it("returns allowed: false when the current plan lacks the requested feature", async () => {
		mockSessionWith("home");

		const { result } = renderHook(() => usePlanCheck({ features: ["quickbooks"] }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("home"));
		expect(result.current.allowed).toBe(false);
	});

	it("returns allowed: true for trialing centers when a paid feature is requested", async () => {
		mockSessionWith("trial", "trialing");

		const { result } = renderHook(() => usePlanCheck({ features: ["quickbooks"] }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("trial"));
		expect(result.current.allowed).toBe(true);
	});

	it("returns allowed: false for selected paid-plan trials missing the requested feature", async () => {
		mockSessionWith("home", "trialing");

		const { result } = renderHook(() => usePlanCheck({ features: ["quickbooks"] }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("home"));
		expect(result.current.allowed).toBe(false);
	});

	it("returns allowed: true for selected paid-plan trials with an included feature", async () => {
		mockSessionWith("center_starter", "trialing");

		const { result } = renderHook(() => usePlanCheck({ features: ["subsidies"] }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("center_starter"));
		expect(result.current.allowed).toBe(true);
	});

	it("returns allowed: false when subscription status is not service-allowed", async () => {
		mockSessionWith("center_starter", "incomplete");

		const { result } = renderHook(() => usePlanCheck({ features: ["subsidies"] }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.currentPlan).toBe("center_starter"));
		expect(result.current.allowed).toBe(false);
	});
});

describe("PlanGate", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
	});

	it("renders children when the center_starter plan is in the allowed list", async () => {
		mockSessionWith("enterprise");

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			<QueryClientProvider client={client}>
				<PlanGate plans={["center_starter", "enterprise"]}>
					<p>Premium feature</p>
				</PlanGate>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Premium feature")).toBeInTheDocument();
		});
	});

	it("renders the fallback when center_starter plan is not in the allowed list", async () => {
		mockSessionWith("home");

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			<QueryClientProvider client={client}>
				<PlanGate plans={["center_starter", "enterprise"]} fallback={<p>Upgrade required</p>}>
					<p>Premium feature</p>
				</PlanGate>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Upgrade required")).toBeInTheDocument();
		});
		expect(screen.queryByText("Premium feature")).not.toBeInTheDocument();
	});

	it("renders nothing when not allowed and no fallback is provided", async () => {
		mockSessionWith("home");

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		const { container } = render(
			<QueryClientProvider client={client}>
				<PlanGate plans={["center_starter", "enterprise"]}>
					<p>Premium feature</p>
				</PlanGate>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.queryByText("Premium feature")).not.toBeInTheDocument();
		});
		expect(container.firstChild).toBeNull();
	});

	it("renders children when the current plan includes the requested feature", async () => {
		mockSessionWith("center_pro");

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			<QueryClientProvider client={client}>
				<PlanGate features={["quickbooks"]}>
					<p>QuickBooks feature</p>
				</PlanGate>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("QuickBooks feature")).toBeInTheDocument();
		});
	});

	it("renders paid-plan children for trialing centers", async () => {
		mockSessionWith("trial", "trialing");

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			<QueryClientProvider client={client}>
				<PlanGate plans={["center_starter", "enterprise"]}>
					<p>Premium feature</p>
				</PlanGate>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Premium feature")).toBeInTheDocument();
		});
	});
});
