import { describe, expect, it } from "vitest";
import type { AgeGroup } from "./enums.js";
import { AGE_GROUPS } from "./enums.js";
import {
	getRequiredRatio,
	isStateRatioStricter,
	resolveEffectiveRatioRule,
	STATE_RATIO_TABLES,
} from "./state-ratios.js";

describe("STATE_RATIO_TABLES", () => {
	it("TX infant rule returns correct staff:children and citation", () => {
		const rule = STATE_RATIO_TABLES.TX.infant;
		expect(rule.staff).toBe(1);
		expect(rule.children).toBe(4);
		expect(rule.citation).toBe("TX Admin Code 746.3303");
	});

	it("CA preschool rule returns correct staff:children and citation", () => {
		const rule = STATE_RATIO_TABLES.CA.preschool;
		expect(rule.staff).toBe(1);
		expect(rule.children).toBe(12);
		expect(rule.citation).toBe("CA Title 22 §101216.3");
	});

	it("FL toddler rule returns correct staff:children and citation", () => {
		const rule = STATE_RATIO_TABLES.FL.toddler;
		expect(rule.staff).toBe(1);
		expect(rule.children).toBe(11);
		expect(rule.citation).toBe("FL 65C-22.001(5)(a)3");
	});

	it("all TX age groups have staff:1", () => {
		for (const ageGroup of AGE_GROUPS) {
			expect(STATE_RATIO_TABLES.TX[ageGroup].staff).toBe(1);
		}
	});

	it("all CA age groups have staff:1", () => {
		for (const ageGroup of AGE_GROUPS) {
			expect(STATE_RATIO_TABLES.CA[ageGroup].staff).toBe(1);
		}
	});

	it("all FL age groups have staff:1", () => {
		for (const ageGroup of AGE_GROUPS) {
			expect(STATE_RATIO_TABLES.FL[ageGroup].staff).toBe(1);
		}
	});
});

describe("getRequiredRatio", () => {
	it("returns correct rule for TX infant", () => {
		const rule = getRequiredRatio("TX", "infant");
		expect(rule).not.toBeNull();
		expect(rule?.staff).toBe(1);
		expect(rule?.children).toBe(4);
		expect(rule?.citation).toBe("TX Admin Code 746.3303");
	});

	it("returns correct rule for CA preschool", () => {
		const rule = getRequiredRatio("CA", "preschool");
		expect(rule).not.toBeNull();
		expect(rule?.staff).toBe(1);
		expect(rule?.children).toBe(12);
		expect(rule?.citation).toBe("CA Title 22 §101216.3");
	});

	it("returns correct rule for FL toddler", () => {
		const rule = getRequiredRatio("FL", "toddler");
		expect(rule).not.toBeNull();
		expect(rule?.staff).toBe(1);
		expect(rule?.children).toBe(11);
		expect(rule?.citation).toBe("FL 65C-22.001(5)(a)3");
	});

	it("returns null for unsupported state NY", () => {
		const rule = getRequiredRatio("NY", "infant");
		expect(rule).toBeNull();
	});

	it("returns null gracefully for unknown age group", () => {
		const rule = getRequiredRatio("TX", "unknown_group" as AgeGroup);
		expect(rule).toBeNull();
	});

	it("returns null for empty string state", () => {
		const rule = getRequiredRatio("", "infant");
		expect(rule).toBeNull();
	});

	it("returns correct rule for TX young_toddler", () => {
		const rule = getRequiredRatio("TX", "young_toddler");
		expect(rule?.children).toBe(5);
	});

	it("returns correct rule for TX toddler", () => {
		const rule = getRequiredRatio("TX", "toddler");
		expect(rule?.children).toBe(9);
	});

	it("returns correct rule for TX preschool", () => {
		const rule = getRequiredRatio("TX", "preschool");
		expect(rule?.children).toBe(15);
	});

	it("returns correct rule for TX pre_k", () => {
		const rule = getRequiredRatio("TX", "pre_k");
		expect(rule?.children).toBe(18);
	});

	it("returns correct rule for TX school_age", () => {
		const rule = getRequiredRatio("TX", "school_age");
		expect(rule?.children).toBe(26);
	});
});

describe("isStateRatioStricter", () => {
	it("returns true when state allows fewer children per staff", () => {
		// State says max 3 children per staff, classroom says 5 — state is stricter
		expect(isStateRatioStricter({ staff: 1, children: 3, citation: "CA" }, 5)).toBe(true);
	});

	it("returns false when classroom is stricter (classroom allows fewer children)", () => {
		// State says max 4 children per staff, classroom says 2 — classroom is stricter
		expect(isStateRatioStricter({ staff: 1, children: 4, citation: "TX" }, 2)).toBe(false);
	});

	it("returns false when state and classroom have the same children count", () => {
		// Equal — classroom value wins (no override needed)
		expect(isStateRatioStricter({ staff: 1, children: 4, citation: "TX" }, 4)).toBe(false);
	});

	it("returns true for CA infant (3) vs classroom 5", () => {
		const rule = getRequiredRatio("CA", "infant");
		expect(rule).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: rule is asserted non-null above
		expect(isStateRatioStricter(rule!, 5)).toBe(true);
	});

	it("returns false for TX school_age (26) vs classroom 20", () => {
		const rule = getRequiredRatio("TX", "school_age");
		expect(rule).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: rule is asserted non-null above
		expect(isStateRatioStricter(rule!, 20)).toBe(false);
	});
});

