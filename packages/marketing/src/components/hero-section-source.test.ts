import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("hero section source regressions", () => {
	it("removes decorative gradient haze and blur-heavy hero chrome", () => {
		const source = readSource("./hero-section.astro");

		expect(source).not.toContain("radial-gradient(circle_at_top_left");
		expect(source).not.toContain("blur-3xl");
		expect(source).not.toContain("backdrop-blur-sm");
	});

	it("supports the redesign floating product collage without changing every caller", () => {
		const source = readSource("./hero-section.astro");

		expect(source).toContain('variant?: "default" | "editorial" | "collage"');
		expect(source).toContain("<FloatingCollage");
		expect(source).toContain("data-floating-collage-hero");
	});
});
