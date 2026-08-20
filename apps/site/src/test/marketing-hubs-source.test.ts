import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("marketing hub route source", () => {
	it("rewrites the resources hub around triage and next-step guidance", () => {
		const source = readSource("../pages/resources/index.astro");

		expect(source).toContain(
			"Find the resource hub that matches the paperwork problem in front of you.",
		);
		expect(source).toContain(
			"PebbleDesk organizes every public guide, best list, free tool, feature page",
		);
		expect(source).toContain("comparison,");
		expect(source).toContain("pricing breakdown, state guide, and city guide");
		expect(source).toContain("resourceHubs.map");
		expect(source).toContain("resourceHubs");
		expect(source).not.toContain("No fluff");
	});

	it("rewrites the compare hub around active buying decisions", () => {
		const source = readSource("../pages/compare/index.astro");

		expect(source).toContain("Compare childcare software by what directors need to prove later.");
		expect(source).toContain(
			"PebbleDesk solves vendor confusion for directors and owner/operators",
		);
		expect(source).toContain("Each guide compares the daily record");
		expect(source).toContain("licensed centers, family childcare homes, and multi-site operators");
		expect(source).toContain("Replacing an incumbent");
		expect(source).toContain("Center Starter at {centerStarterPromoPrice.discountedPriceLabel}");
		expect(source).toContain("formatPlanCapacityClaim");
		expect(source).toContain(
			'const starterCapacityClaim = formatPlanCapacityClaim("center_starter");',
		);
		expect(source).toContain("for licensed centers with {starterCapacityClaim}");
		expect(source).toContain("while {siteConfig.promoBanner.code} is active");
		expect(source).toContain("buttonText={siteConfig.funnel.bofu.ctaText}");
		expect(source).toContain("ctaTarget={siteConfig.funnel.bofu.ctaTarget}");
		expect(source).not.toContain("sales spin");
	});

	it("rewrites the features hub around director workflows instead of a generic feature list", () => {
		const source = readSource("../pages/features/index.astro");

		expect(source).toContain("See how the daily record stays audit-ready.");
		expect(source).toContain("The problem: daily childcare records scatter before audit week.");
		expect(source).toContain(
			"The solution: each PebbleDesk feature feeds the same audit-ready record.",
		);
		expect(source).toContain("Attendance, ratios, family records, billing, and staff notes");
		expect(source).toContain("licensed centers, family childcare homes, and multi-site programs");
		expect(source).toContain("Audit-ready workflows");
		expect(source).toContain("Feature links");
		expect(source).toContain("href={item.href}");
	});

	it("adds a free resources hub so lead magnets are not orphaned behind direct links", () => {
		const source = readSource("../pages/free/index.astro");

		expect(source).toContain("Free Childcare Resources");
		expect(source).toContain("lead-magnets");
		expect(source).toContain("audit, subsidy, ratio, and software-buying workflows");
		expect(source).toContain(
			"PebbleDesk solves one-off paperwork pressure for childcare operators",
		);
		expect(source).toContain("Each worksheet helps");
		expect(source).toContain("directors, family providers, and administrators");
		expect(source).toContain("licensed centers,");
		expect(source).toContain("family childcare homes, and multi-site programs");
		expect(source).toContain("Use the worksheet that matches today's admin");
	});

	it("shows regular price after the first-year offer on resource CTAs", () => {
		const guidesSource = readSource("../pages/resources/guides/[...page].astro");
		const bestSource = readSource("../pages/resources/best/[...page].astro");

		for (const source of [guidesSource, bestSource]) {
			expect(source).toContain(
				"{siteConfig.promoBanner.code} gives {siteConfig.promoBanner.label}",
			);
			expect(source).toContain("{siteConfig.promoBanner.renewalLabel}");
			expect(source).not.toContain("80% off once");
			expect(source).not.toContain("80% off for 12 months");
		}
	});

	it("keeps the state and about hubs clear about who PebbleDesk serves", () => {
		const stateSource = readSource("../pages/childcare-software/index.astro");
		const aboutSource = readSource("../pages/about.astro");

		expect(stateSource).toContain("State-by-state guidance for childcare operators");
		expect(stateSource).toContain("licensed centers and family childcare homes");
		expect(aboutSource).toContain("Who PebbleDesk serves");
		expect(aboutSource).toContain(
			"licensed childcare centers, family childcare homes, and multi-site operators",
		);
		expect(aboutSource).toContain(
			"center directors, owner/operators, family childcare providers, administrators, and multi-site operators",
		);
	});
});
