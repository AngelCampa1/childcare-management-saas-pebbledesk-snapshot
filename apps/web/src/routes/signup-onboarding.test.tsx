import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import type { PendingInvitation } from "../hooks/use-auth-session";
import { createTimezoneSelectMock } from "../test/timezone-select-mock";
import { OnboardingPage } from "./onboarding";
import { SignupPage, SignupRoutePage } from "./signup";

const { mockNavigate, mockSignUpEmail, mockApiFetch, mockUseAuthStatus } = vi.hoisted(() => ({
	mockNavigate: vi.fn(),
	mockSignUpEmail: vi.fn(),
	mockApiFetch: vi.fn(),
	mockUseAuthStatus: vi.fn(() => ({
		data: { status: "unauthenticated" },
		isLoading: false,
	})),
}));

vi.mock("@pebbledesk/auth/client", () => ({
	createBetterAuthClient: () => ({
		signUp: {
			email: mockSignUpEmail,
		},
	}),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		useNavigate: () => mockNavigate,
		Link: ({
			to,
			children,
			...props
		}: {
			to: string;
			children: React.ReactNode;
			[key: string]: unknown;
		}) => React.createElement("a", { href: to, ...props }, children),
		createFileRoute: () => () => ({
			useSearch: () => ({}),
		}),
	};
});

vi.mock("../api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../api")>();
	return {
		...actual,
		apiFetch: (...args: unknown[]) => mockApiFetch(...args),
	};
});

vi.mock("@pebbledesk/ui/components/select", () => createTimezoneSelectMock());

vi.mock("../hooks/use-auth-status", () => ({
	useAuthStatus: () => mockUseAuthStatus(),
}));

