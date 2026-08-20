import { describe, expect, it } from "vitest";
import { getBillingState } from "./-billing-state";

describe("getBillingState", () => {
	it.each([
		"active",
		"trialing",
		"past_due",
	] as const)("treats %s subscriptions as usable billing states", (status) => {
		expect(getBillingState(status)).toBe(true);
	});

	it.each([
		"none",
		"canceled",
		"unpaid",
		"incomplete",
		"incomplete_expired",
		undefined,
	] as const)("treats %s subscriptions as not ready for billing", (status) => {
		expect(getBillingState(status)).toBe(false);
	});
});
