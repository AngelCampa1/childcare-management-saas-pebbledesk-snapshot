import { describe, expect, it } from "vitest";
import { computeSetupProgress } from "./setup-progress";

describe("computeSetupProgress", () => {
	it("returns allDone=false and currentStep='Add a classroom' when all inputs are false", () => {
		const result = computeSetupProgress({
			hasClassrooms: false,
			hasChildren: false,
			hasGuardians: false,
			hasBilling: false,
		});
		expect(result.allDone).toBe(false);
		expect(result.currentStep?.label).toBe("Add a classroom");
		expect(result.steps).toHaveLength(5);
	});

	it("returns allDone=true and currentStep=null when all inputs are true", () => {
		const result = computeSetupProgress({
			hasClassrooms: true,
			hasChildren: true,
			hasGuardians: true,
			hasBilling: true,
		});
		expect(result.allDone).toBe(true);
		expect(result.currentStep).toBeNull();
	});

	it("returns partial state: classrooms done, currentStep='Enroll children'", () => {
		const result = computeSetupProgress({
			hasClassrooms: true,
			hasChildren: false,
			hasGuardians: false,
			hasBilling: false,
		});
		expect(result.allDone).toBe(false);
		expect(result.currentStep?.label).toBe("Enroll children");
	});

	it("marks account step as always done (index 1)", () => {
		const result = computeSetupProgress({
			hasClassrooms: false,
			hasChildren: false,
			hasGuardians: false,
			hasBilling: false,
		});
		expect(result.steps[0].done).toBe(true);
		expect(result.steps[0].label).toBe("Create your account");
	});

	it("marks individual steps correctly based on inputs", () => {
		const result = computeSetupProgress({
			hasClassrooms: true,
			hasChildren: true,
			hasGuardians: false,
			hasBilling: false,
		});
		expect(result.steps[1].done).toBe(true); // classrooms
		expect(result.steps[2].done).toBe(true); // children
		expect(result.steps[3].done).toBe(false); // guardians
		expect(result.steps[4].done).toBe(false); // billing
		expect(result.currentStep?.label).toBe("Add guardians");
	});

	it("returns allDone=false and currentStep='Set up billing' when only billing is missing", () => {
		const result = computeSetupProgress({
			hasClassrooms: true,
			hasChildren: true,
			hasGuardians: true,
			hasBilling: false,
		});
		expect(result.allDone).toBe(false);
		expect(result.currentStep?.label).toBe("Set up billing");
	});
});
