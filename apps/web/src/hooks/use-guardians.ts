import type {
	CreateGuardianInput,
	Guardian,
	GuardianDirectoryEntry,
	GuardianWithChildren,
	UpdateGuardianInput,
} from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	deleteGuardianResponseSchema,
	guardianDetailResponseSchema,
	guardianListResponseSchema,
	guardianMutationResponseSchema,
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
 * Guardian directory hooks.
 *
 * Audit cycle policy:
 *   - Every GET/POST/PATCH/DELETE flows through `parseJsonResponse(res, schema, msg)`
 *     so backend shape regressions surface as parse errors (P1-001).
 *   - Every mutation attaches `onError: toast.error(extractErrorMessage(...))` and a
 *     warm `onSuccess` toast so successes and failures are never silent (P0-001).
 */

// The backend caps every list request at PAGE_MAX=200 and defaults to just 50
// (apps/api/src/lib/pagination.ts). This flat directory hook has no "load more" UI
// and feeds the guardian directory, message/billing recipient pickers, and dashboard
// counts. A large center can easily hold more than 200 guardians (one or two per
// child), so a single page would silently drop rows. We drain all pages with a cursor
// loop so the directory is always complete — mirroring useSubsidyClaims.
const LIST_PAGE_LIMIT = 200;

interface UseGuardiansOptions {
	enabled?: boolean;
}

export function useGuardians(search?: string, options?: UseGuardiansOptions) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "guardians", { search }],
		queryFn: async () => {
			const allGuardians: GuardianDirectoryEntry[] = [];
			let cursor = 0;

			for (;;) {
				const params = new URLSearchParams();
				if (search) params.set("search", search);
				params.set("limit", String(LIST_PAGE_LIMIT));
				params.set("cursor", String(cursor));

				const res = await apiFetch(`/api/guardians?${params.toString()}`);
				const data = await parseJsonResponse(
					res,
					guardianListResponseSchema,
					"Failed to fetch guardians",
				);
				const page = data.guardians as unknown as GuardianDirectoryEntry[];
				allGuardians.push(...page);
				if (page.length < LIST_PAGE_LIMIT) break;
				cursor += LIST_PAGE_LIMIT;
			}

			return allGuardians;
		},
		enabled: options?.enabled ?? true,
	});
}

export function useGuardian(id: string) {
	const activeCenterId = useActiveCenterId();
	const validId = isUuid(id) ? id : "";

	return useQuery({
		queryKey: [activeCenterId, "guardians", validId],
		queryFn: async () => {
			const res = await apiFetch(`/api/guardians/${validId}`);
			const data = await parseJsonResponse(
				res,
				guardianDetailResponseSchema,
				"Failed to fetch guardian",
			);
			return data as unknown as {
				guardian: Guardian;
				children: GuardianWithChildren["children"];
			};
		},
		enabled: validId.length > 0,
	});
}

export function useCreateGuardian() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: CreateGuardianInput) => {
			const res = await apiFetch("/api/guardians", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				guardianMutationResponseSchema,
				"Failed to create guardian",
			);
			return data.guardian as unknown as Guardian;
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.guardianCreated);
			toast.success("Guardian added.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useDeleteGuardian() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async ({ id }: { id: string }) => {
			const res = await apiFetch(`/api/guardians/${id}`, { method: "DELETE" });
			return await parseJsonResponse(
				res,
				deleteGuardianResponseSchema,
				"Failed to delete guardian",
			);
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.guardianDeleted);
			toast.success("Guardian deleted.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}

export function useUpdateGuardian(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: UpdateGuardianInput) => {
			const res = await apiFetch(`/api/guardians/${id}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				guardianMutationResponseSchema,
				"Failed to update guardian",
			);
			return data.guardian as unknown as Guardian;
		},
		onSuccess: (_data, updateInput) => {
			track(ANALYTICS_EVENTS.guardianUpdated, { field_count: Object.keys(updateInput).length });
			toast.success("Guardian details saved.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "guardians", id] });
		},
		onError: (err) => {
			toast.error(extractErrorMessage(err));
		},
	});
}
