import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { EmailConfirmationReminder } from "./email-confirmation-reminder";

vi.mock("../api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../api")>();
	return {
		...actual,
		apiFetch: vi.fn(),
	};
});

const mockApiFetch = vi.mocked(apiFetch);

describe("EmailConfirmationReminder", () => {
	beforeEach(() => {
		mockApiFetch.mockReset();
	});

	it("does not render when the user is already verified", () => {
		const { container } = render(
			<EmailConfirmationReminder emailVerified email="owner@example.com" />,
		);

		expect(container.firstChild).toBeNull();
	});

	it("renders resend guidance for unverified users", () => {
		render(<EmailConfirmationReminder emailVerified={false} email="owner@example.com" />);

		expect(screen.getByText("Confirm your email")).toBeInTheDocument();
		expect(screen.getByText(/owner@example.com/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Resend email" })).toBeInTheDocument();
	});

	it("calls the resend endpoint and shows success copy", async () => {
		mockApiFetch.mockResolvedValueOnce({ ok: true } as Response);

		render(<EmailConfirmationReminder emailVerified={false} email="owner@example.com" />);
		fireEvent.click(screen.getByRole("button", { name: "Resend email" }));

		await waitFor(() => {
			expect(mockApiFetch).toHaveBeenCalledWith("/api/auth/resend-verification", {
				method: "POST",
			});
		});
		expect(await screen.findByText("Confirmation email sent.")).toBeInTheDocument();
	});

	it("shows an error when resend fails", async () => {
		mockApiFetch.mockRejectedValueOnce(new Error("Too many requests"));

		render(<EmailConfirmationReminder emailVerified={false} email="owner@example.com" />);
		fireEvent.click(screen.getByRole("button", { name: "Resend email" }));

		expect(await screen.findByText("Too many requests")).toBeInTheDocument();
	});
});
