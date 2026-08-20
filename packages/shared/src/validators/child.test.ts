import { describe, expect, it } from "vitest";
import { createChildSchema, updateChildSchema } from "./child.js";

function isoDaysFromToday(yearOffset: number, dayOffset = 0): string {
	const now = new Date();
	const d = new Date(
		Date.UTC(now.getUTCFullYear() + yearOffset, now.getUTCMonth(), now.getUTCDate() + dayOffset),
	);
	return d.toISOString().split("T")[0];
}

const base = {
	firstName: "Ava",
	lastName: "Nguyen",
	ageGroup: "preschool" as const,
};

describe("createChildSchema dateOfBirth range", () => {
	it("accepts a plausible recent date of birth", () => {
		expect(
			createChildSchema.safeParse({ ...base, dateOfBirth: isoDaysFromToday(-3) }).success,
		).toBe(true);
	});

	it("accepts a date of birth of today (newborn enrollment)", () => {
		expect(createChildSchema.safeParse({ ...base, dateOfBirth: isoDaysFromToday(0) }).success).toBe(
			true,
		);
	});

	it("rejects a future date of birth", () => {
		expect(
			createChildSchema.safeParse({ ...base, dateOfBirth: isoDaysFromToday(0, 1) }).success,
		).toBe(false);
	});

	it("rejects a date of birth more than 18 years ago", () => {
		expect(
			createChildSchema.safeParse({ ...base, dateOfBirth: isoDaysFromToday(-18, -1) }).success,
		).toBe(false);
	});

	it("accepts the boundary date exactly 18 years ago", () => {
		expect(
			createChildSchema.safeParse({ ...base, dateOfBirth: isoDaysFromToday(-18) }).success,
		).toBe(true);
	});

	it("still rejects a malformed date string", () => {
		expect(createChildSchema.safeParse({ ...base, dateOfBirth: "not-a-date" }).success).toBe(false);
	});
});

describe("updateChildSchema dateOfBirth range", () => {
	it("rejects a future date of birth on update", () => {
		expect(updateChildSchema.safeParse({ dateOfBirth: isoDaysFromToday(0, 1) }).success).toBe(
			false,
		);
	});

	it("accepts a plausible date of birth on update", () => {
		expect(updateChildSchema.safeParse({ dateOfBirth: isoDaysFromToday(-5) }).success).toBe(true);
	});
});
