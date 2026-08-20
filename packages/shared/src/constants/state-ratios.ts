import type { RatioRuleSource } from "../types/attendance.js";
import type { AgeGroup } from "./enums.js";

export type StateRatioRule = {
	/** Staff count in the ratio (numerator) */
	staff: number;
	/** Maximum children per staff (denominator) */
	children: number;
	/** Legal citation for the rule */
	citation: string;
};

export type EffectiveRatioRule = {
	minRatioStaff: number;
	minRatioChildren: number;
	ratioRequired: number;
	ratioRuleSource: RatioRuleSource;
};

// Texas HHSC Minimum Standards for Licensed Child Care Centers (746)
// California Title 22 CCR §101216.3 - Staff-Child Ratio Requirements
// Florida 65C-22.001 - Child Care Standards

export const STATE_RATIO_TABLES: Record<"TX" | "CA" | "FL", Record<AgeGroup, StateRatioRule>> = {
	TX: {
		infant: { staff: 1, children: 4, citation: "TX Admin Code 746.3303" },
		young_toddler: { staff: 1, children: 5, citation: "TX Admin Code 746.3303" },
		toddler: { staff: 1, children: 9, citation: "TX Admin Code 746.3303" },
		preschool: { staff: 1, children: 15, citation: "TX Admin Code 746.3303" },
		pre_k: { staff: 1, children: 18, citation: "TX Admin Code 746.3303" },
		school_age: { staff: 1, children: 26, citation: "TX Admin Code 746.3303" },
	},
	CA: {
		infant: { staff: 1, children: 3, citation: "CA Title 22 §101216.3" },
		young_toddler: { staff: 1, children: 6, citation: "CA Title 22 §101216.3" },
		toddler: { staff: 1, children: 6, citation: "CA Title 22 §101216.3" },
		preschool: { staff: 1, children: 12, citation: "CA Title 22 §101216.3" },
		pre_k: { staff: 1, children: 12, citation: "CA Title 22 §101216.3" },
		school_age: { staff: 1, children: 14, citation: "CA Title 22 §101216.3" },
	},
	FL: {
		infant: { staff: 1, children: 4, citation: "FL 65C-22.001(5)(a)1" },
		young_toddler: { staff: 1, children: 6, citation: "FL 65C-22.001(5)(a)2" },
		toddler: { staff: 1, children: 11, citation: "FL 65C-22.001(5)(a)3" },
		preschool: { staff: 1, children: 20, citation: "FL 65C-22.001(5)(a)4" },
		pre_k: { staff: 1, children: 20, citation: "FL 65C-22.001(5)(a)4" },
		school_age: { staff: 1, children: 25, citation: "FL 65C-22.001(5)(a)5" },
	},
};

/** Returns the state ratio rule for a given state and age group, or null if state not supported */
export function getRequiredRatio(state: string, ageGroup: AgeGroup): StateRatioRule | null {
	const stateTable = STATE_RATIO_TABLES[state as keyof typeof STATE_RATIO_TABLES];
	if (!stateTable) return null;
	return stateTable[ageGroup] ?? null;
}

/**
 * Returns true if the state rule is stricter than the classroom rule.
 * "Stricter" means fewer children allowed per staff member. Both sides are
 * normalized to children-per-staff before comparing, so a classroom expressed
 * with a multi-staff base (e.g. 2 staff : 8 children = 1:4) is compared on equal
 * footing with a state rule (e.g. 1 staff : 4 children = 1:4).
 */
export function isStateRatioStricter(
	stateRule: StateRatioRule,
	classroomMinRatioChildren: number,
	classroomMinRatioStaff = 1,
): boolean {
	const stateChildrenPerStaff = stateRule.children / stateRule.staff;
	const classroomChildrenPerStaff = classroomMinRatioChildren / classroomMinRatioStaff;
	return stateChildrenPerStaff < classroomChildrenPerStaff;
}

export function resolveEffectiveRatioRule(input: {
	centerState: string;
	ageGroup: AgeGroup;
	minRatioStaff: number;
	minRatioChildren: number;
}): EffectiveRatioRule {
	const stateRule = getRequiredRatio(input.centerState, input.ageGroup);
	if (
		stateRule !== null &&
		isStateRatioStricter(stateRule, input.minRatioChildren, input.minRatioStaff)
	) {
		// State rule wins — express the effective rule in the state rule's own
		// terms so ratioRequired reflects the state requirement, not a blend of
		// the classroom's staff count with the state's children count.
		return {
			minRatioStaff: stateRule.staff,
			minRatioChildren: stateRule.children,
			ratioRequired: stateRule.staff / stateRule.children,
			ratioRuleSource: `state:${input.centerState}` as RatioRuleSource,
		};
	}

	return {
		minRatioStaff: input.minRatioStaff,
		minRatioChildren: input.minRatioChildren,
		ratioRequired: input.minRatioStaff / input.minRatioChildren,
		ratioRuleSource: "classroom",
	};
}
