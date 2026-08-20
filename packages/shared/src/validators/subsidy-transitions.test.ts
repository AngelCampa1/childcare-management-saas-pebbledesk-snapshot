import { describe, expect, it } from "vitest";
import {
	canTransitionSubsidyStatus,
	isTerminalSubsidyStatus,
	SUBSIDY_STATUS_TRANSITIONS,
} from "./subsidy-transitions.js";

describe("SUBSIDY_STATUS_TRANSITIONS", () => {
	it("allows pending → active", () => {
		expect(SUBSIDY_STATUS_TRANSITIONS.pending).toContain("active");
	});

	it("allows pending → terminated", () => {
		expect(SUBSIDY_STATUS_TRANSITIONS.pending).toContain("terminated");
	});

	it("allows active → expired", () => {
		expect(SUBSIDY_STATUS_TRANSITIONS.active).toContain("expired");
	});

	it("allows active → terminated", () => {
		expect(SUBSIDY_STATUS_TRANSITIONS.active).toContain("terminated");
	});

	it("expired has no allowed transitions (terminal)", () => {
		expect(SUBSIDY_STATUS_TRANSITIONS.expired).toHaveLength(0);
	});

	it("terminated has no allowed transitions (terminal)", () => {
		expect(SUBSIDY_STATUS_TRANSITIONS.terminated).toHaveLength(0);
	});

	it("pending does not allow transition to expired", () => {
		expect(SUBSIDY_STATUS_TRANSITIONS.pending).not.toContain("expired");
	});

	it("active does not allow transition to pending", () => {
		expect(SUBSIDY_STATUS_TRANSITIONS.active).not.toContain("pending");
	});
});

describe("canTransitionSubsidyStatus", () => {
	// Allowed transitions
	it("returns true for pending → active", () => {
		expect(canTransitionSubsidyStatus("pending", "active")).toBe(true);
	});

	it("returns true for pending → terminated", () => {
		expect(canTransitionSubsidyStatus("pending", "terminated")).toBe(true);
	});

	it("returns true for active → expired", () => {
		expect(canTransitionSubsidyStatus("active", "expired")).toBe(true);
	});

	it("returns true for active → terminated", () => {
		expect(canTransitionSubsidyStatus("active", "terminated")).toBe(true);
	});

	// Disallowed transitions
	it("returns false for pending → expired", () => {
		expect(canTransitionSubsidyStatus("pending", "expired")).toBe(false);
	});

	it("returns false for active → pending", () => {
		expect(canTransitionSubsidyStatus("active", "pending")).toBe(false);
	});

	it("returns false for active → active (same state)", () => {
		expect(canTransitionSubsidyStatus("active", "active")).toBe(false);
	});

	it("returns false for pending → pending (same state)", () => {
		expect(canTransitionSubsidyStatus("pending", "pending")).toBe(false);
	});

	// Terminal states
	it("returns false for expired → active", () => {
		expect(canTransitionSubsidyStatus("expired", "active")).toBe(false);
	});

	it("returns false for expired → pending", () => {
		expect(canTransitionSubsidyStatus("expired", "pending")).toBe(false);
	});

	it("returns false for expired → terminated", () => {
		expect(canTransitionSubsidyStatus("expired", "terminated")).toBe(false);
	});

	it("returns false for expired → expired (same state)", () => {
		expect(canTransitionSubsidyStatus("expired", "expired")).toBe(false);
	});

	it("returns false for terminated → active", () => {
		expect(canTransitionSubsidyStatus("terminated", "active")).toBe(false);
	});

	it("returns false for terminated → pending", () => {
		expect(canTransitionSubsidyStatus("terminated", "pending")).toBe(false);
	});

	it("returns false for terminated → expired", () => {
		expect(canTransitionSubsidyStatus("terminated", "expired")).toBe(false);
	});

	it("returns false for terminated → terminated (same state)", () => {
		expect(canTransitionSubsidyStatus("terminated", "terminated")).toBe(false);
	});
});

describe("isTerminalSubsidyStatus", () => {
	it("returns true for expired", () => {
		expect(isTerminalSubsidyStatus("expired")).toBe(true);
	});

	it("returns true for terminated", () => {
		expect(isTerminalSubsidyStatus("terminated")).toBe(true);
	});

	it("returns false for active", () => {
		expect(isTerminalSubsidyStatus("active")).toBe(false);
	});

	it("returns false for pending", () => {
		expect(isTerminalSubsidyStatus("pending")).toBe(false);
	});
});