describe("resolveEffectiveRatioRule", () => {
	it("uses a stricter state ratio rule when one applies", () => {
		const result = resolveEffectiveRatioRule({
			centerState: "CA",
			ageGroup: "infant",
			minRatioStaff: 1,
			minRatioChildren: 5,
		});

		expect(result.minRatioStaff).toBe(1);
		expect(result.minRatioChildren).toBe(3);
		expect(result.ratioRequired).toBeCloseTo(1 / 3);
		expect(result.ratioRuleSource).toBe("state:CA");
	});

	it("keeps the classroom ratio when it is stricter than the state rule", () => {
		const result = resolveEffectiveRatioRule({
			centerState: "TX",
			ageGroup: "school_age",
			minRatioStaff: 1,
			minRatioChildren: 20,
		});

		expect(result.minRatioStaff).toBe(1);
		expect(result.minRatioChildren).toBe(20);
		expect(result.ratioRequired).toBeCloseTo(1 / 20);
		expect(result.ratioRuleSource).toBe("classroom");
	});

	it("keeps the classroom ratio for unsupported states", () => {
		const result = resolveEffectiveRatioRule({
			centerState: "NY",
			ageGroup: "infant",
			minRatioStaff: 1,
			minRatioChildren: 5,
		});

		expect(result.minRatioChildren).toBe(5);
		expect(result.ratioRequired).toBeCloseTo(1 / 5);
		expect(result.ratioRuleSource).toBe("classroom");
	});

	// Regression: multi-staff classroom ratios must be normalized before comparing
	// against the state rule. A 2:8 classroom is 1:4, equal to TX infant (1:4), so
	// the classroom rule should stand rather than being "overridden" by the state.
	it("does not override an equal multi-staff classroom ratio (2:8 == state 1:4)", () => {
		const result = resolveEffectiveRatioRule({
			centerState: "TX",
			ageGroup: "infant",
			minRatioStaff: 2,
			minRatioChildren: 8,
		});

		expect(result.ratioRuleSource).toBe("classroom");
		expect(result.minRatioStaff).toBe(2);
		expect(result.minRatioChildren).toBe(8);
		expect(result.ratioRequired).toBeCloseTo(2 / 8);
	});

	it("keeps a stricter multi-staff classroom ratio (2:6 == 1:3 beats state 1:4)", () => {
		const result = resolveEffectiveRatioRule({
			centerState: "TX",
			ageGroup: "infant",
			minRatioStaff: 2,
			minRatioChildren: 6,
		});

		expect(result.ratioRuleSource).toBe("classroom");
		expect(result.ratioRequired).toBeCloseTo(2 / 6);
	});

	it("expresses ratioRequired in the state rule's own terms when the state wins", () => {
		// Lenient multi-staff classroom (2:20 = 1:10) loses to CA infant (1:3).
		const result = resolveEffectiveRatioRule({
			centerState: "CA",
			ageGroup: "infant",
			minRatioStaff: 2,
			minRatioChildren: 20,
		});

		expect(result.ratioRuleSource).toBe("state:CA");
		expect(result.minRatioStaff).toBe(1);
		expect(result.minRatioChildren).toBe(3);
		expect(result.ratioRequired).toBeCloseTo(1 / 3);
	});
});

describe("isStateRatioStricter — normalized comparison", () => {
	it("treats an equal multi-staff classroom ratio as not stricter", () => {
		// state 1:4 vs classroom 2:8 (== 1:4) — equal, state not stricter
		expect(isStateRatioStricter({ staff: 1, children: 4, citation: "TX" }, 8, 2)).toBe(false);
	});

	it("recognizes a stricter multi-staff classroom ratio", () => {
		// state 1:4 vs classroom 2:6 (== 1:3) — classroom stricter, state not stricter
		expect(isStateRatioStricter({ staff: 1, children: 4, citation: "TX" }, 6, 2)).toBe(false);
	});

	it("recognizes a stricter multi-staff state rule", () => {
		// hypothetical state 2:6 (==1:3) vs classroom 1:4 — state stricter
		expect(isStateRatioStricter({ staff: 2, children: 6, citation: "X" }, 4, 1)).toBe(true);
	});
});
