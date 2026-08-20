import type { PlanFeature } from "@pebbledesk/shared";
import { FEATURE_MIN_PLAN, SUBSCRIPTION_PLAN_CONFIG } from "@pebbledesk/shared/constants";
import { usePlanCheck } from "../lib/plan-gate";

interface PlanRequirementBadgeProps {
	feature: PlanFeature;
}

export function PlanRequirementBadge({ feature }: PlanRequirementBadgeProps) {
	const { currentPlan } = usePlanCheck({});

	if (currentPlan !== "trial") return null;

	const minPlan = FEATURE_MIN_PLAN[feature];
	const planLabel = SUBSCRIPTION_PLAN_CONFIG[minPlan].label;

	return (
		<span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
			{planLabel} feature
		</span>
	);
}
