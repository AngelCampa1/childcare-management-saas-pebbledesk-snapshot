import { getCollection } from "astro:content";
import { buildLlmsTxt } from "@pebbledesk/marketing/lib/llms-txt";
import type { APIContext } from "astro";
import { siteConfig } from "@/config/site";
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
} from "@/lib/llms";

export const prerender = true;

export async function GET(_context: APIContext) {
	const siteUrl = `https://${siteConfig.domain}`;

	const [
		alternatives,
		comparisons,
		pricingBreakdowns,
		listicles,
		guides,
		statePages,
		leadMagnets,
		features,
		cityPages,
	] = await Promise.all([
		getCollection("alternatives"),
		getCollection("comparisons"),
		getCollection("pricing-breakdowns"),
		getCollection("listicles"),
		getCollection("guides"),
		getCollection("state-pages"),
		getCollection("lead-magnets"),
		getCollection("features"),
		getCollection("city-pages"),
	]);

	const body = buildLlmsTxt({
		name: siteConfig.name,
		description: siteConfig.metaDescription ?? siteConfig.tagline,
		overview: siteConfig.tagline,
		sections: [
			{
				heading: "Machine-Readable AI Data",
				items: [
					{
						title: "Marketing Public Knowledge",
						url: `${siteUrl}/ai/marketing.json`,
						description: "Structured public marketing knowledge for AI systems.",
					},
					{
						title: "Lead Magnet Public Knowledge",
						url: `${siteUrl}/ai/lead-magnets.json`,
						description: "Structured free-resource and lead-magnet catalog data.",
					},
					{
						title: "Content Index Public Knowledge",
						url: `${siteUrl}/ai/content-index.json`,
						description: "Public index of generated marketing content.",
					},
					{
						title: "AI Data Manifest",
						url: `${siteUrl}/ai/manifest.json`,
						description: "Manifest of available public AI data artifacts.",
					},
					{
						title: "Full Public Knowledge",
						url: `${siteUrl}/ai/full.json`,
						description: "Combined public knowledge artifact for AI systems.",
					},
					{
						title: "Pricing Markdown",
						url: `${siteUrl}/pricing.md`,
						description: "Markdown summary of public pricing and plan details.",
					},
					{
						title: "Pricing Text",
						url: `${siteUrl}/pricing.txt`,
						description: "Plain-text summary of public pricing and plan details.",
					},
				],
			},
			{
				heading: "Features",
				items: buildFeatureLlmsItems(siteUrl, features),
			},
			{
				heading: "Guides",
				items: buildGuideLlmsItems(siteUrl, guides),
			},
			{
				heading: "Comparisons",
				items: buildComparisonLlmsItems(siteUrl, comparisons),
			},
			{
				heading: "Alternatives",
				items: buildAlternativeLlmsItems(siteUrl, alternatives),
			},
			{
				heading: "Pricing Breakdowns",
				items: buildPricingLlmsItems(siteUrl, pricingBreakdowns),
			},
			{
				heading: "Listicles",
				items: buildListicleLlmsItems(siteUrl, listicles),
			},
			{
				heading: "State Pages",
				items: buildStatePageLlmsItems(siteUrl, statePages),
			},
			{
				heading: "City Pages",
				items: buildCityPageLlmsItems(siteUrl, cityPages),
			},
			{
				heading: "Free Resources",
				items: buildLeadMagnetLlmsItems(siteUrl, leadMagnets),
			},
		],
	});

	return new Response(body, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
