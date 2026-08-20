import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const configSource = readFileSync(resolve(process.cwd(), "vitest.config.ts"), "utf8");

describe("site coverage config", () => {
	it("keeps full-suite coverage includes while exempting targeted test-file runs", () => {
		expect(configSource).toContain("isTargetedCoverageRun");
		expect(configSource).toContain("include: isTargetedCoverageRun");
		expect(configSource).toContain("? undefined");
		expect(configSource).toContain('"src/lib/**/*.ts"');
		expect(configSource).toContain('"src/worker.ts"');
		expect(configSource).toContain('"src/worker/**/*.ts"');
		expect(configSource).toContain('"scripts/**/*.ts"');
		expect(configSource).not.toContain("all: false");
	});
});
