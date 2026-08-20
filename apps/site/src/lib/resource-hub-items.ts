import { getCollection } from "astro:content";
import {
	getHubIdsForResource,
	type HubResourceType,
	type ResourceHubId,
} from "../config/resource-hubs";
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

export interface HubPageItem {
	type: HubResourceType;
	typeLabel: string;
	slug: string;
	title: string;
	description: string;
	href: string;
	updatedAt: string;
}

export interface StaticHubLink {
	title: string;
	description: string;
	href: string;
	typeLabel: string;
}

export const staticHubLinks: StaticHubLink[] = [
	{
		title: "Compare childcare software",
		description: "Start with the main comparison hub before opening vendor-specific pages.",
		href: "/compare/",
		typeLabel: "Hub",
	},
	{
		title: "PebbleDesk pricing",
		description: "Review PebbleDesk plan shape, flat pricing, and trial details.",
		href: "/pricing/",
		typeLabel: "Pricing",
	},
	{
		title: "Free childcare resources",
		description: "Browse every downloadable checklist, calculator, template, and scorecard.",
		href: "/free/",
		typeLabel: "Hub",
	},
	{
		title: "Childcare software by state and city",
		description: "Browse state and city pages for local childcare software guidance.",
		href: "/childcare-software/",
		typeLabel: "Hub",
	},
];

export async function loadHubPageItems(): Promise<HubPageItem[]> {
	const [
		guides,
		listicles,
		leadMagnets,
		features,
		statePages,
		cityPages,
		alternatives,
		comparisons,
		pricingBreakdowns,
	] = await Promise.all([
		getCollection("guides"),
		getCollection("listicles"),
		getCollection("lead-magnets"),
		getCollection("features"),
		getCollection("state-pages"),
		getCollection("city-pages"),
		getCollection("alternatives"),
		getCollection("comparisons"),
		getCollection("pricing-breakdowns"),
	]);

	return [
		...guides.map((entry) => ({
			type: "guide" as const,
			typeLabel: "Guides",
			slug: contentEntrySlug(entry),
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildGuidePath(contentEntrySlug(entry))}/`,
			updatedAt: entry.data.updatedAt,
		})),
		...listicles.map((entry) => ({
			type: "best" as const,
			typeLabel: "Best lists",
			slug: contentEntrySlug(entry),
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildListiclePath(contentEntrySlug(entry))}/`,
			updatedAt: entry.data.updatedAt,
		})),
		...leadMagnets.map((entry) => ({
			type: "free-tool" as const,
			typeLabel: "Free tools",
			slug: contentEntrySlug(entry),
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildLeadMagnetPath(contentEntrySlug(entry))}/`,
			updatedAt: entry.data.updatedAt,
		})),
		...features.map((entry) => ({
			type: "feature" as const,
			typeLabel: "Features",
			slug: contentEntrySlug(entry),
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildFeaturePath(contentEntrySlug(entry))}/`,
			updatedAt: entry.data.updatedAt,
		})),
		...statePages.map((entry) => ({
			type: "state" as const,
			typeLabel: "State pages",
			slug: contentEntrySlug(entry),
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildStatePagePath(contentEntrySlug(entry))}/`,
			updatedAt: entry.data.updatedAt,
		})),
		...cityPages.map((entry) => ({
			type: "city" as const,
			typeLabel: "City pages",
			slug: contentEntrySlug(entry),
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildCityPagePath(contentEntrySlug(entry))}/`,
			updatedAt: entry.data.updatedAt,
		})),
		...alternatives.map((entry) => ({
			type: "alternative" as const,
			typeLabel: "Alternatives",
			slug: entry.data.competitor.slug,
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildAlternativePath(entry.data.competitor.slug)}/`,
			updatedAt: entry.data.updatedAt,
		})),
		...comparisons.map((entry) => ({
			type: "comparison" as const,
			typeLabel: "Comparisons",
			slug: `${entry.data.competitorA.slug}-vs-${entry.data.competitorB.slug}`,
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildComparisonPath(entry.data.competitorA.slug, entry.data.competitorB.slug)}/`,
			updatedAt: entry.data.updatedAt,
		})),
		...pricingBreakdowns.map((entry) => ({
			type: "pricing" as const,
			typeLabel: "Pricing breakdowns",
			slug: entry.data.competitor.slug,
			title: entry.data.title,
			description: entry.data.description,
			href: `${buildPricingPath(entry.data.competitor.slug)}/`,
			updatedAt: entry.data.updatedAt,
		})),
	];
}

export function filterItemsForHub(items: HubPageItem[], hubId: ResourceHubId): HubPageItem[] {
	return items
		.filter((item) => getHubIdsForResource(item).includes(hubId))
		.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function resolveStartHereItems(
	startHere: string[],
	hubItems: HubPageItem[],
	allItems: HubPageItem[],
): Array<HubPageItem | StaticHubLink> {
	return startHere
		.map(
			(href) =>
				hubItems.find((item) => item.href === href) ??
				allItems.find((item) => item.href === href) ??
				staticHubLinks.find((item) => item.href === href),
		)
		.filter((item): item is HubPageItem | StaticHubLink => item !== undefined);
}
