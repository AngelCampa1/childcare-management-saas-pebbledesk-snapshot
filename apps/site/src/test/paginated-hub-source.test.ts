import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Each `paginatedSource` intentionally contains template-literal syntax (backtick + ${...})
// because the test checks that source files contain that exact string pattern.
// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture strings match source-file template literals
const guides = "`/resources/guides/${page.currentPage}`";
// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture strings match source-file template literals
const best = "`/resources/best/${page.currentPage}`";
// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture strings match source-file template literals
const alternatives = "`/compare/alternatives/${page.currentPage}`";
// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture strings match source-file template literals
const versus = "`/compare/versus/${page.currentPage}`";
// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture strings match source-file template literals
const pricing = "`/compare/pricing/${page.currentPage}`";

const PAGINATED_HUBS = [
	{
		file: "src/pages/resources/guides/[...page].astro",
		paginatedSource: guides,
		baseSource: '"/resources/guides"',
	},
	{
		file: "src/pages/resources/best/[...page].astro",
		paginatedSource: best,
		baseSource: '"/resources/best"',
	},
	{
		file: "src/pages/compare/alternatives/[...page].astro",
		paginatedSource: alternatives,
		baseSource: '"/compare/alternatives"',
	},
	{
		file: "src/pages/compare/versus/[...page].astro",
		paginatedSource: versus,
		baseSource: '"/compare/versus"',
	},
	{
		file: "src/pages/compare/pricing/[...page].astro",
		paginatedSource: pricing,
		baseSource: '"/compare/pricing"',
	},
] as const;

describe("paginated hub CTA sources", () => {
	for (const hub of PAGINATED_HUBS) {
		it(`uses the current paginated route for ${hub.file}`, () => {
			const source = readFileSync(resolve(process.cwd(), hub.file), "utf8");

			expect(source).toContain("page.currentPage > 1");
			expect(source).toContain(hub.paginatedSource);
			expect(source).toContain(hub.baseSource);
		});
	}
});

describe("paginated hub metadata", () => {
	it("keeps paginated hub routes indexable in the sitemap filter", async () => {
		const { shouldIncludeInSitemap } = await import("../lib/sitemap-paths");

		expect(shouldIncludeInSitemap("/compare/alternatives/2/")).toBe(true);
		expect(shouldIncludeInSitemap("/compare/pricing/2/")).toBe(true);
		expect(shouldIncludeInSitemap("/compare/versus/2/")).toBe(true);
		expect(shouldIncludeInSitemap("/resources/best/2/")).toBe(true);
		expect(shouldIncludeInSitemap("/resources/guides/2/")).toBe(true);
	});

	it("uses Page N metadata descriptions for paginated hubs", () => {
		const categoryHubSource = readFileSync(
			resolve(process.cwd(), "../../packages/marketing/src/hubs/category-hub.astro"),
			"utf8",
		);

		const pagePlaceholder = "${";
		expect(categoryHubSource).toContain(`Page ${pagePlaceholder}page.currentPage}:`);
		expect(categoryHubSource).toContain("metadataDescription");
		expect(categoryHubSource).toContain("description={metadataDescription}");
	});
});
