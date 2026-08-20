import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
	exports: Record<string, string>;
};

describe("marketing package exports", () => {
	it("does not expose non-childcare calculator components as explicit package subpaths", () => {
		expect(packageJson.exports["./components/pricebook-builder"]).toBeNull();
		expect(packageJson.exports["./components/software-cost-calculator"]).toBeNull();
	});
});
