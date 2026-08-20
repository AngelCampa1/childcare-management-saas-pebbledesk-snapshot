import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockSignInEmail = vi.fn();
const mockSignInSocial = vi.fn();
const mockSignUpEmail = vi.fn();
const mockApiFetch = vi.fn();

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
	};
});

vi.mock("../hooks/use-auth-status", () => {
	return {
		useAuthStatus: vi.fn(),
	};
});

vi.mock("@pebbledesk/auth/client", () => {
	return {
		createBetterAuthClient: () => ({
			signIn: {
				email: mockSignInEmail,
				social: mockSignInSocial,
			},
			signUp: {
				email: mockSignUpEmail,
			},
		}),
	};
});

vi.mock("../api", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const authStatusModule = await import("../hooks/use-auth-status");
const loginModule = await import("./login");
const { LoginPage, LoginRoutePage, validateLoginSearch } = loginModule;
const { SignupPage } = await import("./signup");

const mockUseAuthStatus = vi.mocked(authStatusModule.useAuthStatus);

function renderWithQueryClient(ui: ReactElement, client?: QueryClient) {
	const queryClient =
		client ??
		new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		});

	return {
		queryClient,
		...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
	};
}

function expectBrandMark() {
	// The signup page is split-screen and renders two brand marks (desktop left pane + mobile
	// right pane header), so we accept one or more. Login still renders exactly one.
	const wordmarks = screen.getAllByText("PebbleDesk");
	expect(wordmarks.length).toBeGreaterThanOrEqual(1);
	const first = wordmarks[0];
	expect(first?.closest("div")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
}

describe("public auth pages", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
		mockSignInEmail.mockReset();
		mockSignInSocial.mockReset();
		mockSignUpEmail.mockReset();
		mockApiFetch.mockReset();
		mockSignInEmail.mockResolvedValue({ error: null });
		mockSignInSocial.mockResolvedValue(undefined);
		mockSignUpEmail.mockResolvedValue({ error: null });
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ status: "authenticated" }),
		});
		mockUseAuthStatus.mockReset();
		mockUseAuthStatus.mockReturnValue({
			data: { status: "unauthenticated" },
			isLoading: false,
		});
	});

	it("renders the brand mark on the login shell", () => {
		renderWithQueryClient(<LoginPage />);

		expectBrandMark();
	});

	it("renders the brand mark on the signup shell", () => {
		renderWithQueryClient(<SignupPage />);

		expectBrandMark();
	});

	it("redirects authenticated users away from the login form", async () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: { status: "authenticated" },
			isLoading: false,
		});

		renderWithQueryClient(<LoginPage />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
		});
		expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
	});

	it("does not navigate a second time after the login redirect has already been handled", async () => {
		mockUseAuthStatus.mockReturnValue({
			data: { status: "authenticated" },
			isLoading: false,
		});

		const { queryClient, rerender } = renderWithQueryClient(<LoginPage redirect="/billing" />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/billing" });
		});

		rerender(
			<QueryClientProvider client={queryClient}>
				<LoginPage redirect="/billing?from=retry" />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledTimes(1);
		});
	});

	it("redirects center-selection-required users away from the login form into the center chooser", async () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: {
				status: "center_selection_required",
				centers: [{ centerId: "center-1", membershipId: "membership-1", role: "owner" }],
			},
			isLoading: false,
		});

		renderWithQueryClient(<LoginPage />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/overview" });
		});
		expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
	});

	it("redirects onboarding-required users away from the login form into onboarding", async () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: { status: "onboarding_required" },
			isLoading: false,
		});

		renderWithQueryClient(<LoginPage />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
		});
		expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
	});

	it("shows onboarding recovery when navigation fails for onboarding-required login", async () => {
		mockNavigate.mockRejectedValueOnce(new Error("Navigation failed"));
		mockUseAuthStatus.mockReturnValue({
			data: { status: "onboarding_required" },
			isLoading: false,
		});

		renderWithQueryClient(<LoginPage redirect="/billing" />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
		});
		// The heading and link both say "Continue onboarding", so query by role to avoid ambiguity.
		expect(await screen.findByRole("heading", { name: "Continue onboarding" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Continue onboarding" })).toHaveAttribute(
			"href",
			"/onboarding",
		);
	});

	it("redirects onboarding-required users from signup into onboarding", async () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: { status: "onboarding_required" },
			isLoading: false,
		});

		renderWithQueryClient(<SignupPage />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "/onboarding",
					replace: true,
					search: expect.any(Function),
				}),
			);
		});
		expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
	});

	it("redirects onboarding-required users from signup with attribution into onboarding", async () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: { status: "onboarding_required" },
			isLoading: false,
		});

		renderWithQueryClient(<SignupPage attribution={{ plan: "home", source: "/pricing" }} />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "/onboarding",
					replace: true,
					search: expect.any(Function),
				}),
			);
		});
	});

	it("redirects invited users away from the login form into onboarding", async () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: {
				status: "invite_pending",
				invitation: {
					membershipId: "membership_2",
					centerId: "center_2",
					centerName: "Pebble North",
					role: "staff",
				},
			},
			isLoading: false,
		});

		renderWithQueryClient(
			<LoginPage redirect="/onboarding?plan=center_starter&source=%2Fpricing" />,
		);

		await waitFor(() => {
			const navigateCall = mockNavigate.mock.calls.at(-1)?.[0];
			expect(navigateCall).toMatchObject({
				to: "/onboarding?plan=center_starter&source=%2Fpricing",
			});
		});
		expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
	});

	it("redirects invited users away from signup into onboarding", async () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: {
				status: "invite_pending",
				invitation: {
					membershipId: "membership_2",
					centerId: "center_2",
					centerName: "Pebble North",
					role: "staff",
				},
			},
			isLoading: false,
		});

		renderWithQueryClient(<SignupPage />);

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith(
				expect.objectContaining({
					to: "/onboarding",
					replace: true,
					search: expect.any(Function),
				}),
			);
		});
		expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
	});

	it("renders login fields with browser-friendly autocomplete hints", () => {
		renderWithQueryClient(<LoginPage />);

		expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
		expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
	});

	it("keeps the login form visible while auth status is loading", () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: undefined,
			isLoading: true,
		});

		renderWithQueryClient(<LoginPage />);

		expect(screen.getByLabelText("Email")).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeDisabled();
		expect(screen.getByLabelText("Password")).toBeDisabled();
		expect(screen.getByText("Checking your session...")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Checking session..." })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
	});

	it("shows recovery guidance when login cannot verify auth status", () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: undefined,
			error: new Error("Failed to fetch auth status"),
			isLoading: false,
		});

		renderWithQueryClient(<LoginPage redirect="/billing?tab=invoices" />);

		expect(screen.getByText("We couldn't verify your session")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
			"href",
			"/login?redirect=%2Fbilling%3Ftab%3Dinvoices",
		);
		expect(screen.getByRole("link", { name: "Back to PebbleDesk" })).toHaveAttribute(
			"href",
			"/billing?tab=invoices",
		);
	});

	it("preserves signup attribution on the login footer signup link", () => {
		renderWithQueryClient(
			<LoginPage redirect="/signup?plan=center_pro&source=%2Fpricing&utm_source=google&ref=ally" />,
		);

		expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
			"href",
			"/signup?plan=center_pro&source=%2Fpricing&utm_source=google&ref=ally",
		);
	});

	it("keeps the Google sign-in button out of the email form submit flow", () => {
		renderWithQueryClient(<LoginPage />);

		expect(screen.getByRole("button", { name: "Continue with Google" })).toHaveAttribute(
			"type",
			"button",
		);
	});

	it("primes authenticated auth status after email sign-in succeeds", async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		});
		mockSignInEmail.mockResolvedValueOnce({ error: null });

		renderWithQueryClient(<LoginPage />, queryClient);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(queryClient.getQueryData(["authStatus"])).toEqual({ status: "authenticated" });
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});

	it("confirms the returned login session through fresh auth status before routing", async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		});
		mockSignInEmail.mockResolvedValueOnce({ error: null });
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "authenticated",
				email: "director@example.com",
				emailVerified: true,
			}),
		});

		renderWithQueryClient(<LoginPage redirect="/billing" />, queryClient);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "director@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(mockSignInEmail).toHaveBeenCalledWith({
				email: "director@example.com",
				password: "password123",
			});
			expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/status");
			expect(queryClient.getQueryData(["authStatus"])).toEqual({
				status: "authenticated",
				email: "director@example.com",
				emailVerified: true,
			});
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/billing" });
		});
		expect(mockSignInEmail.mock.invocationCallOrder[0]).toBeLessThan(
			mockApiFetch.mock.invocationCallOrder[0],
		);
		expect(mockApiFetch.mock.invocationCallOrder[0]).toBeLessThan(
			mockNavigate.mock.invocationCallOrder[0],
		);
	});

	it("bypasses stale unauthenticated auth status cache after successful sign-in", async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false, staleTime: 60_000 },
			},
		});
		queryClient.setQueryData(["authStatus"], { status: "unauthenticated" });
		mockSignInEmail.mockResolvedValueOnce({ error: null });
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "authenticated",
				email: "director@example.com",
				emailVerified: true,
			}),
		});

		renderWithQueryClient(<LoginPage redirect="/dashboard" />, queryClient);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "director@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/status");
			expect(queryClient.getQueryData(["authStatus"])).toEqual({
				status: "authenticated",
				email: "director@example.com",
				emailVerified: true,
			});
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});

	it("returns onboarding-required sign-ins to onboarding after refreshing auth status", async () => {
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ status: "onboarding_required" }),
		});

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" });
		});
	});

	it("returns center-selection-required sign-ins to the center chooser after refreshing auth status", async () => {
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "center_selection_required",
				centers: [{ centerId: "center-1", membershipId: "membership-1", role: "owner" }],
			}),
		});

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/overview" });
		});
	});

	it("shows a visible error when sign-in succeeds but the refreshed auth state is still unauthenticated", async () => {
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ status: "unauthenticated" }),
		});

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		expect(
			await screen.findByText(
				"We signed you in, but couldn't confirm the session. Please try again.",
			),
		).toBeInTheDocument();
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("shows an error when sign-in succeeds but auth status refresh fails", async () => {
		mockApiFetch.mockResolvedValueOnce({
			ok: false,
		});

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		expect(await screen.findByText("Failed to fetch auth status")).toBeInTheDocument();
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("shows a loading state while Google sign-in starts", async () => {
		let resolveSignIn: (() => void) | null = null;
		mockSignInSocial.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				resolveSignIn = resolve;
			}),
		);

		renderWithQueryClient(<LoginPage />);

		fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

		expect(mockSignInSocial).toHaveBeenCalledWith({ provider: "google" });
		const loadingButton = screen.getByRole("button", { name: "Starting Google sign-in..." });
		expect(loadingButton).toBeDisabled();
		loadingButton.removeAttribute("disabled");
		fireEvent.click(loadingButton);
		expect(mockSignInSocial).toHaveBeenCalledTimes(1);

		resolveSignIn?.();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
		});
	});

	it("shows a visible error when Google sign-in fails", async () => {
		mockSignInSocial.mockRejectedValueOnce(new Error("Popup blocked"));

		renderWithQueryClient(<LoginPage />);

		fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

		expect(await screen.findByText("Popup blocked")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
	});

	it("shows a fallback error when Google sign-in rejects with a non-Error value", async () => {
		mockSignInSocial.mockRejectedValueOnce("string error");

		renderWithQueryClient(<LoginPage />);

		fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

		expect(await screen.findByText("Google sign-in failed")).toBeInTheDocument();
	});

	it("renders signup fields with browser-friendly autocomplete hints", () => {
		renderWithQueryClient(<SignupPage />);

		expect(screen.getByLabelText("Full name")).toHaveAttribute("autocomplete", "name");
		expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
		expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
	});

	it("keeps the signup form visible while auth status is loading", () => {
		mockUseAuthStatus.mockReturnValueOnce({
			data: undefined,
			isLoading: true,
		});

		renderWithQueryClient(<SignupPage />);

		expect(screen.getByLabelText("Full name")).toBeInTheDocument();
		expect(screen.getByLabelText("Full name")).toBeDisabled();
		expect(screen.getByLabelText("Email")).toBeDisabled();
		expect(screen.getByLabelText("Password")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Checking session..." })).toBeDisabled();
	});

	it("resets navigatedRef after a failed navigate so the redirect can be retried on login", async () => {
		mockNavigate.mockRejectedValueOnce(new Error("Navigation failed"));
		mockSignInEmail.mockResolvedValueOnce({ error: null });

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		// After the failed navigation, the form should be available again for retry
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalled();
		});
		// The button should be re-enabled (submittingRef is reset in finally)
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
		});
	});

	it("resets navigatedRef after a failed navigate so the redirect can be retried on signup", async () => {
		mockNavigate.mockRejectedValueOnce(new Error("Navigation failed"));
		const mockSignUpEmail = vi.fn().mockResolvedValueOnce({ error: null });

		vi.mocked(
			vi.fn(() => ({
				signIn: { email: mockSignInEmail, social: mockSignInSocial },
				signUp: { email: mockSignUpEmail },
			})),
		);

		// Reset to clear previous navigate calls
		mockNavigate.mockReset();
		mockNavigate.mockRejectedValueOnce(new Error("Navigation failed"));

		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create account" }));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Create account" })).not.toBeDisabled();
		});
	});

	it("ignores rapid double-clicks on Google sign-in button", async () => {
		let resolveFirst: (() => void) | null = null;
		mockSignInSocial.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				resolveFirst = resolve;
			}),
		);

		renderWithQueryClient(<LoginPage />);

		const googleButton = screen.getByRole("button", { name: "Continue with Google" });

		// First click
		fireEvent.click(googleButton);
		// Second rapid click — should be ignored
		fireEvent.click(googleButton);

		// Only one call should have been made despite two clicks
		expect(mockSignInSocial).toHaveBeenCalledTimes(1);

		resolveFirst?.();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
		});
	});

	it("declares a favicon asset in the app shell", () => {
		const indexHtml = readFileSync(resolve(import.meta.dirname, "../../index.html"), "utf8");
		const faviconSvg = readFileSync(
			resolve(import.meta.dirname, "../../public/favicon.svg"),
			"utf8",
		);

		expect(indexHtml).toContain('rel="icon"');
		expect(indexHtml).toContain('href="/favicon.svg"');
		expect(existsSync(resolve(import.meta.dirname, "../../public/favicon.svg"))).toBe(true);
		expect(faviconSvg).toContain("#6f8b72");
		expect(faviconSvg).toContain("#243446");
		expect(faviconSvg).toContain("#d97b67");
		expect(faviconSvg).not.toContain("#1f4b3f");
	});

	it("shows a field validation error when password is empty", async () => {
		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		// Leave password empty — triggers zod validation error
		const form364 = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form364 == null) throw new Error("expected form element");
		fireEvent.submit(form364);

		expect(await screen.findByText("Password is required")).toBeInTheDocument();
		expect(mockSignInEmail).not.toHaveBeenCalled();
	});

	it("shows a server error when sign-in returns an error response", async () => {
		mockSignInEmail.mockResolvedValueOnce({ error: { message: "Invalid credentials" } });

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "wrongpassword" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("falls back to generic error message when sign-in error has no message", async () => {
		mockSignInEmail.mockResolvedValueOnce({ error: { message: null } });

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "wrongpassword" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
	});

	it("surfaces the server message for a non-429 status code instead of the rate-limit copy", async () => {
		mockSignInEmail.mockResolvedValueOnce({ error: { status: 401, message: "Bad password" } });

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "wrongpassword" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		expect(await screen.findByText("Bad password")).toBeInTheDocument();
		expect(
			screen.queryByText("Too many sign-in attempts. Please wait a moment and try again."),
		).not.toBeInTheDocument();
	});

	it("shows a rate-limit message when sign-in returns 429", async () => {
		mockSignInEmail.mockResolvedValueOnce({ error: { status: 429, message: null } });

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "wrongpassword" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		expect(
			await screen.findByText("Too many sign-in attempts. Please wait a moment and try again."),
		).toBeInTheDocument();
	});

	it("navigates to the sanitized redirect path after successful sign-in with a redirect param", async () => {
		mockSignInEmail.mockResolvedValueOnce({ error: null });

		renderWithQueryClient(<LoginPage redirect="/billing" />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/billing" });
		});
	});

	it("navigates to /dashboard when redirect param is an external URL", async () => {
		mockSignInEmail.mockResolvedValueOnce({ error: null });

		renderWithQueryClient(<LoginPage redirect="https://evil.com" />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
		});
	});

	it("ignores rapid double-clicks on the Sign in button", async () => {
		let resolveSignIn: ((val: { error: null }) => void) | null = null;
		mockSignInEmail.mockReturnValueOnce(
			new Promise<{ error: null }>((resolve) => {
				resolveSignIn = resolve;
			}),
		);

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});

		const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);
		// Second rapid submit — should be ignored
		fireEvent.submit(form);

		expect(mockSignInEmail).toHaveBeenCalledTimes(1);

		resolveSignIn?.({ error: null });

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledTimes(1);
		});
	});

	it("shows a generic error message when sign-in throws an unexpected exception", async () => {
		mockSignInEmail.mockRejectedValueOnce(new Error("Network error"));

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		expect(await screen.findByText("Network error")).toBeInTheDocument();
	});

	it("shows a fallback error when the thrown exception is not an Error instance", async () => {
		mockSignInEmail.mockRejectedValueOnce("string error");

		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		expect(await screen.findByText("An error occurred")).toBeInTheDocument();
	});

	// --- Per-field validation error UX: LoginPage ---

	it("login: shows per-field error with id and role=alert when email is invalid", async () => {
		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "not-an-email" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "somepassword" },
		});
		const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		const emailError = await screen.findByText("Please enter a valid email address");
		expect(emailError).toHaveAttribute("role", "alert");
		expect(emailError).toHaveAttribute("id", "email-error");
		expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByLabelText("Email")).toHaveAttribute("aria-describedby", "email-error");
		expect(mockSignInEmail).not.toHaveBeenCalled();
	});

	it("login: shows per-field error for password when password is empty", async () => {
		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		// Leave password empty
		const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		const passwordError = await screen.findByText("Password is required");
		expect(passwordError).toHaveAttribute("role", "alert");
		expect(passwordError).toHaveAttribute("id", "password-error");
		expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", "password-error");
		expect(mockSignInEmail).not.toHaveBeenCalled();
	});

	it("login: shows per-field errors for multiple invalid fields simultaneously", async () => {
		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "bad-email" },
		});
		// Leave password empty
		const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
		expect(await screen.findByText("Password is required")).toBeInTheDocument();
		expect(mockSignInEmail).not.toHaveBeenCalled();
	});

	it("login: typing in email field clears the email error and aria-invalid", async () => {
		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "bad-email" },
		});
		const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		await screen.findByText("Please enter a valid email address");

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "fixed@example.com" },
		});

		expect(screen.queryByText("Please enter a valid email address")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid", "true");
	});

	it("login: typing in password field clears the password error and aria-invalid", async () => {
		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		await screen.findByText("Password is required");

		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "newpassword" },
		});

		expect(screen.queryByText("Password is required")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid", "true");
	});

	it("login: does not show generic error alert for validation failures", async () => {
		renderWithQueryClient(<LoginPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "bad-email" },
		});
		const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		await screen.findByText("Please enter a valid email address");

		// The generic error container (with border-destructive/20 classes) should not be visible
		// The per-field errors use role="alert" with an id; the generic error also uses role="alert"
		// but has aria-live="polite" — verify it is absent
		const alerts = screen.queryAllByRole("alert");
		for (const alert of alerts) {
			expect(alert).not.toHaveAttribute("aria-live", "polite");
		}
	});

	it("login: clears field errors when validation succeeds and submit proceeds", async () => {
		renderWithQueryClient(<LoginPage />);

		// First trigger a field error
		const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);
		await screen.findByText("Please enter a valid email address");

		// Now provide valid data and submit
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "password123" },
		});
		fireEvent.submit(form);

		await waitFor(() => {
			expect(screen.queryByText("Please enter a valid email address")).not.toBeInTheDocument();
		});
		expect(mockSignInEmail).toHaveBeenCalled();
	});

	// --- Per-field validation error UX: SignupPage ---

	it("signup: shows per-field error with id and role=alert when name is empty", async () => {
		renderWithQueryClient(<SignupPage />);

		// Leave name empty, provide email and password
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "Str0ngPassw0rd!" },
		});
		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		const nameError = await screen.findByText("Full name is required");
		expect(nameError).toHaveAttribute("role", "alert");
		expect(nameError).toHaveAttribute("id", "name-error");
		expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-describedby", "name-error");
		expect(mockSignUpEmail).not.toHaveBeenCalled();
	});

	it("signup: shows per-field error when email is invalid", async () => {
		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "not-an-email" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "Str0ngPassw0rd!" },
		});
		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		const emailError = await screen.findByText("Please enter a valid email address");
		expect(emailError).toHaveAttribute("role", "alert");
		expect(emailError).toHaveAttribute("id", "email-error");
		expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByLabelText("Email")).toHaveAttribute("aria-describedby", "email-error");
		expect(mockSignUpEmail).not.toHaveBeenCalled();
	});

	it("signup: shows per-field error when password is too short", async () => {
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
		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		const passwordError = await screen.findByText("Password must be at least 8 characters");
		expect(passwordError).toHaveAttribute("role", "alert");
		expect(passwordError).toHaveAttribute("id", "password-error");
		expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", "password-error");
		expect(mockSignUpEmail).not.toHaveBeenCalled();
	});

	it("signup: shows per-field errors for multiple invalid fields simultaneously", async () => {
		renderWithQueryClient(<SignupPage />);

		// Leave all fields invalid
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "bad" },
		});
		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		expect(await screen.findByText("Full name is required")).toBeInTheDocument();
		expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
		expect(mockSignUpEmail).not.toHaveBeenCalled();
	});

	it("signup: typing in name field clears the name error and aria-invalid", async () => {
		renderWithQueryClient(<SignupPage />);

		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		await screen.findByText("Full name is required");

		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});

		expect(screen.queryByText("Full name is required")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Full name")).not.toHaveAttribute("aria-invalid", "true");
	});

	it("signup: typing in email field clears the email error and aria-invalid", async () => {
		renderWithQueryClient(<SignupPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "bad" },
		});
		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		await screen.findByText("Please enter a valid email address");

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "good@example.com" },
		});

		expect(screen.queryByText("Please enter a valid email address")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid", "true");
	});

	it("signup: typing in password field clears the password error and aria-invalid", async () => {
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
		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		await screen.findByText("Password must be at least 8 characters");

		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "longerpassword" },
		});

		expect(screen.queryByText("Password must be at least 8 characters")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid", "true");
	});

	it("signup: does not show generic error alert for validation failures", async () => {
		renderWithQueryClient(<SignupPage />);

		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");
		fireEvent.submit(form);

		await screen.findByText("Full name is required");

		const alerts = screen.queryAllByRole("alert");
		for (const alert of alerts) {
			expect(alert).not.toHaveAttribute("aria-live", "polite");
		}
	});

	it("signup: clears field errors when validation succeeds and submit proceeds", async () => {
		renderWithQueryClient(<SignupPage />);

		const form = screen.getByRole("button", { name: "Create account" }).closest("form");
		if (form == null) throw new Error("expected form element");

		// Trigger field errors first
		fireEvent.submit(form);
		await screen.findByText("Full name is required");

		// Now fill valid data and resubmit
		fireEvent.change(screen.getByLabelText("Full name"), {
			target: { value: "Jane Smith" },
		});
		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "jane@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "Str0ngPassw0rd!" },
		});
		fireEvent.submit(form);

		await waitFor(() => {
			expect(screen.queryByText("Full name is required")).not.toBeInTheDocument();
		});
		expect(mockSignUpEmail).toHaveBeenCalled();
	});
});

describe("validateLoginSearch", () => {
	it("extracts a string redirect param", () => {
		expect(validateLoginSearch({ redirect: "/billing" })).toEqual({ redirect: "/billing" });
	});

	it("returns undefined redirect when param is missing", () => {
		expect(validateLoginSearch({})).toEqual({ redirect: undefined });
	});

	it("returns undefined redirect when param is not a string", () => {
		expect(validateLoginSearch({ redirect: 42 })).toEqual({ redirect: undefined });
	});
});

describe("LoginRoutePage", () => {
	it("renders LoginPage with the redirect from Route.useSearch", () => {
		const useSearchSpy = vi.spyOn(loginModule.Route, "useSearch").mockReturnValue({
			redirect: "/billing",
		});

		renderWithQueryClient(<LoginRoutePage />);

		expect(useSearchSpy).toHaveBeenCalled();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();

		useSearchSpy.mockRestore();
	});
});
