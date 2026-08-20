import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("shared mobile hit target regressions", () => {
	it("keeps the mobile header brand and nav trigger at 44px minimum targets", () => {
		const source = readSource("./site-header.astro");

		expect(source).toContain("min-h-11");
		expect(source).toContain("min-w-11");
		expect(source).toContain("site-header-brand");
	});

	it("keeps the shared desktop and tablet header nav links at a minimum touch target", () => {
		const source = readSource("./site-header.astro");

		expect(source).toContain("site-header-nav-link");
		expect(source).toContain("inline-flex min-h-11 min-w-11");
	});

	it("keeps footer links large enough for touch interaction", () => {
		const source = readSource("./site-footer.astro");

		expect(source).toContain("min-h-11");
		expect(source).toContain("min-w-11");
		expect(source).toContain("inline-flex");
	});

	it("keeps breadcrumb links at a minimum mobile tap target", () => {
		const source = readSource("./breadcrumb-nav.astro");

		expect(source).toContain("min-h-11");
		expect(source).toContain("min-w-11");
		expect(source).toContain("inline-flex");
	});
});
