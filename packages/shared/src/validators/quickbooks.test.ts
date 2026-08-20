import { describe, expect, it } from "vitest";
import { quickbooksReviewReconciliationSchema } from "./quickbooks.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("quickbooksReviewReconciliationSchema", () => {
	it("requires local target ids to be UUID-like", () => {
		expect(
			quickbooksReviewReconciliationSchema.safeParse({ localTargetId: "not-a-uuid" }).success,
		).toBe(false);
		expect(quickbooksReviewReconciliationSchema.safeParse({ localTargetId: UUID }).success).toBe(
			true,
		);
	});
});
