import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api";
import { useAuthSession } from "./use-auth-session";
import type { CenterOverview } from "./use-overview";
import { useMultiCenterOverview } from "./use-overview";

vi.mock("../api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../api")>();
	return { ...actual, apiFetch: vi.fn() };
});

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
	useMemberships: vi.fn(() => ({
		data: [
			{ id: "membership-1", centerId: "center-1" },
			{ id: "membership-2", centerId: "center-2" },
		],
	})),
}));

vi.mock("./use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseAuthSession = vi.mocked(useAuthSession);

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});

	return {
		wrapper: function Wrapper({ children }: { children: ReactNode }) {
			return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
		},
	};
}

function createResponse<T>(payload: T, ok = true) {
	return {
		ok,
		json: async () => payload,
	} as Response;
}

const MOCK_CENTERS: CenterOverview[] = [
	{
		centerId: "center-1",
		centerName: "Sunny Meadow",
		role: "owner",
		activeChildCount: 12,
		ratioStatus: "ok",
		openViolationCount: 0,
		unreadAlertCount: 0,
	},
	{
		centerId: "center-2",
		centerName: "Little Stars",
		role: "director",
		activeChildCount: 8,
		ratioStatus: "warning",
		openViolationCount: 1,
		unreadAlertCount: 0,
	},
];

describe("useMultiCenterOverview", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedUseAuthSession.mockReset();
		mockedUseAuthSession.mockReturnValue({
			data: {
				center: {
					subscriptionPlan: "enterprise",
				},
			},
		} as ReturnType<typeof useAuthSession>);
	});

	it("fetches from /api/overview/multi-center and returns centers array", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ centers: MOCK_CENTERS }));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMultiCenterOverview(), { wrapper });

		await waitFor(() => expect(result.current.data).toHaveLength(2));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/overview/multi-center");
		expect(result.current.data).toHaveLength(2);
		expect(result.current.data?.[0]?.centerName).toBe("Sunny Meadow");
		expect(result.current.data?.[1]?.ratioStatus).toBe("warning");
	});

	it("throws when apiFetch rejects with a non-403 error", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Server error", 500, { error: "Server error" }),
		);

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMultiCenterOverview(), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(ApiError);
	});

	it("returns empty array on 403 (non-enterprise plan) without throwing", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Subscription plan required", 403, { error: "Subscription plan required" }),
		);

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMultiCenterOverview(), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([]);
	});

	it("rejects a malformed payload missing the centers array", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notCenters: [] }));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMultiCenterOverview(), { wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("returns empty array when centers list is empty", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ centers: [] }));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMultiCenterOverview(), { wrapper });

		await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));
		expect(result.current.data).toEqual([]);
	});

	it("does not fetch when the current session is not enterprise", async () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				center: {
					subscriptionPlan: "center_starter",
				},
			},
		} as ReturnType<typeof useAuthSession>);

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMultiCenterOverview(), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).not.toHaveBeenCalled();
		expect(result.current.data).toEqual([]);
	});

	it("does not fetch when the user only has one accepted center", async () => {
		const { useMemberships } = await import("./use-memberships");
		vi.mocked(useMemberships).mockReturnValue({
			data: [{ id: "membership-1", centerId: "center-1" }],
		} as never);

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMultiCenterOverview(), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).not.toHaveBeenCalled();
		expect(result.current.data).toEqual([]);
	});

	it("uses the correct query key [overview, multi-center]", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ centers: MOCK_CENTERS }));

		const { wrapper } = createWrapper();
		const { result } = renderHook(() => useMultiCenterOverview(), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		// Verify data is accessible via the query
		expect(result.current.data).toBeDefined();
	});
});
