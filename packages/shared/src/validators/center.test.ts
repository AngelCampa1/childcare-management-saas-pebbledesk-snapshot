/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAYABLE_PLANS } from "../constants/billing.js";
import { selfServeSubscriptionPlanSchema } from "./center.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("center validators", () => {
	it("uses payable plans as the source of truth for self-serve subscription plans", () => {
		const source = readFileSync(resolve(currentDir, "center.ts"), "utf8");

		expect(source).toContain("PAYABLE_PLANS");
		expect(source).not.toContain('"center_starter",');
		expect(
			PAYABLE_PLANS.every((plan) => selfServeSubscriptionPlanSchema.safeParse(plan).success),
		).toBe(true);
		expect(selfServeSubscriptionPlanSchema.safeParse("enterprise").success).toBe(false);
	});
});
