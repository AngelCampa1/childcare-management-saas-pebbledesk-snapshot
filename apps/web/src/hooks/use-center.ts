import type { Center } from "@pebbledesk/shared";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import type { UpdateCenterInput } from "@pebbledesk/shared/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { toast } from "../lib/toast";

/**
 * Permissive schema for a Center record. Only the id is required; unknown
 * fields pass through so backend additions don't break the client.
 */
const CenterResponseSchema = z.object({ center: z.object({ id: z.string() }).passthrough() });

export function useCurrentCenter(centerId: string | undefined) {
	return useQuery({
		queryKey: ["center", centerId],
		enabled: Boolean(centerId),
		queryFn: async () => {
			const res = await apiFetch(`/api/centers/${centerId}`);
			if (!res.ok) throw new Error("Failed to fetch center");
			const raw: unknown = await res.json();
			const data = CenterResponseSchema.parse(raw);
			return data.center as unknown as Center;
		},
	});
}

export function useUpdateCenter(centerId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: UpdateCenterInput) => {
			const res = await apiFetch(`/api/centers/${centerId}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to update center");
			}
			const raw: unknown = await res.json();
			const data = CenterResponseSchema.parse(raw);
			return data.center as unknown as Center;
		},
		onSuccess: (_center, input) => {
			track(ANALYTICS_EVENTS.centerSettingsUpdated, {
				field_count: Object.keys(input).length,
			});
			toast.success("Center settings saved.");
			queryClient.invalidateQueries({ queryKey: ["center", centerId] });
			queryClient.invalidateQueries({ queryKey: ["authStatus"] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}
