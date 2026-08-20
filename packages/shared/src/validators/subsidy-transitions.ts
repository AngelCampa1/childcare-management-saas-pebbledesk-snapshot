import type { SubsidyCaseStatus } from "../constants/enums.js";

/**
 * Allowed status transitions for a subsidy case.
 * Terminal states (expired, terminated) map to an empty array — no transitions
 * are permitted once a case reaches them.
 */
export const SUBSIDY_STATUS_TRANSITIONS: Readonly<
	Record<SubsidyCaseStatus, readonly SubsidyCaseStatus[]>
> = {
	pending: ["active", "terminated"],
	active: ["expired", "terminated"],
	expired: [],
	terminated: [],
} as const;

/**
 * Returns true when the given subsidy case status is terminal — i.e. no
 * further transitions are permitted. Derived directly from the state machine
 * so it stays correct if transitions are ever updated.
 */
export function isTerminalSubsidyStatus(status: SubsidyCaseStatus): boolean {
	return SUBSIDY_STATUS_TRANSITIONS[status].length === 0;
}

/**
 * Returns true when transitioning a subsidy case from `from` to `to` is
 * permitted according to the defined state machine.
 */
export function canTransitionSubsidyStatus(
	from: SubsidyCaseStatus,
	to: SubsidyCaseStatus,
): boolean {
	return (SUBSIDY_STATUS_TRANSITIONS[from] as readonly SubsidyCaseStatus[]).includes(to);
}
