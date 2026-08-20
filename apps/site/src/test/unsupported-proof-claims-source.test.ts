import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const comparisonSource = readFileSync(
	resolve(process.cwd(), "src", "content", "comparisons", "pebbledesk-vs-jackrabbit-care.md"),
	"utf8",
);

describe("unsupported marketing proof claims", () => {
	it("does not claim directors have completed inspections with PebbleDesk in place", () => {
		expect(comparisonSource).not.toContain("Directors who have been through inspections");
		expect(comparisonSource).not.toContain("with PebbleDesk in place report");
	});
});
