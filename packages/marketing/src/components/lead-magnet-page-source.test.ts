import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./lead-magnet-page.astro"), "utf8");

describe("LeadMagnetPage source", () => {
	it("links each lead magnet to its printable resource route", () => {
		expect(source).toContain("printPath");
		expect(source).toContain("Open the printable resource");
		expect(source).toContain("/print");
	});

	it("strips the first markdown h1 from teaser content because the layout renders the page h1", () => {
		expect(source).toContain("stripLeadingHeadingOne");
		expect(source).toContain("const renderedHtml = stripLeadingHeadingOne");
	});

	it("composes SEO titles through the shared metadata helper", () => {
		expect(source).toContain("composeMetaTitle");
		expect(source).toContain("title={composeMetaTitle(data.title, config.name)}");
	});

	it("keeps lead magnet pages on the full marketing header contract", () => {
		expect(source).toContain("navItems={config.nav?.items}");
		expect(source).toContain("signInHref={config.nav?.signInHref}");
		expect(source).toContain("ctaText={config.nav?.ctaText ?? headerCta.text}");
	});

	it("does not make unsupported national download proof claims", () => {
		expect(source).not.toContain("Downloaded by childcare directors across the US");
	});
});
