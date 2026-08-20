import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeTemplates = [
	{ collection: "alternatives", route: "src/pages/compare/alternatives/[slug].astro" },
	{ collection: "comparisons", route: "src/pages/compare/versus/[slugA]-vs-[slugB].astro" },
	{ collection: "pricing-breakdowns", route: "src/pages/compare/pricing/[slug].astro" },
	{ collection: "listicles", route: "src/pages/resources/best/[slug].astro" },
	{ collection: "guides", route: "src/pages/resources/guides/[slug].astro" },
	{ collection: "state-pages", route: "src/pages/childcare-software/[slug].astro" },
	{ collection: "city-pages", route: "src/pages/childcare-software/[slug].astro" },
	{ collection: "lead-magnets", route: "src/pages/free/[slug].astro" },
	{ collection: "features", route: "src/pages/features/[slug].astro" },
];

describe("generated content noindex pass-through", () => {
	for (const { collection, route } of routeTemplates) {
		it(`${collection} route ${route} passes entry noindex into the marketing layout`, () => {
			const source = readFileSync(join(process.cwd(), route), "utf8");

			expect(source).toMatch(/\bnoindex\b/);
			expect(source).toContain("noindex={noindex}");
		});
	}

	it("wires generated content noindex paths into Astro sitemap filtering", () => {
		const source = readFileSync(join(process.cwd(), "astro.config.mjs"), "utf8");

		expect(source).toContain("getGeneratedContentNoindexPaths");
		expect(source).toContain("shouldIncludeInSitemap(pathname, generatedContentNoindexPaths)");
	});
});
