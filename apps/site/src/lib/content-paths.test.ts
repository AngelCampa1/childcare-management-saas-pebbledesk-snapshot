import { describe, expect, it } from "vitest";
import {
	buildAlternativePath,
	buildCityPagePath,
	buildComparisonPath,
	buildFeaturePath,
	buildGuidePath,
	buildLeadMagnetPath,
	buildListiclePath,
	buildPricingPath,
	buildStatePagePath,
	contentEntrySlug,
} from "./content-paths";

describe("PebbleDesk content paths", () => {
	it("resolves collection slugs from legacy slug fields or Astro content IDs", () => {
		expect(contentEntrySlug({ id: "licensing-compliance-checklist.md" })).toBe(
			"licensing-compliance-checklist",
		);
		expect(contentEntrySlug({ id: "licensing-compliance-checklist.mdx" })).toBe(
			"licensing-compliance-checklist",
		);
		expect(contentEntrySlug({ id: "guides/billing-guide.md" })).toBe("guides/billing-guide");
		expect(contentEntrySlug({ id: "billing-guide", slug: "billing-guide" })).toBe("billing-guide");
	});

	it("fails clearly when an Astro content entry has no slug or id", () => {
		expect(() => contentEntrySlug({})).toThrow("missing both slug and id");
	});

	it("builds alternative and pricing paths from competitor slugs", () => {
		expect(buildAlternativePath("procare")).toBe("/compare/alternatives/procare");
		expect(buildPricingPath("playground")).toBe("/compare/pricing/playground");
	});

	it("builds comparison paths from competitor slugs", () => {
		expect(buildComparisonPath("procare", "playground")).toBe(
			"/compare/versus/procare-vs-playground",
		);
	});

	it("builds slug-based paths for guides, listicles, state pages, and lead magnets", () => {
		expect(buildGuidePath("how-to-choose-childcare-management-software")).toBe(
			"/resources/guides/how-to-choose-childcare-management-software",
		);
		expect(buildListiclePath("best-childcare-software-small-centers")).toBe(
			"/resources/best/best-childcare-software-small-centers",
		);
		expect(buildStatePagePath("texas")).toBe("/childcare-software/texas");
		expect(buildLeadMagnetPath("ratio-tracking-cheatsheet")).toBe(
			"/free/ratio-tracking-cheatsheet",
		);
	});

	it("builds city page paths from city-state slugs", () => {
		expect(buildCityPagePath("dallas-tx")).toBe("/childcare-software/dallas-tx");
		expect(buildCityPagePath("los-angeles-ca")).toBe("/childcare-software/los-angeles-ca");
	});

	it("builds slug-based paths for feature pages", () => {
		expect(buildFeaturePath("ratio-tracking")).toBe("/features/ratio-tracking");
		expect(buildFeaturePath("subsidy-billing")).toBe("/features/subsidy-billing");
	});
});
