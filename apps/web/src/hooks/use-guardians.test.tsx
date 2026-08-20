import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import {
	useCreateGuardian,
	useDeleteGuardian,
	useGuardian,
	useGuardians,
	useUpdateGuardian,
} from "./use-guardians";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("../lib/toast", () => ({
	toast: { success: toastSuccess, error: toastError, info: vi.fn() },
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

import { track } from "../lib/analytics";

const mockedTrack = vi.mocked(track);

const CENTER_ID = "center-test";
const mockedApiFetch = vi.mocked(apiFetch);

function createErrorResponse(message: string, status = 500) {
	return {
		ok: false,
		status,
		json: async () => ({ error: message }),
	} as Response;
}

function createResponse<T>(payload: T) {
	return {
		ok: true,
		json: async () => payload,
	} as Response;
}

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
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

	return {
		client,
		Wrapper({ children }: { children: ReactNode }) {
			return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
		},
	};
}

describe("use-guardians hooks", () => {
	const GUARDIAN_ID = "550e8400-e29b-41d4-a716-446655440000";

	beforeEach(() => {
		mockedApiFetch.mockReset();
		toastSuccess.mockReset();
		toastError.mockReset();
		mockedTrack.mockReset();
	});

	it("omits empty guardian search values from the query string", async () => {
		mockedApiFetch
			.mockResolvedValueOnce(
				createResponse({
					guardians: [
						{
							id: "guardian-1",
							children: [
								{
									id: "child-1",
									firstName: "Mia",
									lastName: "Lopez",
									authorizedPickup: true,
								},
							],
						},
					],
				}),
			)
			.mockResolvedValueOnce(createResponse({ guardians: [] }));

		const wrapper = createWrapper();
		const first = renderHook(() => useGuardians(), { wrapper });
		await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

		const second = renderHook(() => useGuardians("Jamie"), { wrapper });
		await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/guardians?limit=200&cursor=0");
		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			2,
			"/api/guardians?search=Jamie&limit=200&cursor=0",
		);
		expect(first.result.current.data?.[0]?.children).toEqual([
			{
				id: "child-1",
				firstName: "Mia",
				lastName: "Lopez",
				authorizedPickup: true,
			},
		]);
	});

	it("drains every guardian page so large directories are not silently truncated", async () => {
		const fullPage = Array.from({ length: 200 }, (_value, index) => ({
			id: `guardian-${index}`,
			children: [],
		}));
		mockedApiFetch
			.mockResolvedValueOnce(createResponse({ guardians: fullPage }))
			.mockResolvedValueOnce(createResponse({ guardians: [{ id: "guardian-200", children: [] }] }));

		const { result } = renderHook(() => useGuardians(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/guardians?limit=200&cursor=0");
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/guardians?limit=200&cursor=200");
		expect(result.current.data).toHaveLength(201);
	});

	it("does not fetch the guardians list when disabled", () => {
		const { result } = renderHook(() => useGuardians(undefined, { enabled: false }), {
			wrapper: createWrapper(),
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("does not fetch guardian detail until an identifier is available", () => {
		const { result } = renderHook(() => useGuardian(""), { wrapper: createWrapper() });

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads guardian detail when an identifier is available", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({ guardian: { id: GUARDIAN_ID }, children: [] }),
		);

		const { result } = renderHook(() => useGuardian(GUARDIAN_ID), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/guardians/${GUARDIAN_ID}`);
		expect(result.current.data?.guardian).toEqual({ id: GUARDIAN_ID });
	});

	it("does not fetch guardian detail for malformed identifiers", () => {
		const { result } = renderHook(() => useGuardian("guardian-1"), { wrapper: createWrapper() });

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("invalidates guardians after creating a guardian", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ guardian: { id: GUARDIAN_ID } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useCreateGuardian(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ firstName: "Taylor", lastName: "Reed" });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/guardians", {
			method: "POST",
			body: JSON.stringify({ firstName: "Taylor", lastName: "Reed" }),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("surfaces a server error message as a toast when creating fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(createErrorResponse("Email already in use", 409));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateGuardian(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({ firstName: "Taylor", lastName: "Reed" }),
			).rejects.toThrow("Email already in use");
		});
		expect(toastError).toHaveBeenCalledWith("Email already in use");
	});

	it("invalidates guardians after deleting a guardian", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ok: true }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useDeleteGuardian(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: GUARDIAN_ID });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/guardians/${GUARDIAN_ID}`, {
			method: "DELETE",
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("throws when deleting a guardian fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);
		const { Wrapper } = createWrapperWithClient();

		const { result } = renderHook(() => useDeleteGuardian(), { wrapper: Wrapper });

		await expect(
			act(async () => {
				await result.current.mutateAsync({ id: GUARDIAN_ID });
			}),
		).rejects.toThrow("Failed to delete guardian");
	});

	it("throws ZodError when useCreateGuardian receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ nope: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateGuardian(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({ firstName: "Taylor", lastName: "Reed" }),
			).rejects.toThrow();
		});
	});

	it("throws ZodError when useDeleteGuardian receives a non-object response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse(null));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useDeleteGuardian(), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync({ id: GUARDIAN_ID })).rejects.toThrow();
		});
	});

	it("throws ZodError when useUpdateGuardian receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ bad: "response" }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUpdateGuardian(GUARDIAN_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync({ firstName: "Taylor" })).rejects.toThrow();
		});
	});

	it("invalidates guardian detail after updating a guardian", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ guardian: { id: "guardian-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useUpdateGuardian(GUARDIAN_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ firstName: "Taylor" });
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "guardians", GUARDIAN_ID],
		});
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("rejects an invalid guardians list response with a ZodError", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notGuardians: [] }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useGuardians(), { wrapper: Wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("rejects an invalid guardian detail response with a ZodError", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ children: [] }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useGuardian(GUARDIAN_ID), { wrapper: Wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("tracks guardianCreated event when a guardian is created successfully", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ guardian: { id: GUARDIAN_ID } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateGuardian(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ firstName: "Taylor", lastName: "Reed" });
		});

		expect(mockedTrack).toHaveBeenCalledWith("guardian_created");
	});

	it("tracks guardianDeleted event when a guardian is deleted successfully", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ ok: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useDeleteGuardian(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: GUARDIAN_ID });
		});

		expect(mockedTrack).toHaveBeenCalledWith("guardian_deleted");
	});

	it("tracks guardianUpdated event with field_count when a guardian is updated successfully", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ guardian: { id: "guardian-1" } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUpdateGuardian(GUARDIAN_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ firstName: "Taylor", lastName: "Reed" });
		});

		expect(mockedTrack).toHaveBeenCalledWith("guardian_updated", { field_count: 2 });
	});

	it("does not track guardianCreated when create fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(createErrorResponse("Server error", 500));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateGuardian(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({ firstName: "Taylor", lastName: "Reed" }),
			).rejects.toThrow();
		});

		expect(mockedTrack).not.toHaveBeenCalled();
	});
});
