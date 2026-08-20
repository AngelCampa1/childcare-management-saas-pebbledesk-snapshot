import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { createTimezoneSelectMock } from "../test/timezone-select-mock";
import { OnboardingPage } from "./onboarding";

vi.mock("@pebbledesk/ui/components/select", () => createTimezoneSelectMock());

vi.mock("../api", () => ({
	apiFetch: vi.fn(() =>
		Promise.resolve({
			ok: true,
			json: async () => ({}),
		}),
	),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("../hooks/use-auth-status", () => ({
	useAuthStatus: () => ({
		data: { status: "onboarding_required", emailVerified: false, email: "owner@example.com" },
		isLoading: false,
	}),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => () => ({}),
		useNavigate: () => vi.fn(),
	};
});

describe("OnboardingPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function renderWithQueryClient() {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		return render(
			<QueryClientProvider client={queryClient}>
				<OnboardingPage />
			</QueryClientProvider>,
		);
	}

	it("shows the sales interstitial when no plan attribution is present", async () => {
		renderWithQueryClient();

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { value: "Exploration Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { value: "TX" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { value: "73301" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { value: "(512) 555-0100" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		expect(await screen.findByText("Let's talk about your rollout")).toBeInTheDocument();
		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
	});

	it("falls back to the Chicago timezone when the browser timezone is unsupported", () => {
		const dateTimeFormatSpy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
			() =>
				({
					resolvedOptions: () => ({ timeZone: "Europe/Paris" }),
				}) as never,
		);

		renderWithQueryClient();

		expect(screen.getByLabelText("Timezone")).toHaveValue("America/Chicago");

		dateTimeFormatSpy.mockRestore();
	});

	it("uses free-trial CTA copy for self-serve plans", () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		render(
			<QueryClientProvider client={queryClient}>
				<OnboardingPage attribution={{ plan: "home" }} />
			</QueryClientProvider>,
		);

		expect(screen.getByRole("button", { name: "Start free trial" })).toBeInTheDocument();
	});

	it("leaves center_created analytics to the API while tracking onboarding completion", async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		render(
			<QueryClientProvider client={queryClient}>
				<OnboardingPage attribution={{ plan: "home" }} />
			</QueryClientProvider>,
		);

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { value: "TX" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { value: "73301" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { value: "(512) 555-0100" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Start free trial" }));

		await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/centers", expect.anything()));
		expect(track).not.toHaveBeenCalledWith("center_created", expect.anything());
		expect(track).toHaveBeenCalledWith("onboarding_completed", { plan: "home", self_serve: true });
	});

	it("shows the email confirmation reminder for unverified signed-in users", () => {
		renderWithQueryClient();

		expect(screen.getByText("Confirm your email")).toBeInTheDocument();
		expect(screen.getByText(/owner@example.com/i)).toBeInTheDocument();
	});
});
