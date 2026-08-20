import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	buildGeneratedContentNoindexPathSet,
	getGeneratedContentNoindexPaths,
	hasNoindexFrontmatter,
	isLeadMagnetPrintPage,
	shouldIncludeInSitemap,
} from "./sitemap-paths";

describe("sitemap path filters", () => {
	it("excludes known noindex landing pages and LLM files", () => {
		expect(shouldIncludeInSitemap("/customers/")).toBe(false);
		expect(shouldIncludeInSitemap("/llms.txt")).toBe(false);
		expect(shouldIncludeInSitemap("/llms-full.txt/")).toBe(false);
		expect(shouldIncludeInSitemap("/404")).toBe(false);
		expect(shouldIncludeInSitemap("/404/")).toBe(false);
		expect(shouldIncludeInSitemap("/500")).toBe(false);
		expect(shouldIncludeInSitemap("/500/")).toBe(false);
	});

	it("keeps paginated hub pages indexable across all hub types", () => {
		expect(shouldIncludeInSitemap("/resources/guides/2/")).toBe(true);
		expect(shouldIncludeInSitemap("/resources/best/2/")).toBe(true);
		expect(shouldIncludeInSitemap("/compare/alternatives/2/")).toBe(true);
		expect(shouldIncludeInSitemap("/compare/pricing/2/")).toBe(true);
		expect(shouldIncludeInSitemap("/compare/versus/2/")).toBe(true);
	});

	it("excludes print pages but not their canonical lead-magnet pages", () => {
		expect(isLeadMagnetPrintPage("/free/licensing-compliance-checklist/print/")).toBe(true);
		expect(shouldIncludeInSitemap("/free/licensing-compliance-checklist/print/")).toBe(false);
		expect(shouldIncludeInSitemap("/free/licensing-compliance-checklist/")).toBe(true);
	});

	it("keeps canonical marketing pages indexable", () => {
		expect(shouldIncludeInSitemap("/")).toBe(true);
		expect(shouldIncludeInSitemap("/about/")).toBe(true);
		expect(shouldIncludeInSitemap("/pricing/")).toBe(true);
		expect(shouldIncludeInSitemap("/resources/guides/daycare-business-plan-template/")).toBe(true);
	});

	it("builds deterministic generated content noindex paths with slash variants", () => {
		const paths = buildGeneratedContentNoindexPathSet([
			{
				collection: "alternatives",
				slug: "hidden-alternative",
				noindex: true,
				markdownContent: "---\ncompetitor:\n  slug: hidden-alternative\n---\nBody",
			},
			{ collection: "comparisons", slug: "hidden-a-vs-hidden-b", noindex: true },
			{
				collection: "pricing-breakdowns",
				slug: "hidden-pricing",
				noindex: true,
				markdownContent: "---\ncompetitor:\n  slug: hidden-pricing\n---\nBody",
			},
			{ collection: "listicles", slug: "hidden-best-page", noindex: true },
			{ collection: "guides", slug: "visible-guide", noindex: false },
			{ collection: "guides", slug: "hidden-guide", noindex: true },
			{ collection: "state-pages", slug: "hidden-state", noindex: true },
			{ collection: "city-pages", slug: "hidden-city-st", noindex: true },
			{ collection: "lead-magnets", slug: "hidden-lead-magnet", noindex: true },
			{ collection: "features", slug: "hidden-feature", noindex: true },
		]);

		expect(paths.has("/compare/alternatives/hidden-alternative/")).toBe(true);
		expect(paths.has("/compare/versus/hidden-a-vs-hidden-b/")).toBe(true);
		expect(paths.has("/compare/pricing/hidden-pricing/")).toBe(true);
		expect(paths.has("/resources/best/hidden-best-page")).toBe(true);
		expect(paths.has("/resources/best/hidden-best-page/")).toBe(true);
		expect(paths.has("/resources/guides/hidden-guide/")).toBe(true);
		expect(paths.has("/childcare-software/hidden-state/")).toBe(true);
		expect(paths.has("/childcare-software/hidden-city-st/")).toBe(true);
		expect(paths.has("/free/hidden-lead-magnet/")).toBe(true);
		expect(paths.has("/features/hidden-feature/")).toBe(true);
		expect(paths.has("/resources/guides/visible-guide")).toBe(false);
		expect(shouldIncludeInSitemap("/resources/best/hidden-best-page/", paths)).toBe(false);
		expect(shouldIncludeInSitemap("/compare/alternatives/hidden-alternative/", paths)).toBe(false);
		expect(shouldIncludeInSitemap("/pricing/", paths)).toBe(true);
	});

	it("reads noindex only from frontmatter", () => {
		expect(hasNoindexFrontmatter("---\ntitle: Hidden\nnoindex: true\n---\nBody")).toBe(true);
		expect(hasNoindexFrontmatter('---\ntitle: Hidden\nnoindex: "true"\n---\nBody')).toBe(true);
		expect(hasNoindexFrontmatter("---\ntitle: Visible\n---\n```yaml\nnoindex: true\n```")).toBe(
			false,
		);
		expect(hasNoindexFrontmatter("# No frontmatter\nnoindex: true")).toBe(false);
	});

	it("recursively scans generated content noindex paths using collection slugs", async () => {
		const contentDir = await mkdtemp(join(tmpdir(), "pebbledesk-sitemap-content-"));
		const nestedGuideDir = join(contentDir, "guides", "nested");
		const listicleDir = join(contentDir, "listicles");

		await mkdir(nestedGuideDir, { recursive: true });
		await mkdir(listicleDir, { recursive: true });
		await writeFile(
			join(nestedGuideDir, "hidden-guide.md"),
			"---\ntitle: Hidden\ndescription: Hidden\nnoindex: true\n---\nBody",
			"utf8",
		);
		await writeFile(
			join(listicleDir, "body-only-noindex.md"),
			"---\ntitle: Visible\ndescription: Visible\n---\nBody\nnoindex: true",
			"utf8",
		);

		try {
			const paths = getGeneratedContentNoindexPaths(contentDir);

			expect(paths.has("/resources/guides/nested/hidden-guide/")).toBe(true);
			expect(paths.has("/resources/best/body-only-noindex/")).toBe(false);
			expect(shouldIncludeInSitemap("/resources/guides/nested/hidden-guide/", paths)).toBe(false);
		} finally {
			await rm(contentDir, { recursive: true, force: true });
		}
	});
});
