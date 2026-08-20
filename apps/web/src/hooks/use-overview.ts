import {
	ACTIVE_SUBSCRIPTION_STATUS,
	isServiceAllowedSubscriptionStatus,
	NO_SUBSCRIPTION_STATUS,
	planHasFeature,
} from "@pebbledesk/shared";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, apiFetch } from "../api";
import { useAuthSession } from "./use-auth-session";
import { useActiveCenterId, useMemberships } from "./use-memberships";

export type RatioStatus = "ok" | "warning" | "violation" | "unknown";

/**
 * Permissive schema for the multi-center overview response. Validates the
 * shape the dashboard cards depend on; unknown fields pass through.
 */
const CenterOverviewSchema = z
	.object({
		centerId: z.string(),
		centerName: z.string(),
		ratioStatus: z.enum(["ok", "warning", "violation", "unknown"]),
	})
	.passthrough();

const MultiCenterOverviewResponseSchema = z
	.object({ centers: z.array(CenterOverviewSchema) })
	.passthrough();

export interface CenterOverview {
	centerId: string;
	centerName: string;
	role: string;
	activeChildCount: number;
	ratioStatus: RatioStatus;
	openViolationCount: number;
	unreadAlertCount: number;
}

export function useMultiCenterOverview() {
	const activeCenterId = useActiveCenterId();
	const { data: session } = useAuthSession();
	const { data: memberships } = useMemberships();
	const plan = session?.center.subscriptionPlan;
	const status =
		session?.center.subscriptionStatus ??
		(plan ? ACTIVE_SUBSCRIPTION_STATUS : NO_SUBSCRIPTION_STATUS);
	const hasMultiCenterAccess =
		!!plan && isServiceAllowedSubscriptionStatus(status) && planHasFeature(plan, "multi_center");
	const hasMultipleCenters = (memberships?.length ?? 0) > 1;

	return useQuery({
		queryKey: [activeCenterId, "overview", "multi-center"],
		queryFn: async () => {
			try {
				const res = await apiFetch("/api/overview/multi-center");
				const raw: unknown = await res.json();
				const data = MultiCenterOverviewResponseSchema.parse(raw);
				return data.centers as unknown as CenterOverview[];
			} catch (err) {
				// Legacy fallback in case a stale enterprise session still receives 403.
				if (err instanceof ApiError && err.status === 403) return [];
				throw err;
			}
		},
		enabled: hasMultiCenterAccess && hasMultipleCenters,
		initialData: [],
		retry: false,
	});
}
