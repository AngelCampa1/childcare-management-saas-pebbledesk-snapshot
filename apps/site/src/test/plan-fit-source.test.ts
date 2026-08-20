import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "..");

describe("plan fit source usage", () => {
	it("uses shared plan capacity helpers instead of hardcoded child caps in active site copy", () => {
		const sources = [
			"config/persona-pages.ts",
			"config/hub-faqs.ts",
			"pages/about.astro",
			"pages/compare/index.astro",
		].map((path) => readFileSync(resolve(appRoot, path), "utf8"));

		for (const source of sources) {
			expect(source).not.toContain("up to 15 children");
			expect(source).not.toContain("up to 50 active children");
			expect(source).not.toContain("up to 100 active children");
		}
		expect(sources.join("\n")).toContain("formatPlanCapacityClaim");
		expect(sources.join("\n")).toContain("formatPlanFitSummary");
	});
});
