import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import {
	useRatioSnapshots,
	useRatios,
	useRatioViolations,
	useUpdateViolationNotes,
} from "./use-ratios";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { toast } from "../lib/toast";

const mockedToast = vi.mocked(toast);
const mockedTrack = vi.mocked(track);

const CENTER_ID = "center-test";
const mockedApiFetch = vi.mocked(apiFetch);

function createResponse<T>(payload: T) {
	return {
		ok: true,
		json: async () => payload,
	} as Response;
}

function createWrapperWithClient() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return {
		client,
		Wrapper({ children }: { children: ReactNode }) {
			return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
		},
	};
}

describe("use-ratios hooks", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("sets refetchIntervalInBackground to false so polling pauses on hidden tabs", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ratios: [] }));
		const { client, Wrapper } = createWrapperWithClient();

		const { result } = renderHook(() => useRatios(), { wrapper: Wrapper });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		const queryState = client.getQueryState(["center-test", "ratios"]);

		// The query should be configured with refetchIntervalInBackground: false.
		// We verify this by inspecting the query options directly.
		const query = client.getQueryCache().find({ queryKey: ["center-test", "ratios"] });

		expect(query?.options.refetchIntervalInBackground).toBe(false);
		expect(queryState).toBeDefined();
	});

	it("sets refetchOnWindowFocus to true so ratios refresh when the user returns", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ratios: [] }));
		const { client, Wrapper } = createWrapperWithClient();

		renderHook(() => useRatios(), { wrapper: Wrapper });
		await waitFor(() => client.getQueryState(["center-test", "ratios"]) !== undefined);

		const query = client.getQueryCache().find({ queryKey: ["center-test", "ratios"] });

		expect(query?.options.refetchOnWindowFocus).toBe(true);
	});

	it("loads the live ratio dashboard data", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ratios: [{ classroomId: "room-1" }] }));

		const { result } = renderHook(() => useRatios(), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/ratios");
	});

	it("does not fetch live ratios when the query is disabled", async () => {
		const { result } = renderHook(() => useRatios({ enabled: false }), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("stops fetching when the query is disabled, keeping cached data", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ratios: [{ classroomId: "room-1" }] }));
		const { Wrapper } = createWrapperWithClient();
		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) => useRatios({ enabled }),
			{
				initialProps: { enabled: true },
				wrapper: Wrapper,
			},
		);

		await waitFor(() => expect(result.current.data).toEqual([{ classroomId: "room-1" }]));

		rerender({ enabled: false });

		await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
		// Cached data is preserved when using a unified query key — no refetch occurs
		expect(mockedApiFetch).toHaveBeenCalledTimes(1);
	});

	it("omits empty ratio snapshot and violation filters", async () => {
		mockedApiFetch
			.mockResolvedValueOnce(createResponse({ snapshots: [] }))
			.mockResolvedValueOnce(createResponse({ violations: [] }));

		const wrapper = createWrapperWithClient().Wrapper;
		const snapshots = renderHook(
			() => useRatioSnapshots({ classroomId: "room-1", from: "", to: "2026-04-09" }),
			{ wrapper },
		);
		await waitFor(() => expect(snapshots.result.current.isSuccess).toBe(true));

		const violations = renderHook(
			() => useRatioViolations({ classroomId: "room-1", status: "open", from: "", to: "" }),
			{ wrapper },
		);
		await waitFor(() => expect(violations.result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			1,
			"/api/ratios/snapshots?classroomId=room-1&to=2026-04-09",
		);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			2,
			"/api/ratios/violations?classroomId=room-1&status=open",
		);
	});

	it("polls open ratio violations for readiness-sensitive status", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ violations: [] }));
		const { client, Wrapper } = createWrapperWithClient();

		const { result } = renderHook(() => useRatioViolations({ status: "open" }), {
			wrapper: Wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		const query = client.getQueryCache().find({
			queryKey: ["center-test", "ratioViolations", { status: "open" }],
		});
		expect(query?.options.refetchInterval).toBe(15_000);
		expect(query?.options.refetchIntervalInBackground).toBe(false);
	});

	it("sends only resolution notes and invalidates violations after update", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ violation: { id: "violation-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useUpdateViolationNotes(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				id: "violation-1",
				resolutionNotes: "Resolved after staff reassignment",
			});
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/ratios/violations/violation-1", {
			method: "PATCH",
			body: JSON.stringify({ resolutionNotes: "Resolved after staff reassignment" }),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "ratioViolations"] });
	});

	it("surfaces a schema parse error when the ratios payload shape drifts", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ratios: [{ noClassroomId: true }] }));

		const { result } = renderHook(() => useRatios(), {
			wrapper: createWrapperWithClient().Wrapper,
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("tracks ratio_violation_notes_updated when useUpdateViolationNotes succeeds", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ violation: { id: "violation-1" } }));
		const { Wrapper } = createWrapperWithClient();

		const { result } = renderHook(() => useUpdateViolationNotes(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: "violation-1", resolutionNotes: "Resolved" });
		});

		expect(mockedTrack).toHaveBeenCalledWith("ratio_violation_notes_updated", {});
	});

	it("shows a success toast after updating violation notes", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ violation: { id: "violation-1" } }));
		const { Wrapper } = createWrapperWithClient();

		const { result } = renderHook(() => useUpdateViolationNotes(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: "violation-1", resolutionNotes: "Done" });
		});

		expect(mockedToast.success).toHaveBeenCalledTimes(1);
	});

	it("shows an error toast when updating violation notes fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Server says no" }),
		} as Response);
		const { Wrapper } = createWrapperWithClient();

		const { result } = renderHook(() => useUpdateViolationNotes(), { wrapper: Wrapper });

		await expect(
			act(async () => {
				await result.current.mutateAsync({ id: "violation-1", resolutionNotes: "Done" });
			}),
		).rejects.toThrow("Server says no");

		expect(mockedToast.error).toHaveBeenCalledWith("Server says no");
	});
});
