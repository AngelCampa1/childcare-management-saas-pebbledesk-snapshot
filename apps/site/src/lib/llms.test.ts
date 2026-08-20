import { describe, expect, it } from "vitest";
import {
	buildAlternativeLlmsItems,
	buildCityPageLlmsItems,
	buildComparisonLlmsItems,
	buildFeatureLlmsItems,
	buildGuideLlmsItems,
	buildLeadMagnetLlmsItems,
	buildListicleLlmsItems,
	buildPricingLlmsItems,
	buildStatePageLlmsItems,
} from "./llms";

describe("PebbleDesk llms helpers", () => {
	const siteUrl = "https://pebbledesk.app";

	it("builds guide URLs from entry id and excludes noindex guides", () => {
		const items = buildGuideLlmsItems(siteUrl, [
			{
				id: "home-daycare-licensing-requirements.md",
				data: {
					title: "Home Daycare Licensing Requirements",
					description: "Wrong-intent licensing guide",
					noindex: true,
				},
			},
			{
				id: "how-to-choose-childcare-management-software.md",
				data: {
					title: "How to Choose Childcare Management Software",
					description: "Software buyer guide",
					noindex: false,
				},
			},
		]);

		expect(items).toEqual([
			{
				title: "How to Choose Childcare Management Software",
				url: "https://pebbledesk.app/resources/guides/how-to-choose-childcare-management-software/",
				description: "Software buyer guide",
			},
		]);
	});

	it("builds alternative and pricing URLs from competitor slugs", () => {
		const alternatives = buildAlternativeLlmsItems(siteUrl, [
			{
				id: "brightwheel-alternative.md",
				data: {
					title: "Brightwheel Alternative",
					description: "Alternative page",
					competitor: { slug: "brightwheel" },
				},
			},
		]);
		const pricing = buildPricingLlmsItems(siteUrl, [
			{
				id: "brightwheel-pricing.md",
				data: {
					title: "Brightwheel Pricing",
					description: "Pricing page",
					competitor: { slug: "brightwheel" },
				},
			},
		]);

		expect(alternatives[0]?.url).toBe("https://pebbledesk.app/compare/alternatives/brightwheel/");
		expect(pricing[0]?.url).toBe("https://pebbledesk.app/compare/pricing/brightwheel/");
	});

	it("builds comparison URLs from competitor slugs", () => {
		const items = buildComparisonLlmsItems(siteUrl, [
			{
				id: "brightwheel-vs-playground.md",
				data: {
					title: "Brightwheel vs Playground",
					description: "Comparison page",
					competitorA: { slug: "brightwheel" },
					competitorB: { slug: "playground" },
				},
			},
		]);

		expect(items).toEqual([
			{
				title: "Brightwheel vs Playground",
				url: "https://pebbledesk.app/compare/versus/brightwheel-vs-playground/",
				description: "Comparison page",
			},
		]);
	});

	it("builds listicle URLs from entry id", () => {
		const items = buildListicleLlmsItems(siteUrl, [
			{
				id: "best-childcare-software-small-centers.md",
				data: {
					title: "Best Childcare Software for Small Centers",
					description: "Listicle page",
				},
			},
		]);

		expect(items).toEqual([
			{
				title: "Best Childcare Software for Small Centers",
				url: "https://pebbledesk.app/resources/best/best-childcare-software-small-centers/",
				description: "Listicle page",
			},
		]);
	});

	it("builds feature URLs from entry id", () => {
		const items = buildFeatureLlmsItems(siteUrl, [
			{
				id: "ratio-compliance.md",
				data: {
					title: "Ratio Compliance",
					description: "Feature page",
				},
			},
		]);

		expect(items).toEqual([
			{
				title: "Ratio Compliance",
				url: "https://pebbledesk.app/features/ratio-compliance/",
				description: "Feature page",
			},
		]);
	});

	it("builds state page and lead magnet URLs from entry id", () => {
		const statePages = buildStatePageLlmsItems(siteUrl, [
			{
				id: "texas.md",
				data: {
					title: "Childcare Software in Texas",
					description: "State page",
				},
			},
		]);
		const leadMagnets = buildLeadMagnetLlmsItems(siteUrl, [
			{
				id: "ratio-tracking-cheatsheet.md",
				data: {
					title: "Ratio Tracking Cheatsheet",
					description: "Lead magnet",
				},
			},
		]);

		expect(statePages).toEqual([
			{
				title: "Childcare Software in Texas",
				url: "https://pebbledesk.app/childcare-software/texas/",
				description: "State page",
			},
		]);
		expect(leadMagnets).toEqual([
			{
				title: "Ratio Tracking Cheatsheet",
				url: "https://pebbledesk.app/free/ratio-tracking-cheatsheet/",
				description: "Lead magnet",
			},
		]);
	});

	it("builds city page URLs from entry id with canonical trailing slash", () => {
		const items = buildCityPageLlmsItems("https://pebbledesk.app/", [
			{
				id: "dallas-tx.md",
				data: {
					title: "Childcare Software in Dallas",
					description: "City page",
				},
			},
		]);

		expect(items).toEqual([
			{
				title: "Childcare Software in Dallas",
				url: "https://pebbledesk.app/childcare-software/dallas-tx/",
				description: "City page",
			},
		]);
	});
});
