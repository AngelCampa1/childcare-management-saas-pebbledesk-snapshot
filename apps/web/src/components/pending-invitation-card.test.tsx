import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingInvitationCard } from "./pending-invitation-card";

const { mockApiFetch, mockSignOut, mockNavigate, mockToastSuccess, mockToastError, mockToastInfo } =
	vi.hoisted(() => ({
		mockApiFetch: vi.fn(),
		mockSignOut: vi.fn(),
		mockNavigate: vi.fn(),
		mockToastSuccess: vi.fn(),
		mockToastError: vi.fn(),
		mockToastInfo: vi.fn(),
	}));

vi.mock("../api", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("@pebbledesk/auth/client", () => ({
	createBetterAuthClient: () => ({
		signOut: mockSignOut,
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
}));

vi.mock("../lib/toast", () => ({
	toast: {
		success: (...args: unknown[]) => mockToastSuccess(...args),
		error: (...args: unknown[]) => mockToastError(...args),
		info: (...args: unknown[]) => mockToastInfo(...args),
	},
}));

describe("PendingInvitationCard", () => {
	beforeEach(() => {
		mockApiFetch.mockReset();
		mockSignOut.mockReset();
		mockNavigate.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();
		mockToastInfo.mockReset();
	});

	it("invalidates both auth session and auth status after accepting an invite", async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ membership: { id: "membership-2" } }),
		});

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		});
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-2",
						centerId: "center-2",
						centerName: "Pebble North",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

		await waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["authSession"] });
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["authStatus"] });
		});
	});

	it("offers a way to switch accounts from the full-page invitation state", async () => {
		mockSignOut.mockResolvedValue(undefined);

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		});
		client.setQueryData(["authStatus"], {
			status: "invite_pending",
			invitation: {
				membershipId: "membership-2",
				centerId: "center-2",
				centerName: "Pebble North",
				role: "staff",
			},
		});

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-2",
						centerId: "center-2",
						centerName: "Pebble North",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Use a different account" }));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalled();
			expect(client.getQueryData(["authStatus"])).toEqual({ status: "unauthenticated" });
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
		});
	});

	it("surfaces a sign-out error when signOut rejects", async () => {
		mockSignOut.mockRejectedValue(new Error("oauth session expired"));

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-2",
						centerId: "center-2",
						centerName: "Pebble North",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Use a different account" }));

		await waitFor(() => {
			expect(screen.getByText(/failed to sign out\. please try again/i)).toBeInTheDocument();
		});

		// Navigation should NOT have been attempted if sign-out failed
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("does not show an error when signOut succeeds but navigate rejects", async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockNavigate.mockReturnValue(Promise.reject(new Error("route not found")));

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-2",
						centerId: "center-2",
						centerName: "Pebble North",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Use a different account" }));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalled();
			expect(client.getQueryData(["authStatus"])).toEqual({ status: "unauthenticated" });
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
		});

		// Give the navigation rejection a tick to surface before asserting "no error"
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(screen.queryByText(/failed to sign out/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/failed to switch accounts/i)).not.toBeInTheDocument();
	});

	it("shows a success toast after accepting an invitation", async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-1",
						centerId: "center-1",
						centerName: "Test Center",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

		await waitFor(() => {
			expect(mockToastSuccess).toHaveBeenCalledWith("Invitation accepted. Welcome to the center!");
		});
	});

	it("optimistically clears the pending invitation from the authSession cache on mutate", async () => {
		// The server call will hang — we just want to verify the optimistic update fires immediately
		let resolveRequest: () => void;
		mockApiFetch.mockReturnValue(
			new Promise<Response>((resolve) => {
				resolveRequest = () =>
					resolve({
						ok: true,
						json: async () => ({}),
					} as Response);
			}),
		);

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(["authSession"], {
			membership: { centerId: "center-1" },
			pendingInvitation: { membershipId: "membership-1", centerName: "Test Center", role: "staff" },
		});

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-1",
						centerId: "center-1",
						centerName: "Test Center",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

		await waitFor(() => {
			const session = client.getQueryData<Record<string, unknown>>(["authSession"]);
			expect(session?.pendingInvitation).toBeUndefined();
		});

		// Resolve so cleanup can happen (resolveRequest is always set before waitFor resolves)
		resolveRequest?.();
	});

	it("navigates to /dashboard after accepting an invitation", async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-1",
						centerId: "center-1",
						centerName: "Test Center",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
		});
	});

	it("surfaces a recovery toast when post-accept navigation rejects", async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});
		mockNavigate.mockReturnValue(Promise.reject(new Error("route not found")));

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-1",
						centerId: "center-1",
						centerName: "Test Center",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

		await waitFor(() => {
			expect(mockToastSuccess).toHaveBeenCalled();
		});

		// The navigation rejection must surface a recovery path instead of being swallowed.
		await waitFor(() => {
			expect(mockToastInfo).toHaveBeenCalledWith(
				"You're in! Reload the page to open your dashboard.",
			);
		});

		expect(warnSpy).toHaveBeenCalledWith(
			"[pending-invitation] post-accept navigation failed",
			expect.any(Error),
		);
		// The accept itself succeeded, so no destructive error banner should appear.
		expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();

		warnSpy.mockRestore();
	});

	it("rolls back the optimistic update on accept error", async () => {
		mockApiFetch.mockResolvedValue({
			ok: false,
			json: async () => ({ error: "Server error" }),
		});

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const originalInvitation = {
			membershipId: "membership-1",
			centerName: "Test Center",
			role: "staff",
		};
		client.setQueryData(["authSession"], {
			membership: { centerId: "center-1" },
			pendingInvitation: originalInvitation,
		});

		render(
			<QueryClientProvider client={client}>
				<PendingInvitationCard
					invitation={{
						membershipId: "membership-1",
						centerId: "center-1",
						centerName: "Test Center",
						role: "staff",
					}}
				/>
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

		await waitFor(() => {
			// Error message should be visible
			expect(screen.getByText("Server error")).toBeInTheDocument();
		});

		// The session should be rolled back to include the pending invitation again
		const session = client.getQueryData<Record<string, unknown>>(["authSession"]);
		expect(session?.pendingInvitation).toEqual(originalInvitation);
	});
});
