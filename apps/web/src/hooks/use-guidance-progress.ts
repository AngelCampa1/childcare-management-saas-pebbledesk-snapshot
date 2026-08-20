import {
	type GuidanceProgress,
	type GuidanceProgressPatch,
	guidanceProgressResponseSchema,
} from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { extractErrorMessage } from "../lib/extract-error-message";
import { toast } from "../lib/toast";
import { useAuthSession } from "./use-auth-session";

export function guidanceProgressQueryKey(centerId?: string, membershipId?: string) {
	return [
		"guidance",
		"progress",
		centerId ?? "no-center",
		membershipId ?? "no-membership",
	] as const;
}

export function useGuidanceProgress() {
	const { data: session } = useAuthSession();
	const centerId = session?.membership.centerId;
	const membershipId = session?.membership.id;

	return useQuery({
		queryKey: guidanceProgressQueryKey(centerId, membershipId),
		enabled: Boolean(centerId && membershipId),
		queryFn: async () => {
			const res = await apiFetch("/api/guidance/progress");
			const raw: unknown = await res.json();
			const data = guidanceProgressResponseSchema.parse(raw);
			return data.progress as GuidanceProgress;
		},
	});
}

export function usePatchGuidanceProgress() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (patch: GuidanceProgressPatch) => {
			const res = await apiFetch("/api/guidance/progress", {
				method: "PATCH",
				body: JSON.stringify(patch),
			});
			const raw: unknown = await res.json();
			const data = guidanceProgressResponseSchema.parse(raw);
			return data.progress as GuidanceProgress;
		},
		onSuccess: (progress) => {
			queryClient.setQueryData(
				guidanceProgressQueryKey(progress.centerId, progress.membershipId),
				progress,
			);
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}
