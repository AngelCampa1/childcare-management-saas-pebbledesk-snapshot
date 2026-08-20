import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import {
	useArchiveClassroom,
	useAssignChild,
	useAssignStaff,
	useClassroom,
	useClassroomChildren,
	useClassroomStaff,
	useClassrooms,
	useCreateClassroom,
	useUnarchiveClassroom,
	useUnassignChild,
	useUnassignStaff,
	useUpdateClassroom,
} from "./use-classrooms";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

import { track } from "../lib/analytics";
import { toast } from "../lib/toast";

const mockedToast = vi.mocked(toast);
const mockedTrack = vi.mocked(track);
const mockedApiFetch = vi.mocked(apiFetch);
const CLASSROOM_ID = "550e8400-e29b-41d4-a716-446655440000";
const CHILD_ID = "660e8400-e29b-41d4-a716-446655440000";
const CENTER_ID = "center-test";

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

describe("use-classrooms hooks", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
		mockedTrack.mockReset();
	});

	it("serializes classroom filters without false archived flags", async () => {
		mockedApiFetch
			.mockResolvedValueOnce(createResponse({ classrooms: [] }))
			.mockResolvedValueOnce(createResponse({ classrooms: [] }));

		const wrapper = createWrapper();
		const first = renderHook(() => useClassrooms({ ageGroup: "infant", includeArchived: false }), {
			wrapper,
		});
		await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

		const second = renderHook(() => useClassrooms({ includeArchived: true }), { wrapper });
		await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/classrooms?ageGroup=infant");
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/classrooms?includeArchived=true");
	});

	it("does not fetch the classrooms list when disabled", () => {
		const wrapper = createWrapper();

		const { result } = renderHook(() => useClassrooms(undefined, { enabled: false }), {
			wrapper,
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("does not fetch classroom detail, children, or staff without an identifier", () => {
		const wrapper = createWrapper();

		const classroom = renderHook(() => useClassroom(""), { wrapper });
		const children = renderHook(() => useClassroomChildren(""), { wrapper });
		const staff = renderHook(() => useClassroomStaff(""), { wrapper });

		expect(classroom.result.current.fetchStatus).toBe("idle");
		expect(children.result.current.fetchStatus).toBe("idle");
		expect(staff.result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("does not fetch classroom detail, children, or staff for malformed identifiers", () => {
		const wrapper = createWrapper();

		const classroom = renderHook(() => useClassroom("classroom-1"), { wrapper });
		const children = renderHook(() => useClassroomChildren("classroom-1"), { wrapper });
		const staff = renderHook(() => useClassroomStaff("classroom-1"), { wrapper });

		expect(classroom.result.current.fetchStatus).toBe("idle");
		expect(children.result.current.fetchStatus).toBe("idle");
		expect(staff.result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads classroom detail, children, and staff", async () => {
		mockedApiFetch
			.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }))
			.mockResolvedValueOnce(createResponse({ children: [{ childId: "child-1" }] }))
			.mockResolvedValueOnce(createResponse({ staff: [{ membershipId: "membership-1" }] }));

		const wrapper = createWrapper();
		const classroom = renderHook(() => useClassroom(CLASSROOM_ID), { wrapper });
		const children = renderHook(() => useClassroomChildren(CLASSROOM_ID), { wrapper });
		const staff = renderHook(() => useClassroomStaff(CLASSROOM_ID), { wrapper });

		await waitFor(() => expect(classroom.result.current.isSuccess).toBe(true));
		await waitFor(() => expect(children.result.current.isSuccess).toBe(true));
		await waitFor(() => expect(staff.result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, `/api/classrooms/${CLASSROOM_ID}`);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, `/api/classrooms/${CLASSROOM_ID}/children`);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(3, `/api/classrooms/${CLASSROOM_ID}/staff`);
	});

	it("invalidates classrooms after creating a classroom", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useCreateClassroom(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				name: "Bluebirds",
				ageGroup: "preschool",
				maxCapacity: 20,
				minRatioStaff: 1,
				minRatioChildren: 10,
			});
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
	});

	it("invalidates classroom detail after updating a classroom", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useUpdateClassroom("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ name: "Bluebirds" });
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "classrooms", "room-1"],
		});
	});

	it("invalidates classroom detail after archiving a classroom", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useArchiveClassroom("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "classrooms", "room-1"],
		});
	});

	it("invalidates classroom detail after unarchiving a classroom", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useUnarchiveClassroom("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "classrooms", "room-1"],
		});
	});

	it("invalidates classroom children and child detail after assigning a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useAssignChild("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ childId: CHILD_ID, effectiveDate: "2026-04-09" });
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "classrooms", "room-1", "children"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children", CHILD_ID] });
	});

	it("invalidates classroom children and child detail after unassigning a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useUnassignChild("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync(CHILD_ID);
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "classrooms", "room-1", "children"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children", CHILD_ID] });
	});

	it("invalidates classroom staff after assigning staff", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useAssignStaff("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				membershipId: "membership-1",
				effectiveDate: "2026-04-09",
			});
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "classrooms", "room-1", "staff"],
		});
	});

	it("throws ZodError when useCreateClassroom receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ badKey: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateClassroom(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({
					name: "Bluebirds",
					ageGroup: "preschool",
					maxCapacity: 20,
					minRatioStaff: 1,
					minRatioChildren: 10,
				}),
			).rejects.toThrow();
		});
	});

	it("throws ZodError when useUpdateClassroom receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notAClassroom: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUpdateClassroom(CLASSROOM_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync({ name: "Updated" })).rejects.toThrow();
		});
	});

	it("throws ZodError when useArchiveClassroom receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ gone: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useArchiveClassroom(CLASSROOM_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync()).rejects.toThrow();
		});
	});

	it("throws ZodError when useUnarchiveClassroom receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse(null));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUnarchiveClassroom(CLASSROOM_ID), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync()).rejects.toThrow();
		});
	});

	it("throws ZodError when useAssignChild receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse(null));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useAssignChild("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({ childId: CHILD_ID, effectiveDate: "2026-04-09" }),
			).rejects.toThrow();
		});
	});

	it("throws ZodError when useUnassignChild receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse(null));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUnassignChild("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync(CHILD_ID)).rejects.toThrow();
		});
	});

	it("throws ZodError when useAssignStaff receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse(null));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useAssignStaff("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({ membershipId: "m-1", effectiveDate: "2026-04-09" }),
			).rejects.toThrow();
		});
	});

	it("invalidates classroom staff after unassigning staff", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useUnassignStaff("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync("membership-1");
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [CENTER_ID, "classrooms", "room-1", "staff"],
		});
	});

	it("surfaces a schema parse error when the classrooms list shape drifts", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ classrooms: [{ noId: true }] }));
		const { result } = renderHook(() => useClassrooms(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("surfaces a schema parse error when classroom children shape drifts", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ children: [{ assignmentId: "a-1" }] }));
		const { result } = renderHook(() => useClassroomChildren(CLASSROOM_ID), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("tracks classroomUpdated with field_count when a classroom is updated", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUpdateClassroom("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ name: "Bluebirds", maxCapacity: 15 });
		});

		expect(mockedTrack).toHaveBeenCalledWith("classroom_updated", { field_count: 2 });
	});

	it("tracks classroomArchived when a classroom is archived", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useArchiveClassroom("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).toHaveBeenCalledWith("classroom_archived");
	});

	it("tracks classroomRestored when a classroom is unarchived", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUnarchiveClassroom("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).toHaveBeenCalledWith("classroom_restored");
	});

	it("tracks classroomChildAssigned when a child is assigned", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useAssignChild("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ childId: CHILD_ID, effectiveDate: "2026-04-09" });
		});

		expect(mockedTrack).toHaveBeenCalledWith("classroom_child_assigned");
	});

	it("tracks classroomChildUnassigned when a child is unassigned", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUnassignChild("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync(CHILD_ID);
		});

		expect(mockedTrack).toHaveBeenCalledWith("classroom_child_unassigned");
	});

	it("tracks classroomStaffAssigned when staff is assigned", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useAssignStaff("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ membershipId: "m-1", effectiveDate: "2026-04-09" });
		});

		expect(mockedTrack).toHaveBeenCalledWith("classroom_staff_assigned");
	});

	it("tracks classroomStaffUnassigned when staff is unassigned", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUnassignStaff("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync("m-1");
		});

		expect(mockedTrack).toHaveBeenCalledWith("classroom_staff_unassigned");
	});

	it("shows a success toast after creating a classroom", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }));
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateClassroom(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				name: "Bluebirds",
				ageGroup: "preschool",
				maxCapacity: 20,
				minRatioStaff: 1,
				minRatioChildren: 10,
			});
		});

		expect(mockedToast.success).toHaveBeenCalledTimes(1);
	});

	it("shows an error toast when creating a classroom fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Name already used" }),
		} as Response);
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useCreateClassroom(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				result.current.mutateAsync({
					name: "Bluebirds",
					ageGroup: "preschool",
					maxCapacity: 20,
					minRatioStaff: 1,
					minRatioChildren: 10,
				}),
			).rejects.toThrow("Name already used");
		});

		expect(mockedToast.error).toHaveBeenCalledWith("Name already used");
	});

	it("shows an error toast when unassigning staff fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Staff not assigned" }),
		} as Response);
		const { Wrapper } = createWrapperWithClient();
		const { result } = renderHook(() => useUnassignStaff("room-1"), { wrapper: Wrapper });

		await act(async () => {
			await expect(result.current.mutateAsync("m-1")).rejects.toThrow("Staff not assigned");
		});

		expect(mockedToast.error).toHaveBeenCalledWith("Staff not assigned");
	});

	it("shows success toasts after archive, unarchive, and assignment mutations", async () => {
		const { Wrapper } = createWrapperWithClient();

		mockedApiFetch.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }));
		const archive = renderHook(() => useArchiveClassroom("room-1"), { wrapper: Wrapper });
		await act(async () => {
			await archive.result.current.mutateAsync();
		});

		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const unarchive = renderHook(() => useUnarchiveClassroom("room-1"), { wrapper: Wrapper });
		await act(async () => {
			await unarchive.result.current.mutateAsync();
		});

		mockedApiFetch.mockResolvedValueOnce(createResponse({ classroom: { id: "room-1" } }));
		const update = renderHook(() => useUpdateClassroom("room-1"), { wrapper: Wrapper });
		await act(async () => {
			await update.result.current.mutateAsync({ name: "Renamed" });
		});

		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const assignChild = renderHook(() => useAssignChild("room-1"), { wrapper: Wrapper });
		await act(async () => {
			await assignChild.result.current.mutateAsync({
				childId: CHILD_ID,
				effectiveDate: "2026-04-09",
			});
		});

		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const unassignChild = renderHook(() => useUnassignChild("room-1"), { wrapper: Wrapper });
		await act(async () => {
			await unassignChild.result.current.mutateAsync(CHILD_ID);
		});

		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const assignStaff = renderHook(() => useAssignStaff("room-1"), { wrapper: Wrapper });
		await act(async () => {
			await assignStaff.result.current.mutateAsync({
				membershipId: "m-1",
				effectiveDate: "2026-04-09",
			});
		});

		mockedApiFetch.mockResolvedValueOnce(createResponse({ success: true }));
		const unassignStaff = renderHook(() => useUnassignStaff("room-1"), { wrapper: Wrapper });
		await act(async () => {
			await unassignStaff.result.current.mutateAsync("m-1");
		});

		expect(mockedToast.success).toHaveBeenCalledTimes(7);
	});
});
