import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contentConfigPath = resolve(process.cwd(), "src/content.config.ts");

describe("content collection config", () => {
	it("loads every markdown collection with an explicit glob loader", () => {
		const source = readFileSync(contentConfigPath, "utf-8");

		expect(source).toContain('import { glob } from "astro/loaders";');
		expect(source).not.toContain('type: "content"');

		for (const collection of [
			"alternatives",
			"comparisons",
			"pricing-breakdowns",
			"listicles",
			"guides",
			"state-pages",
			"city-pages",
			"lead-magnets",
			"features",
		]) {
			expect(source).toContain(`base: "./src/content/${collection}"`);
		}
	});
});
