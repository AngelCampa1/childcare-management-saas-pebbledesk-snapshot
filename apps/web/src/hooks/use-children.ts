import type {
	Child,
	ChildWithDetails,
	CreateChildInput,
	EnrollChildInput,
	LinkGuardianInput,
	UpdateChildInput,
} from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	childDetailResponseSchema,
	childListResponseSchema,
	childMutationResponseSchema,
	enrollChildResponseSchema,
	linkGuardianResponseSchema,
	unlinkGuardianResponseSchema,
	updateGuardianLinkResponseSchema,
} from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { isUuid } from "../lib/is-uuid";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

/**
 * Children + child-guardian-link hooks.
 *
 * Audit cycle policy:
 *   - Every GET/POST/PATCH/DELETE flows through `parseJsonResponse(res, schema, msg)`
 *     so backend shape regressions surface as parse errors instead of silent
 *     `undefined` propagation (P1-001/P1-004).
 *   - Every mutation attaches `onError: toast.error(extractErrorMessage(...))` and a
 *     warm `onSuccess` toast so successes and failures are never silent (P0-001).
 */

// The backend caps every list request at PAGE_MAX=200 and defaults to just 50
// (apps/api/src/lib/pagination.ts). This flat list hook has no "load more" UI and
// feeds dashboard counts, dialogs, and the roster, so a single page would silently
// drop every child past the first 200. We drain all pages with a cursor loop so the
// roster is always complete regardless of center size — mirroring useSubsidyClaims.
const LIST_PAGE_LIMIT = 200;

interface ChildrenFilters {
	search?: string;
	status?: string;
	ageGroup?: string;
	classroomId?: string;
}

interface UseChildrenOptions {
	enabled?: boolean;
}

export function useChildren(filters?: ChildrenFilters, options?: UseChildrenOptions) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "children", filters],
		queryFn: async () => {
			const allChildren: Child[] = [];
			let cursor = 0;

			for (;;) {
				const params = new URLSearchParams();
				if (filters?.search) params.set("search", filters.search);
				if (filters?.status) params.set("status", filters.status);
				if (filters?.ageGroup) params.set("ageGroup", filters.ageGroup);
				if (filters?.classroomId) params.set("classroomId", filters.classroomId);
				params.set("limit", String(LIST_PAGE_LIMIT));
				params.set("cursor", String(cursor));

				const res = await apiFetch(`/api/children?${params.toString()}`);
				const data = await parseJsonResponse(
					res,
					childListResponseSchema,
					"Failed to fetch children",
				);
				const page = data.children as unknown as Child[];
				allChildren.push(...page);
				if (page.length < LIST_PAGE_LIMIT) break;
				cursor += LIST_PAGE_LIMIT;
			}

			return allChildren;
		},
		enabled: options?.enabled ?? true,
	});
}

export function useChild(id: string) {
	const activeCenterId = useActiveCenterId();
	const validId = isUuid(id) ? id : "";

	return useQuery({
		queryKey: [activeCenterId, "children", validId],
		queryFn: async () => {
			const res = await apiFetch(`/api/children/${validId}`);
			const data = await parseJsonResponse(res, childDetailResponseSchema, "Failed to fetch child");
			return data as unknown as {
				child: Child;
				currentClassroom: ChildWithDetails["currentClassroom"];
				guardians: ChildWithDetails["guardians"];
				primaryGuardianName: string | null;
			};
		},
		enabled: validId.length > 0,
	});
}

export function useCreateChild() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: CreateChildInput) => {
			const res = await apiFetch("/api/children", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				childMutationResponseSchema,
				"Failed to create child",
			);
			return data.child as unknown as Child;
		},
		onSuccess: (child) => {
			track(ANALYTICS_EVENTS.childCreated, { age_group: child.ageGroup });
			toast.success("Child created.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useUpdateChild(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: UpdateChildInput) => {
			const res = await apiFetch(`/api/children/${id}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				childMutationResponseSchema,
				"Failed to update child",
			);
			return data.child as unknown as Child;
		},
		onSuccess: (_data, variables) => {
			track(ANALYTICS_EVENTS.childUpdated, { field_count: Object.keys(variables).length });
			toast.success("Child details saved.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children", id] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useWithdrawChild(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/children/${id}/withdraw`, {
				method: "POST",
			});
			const data = await parseJsonResponse(
				res,
				childMutationResponseSchema,
				"Failed to withdraw child",
			);
			return data.child as unknown as Child;
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.childWithdrawn, {});
			toast.success("Child withdrawn.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children", id] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useReactivateChild(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/children/${id}/reactivate`, {
				method: "POST",
			});
			const data = await parseJsonResponse(
				res,
				childMutationResponseSchema,
				"Failed to reactivate child",
			);
			return data.child as unknown as Child;
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.childReactivated, {});
			toast.success("Child reactivated.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children", id] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useLinkGuardian(childId: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: LinkGuardianInput) => {
			const res = await apiFetch(`/api/children/${childId}/guardians`, {
				method: "POST",
				body: JSON.stringify(input),
			});
			return await parseJsonResponse(res, linkGuardianResponseSchema, "Failed to link guardian");
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.guardianLinked, {});
			toast.success("Guardian linked.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children", childId] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useUnlinkGuardian(childId: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (guardianId: string) => {
			const res = await apiFetch(`/api/children/${childId}/guardians/${guardianId}`, {
				method: "DELETE",
			});
			return await parseJsonResponse(
				res,
				unlinkGuardianResponseSchema,
				"Failed to unlink guardian",
			);
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.guardianUnlinked, {});
			toast.success("Guardian unlinked.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children", childId] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useUpdateGuardianLink(childId: string) {
	const qc = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async ({
			guardianId,
			data,
		}: {
			guardianId: string;
			data: { isPrimary?: boolean; authorizedPickup?: boolean; relationship?: string };
		}) => {
			const res = await apiFetch(`/api/children/${childId}/guardians/${guardianId}`, {
				method: "PATCH",
				body: JSON.stringify(data),
			});
			return await parseJsonResponse(
				res,
				updateGuardianLinkResponseSchema,
				"Failed to update guardian link",
			);
		},
		onSuccess: (_data, variables) => {
			track(ANALYTICS_EVENTS.guardianLinkUpdated, {
				field_count: Object.keys(variables.data).length,
			});
			toast.success("Guardian link updated.");
			qc.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			qc.invalidateQueries({ queryKey: [activeCenterId, "children", childId] });
			qc.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
			qc.invalidateQueries({ queryKey: [activeCenterId, "guardians", variables.guardianId] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useEnrollChild() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: EnrollChildInput) => {
			const res = await apiFetch("/api/children/enroll", {
				method: "POST",
				body: JSON.stringify(input),
			});
			return await parseJsonResponse(res, enrollChildResponseSchema, "Failed to enroll child");
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.enrollmentCompleted, { result: "success" });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "children"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "classrooms"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}
