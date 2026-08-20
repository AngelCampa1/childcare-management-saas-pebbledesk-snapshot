import { computeSetupProgress, type SetupStep } from "../lib/setup-progress";
import { getBillingState } from "../routes/_auth/-billing-state";
import { useAuthSession } from "./use-auth-session";
import { useChildren } from "./use-children";
import { useClassrooms } from "./use-classrooms";
import { useGuardians } from "./use-guardians";

export interface SetupProgressResult {
	allDone: boolean;
	isLoading: boolean;
	currentStep: SetupStep | null;
}

export function useSetupProgress(): SetupProgressResult {
	const { data: session, isLoading: sessionLoading } = useAuthSession();
	const role = session?.membership.role ?? "owner";
	const enabled = Boolean(session && role !== "staff");

	const { data: classrooms, isLoading: classroomsLoading } = useClassrooms(undefined, {
		enabled,
	});
	const { data: children, isLoading: childrenLoading } = useChildren(undefined, { enabled });
	const { data: guardians, isLoading: guardiansLoading } = useGuardians(undefined, { enabled });

	const isLoading =
		sessionLoading || (enabled && (classroomsLoading || childrenLoading || guardiansLoading));

	if (isLoading || !session) {
		return { allDone: false, isLoading, currentStep: null };
	}

	const hasClassrooms = (classrooms ?? []).some((c) => !c.archivedAt);
	const hasChildren = (children ?? []).some(
		(c) => c.enrollmentStatus === "active" || c.enrollmentStatus === "waitlist",
	);
	const hasGuardians = (guardians?.length ?? 0) > 0;
	const hasBilling = Boolean(getBillingState(session.center.subscriptionStatus));

	const { currentStep, allDone } = computeSetupProgress({
		hasClassrooms,
		hasChildren,
		hasGuardians,
		hasBilling,
	});

	return { allDone, isLoading: false, currentStep };
}
