import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
import { useCurrentCenter, useUpdateCenter } from "./use-center";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
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

function createResponse<T>(payload: T, ok = true, status = 200) {
	return {
		ok,
		status,
		json: async () => payload,
	} as Response;
}

const sampleCenter = {
	id: "center-1",
	name: "Sunshine Learning",
	address: "123 Elm",
	city: "Austin",
	state: "TX",
	zip: "78701",
	phone: "(512) 555-0100",
	licenseNumber: "LIC-1",
	timezone: "America/Chicago",
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

describe("useCurrentCenter", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
	});

	it("fetches the center by id", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ center: sampleCenter }));

		const { result } = renderHook(() => useCurrentCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/centers/center-1");
		expect(result.current.data?.name).toBe("Sunshine Learning");
	});

	it("stays disabled when the centerId is undefined", () => {
		const { result } = renderHook(() => useCurrentCenter(undefined), {
			wrapper: createWrapper(),
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("stays disabled when the centerId is an empty string", () => {
		const { result } = renderHook(() => useCurrentCenter(""), {
			wrapper: createWrapper(),
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("throws when the fetch fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ error: "nope" }, false, 500));

		const { result } = renderHook(() => useCurrentCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toEqual(new Error("Failed to fetch center"));
	});

	it("rejects a malformed payload missing the center field", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notCenter: {} }));

		const { result } = renderHook(() => useCurrentCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
	});
});

describe("useUpdateCenter", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("tracks center_settings_updated with field_count on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ center: sampleCenter }));

		const { result } = renderHook(() => useUpdateCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await act(async () =>
			result.current.mutateAsync({ name: "Sunshine Learning", city: "Austin" }),
		);

		expect(mockedTrack).toHaveBeenCalledWith("center_settings_updated", { field_count: 2 });
	});

	it("does not track on failure", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: async () => ({ error: "Invalid state" }),
		} as Response);

		const { result } = renderHook(() => useUpdateCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await expect(result.current.mutateAsync({ state: "ZZ" })).rejects.toThrow();
		expect(mockedTrack).not.toHaveBeenCalled();
	});

	it("shows a success toast after a successful update", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ center: sampleCenter }));

		const { result } = renderHook(() => useUpdateCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => result.current.mutateAsync({ name: "Sunshine Learning" }));

		await waitFor(() => expect(mockedToast.success).toHaveBeenCalledTimes(1));
		expect(mockedToast.error).not.toHaveBeenCalled();
	});

	it("shows an error toast when the update fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: async () => ({ error: "Invalid state" }),
		} as Response);

		const { result } = renderHook(() => useUpdateCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await expect(result.current.mutateAsync({ state: "ZZ" })).rejects.toThrow("Invalid state");
		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("Invalid state"));
	});

	it("PATCHes the center and returns the updated record", async () => {
		const updated = { ...sampleCenter, name: "New Name" };
		mockedApiFetch.mockResolvedValueOnce(createResponse({ center: updated }));

		const { result } = renderHook(() => useUpdateCenter("center-1"), {
			wrapper: createWrapper(),
		});

		const returned = await act(async () => result.current.mutateAsync({ name: "New Name" }));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/centers/center-1", {
			method: "PATCH",
			body: JSON.stringify({ name: "New Name" }),
		});
		expect(returned.name).toBe("New Name");
	});

	it("surfaces the error body on failure", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: async () => ({ error: "Invalid state" }),
		} as Response);

		const { result } = renderHook(() => useUpdateCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await expect(result.current.mutateAsync({ state: "ZZ" })).rejects.toThrow("Invalid state");
	});

	it("falls back to a default error message when the body is missing", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => {
				throw new Error("no body");
			},
		} as unknown as Response);

		const { result } = renderHook(() => useUpdateCenter("center-1"), {
			wrapper: createWrapper(),
		});

		await expect(result.current.mutateAsync({ name: "x" })).rejects.toThrow(
			"Failed to update center",
		);
	});
});
