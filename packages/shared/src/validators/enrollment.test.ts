import { describe, expect, it } from "vitest";
import { enrollChildSchema } from "./enrollment.js";

function isoFromToday(yearOffset: number, dayOffset = 0): string {
	const now = new Date();
	const d = new Date(
		Date.UTC(now.getUTCFullYear() + yearOffset, now.getUTCMonth(), now.getUTCDate() + dayOffset),
	);
	return d.toISOString().split("T")[0];
}

const guardians = [{ type: "new" as const, firstName: "Mia", lastName: "Nguyen" }];

function enrollPayload(dateOfBirth: string) {
	return {
		child: {
			firstName: "Ava",
			lastName: "Nguyen",
			dateOfBirth,
			ageGroup: "preschool" as const,
		},
		guardians,
	};
}

describe("enrollChildSchema dateOfBirth range", () => {
	it("accepts a plausible date of birth", () => {
		expect(enrollChildSchema.safeParse(enrollPayload(isoFromToday(-3))).success).toBe(true);
	});

	it("rejects a future date of birth (same rule as createChildSchema)", () => {
		expect(enrollChildSchema.safeParse(enrollPayload(isoFromToday(0, 1))).success).toBe(false);
	});

	it("rejects a date of birth more than 18 years ago", () => {
		expect(enrollChildSchema.safeParse(enrollPayload(isoFromToday(-18, -1))).success).toBe(false);
	});
});
