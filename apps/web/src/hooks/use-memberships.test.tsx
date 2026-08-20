import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
import { useActiveCenterId, useMemberships, useSwitchCenter } from "./use-memberships";

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("./use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({
		data: { membership: { centerId: "center-1" } },
	})),
}));

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
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
			mutations: { retry: false },
		},
	});

	return {
		wrapper: function Wrapper({ children }: { children: ReactNode }) {
			return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
		},
		client,
	};
}

function createResponse<T>(payload: T, ok = true) {
	return {
		ok,
		json: async () => payload,
	} as Response;
}

describe("useMemberships", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
	});

	it("fetches from the correct URL and returns the membership array", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				memberships: [
					{
						id: "mem-1",
						centerId: "center-1",
						centerName: "Sunny Meadow",
						role: "owner",
						acceptedAt: "2026-01-01T00:00:00.000Z",
					},
					{
						id: "mem-2",
						centerId: "center-2",
						centerName: "Little Stars",
						role: "director",
						acceptedAt: "2026-02-01T00:00:00.000Z",
					},
				],
			}),
		);

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMemberships(), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/memberships/mine");
		expect(result.current.data).toHaveLength(2);
		expect(result.current.data?.[0]?.centerName).toBe("Sunny Meadow");
		expect(result.current.data?.[1]?.centerId).toBe("center-2");
	});

	it("throws when the memberships request fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ error: "forbidden" }, false));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMemberships(), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toEqual(new Error("Failed to load memberships"));
	});

	it("rejects a malformed payload missing the memberships array", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notMemberships: [] }));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMemberships(), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});
});

describe("useActiveCenterId", () => {
	it("returns the active centerId from the auth session", () => {
		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useActiveCenterId(), { wrapper });
		expect(result.current).toBe("center-1");
	});

	it("returns undefined when session is not available", async () => {
		const authSessionModule = await import("./use-auth-session");
		vi.mocked(authSessionModule.useAuthSession).mockReturnValueOnce({
			data: undefined,
		} as ReturnType<typeof authSessionModule.useAuthSession>);

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useActiveCenterId(), { wrapper });
		expect(result.current).toBeUndefined();
	});
});

describe("useSwitchCenter", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("shows an error toast when the switch request fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ error: "not found" }, false));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useSwitchCenter(), { wrapper });

		await expect(
			act(async () => {
				await result.current.mutateAsync("center-999");
			}),
		).rejects.toThrow("Failed to switch center");

		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("Failed to switch center"));
	});

	it("POSTs to the correct URL with the centerId in the body", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ok: true }));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useSwitchCenter(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync("center-2");
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/memberships/switch", {
			method: "POST",
			body: JSON.stringify({ centerId: "center-2" }),
		});
	});

	it("cancels in-flight queries before clearing the cache on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ok: true }));

		const { wrapper, client } = createWrapper();
		const cancelQueries = vi.spyOn(client, "cancelQueries");
		const { result } = renderHook(() => useSwitchCenter(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync("center-2");
		});

		expect(cancelQueries).toHaveBeenCalled();
	});

	it("clears the query client cache on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ok: true }));

		const { wrapper, client } = createWrapper();
		// Seed a query so we can verify it gets cleared
		client.setQueryData(["authSession"], { user: { id: "u1" } });
		expect(client.getQueryData(["authSession"])).toBeDefined();

		const { result } = renderHook(() => useSwitchCenter(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync("center-2");
		});

		expect(client.getQueryData(["authSession"])).toBeUndefined();
	});

	it("removes center-scoped queries (children, classrooms, ratios) before clearing the cache", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ok: true }));

		const { wrapper, client } = createWrapper();

		// Seed center-scoped queries similar to what the hooks use
		client.setQueryData(["center-1", "children", {}], [{ id: "child-1" }]);
		client.setQueryData(["center-1", "classrooms"], [{ id: "classroom-1" }]);
		client.setQueryData(["center-1", "ratios"], []);

		const removeQueriesSpy = vi.spyOn(client, "removeQueries");

		const { result } = renderHook(() => useSwitchCenter(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync("center-2");
		});

		// removeQueries should have been called to purge old center data
		expect(removeQueriesSpy).toHaveBeenCalled();
		// All data should be gone after the full clear
		expect(client.getQueryData(["center-1", "children", {}])).toBeUndefined();
		expect(client.getQueryData(["center-1", "classrooms"])).toBeUndefined();
	});

	it("tracks center_switched when the switch succeeds", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ok: true }));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useSwitchCenter(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync("center-3");
		});

		expect(mockedTrack).toHaveBeenCalledWith("center_switched", {});
	});

	it("throws when the switch request fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ error: "not found" }, false));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useSwitchCenter(), { wrapper });

		await expect(
			act(async () => {
				await result.current.mutateAsync("center-999");
			}),
		).rejects.toThrow("Failed to switch center");
	});
});
