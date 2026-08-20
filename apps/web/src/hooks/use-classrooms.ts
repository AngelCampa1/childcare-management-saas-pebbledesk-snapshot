import type {
	ClassroomWithCounts,
	CreateClassroomInput,
	UpdateClassroomInput,
} from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	classroomChildrenResponseSchema,
	classroomResponseSchema,
	classroomStaffResponseSchema,
	classroomsResponseSchema,
} from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { isUuid } from "../lib/is-uuid";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

/**
 * Acknowledgement-only mutation responses (archive toggles, assignment
 * actions) return an opaque success body; we only assert it is a JSON object.
 */
const AcknowledgementResponseSchema = z.object({}).passthrough();

interface ClassroomFilters {
	ageGroup?: string;
	includeArchived?: boolean;
}

interface UseClassroomsOptions {
	enabled?: boolean;
}

export function useClassrooms(filters?: ClassroomFilters, options?: UseClassroomsOptions) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "classrooms", filters],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (filters?.ageGroup) params.set("ageGroup", filters.ageGroup);
			if (filters?.includeArchived) params.set("includeArchived", "true");

			const query = params.toString();
			const path = `/api/classrooms${query ? `?${query}` : ""}`;
			const res = await apiFetch(path);
			const data = await parseJsonResponse(
				res,
				classroomsResponseSchema,
				"Failed to fetch classrooms",
			);
			return data.classrooms as unknown as ClassroomWithCounts[];
		},
		enabled: options?.enabled ?? true,
	});
}

export function useClassroom(id: string) {
	const activeCenterId = useActiveCenterId();
	const validId = isUuid(id) ? id : "";

	return useQuery({
		queryKey: [activeCenterId, "classrooms", validId],
		queryFn: async () => {
			const res = await apiFetch(`/api/classrooms/${validId}`);
			const data = await parseJsonResponse(
				res,
				classroomResponseSchema,
				"Failed to fetch classroom",
			);
			return data.classroom as unknown as ClassroomWithCounts;
		},
		enabled: validId.length > 0,
	});
}

interface ClassroomChild {
	assignmentId: string;
	childId: string;
	effectiveDate: string;
	firstName: string | null;
	lastName: string | null;
	dateOfBirth: string | null;
	ageGroup: string | null;
}

export function useClassroomChildren(classroomId: string) {
	const activeCenterId = useActiveCenterId();
	const validId = isUuid(classroomId) ? classroomId : "";

	return useQuery({
		queryKey: [activeCenterId, "classrooms", validId, "children"],
		queryFn: async () => {
			const res = await apiFetch(`/api/classrooms/${validId}/children`);
			const data = await parseJsonResponse(
				res,
				classroomChildrenResponseSchema,
				"Failed to fetch classroom children",
			);
			return data.children as unknown as ClassroomChild[];
		},
		enabled: validId.length > 0,
	});
}

interface ClassroomStaff {
	assignmentId: string;
	membershipId: string;
	effectiveDate: string;
	role: string | null;
	userName: string | null;
	userEmail: string | null;
}

export function useClassroomStaff(classroomId: string) {
	const activeCenterId = useActiveCenterId();
	const validId = isUuid(classroomId) ? classroomId : "";

	return useQuery({
		queryKey: [activeCenterId, "classrooms", validId, "staff"],
		queryFn: async () => {
			const res = await apiFetch(`/api/classrooms/${validId}/staff`);
			const data = await parseJsonResponse(
				res,
				classroomStaffResponseSchema,
				"Failed to fetch classroom staff",
			);
			return data.staff as unknown as ClassroomStaff[];
		},
		enabled: validId.length > 0,
	});
}

export function useCreateClassroom() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: CreateClassroomInput) => {
			const res = await apiFetch("/api/classrooms", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				classroomResponseSchema,
				"Failed to create classroom",
			);
			return data.classroom as unknown as ClassroomWithCounts;
		},
		onSuccess: (classroom) => {
			track(ANALYTICS_EVENTS.classroomCreated, {
				age_group: classroom.ageGroup,
			});
			toast.success("Classroom created.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useUpdateClassroom(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: UpdateClassroomInput) => {
			const res = await apiFetch(`/api/classrooms/${id}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				classroomResponseSchema,
				"Failed to update classroom",
			);
			return data.classroom as unknown as ClassroomWithCounts;
		},
		onSuccess: (_data, updateInput) => {
			track(ANALYTICS_EVENTS.classroomUpdated, { field_count: Object.keys(updateInput).length });
			toast.success("Classroom updated.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms", id] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useArchiveClassroom(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/classrooms/${id}/archive`, {
				method: "POST",
			});
			const data = await parseJsonResponse(
				res,
				classroomResponseSchema,
				"Failed to archive classroom",
			);
			return data.classroom as unknown as ClassroomWithCounts;
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.classroomArchived);
			toast.success("Classroom archived.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms", id] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useUnarchiveClassroom(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/classrooms/${id}/unarchive`, {
				method: "POST",
			});
			return parseJsonResponse(res, AcknowledgementResponseSchema, "Failed to unarchive classroom");
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.classroomRestored);
			toast.success("Classroom restored.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms", id] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

interface AssignChildInput {
	childId: string;
	effectiveDate: string;
}

export function useAssignChild(classroomId: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: AssignChildInput) => {
			const res = await apiFetch(`/api/classrooms/${classroomId}/children`, {
				method: "POST",
				body: JSON.stringify(input),
			});
			return parseJsonResponse(res, AcknowledgementResponseSchema, "Failed to assign child");
		},
		onSuccess: (_data, variables) => {
			track(ANALYTICS_EVENTS.classroomChildAssigned);
			toast.success("Child assigned.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			queryClient.invalidateQueries({
				queryKey: [activeCenterId, "classrooms", classroomId, "children"],
			});
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children", variables.childId] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useUnassignChild(classroomId: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (childId: string) => {
			const res = await apiFetch(`/api/classrooms/${classroomId}/children/${childId}`, {
				method: "DELETE",
			});
			return parseJsonResponse(res, AcknowledgementResponseSchema, "Failed to unassign child");
		},
		onSuccess: (_data, childId) => {
			track(ANALYTICS_EVENTS.classroomChildUnassigned);
			toast.success("Child unassigned.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			queryClient.invalidateQueries({
				queryKey: [activeCenterId, "classrooms", classroomId, "children"],
			});
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children", childId] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

interface AssignStaffInput {
	membershipId: string;
	effectiveDate: string;
}

export function useAssignStaff(classroomId: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: AssignStaffInput) => {
			const res = await apiFetch(`/api/classrooms/${classroomId}/staff`, {
				method: "POST",
				body: JSON.stringify(input),
			});
			return parseJsonResponse(res, AcknowledgementResponseSchema, "Failed to assign staff");
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.classroomStaffAssigned);
			toast.success("Staff assigned.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			queryClient.invalidateQueries({
				queryKey: [activeCenterId, "classrooms", classroomId, "staff"],
			});
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useUnassignStaff(classroomId: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (membershipId: string) => {
			const res = await apiFetch(`/api/classrooms/${classroomId}/staff/${membershipId}`, {
				method: "DELETE",
			});
			return parseJsonResponse(res, AcknowledgementResponseSchema, "Failed to unassign staff");
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.classroomStaffUnassigned);
			toast.success("Staff unassigned.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			queryClient.invalidateQueries({
				queryKey: [activeCenterId, "classrooms", classroomId, "staff"],
			});
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}
