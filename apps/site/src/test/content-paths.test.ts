import { describe, expect, it } from "vitest";
import { buildCanonicalPathFromContentSlug } from "../lib/content-paths";

describe("buildCanonicalPathFromContentSlug", () => {
	it("maps content collection slugs to canonical public paths", () => {
		expect(buildCanonicalPathFromContentSlug("alternatives/brightwheel")).toBe(
			"/compare/alternatives/brightwheel",
		);
		expect(buildCanonicalPathFromContentSlug("pricing-breakdowns/brightwheel")).toBe(
			"/compare/pricing/brightwheel",
		);
		expect(buildCanonicalPathFromContentSlug("guides/audit-readiness")).toBe(
			"/resources/guides/audit-readiness",
		);
		expect(buildCanonicalPathFromContentSlug("listicles/best-childcare-apps")).toBe(
			"/resources/best/best-childcare-apps",
		);
		expect(buildCanonicalPathFromContentSlug("state-pages/texas")).toBe(
			"/childcare-software/texas",
		);
		expect(buildCanonicalPathFromContentSlug("city-pages/dallas-tx")).toBe(
			"/childcare-software/dallas-tx",
		);
		expect(buildCanonicalPathFromContentSlug("lead-magnets/ratio-tracking-cheatsheet")).toBe(
			"/free/ratio-tracking-cheatsheet",
		);
		expect(buildCanonicalPathFromContentSlug("features/ratio-tracking")).toBe(
			"/features/ratio-tracking",
		);
	});

	it("maps comparison slugs and rejects unknown content collections", () => {
		expect(buildCanonicalPathFromContentSlug("comparisons/brightwheel-vs-procare")).toBe(
			"/compare/versus/brightwheel-vs-procare",
		);
		expect(buildCanonicalPathFromContentSlug("unknown/example")).toBeNull();
		expect(buildCanonicalPathFromContentSlug("alternatives")).toBeNull();
		expect(buildCanonicalPathFromContentSlug("comparisons/brightwheel")).toBeNull();
		expect(buildCanonicalPathFromContentSlug("comparisons/-vs-procare")).toBeNull();
		expect(buildCanonicalPathFromContentSlug("comparisons/brightwheel-vs-")).toBeNull();
	});

	it("uses competitor frontmatter slugs for alternative and pricing canonical paths", () => {
		const alternativeMarkdown = `---
title: "Brightwheel Alternative for Preschools"
competitor:
  name: "Brightwheel"
  slug: "brightwheel-preschools"
---`;
		const pricingMarkdown = `---
title: "Brightwheel Pricing for Small Centers"
competitor:
  name: "Brightwheel"
  slug: "brightwheel-small-centers"
---`;

		expect(
			buildCanonicalPathFromContentSlug(
				"alternatives/brightwheel-alternative-preschools",
				alternativeMarkdown,
			),
		).toBe("/compare/alternatives/brightwheel-preschools");
		expect(
			buildCanonicalPathFromContentSlug(
				"pricing-breakdowns/brightwheel-pricing-small-centers",
				pricingMarkdown,
			),
		).toBe("/compare/pricing/brightwheel-small-centers");
	});

	it("falls back to file slugs when frontmatter slugs are absent", () => {
		expect(
			buildCanonicalPathFromContentSlug(
				"alternatives/brightwheel",
				`---
title: "Brightwheel Alternative"
---`,
			),
		).toBe("/compare/alternatives/brightwheel");
		expect(
			buildCanonicalPathFromContentSlug(
				"pricing-breakdowns/childpilot-pricing",
				"Body without frontmatter",
			),
		).toBe("/compare/pricing/childpilot-pricing");
		expect(
			buildCanonicalPathFromContentSlug(
				"pricing-breakdowns/famly-pricing",
				`---
title: "Famly Pricing"
competitor:
  name: "Famly"
---`,
			),
		).toBe("/compare/pricing/famly-pricing");
	});
});
