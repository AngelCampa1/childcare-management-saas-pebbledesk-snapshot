import {
	isServiceAllowedSubscriptionStatus,
	type PlanFeature,
	planHasFeature,
	type SubscriptionPlan,
} from "@pebbledesk/shared";
import type { ReactNode } from "react";
import { useAuthSession } from "../hooks/use-auth-session";

export interface UsePlanCheckResult {
	allowed: boolean;
	currentPlan: SubscriptionPlan | null;
}

export interface PlanCheckOptions {
	plans?: SubscriptionPlan[];
	features?: PlanFeature[];
}

export function usePlanCheck(input: SubscriptionPlan[] | PlanCheckOptions): UsePlanCheckResult {
	const session = useAuthSession();

	const currentPlan = session.data?.center.subscriptionPlan ?? null;
	const currentStatus = session.data?.center.subscriptionStatus ?? "none";
	const options = Array.isArray(input) ? { plans: input } : input;
	const hasLegacyFullAccessTrial = currentStatus === "trialing" && currentPlan === "trial";
	const allowed =
		currentPlan !== null &&
		isServiceAllowedSubscriptionStatus(currentStatus) &&
		(hasLegacyFullAccessTrial ||
			((!options.plans || options.plans.includes(currentPlan)) &&
				(!options.features ||
					options.features.every((feature) => planHasFeature(currentPlan, feature)))));

	return { allowed, currentPlan };
}

export interface PlanGateProps {
	plans?: SubscriptionPlan[];
	features?: PlanFeature[];
	fallback?: ReactNode;
	children: ReactNode;
}

export function PlanGate({ plans, features, fallback = null, children }: PlanGateProps) {
	const { allowed } = usePlanCheck({ plans, features });

	if (!allowed) {
		return fallback;
	}

	return children;
}
