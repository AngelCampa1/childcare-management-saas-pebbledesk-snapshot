import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockRequestPasswordReset = vi.fn();
const mockResetPassword = vi.fn();
let mockResetToken: string | undefined = "test-token-abc";

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
			useSearch: () => ({ token: mockResetToken }),
		}),
	};
});

vi.mock("@pebbledesk/auth/client", () => ({
	createBetterAuthClient: () => ({
		requestPasswordReset: mockRequestPasswordReset,
		resetPassword: mockResetPassword,
	}),
}));

vi.mock("../lib/api-origin", () => ({
	resolveApiBaseUrl: () => "",
}));

vi.mock("../lib/zxcvbn-init", () => ({
	// Return a low score for simple/numeric passwords, high score for complex ones
	zxcvbn: (pw: string) => ({
		score: /^\d+$/.test(pw) || pw.length < 8 ? 0 : 3,
		feedback: { suggestions: [], warning: "" },
	}),
}));

function createWrapper() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

function renderReset(ui: React.ReactElement) {
	return render(ui, { wrapper: createWrapper() });
}

const { ForgotPasswordPage } = await import("./forgot-password");
const { ResetPasswordPage } = await import("./reset-password");

describe("ForgotPasswordPage", () => {
	beforeEach(() => {
		mockRequestPasswordReset.mockReset();
	});

	it("renders the form with an email field and submit button", () => {
		render(<ForgotPasswordPage />);

		expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
	});

	it("shows a success message after a valid submission", async () => {
		mockRequestPasswordReset.mockResolvedValue(undefined);

		render(<ForgotPasswordPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "user@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

		expect(await screen.findByText("Check your email for a reset link.")).toBeInTheDocument();
		expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
		expect(mockRequestPasswordReset).toHaveBeenCalledWith({
			email: "user@example.com",
			redirectTo: "/reset-password",
		});
	});

	it("shows a 'Back to sign in' link on the success state", async () => {
		mockRequestPasswordReset.mockResolvedValue(undefined);

		render(<ForgotPasswordPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "user@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

		await screen.findByText("Check your email for a reset link.");
		expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
	});

	it("shows an error message when the request fails", async () => {
		mockRequestPasswordReset.mockRejectedValue(new Error("Email not found"));

		render(<ForgotPasswordPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "unknown@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

		expect(await screen.findByText("Email not found")).toBeInTheDocument();
		expect(mockRequestPasswordReset).toHaveBeenCalled();
	});

	it("shows an inline error before submitting when email is empty", async () => {
		render(<ForgotPasswordPage />);

		fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Please enter your email address");
		expect(mockRequestPasswordReset).not.toHaveBeenCalled();
	});

	it("falls back to generic error copy for non-Error throws", async () => {
		mockRequestPasswordReset.mockRejectedValue("network error");

		render(<ForgotPasswordPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "user@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

		expect(await screen.findByText("An error occurred. Please try again.")).toBeInTheDocument();
	});

	it("shows a loading state while the request is in flight", async () => {
		let resolve: (() => void) | null = null;
		mockRequestPasswordReset.mockReturnValue(
			new Promise<void>((res) => {
				resolve = res;
			}),
		);

		render(<ForgotPasswordPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "user@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

		expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
		expect(screen.getByLabelText("Email")).toBeDisabled();

		resolve?.();

		// After success the form is replaced by the success message
		await waitFor(() => {
			expect(screen.getByText("Check your email for a reset link.")).toBeInTheDocument();
		});
	});

	it("ignores rapid double-clicks", async () => {
		let resolve: (() => void) | null = null;
		mockRequestPasswordReset.mockReturnValue(
			new Promise<void>((res) => {
				resolve = res;
			}),
		);

		render(<ForgotPasswordPage />);

		fireEvent.change(screen.getByLabelText("Email"), {
			target: { value: "user@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
		fireEvent.click(screen.getByRole("button", { name: "Sending..." }));

		expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);

		resolve?.();

		// After success, the form switches to the success state
		await waitFor(() => {
			expect(screen.getByText("Check your email for a reset link.")).toBeInTheDocument();
		});
	});
});

describe("ResetPasswordPage", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
		mockResetPassword.mockReset();
		mockResetToken = "test-token-abc";
	});

	it("renders the form with new-password and confirm-password fields", () => {
		renderReset(<ResetPasswordPage />);

		expect(screen.getByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
		expect(screen.getByLabelText("New password")).toBeInTheDocument();
		expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
	});

	it("renders PebbleDesk branding on invalid reset links", () => {
		mockResetToken = undefined;

		renderReset(<ResetPasswordPage />);

		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Invalid reset link" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Request a new reset link" })).toHaveAttribute(
			"href",
			"/forgot-password",
		);
	});

	it("calls resetPassword and navigates to /login on success", async () => {
		mockResetPassword.mockResolvedValue(undefined);

		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		await waitFor(() => {
			expect(mockResetPassword).toHaveBeenCalledWith({
				newPassword: "newSecurePass1!",
				token: "test-token-abc",
			});
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
		});
	});

	it("invalidates authStatus and authSession queries before redirecting on success", async () => {
		mockResetPassword.mockResolvedValue(undefined);
		mockNavigate.mockResolvedValue(undefined);

		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

		render(<ResetPasswordPage />, {
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			),
		});

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		await waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["authStatus"] });
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["authSession"] });
		});
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
	});

	it("shows an error when passwords do not match", async () => {
		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "differentSecurePass2!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
		expect(mockResetPassword).not.toHaveBeenCalled();
	});

	it("shows an error when the password is too weak", async () => {
		renderReset(<ResetPasswordPage />);

		// "12345678" scores 0 with zxcvbn — well below the threshold of 2
		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "12345678" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "12345678" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		expect(await screen.findByText("Pick a stronger password")).toBeInTheDocument();
		expect(mockResetPassword).not.toHaveBeenCalled();
	});

	it("shows an error when the password is too short", async () => {
		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "short" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "short" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
		expect(mockResetPassword).not.toHaveBeenCalled();
	});

	it("shows an error when the API call fails", async () => {
		mockResetPassword.mockRejectedValue(new Error("Token expired"));

		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		expect(await screen.findByText("Token expired")).toBeInTheDocument();
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("falls back to generic error copy for non-Error throws", async () => {
		mockResetPassword.mockRejectedValue("network_error");

		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		expect(await screen.findByText("An error occurred. Please try again.")).toBeInTheDocument();
	});

	it("shows a loading state while the request is in flight", async () => {
		let resolve: (() => void) | null = null;
		mockResetPassword.mockReturnValue(
			new Promise<void>((res) => {
				resolve = res;
			}),
		);

		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		expect(screen.getByRole("button", { name: "Resetting..." })).toBeDisabled();

		resolve?.();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Reset password" })).not.toBeDisabled();
		});
	});

	it("ignores rapid double-clicks", async () => {
		let resolve: (() => void) | null = null;
		mockResetPassword.mockReturnValue(
			new Promise<void>((res) => {
				resolve = res;
			}),
		);

		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
		fireEvent.click(screen.getByRole("button", { name: "Resetting..." }));

		expect(mockResetPassword).toHaveBeenCalledTimes(1);

		resolve?.();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Reset password" })).not.toBeDisabled();
		});
	});

	it("disables both password inputs while the reset request is in flight", async () => {
		let resolve: (() => void) | null = null;
		mockResetPassword.mockReturnValue(
			new Promise<void>((res) => {
				resolve = res;
			}),
		);

		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		expect(screen.getByLabelText("New password")).toBeDisabled();
		expect(screen.getByLabelText("Confirm password")).toBeDisabled();

		resolve?.();

		await waitFor(() => {
			expect(screen.getByLabelText("New password")).not.toBeDisabled();
			expect(screen.getByLabelText("Confirm password")).not.toBeDisabled();
		});
	});

	it("shows an error and does not navigate when the navigate call rejects after a successful reset", async () => {
		mockResetPassword.mockResolvedValue(undefined);
		mockNavigate.mockRejectedValueOnce(new Error("Navigation failed"));

		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "newSecurePass1!" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		expect(
			await screen.findByText("Could not redirect. Please go to login manually."),
		).toBeInTheDocument();
	});

	it("renders the password strength meter below the new password field", () => {
		renderReset(<ResetPasswordPage />);

		// The strength meter renders four bars (data-testid="strength-bar")
		const bars = screen.getAllByTestId("strength-bar");
		expect(bars.length).toBe(4);
	});

	it("error alert has role=alert and aria-live=polite", async () => {
		renderReset(<ResetPasswordPage />);

		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "12345678" },
		});
		fireEvent.change(screen.getByLabelText("Confirm password"), {
			target: { value: "12345678" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveAttribute("aria-live", "polite");
	});
});
