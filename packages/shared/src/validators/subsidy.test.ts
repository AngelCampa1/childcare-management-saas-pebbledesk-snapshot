import { describe, expect, it } from "vitest";
import { createSubsidyClaimSchema, updateSubsidyClaimSchema } from "./subsidy.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

const validClaim = {
	subsidyCaseId: UUID,
	periodStart: "2026-04-01",
	periodEnd: "2026-04-05",
	daysAttended: 5,
	hoursAttended: 40,
	amountClaimed: 500,
	amountApproved: 450,
	amountPaid: 400,
	status: "paid",
};

describe("createSubsidyClaimSchema", () => {
	it("rejects approved amount greater than claimed amount", () => {
		expect(
			createSubsidyClaimSchema.safeParse({
				...validClaim,
				amountApproved: 501,
			}).success,
		).toBe(false);
	});

	it("rejects paid amount greater than approved amount", () => {
		expect(
			createSubsidyClaimSchema.safeParse({
				...validClaim,
				amountPaid: 451,
			}).success,
		).toBe(false);
	});

	it("rejects attended days beyond the inclusive claim period", () => {
		expect(
			createSubsidyClaimSchema.safeParse({
				...validClaim,
				daysAttended: 6,
			}).success,
		).toBe(false);
	});
});

describe("updateSubsidyClaimSchema", () => {
	it("rejects impossible claim states when all dependent fields are present", () => {
		expect(
			updateSubsidyClaimSchema.safeParse({
				...validClaim,
				amountPaid: 451,
			}).success,
		).toBe(false);
	});
});
