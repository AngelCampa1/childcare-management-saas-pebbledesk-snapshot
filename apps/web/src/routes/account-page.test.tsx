import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockChangePassword = vi.fn();
const mockDeleteUser = vi.fn();
const mockUseAuthSession = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => () => ({}),
		Link: ({
			to,
			children,
			...props
		}: {
			to: string;
			children: React.ReactNode;
			[key: string]: unknown;
		}) => React.createElement("a", { href: to, ...props }, children),
		useNavigate: () => mockNavigate,
	};
});

vi.mock("@pebbledesk/auth/client", () => ({
	createBetterAuthClient: () => ({
		changePassword: mockChangePassword,
		deleteUser: mockDeleteUser,
	}),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: () => mockUseAuthSession(),
}));

const { AccountPage } = await import("./_auth/account");

describe("AccountPage", () => {
	beforeEach(() => {
		mockChangePassword.mockReset();
		mockDeleteUser.mockReset();
		mockNavigate.mockReset();
		mockUseAuthSession.mockReturnValue({
			data: {
				user: {
					id: "user-1",
					name: "Taylor Reed",
					email: "taylor@example.com",
				},
			},
			isLoading: false,
		});
		mockDeleteUser.mockResolvedValue({ data: {} });
	});

	it("renders account identity and guarded account deletion", () => {
		render(<AccountPage />);

		expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
		expect(screen.getByText("Taylor Reed")).toBeInTheDocument();
		expect(screen.getByText("taylor@example.com")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Account deletion" })).toBeInTheDocument();
		expect(screen.getByText(/Leave all centers before deleting your account/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
	});

	it("gives each password form a hidden username field bound to the account email", () => {
		// Password managers and assistive tech need an autocomplete=username field
		// in the same form to associate the saved credential with the account.
		// One belongs to the change-password form, one to the account-deletion form.
		const { container } = render(<AccountPage />);

		const usernameFields = container.querySelectorAll<HTMLInputElement>(
			'input[autocomplete="username"]',
		);
		expect(usernameFields).toHaveLength(2);
		for (const field of usernameFields) {
			expect(field).toHaveValue("taylor@example.com");
			expect(field.closest("form")).not.toBeNull();
			expect(field.readOnly).toBe(true);
		}
	});

	it("requires DELETE confirmation before deleting the account", async () => {
		render(<AccountPage />);

		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "current-password" },
		});
		fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
			target: { value: "delete" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Type DELETE to confirm account deletion.",
		);
		expect(mockDeleteUser).not.toHaveBeenCalled();
	});

	it("deletes the account and redirects to login", async () => {
		render(<AccountPage />);

		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: " current-password " },
		});
		fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
			target: { value: "DELETE" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

		await waitFor(() =>
			expect(mockDeleteUser).toHaveBeenCalledWith({
				password: " current-password ",
			}),
		);
		expect(mockNavigate).toHaveBeenCalledWith({ to: "/login", replace: true });
	});

	it("shows account deletion failures near the deletion form", async () => {
		mockDeleteUser.mockResolvedValue({
			error: { message: "Leave all centers before deleting your account." },
		});
		render(<AccountPage />);

		fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
			target: { value: "DELETE" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

		expect(
			await screen.findByText("Leave all centers before deleting your account."),
		).toBeInTheDocument();
		expect(screen.getByLabelText("Type DELETE to confirm").closest("form")).toHaveTextContent(
			"Leave all centers before deleting your account.",
		);
	});

	it("changes the password and revokes other sessions", async () => {
		mockChangePassword.mockResolvedValue({ data: {} });
		render(<AccountPage />);

		fireEvent.change(screen.getByLabelText("Current password"), {
			target: { value: "old-password" },
		});
		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "new-password-123" },
		});
		fireEvent.change(screen.getByLabelText("Confirm new password"), {
			target: { value: "new-password-123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Update password" }));

		await waitFor(() =>
			expect(mockChangePassword).toHaveBeenCalledWith({
				currentPassword: "old-password",
				newPassword: "new-password-123",
				revokeOtherSessions: true,
			}),
		);
		expect(
			await screen.findByText("Password updated. Other sessions were signed out."),
		).toBeInTheDocument();
		expect(screen.getByLabelText("Current password")).toHaveValue("");
	});

	it("announces password changes and explains Google-only sign-ins", async () => {
		mockChangePassword.mockResolvedValue({ data: {} });
		render(<AccountPage />);

		expect(screen.getByText(/If you only sign in with Google/i)).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Current password"), {
			target: { value: "old-password" },
		});
		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "new-password-123" },
		});
		fireEvent.change(screen.getByLabelText("Confirm new password"), {
			target: { value: "new-password-123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Update password" }));

		expect(await screen.findByRole("status")).toHaveTextContent(
			"Password updated. Other sessions were signed out.",
		);
	});

	it("validates the password confirmation before calling Better Auth", async () => {
		render(<AccountPage />);

		fireEvent.change(screen.getByLabelText("Current password"), {
			target: { value: "old-password" },
		});
		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "new-password-123" },
		});
		fireEvent.change(screen.getByLabelText("Confirm new password"), {
			target: { value: "different-password" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Update password" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"New password and confirmation must match.",
		);
		expect(mockChangePassword).not.toHaveBeenCalled();
	});

	it("shows Better Auth password change failures", async () => {
		mockChangePassword.mockResolvedValue({
			error: { message: "Current password is incorrect." },
		});
		render(<AccountPage />);

		fireEvent.change(screen.getByLabelText("Current password"), {
			target: { value: "wrong-password" },
		});
		fireEvent.change(screen.getByLabelText("New password"), {
			target: { value: "new-password-123" },
		});
		fireEvent.change(screen.getByLabelText("Confirm new password"), {
			target: { value: "new-password-123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Update password" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect.");
	});
});
