import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "..");

describe("API schema source usage", () => {
	it("uses shared billing arrays for subscription checkout enums", () => {
		const source = readFileSync(resolve(appRoot, "routes/subscriptions.ts"), "utf8");

		expect(source).toContain("PAYABLE_PLANS");
		expect(source).toContain("BILLING_CADENCES");
		expect(source).not.toContain('z.enum(["home", "center_starter", "center_pro", "group"])');
		expect(source).not.toContain('z.enum(["monthly", "annual"])');
	});

	it("uses shared subscription plan lists for webhook metadata validation", () => {
		const source = readFileSync(resolve(appRoot, "routes/subscriptions-webhook.ts"), "utf8");

		expect(source).toContain("SUBSCRIPTION_PLANS_LIST");
		expect(source).not.toContain('plan === "home"');
		expect(source).not.toContain('plan === "enterprise"');
	});
});
