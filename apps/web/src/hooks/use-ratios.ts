import type {
	RatioSnapshot,
	RatioViolation,
	RoomRatioStatus,
	ViolationNotesInput,
} from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	ratioSnapshotsResponseSchema,
	ratiosResponseSchema,
	ratioViolationResponseSchema,
	ratioViolationsResponseSchema,
} from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

interface RatioSnapshotFilters {
	classroomId?: string;
	from?: string;
	to?: string;
}

interface RatioViolationFilters {
	classroomId?: string;
	status?: "open" | "resolved";
	from?: string;
	to?: string;
}

interface UseRatiosOptions {
	enabled?: boolean;
}

export function useRatios(options?: UseRatiosOptions) {
	const activeCenterId = useActiveCenterId();
	const isEnabled = options?.enabled ?? true;

	return useQuery({
		queryKey: [activeCenterId, "ratios"],
		queryFn: async () => {
			const res = await apiFetch("/api/ratios");
			const data = await parseJsonResponse(res, ratiosResponseSchema, "Failed to fetch ratios");
			return data.ratios as unknown as RoomRatioStatus[];
		},
		enabled: isEnabled,
		refetchInterval: 15_000,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: true,
	});
}

export function useRatioSnapshots(filters?: RatioSnapshotFilters) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "ratioSnapshots", filters],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (filters?.classroomId) params.set("classroomId", filters.classroomId);
			if (filters?.from) params.set("from", filters.from);
			if (filters?.to) params.set("to", filters.to);

			const query = params.toString();
			const path = `/api/ratios/snapshots${query ? `?${query}` : ""}`;
			const res = await apiFetch(path);
			const data = await parseJsonResponse(
				res,
				ratioSnapshotsResponseSchema,
				"Failed to fetch ratio snapshots",
			);
			return data.snapshots as unknown as RatioSnapshot[];
		},
	});
}

export function useRatioViolations(filters?: RatioViolationFilters) {
	const activeCenterId = useActiveCenterId();
	const shouldPollOpenViolations = filters?.status === "open";
	return useQuery({
		queryKey: [activeCenterId, "ratioViolations", filters],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (filters?.classroomId) params.set("classroomId", filters.classroomId);
			if (filters?.status) params.set("status", filters.status);
			if (filters?.from) params.set("from", filters.from);
			if (filters?.to) params.set("to", filters.to);

			const query = params.toString();
			const path = `/api/ratios/violations${query ? `?${query}` : ""}`;
			const res = await apiFetch(path);
			const data = await parseJsonResponse(
				res,
				ratioViolationsResponseSchema,
				"Failed to fetch ratio violations",
			);
			return data.violations as unknown as RatioViolation[];
		},
		refetchInterval: shouldPollOpenViolations ? 15_000 : false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: true,
	});
}

export function useUpdateViolationNotes() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async ({ id, ...input }: ViolationNotesInput & { id: string }) => {
			const res = await apiFetch(`/api/ratios/violations/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ resolutionNotes: input.resolutionNotes }),
			});
			const data = await parseJsonResponse(
				res,
				ratioViolationResponseSchema,
				"Failed to update violation notes",
			);
			return data.violation as unknown as RatioViolation;
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.ratioViolationNotesUpdated, {});
			toast.success("Violation notes saved.");
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioViolations"] });
		},
	});
}
