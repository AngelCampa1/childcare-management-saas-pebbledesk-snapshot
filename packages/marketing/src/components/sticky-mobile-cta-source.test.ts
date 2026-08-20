import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sticky-mobile-cta source", () => {
	const source = readFileSync(resolve(import.meta.dirname, "./sticky-mobile-cta.astro"), "utf8");

	it("observes the dedicated site footer hook instead of the first footer tag", () => {
		expect(source).toContain("document.querySelector('[data-site-footer]')");
		expect(source).not.toContain("document.querySelector('footer')");
	});

	it("recalculates visibility and spacer height on viewport resize", () => {
		expect(source).toContain("window.addEventListener('resize', handleResize)");
		expect(source).toContain("window.removeEventListener('resize', handleResize)");
	});
});
