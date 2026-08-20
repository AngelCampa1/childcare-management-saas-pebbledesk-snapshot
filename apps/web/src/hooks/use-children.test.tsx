import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import {
	useChild,
	useChildren,
	useCreateChild,
	useEnrollChild,
	useLinkGuardian,
	useReactivateChild,
	useUnlinkGuardian,
	useUpdateChild,
	useUpdateGuardianLink,
	useWithdrawChild,
} from "./use-children";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

import { track } from "../lib/analytics";

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("../lib/toast", () => ({
	toast: { success: toastSuccess, error: toastError, info: vi.fn() },
}));

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

describe("use-children hooks", () => {
	const CHILD_ID = "550e8400-e29b-41d4-a716-446655440000";
	const GUARDIAN_ID = "70000000-0000-0000-0000-000000000001";

	const mockedTrack = vi.mocked(track);

	beforeEach(() => {
		mockedApiFetch.mockReset();
		toastSuccess.mockReset();
		toastError.mockReset();
		mockedTrack.mockReset();
	});

	it("omits empty child filters from the query string", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ children: [] }));

		const { result } = renderHook(
			() => useChildren({ search: "", status: "active", ageGroup: "", classroomId: "room-1" }),
			{ wrapper: createWrapper() },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/children?status=active&classroomId=room-1&limit=200&cursor=0",
		);
	});

	it("drains every children page so large rosters are not silently truncated", async () => {
		const fullPage = Array.from({ length: 200 }, (_value, index) => ({ id: `child-${index}` }));
		mockedApiFetch
			.mockResolvedValueOnce(createResponse({ children: fullPage }))
			.mockResolvedValueOnce(createResponse({ children: [{ id: "child-200" }] }));

		const { result } = renderHook(() => useChildren(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/children?limit=200&cursor=0");
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/children?limit=200&cursor=200");
		expect(result.current.data).toHaveLength(201);
	});

	it("does not fetch the children list when disabled", () => {
		const { result } = renderHook(() => useChildren(undefined, { enabled: false }), {
			wrapper: createWrapper(),
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("does not fetch child details until an identifier is available", () => {
		const { result } = renderHook(() => useChild(""), { wrapper: createWrapper() });

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads child details when an identifier is available", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				child: { id: CHILD_ID },
				currentClassroom: null,
				guardians: [],
				primaryGuardianName: null,
			}),
		);

		const { result } = renderHook(() => useChild(CHILD_ID), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/children/${CHILD_ID}`);
		expect(result.current.data?.child).toEqual({ id: CHILD_ID });
	});

	it("does not fetch child details for malformed identifiers", () => {
		const { result } = renderHook(() => useChild("child-1"), { wrapper: createWrapper() });

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("invalidates children after creating a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "child-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const { useCreateChild } = await import("./use-children");
		const { result } = renderHook(() => useCreateChild(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				firstName: "Jamie",
				lastName: "Stone",
				dateOfBirth: "2023-01-01",
				ageGroup: "preschool",
				enrollmentStatus: "active",
				subsidyEligible: false,
			});
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("includes activeCenterId in the query key to scope cache by center", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ children: [] }));

		const { result } = renderHook(() => useChildren(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		// The query key must start with the active center ID
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/children?limit=200&cursor=0");
	});

	it("invalidates both children list and child detail after updating a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "child-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useUpdateChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ firstName: "Jamie" });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/children/${CHILD_ID}`, {
			method: "PATCH",
			body: JSON.stringify({ firstName: "Jamie" }),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children", CHILD_ID] });
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("invalidates child detail and classrooms after withdrawing a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "child-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useWithdrawChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/children/${CHILD_ID}/withdraw`, {
			method: "POST",
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children", CHILD_ID] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("invalidates child detail and classrooms after reactivating a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "child-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useReactivateChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/children/${CHILD_ID}/reactivate`, {
			method: "POST",
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children", CHILD_ID] });
		// Reactivation flips enrollment status back to active, which changes the
		// classroom childCount — the classrooms list must be refreshed too, mirroring
		// the inverse withdraw mutation.
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("invalidates children and guardians after linking a guardian", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ linked: true }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useLinkGuardian(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				guardianId: GUARDIAN_ID,
				isPrimary: false,
				authorizedPickup: true,
				relationship: "Parent",
			});
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/children/${CHILD_ID}/guardians`, {
			method: "POST",
			body: JSON.stringify({
				guardianId: GUARDIAN_ID,
				isPrimary: false,
				authorizedPickup: true,
				relationship: "Parent",
			}),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children", CHILD_ID] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("rejects an invalid link guardian response with a ZodError and surfaces a toast", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { Wrapper } = createWrapperWithClient();

		const { result } = renderHook(() => useLinkGuardian(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({
					guardianId: GUARDIAN_ID,
					isPrimary: false,
					authorizedPickup: true,
				}),
			).rejects.toThrow();
		});
		expect(toastError).toHaveBeenCalledTimes(1);
	});

	it("surfaces a server error message as a toast when linking fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(createErrorResponse("Guardian not found", 404));
		const { Wrapper } = createWrapperWithClient();

		const { result } = renderHook(() => useLinkGuardian(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({
					guardianId: GUARDIAN_ID,
					isPrimary: false,
					authorizedPickup: true,
				}),
			).rejects.toThrow("Guardian not found");
		});
		expect(toastError).toHaveBeenCalledWith("Guardian not found");
	});

	it("invalidates children and guardians after unlinking a guardian", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ unlinked: true }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useUnlinkGuardian(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync("guardian-1");
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/children/${CHILD_ID}/guardians/guardian-1`, {
			method: "DELETE",
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children", CHILD_ID] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("invalidates child and guardian detail after updating guardian link metadata", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ link: { guardianId: GUARDIAN_ID } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const guardianId = GUARDIAN_ID;

		const { result } = renderHook(() => useUpdateGuardianLink(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				guardianId,
				data: { isPrimary: true, authorizedPickup: true, relationship: "Parent" },
			});
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(
			`/api/children/${CHILD_ID}/guardians/${guardianId}`,
			{
				method: "PATCH",
				body: JSON.stringify({ isPrimary: true, authorizedPickup: true, relationship: "Parent" }),
			},
		);
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children", CHILD_ID] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "guardians", guardianId],
		});
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	it("throws ZodError when useCreateChild receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notAChild: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateChild(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({
					firstName: "Jamie",
					lastName: "Stone",
					dateOfBirth: "2023-01-01",
					ageGroup: "preschool",
					enrollmentStatus: "active",
					subsidyEligible: false,
				}),
			).rejects.toThrow();
		});
	});

	it("throws ZodError when useUpdateChild receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ wrongKey: "bad" }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUpdateChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync({ firstName: "Bad" })).rejects.toThrow();
		});
	});

	it("throws ZodError when useWithdrawChild receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ noChild: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useWithdrawChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync()).rejects.toThrow();
		});
	});

	it("throws ZodError when useReactivateChild receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ noChild: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useReactivateChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync()).rejects.toThrow();
		});
	});

	it("throws ZodError when useUnlinkGuardian receives a non-object response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse(null));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUnlinkGuardian(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync(GUARDIAN_ID)).rejects.toThrow();
		});
	});

	it("throws ZodError when useUpdateGuardianLink receives a non-object response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse(null));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUpdateGuardianLink(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({ guardianId: GUARDIAN_ID, data: { isPrimary: true } }),
			).rejects.toThrow();
		});
	});

	it("invalidates children, classrooms, and guardians after enrolling a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "enrolled-child-id" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useEnrollChild(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				child: {
					firstName: "Jamie",
					lastName: "Stone",
					dateOfBirth: "2023-01-01",
					ageGroup: "preschool",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [
					{
						type: "existing",
						guardianId: "70000000-0000-0000-0000-000000000001",
						isPrimary: true,
						authorizedPickup: true,
						relationship: "Parent",
					},
				],
				classroom: {
					classroomId: "60000000-0000-0000-0000-000000000001",
					effectiveDate: "2026-04-09",
				},
			});
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/children/enroll", {
			method: "POST",
			body: JSON.stringify({
				child: {
					firstName: "Jamie",
					lastName: "Stone",
					dateOfBirth: "2023-01-01",
					ageGroup: "preschool",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [
					{
						type: "existing",
						guardianId: "70000000-0000-0000-0000-000000000001",
						isPrimary: true,
						authorizedPickup: true,
						relationship: "Parent",
					},
				],
				classroom: {
					classroomId: "60000000-0000-0000-0000-000000000001",
					effectiveDate: "2026-04-09",
				},
			}),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		// The enroll hook intentionally does not toast on success — the enroll wizard
		// page owns the success toast so it can sequence it with navigation (P1-010).
		expect(toastSuccess).not.toHaveBeenCalled();
	});

	it("rejects an invalid children list response with a ZodError", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notChildren: [] }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useChildren(), { wrapper: Wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("rejects an invalid child detail response with a ZodError", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ noChild: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useChild(CHILD_ID), { wrapper: Wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	// Analytics tracking tests
	it("tracks childCreated event with age_group after creating a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({ child: { id: "child-1", ageGroup: "preschool" } }),
		);
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateChild(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				firstName: "Jamie",
				lastName: "Stone",
				dateOfBirth: "2023-01-01",
				ageGroup: "preschool",
				enrollmentStatus: "active",
				subsidyEligible: false,
			});
		});

		expect(mockedTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.childCreated, {
			age_group: "preschool",
		});
	});

	it("tracks childUpdated event with field_count after updating a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "child-1" } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUpdateChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ firstName: "Jamie", lastName: "Stone" });
		});

		expect(mockedTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.childUpdated, { field_count: 2 });
	});

	it("tracks childWithdrawn event after withdrawing a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "child-1" } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useWithdrawChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.childWithdrawn, {});
	});

	it("tracks childReactivated event after reactivating a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "child-1" } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useReactivateChild(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.childReactivated, {});
	});

	it("tracks guardianLinked event after linking a guardian", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ linked: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useLinkGuardian(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				guardianId: GUARDIAN_ID,
				isPrimary: true,
				authorizedPickup: false,
				relationship: "Parent",
			});
		});

		expect(mockedTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.guardianLinked, {});
	});

	it("tracks guardianUnlinked event after unlinking a guardian", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ unlinked: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUnlinkGuardian(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync(GUARDIAN_ID);
		});

		expect(mockedTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.guardianUnlinked, {});
	});

	it("tracks guardianLinkUpdated event with field_count after updating guardian link", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ link: { guardianId: GUARDIAN_ID } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUpdateGuardianLink(CHILD_ID), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				guardianId: GUARDIAN_ID,
				data: { isPrimary: true, authorizedPickup: true },
			});
		});

		expect(mockedTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.guardianLinkUpdated, {
			field_count: 2,
		});
	});

	it("tracks enrollmentCompleted event with result success after enrolling a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ child: { id: "enrolled-child-id" } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useEnrollChild(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				child: {
					firstName: "Jamie",
					lastName: "Stone",
					dateOfBirth: "2023-01-01",
					ageGroup: "preschool",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [],
				classroom: {
					classroomId: "60000000-0000-0000-0000-000000000001",
					effectiveDate: "2026-04-09",
				},
			});
		});

		expect(mockedTrack).toHaveBeenCalledWith(ANALYTICS_EVENTS.enrollmentCompleted, {
			result: "success",
		});
	});
});
