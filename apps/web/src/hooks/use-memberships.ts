import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { toast } from "../lib/toast";
import { useAuthSession } from "./use-auth-session";

export interface Membership {
	id: string;
	centerId: string;
	centerName: string;
	role: string;
	acceptedAt: string;
}

/**
 * Permissive schema for a membership record. Validates the fields the center
 * switcher relies on; unknown fields pass through.
 */
const MembershipSchema = z
	.object({
		id: z.string(),
		centerId: z.string(),
		centerName: z.string(),
	})
	.passthrough();

const MembershipsResponseSchema = z
	.object({ memberships: z.array(MembershipSchema) })
	.passthrough();

export function useActiveCenterId(): string | undefined {
	const { data: session } = useAuthSession();
	return session?.membership.centerId;
}

export function useMemberships() {
	return useQuery({
		queryKey: ["memberships", "mine"],
		queryFn: async () => {
			const res = await apiFetch("/api/memberships/mine");
			if (!res.ok) throw new Error("Failed to load memberships");
			const raw: unknown = await res.json();
			const data = MembershipsResponseSchema.parse(raw);
			return data.memberships as unknown as Membership[];
		},
	});
}

export function useSwitchCenter() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (centerId: string) => {
			const res = await apiFetch("/api/memberships/switch", {
				method: "POST",
				body: JSON.stringify({ centerId }),
			});
			if (!res.ok) throw new Error("Failed to switch center");
		},
		onSuccess: async () => {
			track(ANALYTICS_EVENTS.centerSwitched, {});
			await queryClient.cancelQueries();
			// Explicitly remove all center-scoped queries (children, classrooms, ratios, etc.)
			// before clearing the full cache so any pending cache writes for the old center
			// do not survive the switch.
			queryClient.removeQueries({
				predicate: (query) =>
					Array.isArray(query.queryKey) &&
					query.queryKey.some(
						(k) => typeof k === "string" && k !== "authSession" && k !== "authStatus",
					),
			});
			queryClient.clear();
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}
