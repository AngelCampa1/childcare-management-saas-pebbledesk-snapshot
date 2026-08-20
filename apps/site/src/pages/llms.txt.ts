import { getCollection } from "astro:content";
import { buildLlmsTxt } from "@pebbledesk/marketing/lib/llms-txt";
import type { APIContext } from "astro";
import { personaPages } from "@/config/persona-pages";
import { siteConfig } from "@/config/site";
import {
	buildAlternativeLlmsItems,
	buildComparisonLlmsItems,
	buildFeatureLlmsItems,
	buildGuideLlmsItems,
	buildListicleLlmsItems,
	buildPricingLlmsItems,
} from "@/lib/llms";

export const prerender = true;

export async function GET(_context: APIContext) {
	const siteUrl = `https://${siteConfig.domain}`;

	const [alternatives, comparisons, pricingBreakdowns, listicles, guides, features] =
		await Promise.all([
			getCollection("alternatives"),
			getCollection("comparisons"),
			getCollection("pricing-breakdowns"),
			getCollection("listicles"),
			getCollection("guides"),
			getCollection("features"),
		]);

	const body = buildLlmsTxt({
		name: siteConfig.name,
		description: siteConfig.metaDescription ?? siteConfig.tagline,
		overview: siteConfig.tagline,
		sections: [
			{
				heading: "Who It's For",
				items: [
					{
						title: "Who PebbleDesk Is For",
						url: `${siteUrl}/for/`,
						description: "Hub page listing all program types PebbleDesk serves.",
					},
					...personaPages.map((p) => ({
						title: p.navLabel,
						url: `${siteUrl}${p.route}`,
						description: p.description,
					})),
				],
			},
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
		],
	});

	return new Response(body, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