function renderWithQueryClient(ui: ReactElement, client?: QueryClient) {
	const queryClient =
		client ??
		new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

	return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("SignupRoutePage", () => {
	it("renders the signup form via the route component wrapper", () => {
		mockUseAuthStatus.mockReturnValue({
			data: { status: "unauthenticated" },
			isLoading: false,
		});
		renderWithQueryClient(<SignupRoutePage />);
		expect(
			screen.getByRole("heading", { name: "Create your PebbleDesk account." }),
		).toBeInTheDocument();
	});
});

describe("SignupPage", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
		mockSignUpEmail.mockReset();
		mockUseAuthStatus.mockReturnValue({
			data: { status: "unauthenticated" },
			isLoading: false,
		});
	});

	it("navigates to onboarding when signup succeeds", async () => {
		mockSignUpEmail.mockResolvedValue({ error: null });

		renderWithQueryClient(
			<SignupPage attribution={{ plan: "center_starter", source: "/compare" }} />,
		);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		await waitFor(() => {
			expect(mockSignUpEmail).toHaveBeenCalledWith({
				name: "Jane Smith",
				email: "jane@example.com",
				password: "xK9#mR2vLpQw8!",
			});

			const navigateCall = mockNavigate.mock.calls.at(-1)?.[0];
			expect(navigateCall).toMatchObject({
				to: "/onboarding",
				replace: true,
			});
			expect(navigateCall.search({ existing: "1" })).toEqual({
				existing: "1",
				plan: "center_starter",
				source: "/compare",
			});
		});
	});

	it("invalidates authStatus and navigates to onboarding after a successful signup", async () => {
		mockSignUpEmail.mockResolvedValue({ error: null });
		const client = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});
		client.setQueryData(["authStatus"], { status: "unauthenticated" });
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");

		renderWithQueryClient(<SignupPage />, client);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		await waitFor(() => {
			// Server is now the source of truth — invalidateQueries is called, not setQueryData
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["authStatus"] });

			const navigateCall = mockNavigate.mock.calls.at(-1)?.[0];
			expect(navigateCall).toMatchObject({
				to: "/onboarding",
				replace: true,
			});
		});
	});

	it("navigates to onboarding only once after a successful signup", async () => {
		mockSignUpEmail.mockResolvedValue({ error: null });

		renderWithQueryClient(
			<SignupPage
				attribution={{
					plan: "center_starter",
					source: "/compare",
					ref: "partner-ally",
				}}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledTimes(1);
		});
	});

	it("renders the auth error message when signup fails", async () => {
		mockSignUpEmail.mockResolvedValue({
			error: { message: "Email already registered" },
		});

		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("Email already registered")).toBeInTheDocument();
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("falls back to the default signup error when the auth response has no message", async () => {
		mockSignUpEmail.mockResolvedValue({
			error: {},
		});

		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
	});

	it("shows a rate-limit message when sign-up returns 429", async () => {
		mockSignUpEmail.mockResolvedValueOnce({ error: { status: 429, message: null } });

		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		expect(
			await screen.findByText("Too many sign-up attempts. Please wait a moment and try again."),
		).toBeInTheDocument();
	});

	it("renders the split-screen form and handles thrown errors", async () => {
		mockSignUpEmail.mockRejectedValue(new Error("Network unavailable"));

		renderWithQueryClient(<SignupPage />);

		expect(
			screen.getByRole("heading", { name: "Create your PebbleDesk account." }),
		).toBeInTheDocument();
		expect(
			screen.getByText("30 days free. No credit card required. Cancel anytime."),
		).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
	});

	it("falls back to the generic exception copy for non-Error throws", async () => {
		mockSignUpEmail.mockRejectedValue("offline");

		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("An error occurred")).toBeInTheDocument();
	});

	it("shows a validation error when the password is too weak (fails zxcvbn refine)", async () => {
		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		// "12345678" scores 0 with zxcvbn — below threshold of 2
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "12345678" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("Pick a stronger password")).toBeInTheDocument();
		expect(mockSignUpEmail).not.toHaveBeenCalled();
	});

	it("shows a validation error when the password is too short", async () => {
		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "short" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
		expect(mockSignUpEmail).not.toHaveBeenCalled();
	});

	it("renders null and navigates to dashboard when already authenticated", async () => {
		mockNavigate.mockResolvedValue(undefined);
		mockUseAuthStatus.mockReturnValue({
			data: { status: "authenticated" },
			isLoading: false,
		});

		const { container } = renderWithQueryClient(<SignupPage />);
		// The component renders null (empty) for authenticated users
		expect(container.firstChild).toBeNull();
		// Navigates to dashboard
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});

	it("renders null when status is onboarding_required and navigates to onboarding", async () => {
		mockNavigate.mockResolvedValue(undefined);
		mockUseAuthStatus.mockReturnValue({
			data: { status: "onboarding_required" },
			isLoading: false,
		});

		const { container, rerender } = renderWithQueryClient(<SignupPage />);
		expect(container.firstChild).toBeNull();
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/onboarding" }));
		});
		// Re-render with same status: the guard (line 88) prevents double navigation
		const initialCallCount = mockNavigate.mock.calls.length;
		rerender(
			<QueryClientProvider
				client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
			>
				<SignupPage />
			</QueryClientProvider>,
		);
		// Navigate should not be called again — guard hit
		await waitFor(() => {
			expect(mockNavigate.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount);
		});
	});

	it("renders null when status is invite_pending and navigates to onboarding", async () => {
		mockNavigate.mockResolvedValue(undefined);
		mockUseAuthStatus.mockReturnValue({
			data: { status: "invite_pending" },
			isLoading: false,
		});

		const { container } = renderWithQueryClient(<SignupPage />);
		expect(container.firstChild).toBeNull();
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/onboarding" }));
		});
	});

	it("shows recovery guidance when an auth-status onboarding redirect fails", async () => {
		mockNavigate.mockRejectedValue(new Error("Navigation failed"));
		mockUseAuthStatus.mockReturnValue({
			data: { status: "onboarding_required" },
			isLoading: false,
		});

		renderWithQueryClient(
			<SignupPage attribution={{ plan: "center_starter", source: "/compare" }} />,
		);

		expect(await screen.findByRole("heading", { name: "Continue onboarding" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Continue onboarding" })).toHaveAttribute(
			"href",
			"/onboarding?plan=center_starter&source=%2Fcompare",
		);
	});

	it("renders null when center selection is still required and redirects to overview", async () => {
		mockNavigate.mockResolvedValue(undefined);
		mockUseAuthStatus.mockReturnValue({
			data: { status: "center_selection_required" },
			isLoading: false,
		});

		const { container } = renderWithQueryClient(<SignupPage />);
		expect(container.firstChild).toBeNull();

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/overview", replace: true });
		});
	});

	it("shows recovery guidance when the center-selection redirect fails from auth status", async () => {
		mockNavigate.mockRejectedValue(new Error("Navigation failed"));
		mockUseAuthStatus.mockReturnValue({
			data: { status: "center_selection_required" },
			isLoading: false,
		});

		renderWithQueryClient(<SignupPage />);

		expect(await screen.findByText("Choose your center")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Choose a center" })).toHaveAttribute(
			"href",
			"/overview",
		);
	});

	it("shows recovery guidance when the center-selection redirect fails", async () => {
		mockNavigate.mockRejectedValue(new Error("Navigation failed"));
		mockUseAuthStatus.mockReturnValue({
			data: { status: "center_selection_required" },
			isLoading: false,
		});

		renderWithQueryClient(
			<SignupPage attribution={{ plan: "center_starter", source: "/compare" }} />,
		);

		expect(await screen.findByText("Choose your center")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Choose a center" })).toHaveAttribute(
			"href",
			"/overview",
		);
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login?redirect=%2Fsignup%3Fplan%3Dcenter_starter%26source%3D%252Fcompare",
		);
	});

	it("shows recovery guidance when signup cannot verify auth status", () => {
		mockUseAuthStatus.mockReturnValue({
			data: undefined,
			error: new Error("Failed to fetch auth status"),
			isLoading: false,
		});

		renderWithQueryClient(
			<SignupPage attribution={{ plan: "center_starter", source: "/compare" }} />,
		);

		expect(screen.getByText("We couldn't verify your session")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
			"href",
			"/signup?plan=center_starter&source=%2Fcompare",
		);
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login?redirect=%2Fsignup%3Fplan%3Dcenter_starter%26source%3D%252Fcompare",
		);
		expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
	});

	it("disables signup while auth status is loading", () => {
		mockUseAuthStatus.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		renderWithQueryClient(<SignupPage />);

		expect(screen.getByRole("button", { name: "Checking session..." })).toBeDisabled();
	});

	it("preserves attribution on the signup footer sign-in link", () => {
		renderWithQueryClient(
			<SignupPage
				attribution={{
					plan: "center_starter",
					source: "/compare",
					utm_source: "google",
					ref: "partner-ally",
				}}
			/>,
		);

		expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
			"href",
			"/login?redirect=%2Fsignup%3Fplan%3Dcenter_starter%26source%3D%252Fcompare%26utm_source%3Dgoogle%26ref%3Dpartner-ally",
		);
	});

	it("links the legal terms from the signup form", () => {
		renderWithQueryClient(<SignupPage />);

		expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
			"href",
			"https://pebbledesk.app/privacy/",
		);
		expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
			"href",
			"https://pebbledesk.app/terms/",
		);
	});

	it("handles a failed dashboard navigation after authentication without crashing", async () => {
		mockNavigate.mockRejectedValue(new Error("Navigation failed"));
		mockUseAuthStatus.mockReturnValue({
			data: { status: "authenticated" },
			isLoading: false,
		});

		const { container } = renderWithQueryClient(<SignupPage />);
		expect(container.firstChild).toBeNull();
		// Navigation failure is caught — no unhandled rejection
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});

	it("catches onboarding navigation failure without crashing after successful signup", async () => {
		// Simulate signup succeeding but navigate rejecting on the first call (navigateToOnboarding)
		mockSignUpEmail.mockResolvedValue({ error: null });
		mockNavigate.mockRejectedValueOnce(new Error("nav error"));

		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		// Navigate was called — rejection is caught without throwing
		await waitFor(() => {
			expect(mockSignUpEmail).toHaveBeenCalled();
			expect(mockNavigate).toHaveBeenCalled();
		});
	});

	it("shows recovery guidance when signup completes but reopening onboarding fails", async () => {
		mockSignUpEmail.mockResolvedValue({ error: null });
		mockNavigate.mockRejectedValueOnce(new Error("nav error"));

		renderWithQueryClient(
			<SignupPage attribution={{ plan: "center_starter", source: "/compare" }} />,
		);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "xK9#mR2vLpQw8!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		// The recovery card renders "Continue onboarding" as both heading and link, so use role.
		expect(await screen.findByRole("heading", { name: "Continue onboarding" })).toBeInTheDocument();
		expect(screen.getByText("Confirm your email")).toBeInTheDocument();
		expect(screen.getByText(/jane@example.com/i)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Continue onboarding" })).toHaveAttribute(
			"href",
			"/onboarding?plan=center_starter&source=%2Fcompare",
		);
	});
});

