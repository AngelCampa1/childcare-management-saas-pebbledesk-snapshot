import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "..");

describe("auth shell source usage", () => {
	it("uses shared subscription status and support email sources", () => {
		const authSource = readFileSync(resolve(appRoot, "routes/_auth.tsx"), "utf8");
		const supportSources = [
			authSource,
			readFileSync(resolve(appRoot, "routes/_auth/billing/index.tsx"), "utf8"),
			readFileSync(resolve(appRoot, "routes/_auth/overview.tsx"), "utf8"),
			readFileSync(resolve(appRoot, "routes/_auth/messages/index.tsx"), "utf8"),
		].join("\n");

		expect(authSource).toContain("isServiceAllowedSubscriptionStatus");
		expect(authSource).not.toContain("ACTIVE_SUBSCRIPTION_STATUSES");
		expect(authSource).not.toContain('status === "trialing"');
		expect(supportSources).toContain("PUBLIC_BRAND_KNOWLEDGE.supportEmail");
		expect(supportSources).not.toContain("mailto:support@pebbledesk.app");
	});
});
