import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("web coverage gate", () => {
	it("runs coverage through the branch-aware test wrapper", () => {
		const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");

		expect(packageJson).toContain('"test": "node scripts/run-tests.mjs"');
		expect(packageJson).toContain('"test:coverage": "node scripts/run-tests.mjs --coverage"');
	});

	it("does not enforce broad per-file web thresholds in Vitest", () => {
		const config = readFileSync(resolve(process.cwd(), "vitest.config.ts"), "utf8");

		expect(config).not.toContain("perFile: true");
		expect(config).not.toContain("thresholds:");
	});

	it("fails changed source lines that are missing from coverage", () => {
		const script = readFileSync(
			resolve(process.cwd(), "scripts/check-touched-coverage.mjs"),
			"utf8",
		);

		expect(script).toContain("Changed-line coverage failed");
		expect(script).toContain('--cached", "--unified=0');
		expect(script).toContain("missing from lcov report");
		expect(script).toContain("was not covered");
	});
});
