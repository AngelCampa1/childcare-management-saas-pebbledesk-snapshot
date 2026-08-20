import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
import { useInviteMember, useMembers, useRemoveMember } from "./use-members";

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../api")>();
	return {
		...actual,
		apiFetch: vi.fn(),
	};
});

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);
const mockedToast = vi.mocked(toast);

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

function createWrapperWithClient() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	}

	return { client, Wrapper };
}

function createResponse<T>(payload: T, ok = true) {
	return {
		ok,
		json: async () => payload,
	} as Response;
}

describe("useMembers", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("rejects a malformed roster payload that is missing the members array", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notMembers: [] }));

		const { result } = renderHook(() => useMembers(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("loads the center roster", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				members: [
					{
						id: "membership-1",
						centerId: "center-1",
						userId: "user-1",
						role: "director",
						joinedAt: "2026-04-01T08:00:00.000Z",
						acceptedAt: "2026-04-01T08:00:00.000Z",
						invitedAt: null,
						userName: "Jamie Rivera",
						userEmail: "jamie@example.com",
					},
				],
			}),
		);

		const { result } = renderHook(() => useMembers(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/members");
		expect(result.current.data?.[0]?.userName).toBe("Jamie Rivera");
	});

	it("throws when the roster request fails", async () => {
		mockedApiFetch.mockRejectedValueOnce(new ApiError("boom", 500, { error: "boom" }));

		const { result } = renderHook(() => useMembers(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toEqual(new Error("boom"));
	});
});

describe("useInviteMember", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("shows a success toast after a successful invitation", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				membership: {
					id: "membership-3",
					centerId: "center-1",
					userId: "user-3",
					role: "director",
					joinedAt: "2026-04-12T00:00:00.000Z",
					acceptedAt: null,
					invitedAt: "2026-04-12T00:00:00.000Z",
					userName: null,
					userEmail: null,
				},
			}),
		);

		const { result } = renderHook(() => useInviteMember(), { wrapper: createWrapper() });
		await act(async () =>
			result.current.mutateAsync({ email: "lead@example.com", role: "director" }),
		);

		await waitFor(() => expect(mockedToast.success).toHaveBeenCalledTimes(1));
		expect(mockedToast.error).not.toHaveBeenCalled();
	});

	it("shows an error toast when the invitation fails", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Service unavailable", 503, { error: "Service unavailable" }),
		);

		const { result } = renderHook(() => useInviteMember(), { wrapper: createWrapper() });
		await expect(
			result.current.mutateAsync({ email: "x@example.com", role: "staff" }),
		).rejects.toThrow("Service unavailable");

		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("Service unavailable"));
	});

	it("posts invitation and returns the new membership", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				membership: {
					id: "membership-2",
					centerId: "center-1",
					userId: "user-2",
					role: "staff",
					joinedAt: "2026-04-12T00:00:00.000Z",
					acceptedAt: null,
					invitedAt: "2026-04-12T00:00:00.000Z",
					userName: null,
					userEmail: null,
				},
			}),
		);

		const { result } = renderHook(() => useInviteMember(), { wrapper: createWrapper() });

		const returned = await act(async () =>
			result.current.mutateAsync({ email: "staff@example.com", role: "staff" }),
		);

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/members/invites", {
			method: "POST",
			body: JSON.stringify({ email: "staff@example.com", role: "staff" }),
		});
		expect(returned.role).toBe("staff");
	});

	it("tracks team_member_invited with role on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				membership: {
					id: "membership-4",
					centerId: "center-1",
					userId: "user-4",
					role: "director",
					joinedAt: "2026-04-12T00:00:00.000Z",
					acceptedAt: null,
					invitedAt: "2026-04-12T00:00:00.000Z",
					userName: null,
					userEmail: null,
				},
			}),
		);

		const { result } = renderHook(() => useInviteMember(), { wrapper: createWrapper() });
		await act(async () =>
			result.current.mutateAsync({ email: "director@example.com", role: "director" }),
		);

		expect(mockedTrack).toHaveBeenCalledWith("team_member_invited", { role: "director" });
	});

	it("surfaces a helpful message when the email has no account", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Invitation could not be sent", 400, {
				error: "Invitation could not be sent",
			}),
		);

		const { result } = renderHook(() => useInviteMember(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ email: "nobody@example.com", role: "staff" }),
		).rejects.toThrow(/Ask them to sign up first/);
	});

	it("explains the already-on-team variant without exposing account existence", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Invitation could not be sent", 400, {
				error: "Invitation could not be sent",
			}),
		);

		const { result } = renderHook(() => useInviteMember(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ email: "existing@example.com", role: "staff" }),
		).rejects.toThrow(/already on your team/);
	});

	it("surfaces generic error for non-404 failures", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Service unavailable", 503, { error: "Service unavailable" }),
		);

		const { result } = renderHook(() => useInviteMember(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ email: "existing@example.com", role: "staff" }),
		).rejects.toThrow("Service unavailable");
	});
});

describe("useRemoveMember", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("calls DELETE /api/members/:memberId with the encoded id", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));

		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync("mem-abc");
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/members/mem-abc", { method: "DELETE" });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
	});

	it("URL-encodes the member id before calling the API", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));

		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		const specialId = "mem id/with special";
		await act(async () => {
			await result.current.mutateAsync(specialId);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/members/${encodeURIComponent(specialId)}`, {
			method: "DELETE",
		});
	});

	it("returns the parsed success response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));

		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		let returned: unknown;
		await act(async () => {
			returned = await result.current.mutateAsync("mem-1");
		});

		expect(returned).toMatchObject({ success: true });
	});

	it("invalidates the members query key on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));

		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync("mem-1");
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "members"] });
	});

	it("tracks team_member_removed on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));

		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync("mem-rm-1");
		});

		expect(mockedTrack).toHaveBeenCalledWith("team_member_removed", {});
	});

	it("toasts success message on successful removal", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));

		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync("mem-1");
		});

		expect(mockedToast.success).toHaveBeenCalledWith("Member removed.");
	});

	it("toasts an error message when the API returns an error", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Cannot remove the owner from the center", 403, {
				error: "Cannot remove the owner from the center",
			}),
		);

		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		await act(async () => {
			try {
				await result.current.mutateAsync("mem-owner");
			} catch {
				// mutation rejects — error is surfaced via toast
			}
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(mockedToast.error).toHaveBeenCalled();
	});

	it("wraps unknown non-Error rejections in a generic Error", async () => {
		mockedApiFetch.mockRejectedValueOnce("something weird");

		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		await act(async () => {
			try {
				await result.current.mutateAsync("mem-1");
			} catch {
				// expected
			}
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(Error);
		expect((result.current.error as Error).message).toBe("Failed to remove member");
	});

	it("rejects when the response shape does not match the success schema", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ removed: true }));

		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useRemoveMember(), { wrapper: Wrapper });

		await act(async () => {
			try {
				await result.current.mutateAsync("mem-1");
			} catch {
				// expected
			}
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(Error);
	});
});
