import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("site footer source regressions", () => {
	it("uses mobile-safe hit areas for footer navigation links", () => {
		const source = readSource("./site-footer.astro");

		expect(source).toContain("inline-flex min-h-11");
		expect(source).toContain("items-center");
	});
});
