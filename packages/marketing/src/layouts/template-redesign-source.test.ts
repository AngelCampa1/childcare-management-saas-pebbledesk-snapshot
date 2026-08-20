import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("marketing template redesign source regressions", () => {
	it("turns the category hub into a guided start page instead of a bare card grid", () => {
		const source = readSource("../hubs/content-hub.astro");

		expect(source).toContain("data-hub-pathways");
		expect(source).toContain("Where to start");
	});

	it("turns paginated hubs into scan-first browse pages with a quick-start rail", () => {
		const source = readSource("../hubs/category-hub.astro");

		expect(source).toContain("data-hub-quick-start");
		expect(source).toContain("Start with the section that matches your job today.");
	});

	it("adds a winner recommendation band to comparison layouts", () => {
		const source = readSource("./comparison-layout.astro");

		expect(source).toContain("<WinnerCallout");
		expect(source).toContain("productName={config.name}");
	});

	it("adds an outcome-oriented intro panel to long-form content layouts", () => {
		const source = readSource("./content-layout.astro");

		expect(source).toContain("data-content-intro-panel");
		expect(source).toContain("Use this guide when you need to");
	});

	it("shows a value preview before the lead-magnet gate", () => {
		const source = readSource("../components/lead-magnet-page.astro");

		expect(source).toContain("data-lead-magnet-value-preview");
		expect(source).toContain("What's inside");
	});

	it("adds score bars and print checklist components for redesigned SEO templates", () => {
		const scoreBarsSource = readSource("../components/score-bars.astro");
		const printChecklistSource = readSource("../components/print-checklist.astro");
		const listicleSource = readSource("./listicle-layout.astro");
		const printLayoutSource = readSource("../components/lead-magnet-print-layout.astro");

		expect(scoreBarsSource).toContain("data-score-bars");
		expect(scoreBarsSource).toContain("Selection snapshot");
		expect(scoreBarsSource).not.toContain("/100</p>");
		expect(listicleSource).not.toContain("92 - index * 6");
		expect(printChecklistSource).toContain("data-print-checklist");
		expect(printChecklistSource).toContain("Audit-ready print checklist");
		expect(listicleSource).toContain("<ScoreBars");
		expect(printLayoutSource).toContain("<PrintChecklist");
	});

	it("keeps every SEO route family on a redesigned layout or hub shell", () => {
		const routeSources = [
			"../../../../apps/site/src/pages/resources/guides/[slug].astro",
			"../../../../apps/site/src/pages/resources/best/[slug].astro",
			"../../../../apps/site/src/pages/compare/alternatives/[slug].astro",
			"../../../../apps/site/src/pages/compare/versus/[slugA]-vs-[slugB].astro",
			"../../../../apps/site/src/pages/compare/pricing/[slug].astro",
			"../../../../apps/site/src/pages/childcare-software/[slug].astro",
			"../../../../apps/site/src/pages/features/[slug].astro",
			"../../../../apps/site/src/pages/free/[slug].astro",
			"../../../../apps/site/src/pages/free/[slug]/print.astro",
		].map((path) => readSource(path));

		expect(routeSources[0]).toContain("<ArticleLayout");
		expect(routeSources[1]).toContain("<ListicleLayout");
		expect(routeSources[2]).toContain("<ComparisonLayout");
		expect(routeSources[3]).toContain("<ComparisonLayout");
		expect(routeSources[4]).toContain("<PricingBreakdownLayout");
		expect(routeSources[5]).toContain("<ArticleLayout");
		expect(routeSources[6]).toContain("<ArticleLayout");
		expect(routeSources[7]).toContain("<LeadMagnetPage");
		expect(routeSources[8]).toContain("<LeadMagnetPrintLayout");
	});
});
