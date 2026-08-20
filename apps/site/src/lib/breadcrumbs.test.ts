import { describe, expect, it } from "vitest";
import {
	buildAlternativeBreadcrumbs,
	buildCityBreadcrumbs,
	buildFeatureBreadcrumbs,
	buildGuideBreadcrumbs,
	buildListicleBreadcrumbs,
	buildPricingBreadcrumbs,
	buildStateBreadcrumbs,
	buildVersusBreadcrumbs,
} from "./breadcrumbs";

describe("buildAlternativeBreadcrumbs", () => {
	it("returns 4-item breadcrumb trail with correct labels and hrefs", () => {
		const result = buildAlternativeBreadcrumbs("Brightwheel", "/compare/alternatives/brightwheel");
		expect(result).toEqual([
			{ label: "Home", href: "/" },
			{ label: "Compare", href: "/compare" },
			{ label: "Alternatives", href: "/compare/alternatives" },
			{
				label: "Brightwheel Alternative",
				href: "/compare/alternatives/brightwheel",
			},
		]);
	});

	it("handles slugs with hyphens", () => {
		const result = buildAlternativeBreadcrumbs(
			"Procare Solutions",
			"/compare/alternatives/procare-solutions",
		);
		expect(result).toHaveLength(4);
		expect(result[3]).toEqual({
			label: "Procare Solutions Alternative",
			href: "/compare/alternatives/procare-solutions",
		});
	});
});

describe("buildVersusBreadcrumbs", () => {
	it("returns 4-item breadcrumb trail with vs label", () => {
		const result = buildVersusBreadcrumbs(
			"Brightwheel",
			"Procare",
			"/compare/versus/brightwheel-vs-procare",
		);
		expect(result).toEqual([
			{ label: "Home", href: "/" },
			{ label: "Compare", href: "/compare" },
			{ label: "Head-to-Head", href: "/compare/versus" },
			{
				label: "Brightwheel vs Procare",
				href: "/compare/versus/brightwheel-vs-procare",
			},
		]);
	});
});

describe("buildPricingBreadcrumbs", () => {
	it("returns 4-item breadcrumb trail with pricing label", () => {
		const result = buildPricingBreadcrumbs("Brightwheel", "/compare/pricing/brightwheel");
		expect(result).toEqual([
			{ label: "Home", href: "/" },
			{ label: "Compare", href: "/compare" },
			{ label: "Pricing", href: "/compare/pricing" },
			{ label: "Brightwheel Pricing", href: "/compare/pricing/brightwheel" },
		]);
	});
});

describe("buildGuideBreadcrumbs", () => {
	it("returns 4-item breadcrumb trail under Resources > Guides", () => {
		const result = buildGuideBreadcrumbs(
			"How to Choose Childcare Software",
			"/resources/guides/how-to-choose-childcare-software",
		);
		expect(result).toEqual([
			{ label: "Home", href: "/" },
			{ label: "Resources", href: "/resources" },
			{ label: "Guides", href: "/resources/guides" },
			{
				label: "How to Choose Childcare Software",
				href: "/resources/guides/how-to-choose-childcare-software",
			},
		]);
	});
});

describe("buildListicleBreadcrumbs", () => {
	it("returns 4-item breadcrumb trail under Resources > Software Roundups", () => {
		const result = buildListicleBreadcrumbs(
			"Best Childcare Apps 2026",
			"/resources/best/best-childcare-apps-2026",
		);
		expect(result).toEqual([
			{ label: "Home", href: "/" },
			{ label: "Resources", href: "/resources" },
			{ label: "Software Roundups", href: "/resources/best" },
			{
				label: "Best Childcare Apps 2026",
				href: "/resources/best/best-childcare-apps-2026",
			},
		]);
	});
});

describe("buildStateBreadcrumbs", () => {
	it("returns 3-item breadcrumb trail under Childcare Software", () => {
		const result = buildStateBreadcrumbs("Texas", "/childcare-software/texas");
		expect(result).toEqual([
			{ label: "Home", href: "/" },
			{ label: "Childcare Software", href: "/childcare-software/" },
			{ label: "Texas", href: "/childcare-software/texas" },
		]);
	});
});

describe("buildFeatureBreadcrumbs", () => {
	it("returns 3-item breadcrumb trail under Features", () => {
		const result = buildFeatureBreadcrumbs("Ratio Tracking", "/features/ratio-tracking");
		expect(result).toEqual([
			{ label: "Home", href: "/" },
			{ label: "Features", href: "/features" },
			{ label: "Ratio Tracking", href: "/features/ratio-tracking" },
		]);
	});
});

describe("buildCityBreadcrumbs", () => {
	it("returns 3-item breadcrumb trail with city+state label", () => {
		const result = buildCityBreadcrumbs("Dallas", "TX", "/childcare-software/dallas-tx");
		expect(result).toEqual([
			{ label: "Home", href: "/" },
			{ label: "Childcare Software", href: "/childcare-software/" },
			{ label: "Dallas, TX", href: "/childcare-software/dallas-tx" },
		]);
	});
});
