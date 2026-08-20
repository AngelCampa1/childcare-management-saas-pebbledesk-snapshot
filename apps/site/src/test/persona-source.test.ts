import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "..");

describe("persona page source usage", () => {
	it("uses shared offering claims for trial, state support, and migration support copy", () => {
		const source = readFileSync(resolve(appRoot, "config/persona-pages.ts"), "utf8");

		expect(source).toContain("PEBBLEDESK_OFFERING.claims.trialStartDisclosure");
		expect(source).toContain("PEBBLEDESK_OFFERING.claims.stateSupport");
		expect(source).toContain("PEBBLEDESK_OFFERING.claims.migrationSupport");
		expect(source).not.toContain("works for centers in every state");
		expect(source).not.toContain("3 days before it ends");
		expect(source).not.toContain("Brightwheel and Procare presets help");
	});
});
