import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("editorial layout source regressions", () => {
	it("lets editorial pages disable non-essential base layout enhancements", () => {
		const baseLayoutSource = readSource("./base-layout.astro");

		expect(baseLayoutSource).toContain("enableScrollReveal");
		expect(baseLayoutSource).toContain("{enableScrollReveal && (");
	});

	it("removes footer email capture from long-form editorial layouts", () => {
		const articleLayoutSource = readSource("./article-layout.astro");
		const comparisonLayoutSource = readSource("./comparison-layout.astro");
		const contentLayoutSource = readSource("./content-layout.astro");
		const listicleLayoutSource = readSource("./listicle-layout.astro");
		const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

		for (const source of [
			articleLayoutSource,
			comparisonLayoutSource,
			contentLayoutSource,
			listicleLayoutSource,
			pricingLayoutSource,
		]) {
			expect(source).toContain("enableScrollReveal={false}");
			expect(source).toContain('captureVariant="none"');
		}
	});

	it("passes the site author into editorial article metadata", () => {
		const articleLayoutSource = readSource("./article-layout.astro");
		const comparisonLayoutSource = readSource("./comparison-layout.astro");
		const contentLayoutSource = readSource("./content-layout.astro");
		const listicleLayoutSource = readSource("./listicle-layout.astro");
		const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

		for (const source of [
			articleLayoutSource,
			comparisonLayoutSource,
			contentLayoutSource,
			listicleLayoutSource,
			pricingLayoutSource,
		]) {
			expect(source).toContain("<ArticleMeta");
			expect(source).toContain("author={config.author}");
		}
	});

	it("uses darker shared label treatments for TOC and footer scan text", () => {
		const tocSource = readSource("../components/table-of-contents.astro");
		const footerSource = readSource("../components/site-footer.astro");

		expect(tocSource).toContain("text-[var(--color-accent-800)]");
		expect(footerSource).toContain("text-[var(--color-accent-800)]");
		expect(footerSource).toContain("text-[var(--color-neutral-800)]");
	});

	it("flattens repeated blur-heavy shared chrome surfaces", () => {
		const headerSource = readSource("../components/site-header.astro");
		const stickyMobileCtaSource = readSource("../components/sticky-mobile-cta.astro");

		expect(headerSource).not.toContain("backdrop-blur-sm");
		expect(headerSource).not.toContain("backdrop-blur-xl");
		expect(headerSource).not.toContain("backdrop-filter: blur(10px)");
		expect(stickyMobileCtaSource).not.toContain("backdrop-blur-lg");
	});

	it("uses a button-driven mobile nav instead of summary/details chrome", () => {
		const headerSource = readSource("../components/site-header.astro");

		expect(headerSource).toContain("data-mobile-nav-trigger");
		expect(headerSource).toContain("data-mobile-nav-overlay");
		expect(headerSource).toContain('data-mobile-nav-ready="false"');
		expect(headerSource).toContain(".mobile-nav-trigger {");
		expect(headerSource).toContain(".mobile-nav-overlay[hidden] {");
		expect(headerSource).toContain("data-mobile-nav-fallback");
		expect(headerSource).not.toContain("<summary");
		expect(headerSource).not.toContain("</summary>");
	});

	it("supports stacked comparison cells for editorial tables on small screens", () => {
		const comparisonTableSource = readSource("../components/comparison-table.astro");

		expect(comparisonTableSource).toContain("data-column-label={headers[i + 1]}");
		expect(comparisonTableSource).toContain("@media (max-width: 40rem)");
	});

	it("marks highlighted comparison columns with winner treatment", () => {
		const comparisonTableSource = readSource("../components/comparison-table.astro");

		expect(comparisonTableSource).toContain("data-winner-column={i === highlightColumn");
		expect(comparisonTableSource).toContain("data-winner-column={(i + 1) === highlightColumn");
		expect(comparisonTableSource).toContain("Recommended");
		expect(comparisonTableSource).toContain("Winner");
	});

	it("renders the shared winner callout near the top of comparison and pricing layouts", () => {
		const comparisonLayoutSource = readSource("./comparison-layout.astro");
		const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");
		const winnerCalloutSource = readSource("../components/winner-callout.astro");

		for (const source of [comparisonLayoutSource, pricingLayoutSource]) {
			expect(source).toContain('import WinnerCallout from "../components/winner-callout.astro"');
			expect(source).toContain("<WinnerCallout");
		}
		expect(winnerCalloutSource).toContain("data-winner-callout");
		expect(winnerCalloutSource).toContain("Overall winner");
	});
});