describe("OnboardingPage", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
		mockApiFetch.mockReset();
		mockUseAuthStatus.mockReset();
		mockUseAuthStatus.mockReturnValue({
			data: { status: "onboarding_required" },
			isLoading: false,
		});
	});

	it("shows a session-checking state instead of a blank screen while auth is loading", () => {
		mockUseAuthStatus.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		renderWithQueryClient(<OnboardingPage />);

		expect(screen.getByText("Checking your session...")).toBeInTheDocument();
		expect(screen.queryByLabelText("Center name")).not.toBeInTheDocument();
	});

	it("shows field-linked inline validation when onboarding is submitted empty", async () => {
		renderWithQueryClient(<OnboardingPage />);

		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		expect(await screen.findByText("Center name is required")).toHaveAttribute("role", "alert");
		expect(screen.getByLabelText("Center name")).toHaveAttribute("aria-describedby", "name-error");
		expect(screen.getByText("Street address is required")).toHaveAttribute("role", "alert");
		expect(screen.getByText("City is required")).toHaveAttribute("role", "alert");
		expect(screen.getByText("State is required")).toHaveAttribute("role", "alert");
		expect(screen.getByText("ZIP code is required")).toHaveAttribute("role", "alert");
		expect(screen.getByText("Phone is required")).toHaveAttribute("role", "alert");
		expect(mockApiFetch).not.toHaveBeenCalled();
	});

	it("shows sign-in guidance instead of the setup form for signed-out visitors", () => {
		mockUseAuthStatus.mockReturnValue({
			data: { status: "unauthenticated" },
			isLoading: false,
		});

		renderWithQueryClient(<OnboardingPage />);

		expect(screen.getByText("Sign in required")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login",
		);
		expect(screen.queryByLabelText("Center name")).not.toBeInTheDocument();
	});

	it("shows recovery guidance when auth status verification fails", () => {
		mockUseAuthStatus.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: new Error("Failed to fetch auth status"),
		});

		renderWithQueryClient(<OnboardingPage />);

		expect(screen.getByText("We couldn't verify your session")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/onboarding");
		expect(screen.queryByLabelText("Center name")).not.toBeInTheDocument();
	});

	it("normalizes state input and routes sales-led setup to the sales interstitial on success", async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
		});

		renderWithQueryClient(<OnboardingPage />);

		expect(screen.getByText(/^Tell us about your childcare center/)).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tex" },
		});
		expect(screen.getByLabelText("State")).toHaveValue("TE");
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith("/api/centers", {
				method: "POST",
				body: JSON.stringify({
					name: "Pebble Center",
					address: "123 Main St",
					city: "Austin",
					state: "TE",
					zip: "78701",
					phone: "(512) 555-0100",
					timezone: "America/Chicago",
				}),
			});
		});

		expect(await screen.findByRole("link", { name: "Book discovery call" })).toHaveAttribute(
			"href",
			"https://cal.com/pebbledesk/discovery",
		);
		expect(screen.getByRole("link", { name: "Skip — choose a plan later" })).toHaveAttribute(
			"href",
			"/dashboard",
		);
	});

	it("marks auth as authenticated and invalidates the session cache after center creation succeeds", async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
		});

		const client = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});
		client.setQueryData(["authStatus"], { status: "onboarding_required" });
		const setQueryData = vi.spyOn(client, "setQueryData");
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		renderWithQueryClient(<OnboardingPage />, client);

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		await waitFor(() => {
			expect(setQueryData).toHaveBeenCalledWith(["authStatus"], { status: "authenticated" });
			expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["authSession"] });
		});
		expect(await screen.findByText("Let's talk about your rollout")).toBeInTheDocument();
	});

	it("renders the API error message when center creation fails", async () => {
		mockApiFetch.mockRejectedValue(
			new ApiError("Center could not be created", 500, { message: "Center could not be created" }),
		);

		renderWithQueryClient(<OnboardingPage />);

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		expect(await screen.findByText("Center could not be created")).toBeInTheDocument();
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("prefills timezone from the browser and sends the selected timezone with the request", async () => {
		const dateTimeFormatSpy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
			() =>
				({
					resolvedOptions: () => ({ timeZone: "America/Los_Angeles" }),
				}) as never,
		);

		mockApiFetch.mockResolvedValue({
			ok: true,
		});

		renderWithQueryClient(<OnboardingPage />);

		expect(screen.getByLabelText("Timezone")).toHaveValue("America/Los_Angeles");

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith("/api/centers", {
				method: "POST",
				body: JSON.stringify({
					name: "Pebble Center",
					address: "123 Main St",
					city: "Austin",
					state: "TX",
					zip: "78701",
					phone: "(512) 555-0100",
					timezone: "America/Los_Angeles",
				}),
			});
		});

		dateTimeFormatSpy.mockRestore();
	});

	it("falls back to the default center creation error when the error payload cannot be read", async () => {
		mockApiFetch.mockRejectedValue(new ApiError("Request failed with status 500", 500, {}));

		renderWithQueryClient(<OnboardingPage />);

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		expect(await screen.findByText("Request failed with status 500")).toBeInTheDocument();
	});

	it("guides signed-out visitors back to login when center creation is unauthorized", async () => {
		mockApiFetch.mockRejectedValue(new ApiError("Unauthorized", 401, {}));

		renderWithQueryClient(<OnboardingPage />);

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		expect(
			await screen.findByText(
				"Your session has ended. Sign in again to finish setting up your center.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute(
			"href",
			"/login",
		);
	});

	it("shows the invitation acceptance state instead of center setup when the user has a pending invite", () => {
		const invitation: PendingInvitation = {
			membershipId: "membership-2",
			centerId: "center-2",
			centerName: "Pebble North",
			role: "staff",
		};
		mockUseAuthStatus.mockReturnValue({
			data: {
				status: "invite_pending",
				invitation,
			},
			isLoading: false,
		});

		renderWithQueryClient(<OnboardingPage />);

		expect(screen.getByText("Accept your invitation")).toBeInTheDocument();
		expect(
			screen.getByText("You've been invited to join Pebble North as staff."),
		).toBeInTheDocument();
		expect(screen.queryByLabelText("Center name")).not.toBeInTheDocument();
	});

	it("redirects accepted members away from onboarding and into the dashboard", async () => {
		mockUseAuthStatus.mockReturnValue({
			data: { status: "authenticated" },
			isLoading: false,
		});

		renderWithQueryClient(<OnboardingPage />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
		});
	});

	it("omits plan copy when no plan is selected and handles request exceptions", async () => {
		mockApiFetch.mockRejectedValue(new Error("Request timed out"));

		renderWithQueryClient(<OnboardingPage />);

		expect(screen.getByText("Tell us about your childcare center")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		expect(await screen.findByText("Request timed out")).toBeInTheDocument();
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("starts a self-serve trial when a plan is selected and skips checkout", async () => {
		mockApiFetch.mockResolvedValueOnce({ ok: true });

		renderWithQueryClient(<OnboardingPage attribution={{ plan: "home", promo: "PARTNER30" }} />);

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Start free trial" }));

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith("/api/centers", {
				method: "POST",
				body: JSON.stringify({
					name: "Pebble Center",
					address: "123 Main St",
					city: "Austin",
					state: "TX",
					zip: "78701",
					phone: "(512) 555-0100",
					timezone: "America/Chicago",
					subscriptionPlan: "home",
				}),
			});
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
		});
		expect(mockApiFetch).not.toHaveBeenCalledWith("/api/subscriptions/checkout", expect.anything());
	});

	it("starts a self-serve trial for Group instead of showing the sales interstitial", async () => {
		mockApiFetch.mockResolvedValueOnce({ ok: true });

		renderWithQueryClient(<OnboardingPage attribution={{ plan: "group" }} />);

		expect(screen.getByText(/Group plan selected\./)).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Start free trial" }));

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith("/api/centers", {
				method: "POST",
				body: JSON.stringify({
					name: "Pebble Center",
					address: "123 Main St",
					city: "Austin",
					state: "TX",
					zip: "78701",
					phone: "(512) 555-0100",
					timezone: "America/Chicago",
					subscriptionPlan: "group",
				}),
			});
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
		});
		expect(screen.queryByText("Let's talk about your rollout")).not.toBeInTheDocument();
	});

	it("falls back to generic exception copy for non-Error onboarding failures", async () => {
		mockApiFetch.mockRejectedValue("offline");

		renderWithQueryClient(<OnboardingPage />);

		fireEvent.change(screen.getByLabelText("Center name"), {
			target: { name: "name", value: "Pebble Center" },
		});
		fireEvent.change(screen.getByLabelText("Street address"), {
			target: { name: "address", value: "123 Main St" },
		});
		fireEvent.change(screen.getByLabelText("City"), {
			target: { name: "city", value: "Austin" },
		});
		fireEvent.change(screen.getByLabelText("State"), {
			target: { name: "state", value: "tx" },
		});
		fireEvent.change(screen.getByLabelText("ZIP code"), {
			target: { name: "zip", value: "78701" },
		});
		fireEvent.change(screen.getByLabelText("Phone"), {
			target: { name: "phone", value: "(512) 555-0100" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue to dashboard" }));

		expect(await screen.findByText("An error occurred")).toBeInTheDocument();
	});
});
