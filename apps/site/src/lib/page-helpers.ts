import type { CollectionEntry } from "astro:content";
import { buildHowToSchema } from "@pebbledesk/marketing/lib/schema-builders";
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

type RelatedLinkSource = "authored" | "fallback";

type ContentEntry = {
	title: string;
	description: string;
	canonicalHref?: string;
};

export function entrySlug(entry: { id?: string; slug?: string }): string {
	return contentEntrySlug(entry).split(/[\\/]/).filter(Boolean).at(-1) ?? contentEntrySlug(entry);
}

export function buildContentMap(collections: {
	alternatives: CollectionEntry<"alternatives">[];
	comparisons: CollectionEntry<"comparisons">[];
	pricingBreakdowns: CollectionEntry<"pricing-breakdowns">[];
	listicles: CollectionEntry<"listicles">[];
	guides: CollectionEntry<"guides">[];
	statePages: CollectionEntry<"state-pages">[];
	leadMagnets: CollectionEntry<"lead-magnets">[];
	features?: CollectionEntry<"features">[];
	cityPages?: CollectionEntry<"city-pages">[];
}): Map<string, ContentEntry> {
	const map = new Map<string, ContentEntry>();

	for (const entry of collections.alternatives) {
		map.set(buildAlternativePath(entry.data.competitor.slug), {
			title: entry.data.title,
			description: entry.data.description,
			canonicalHref: entry.data.canonicalHref,
		});
	}

	for (const entry of collections.comparisons) {
		const key = buildComparisonPath(entry.data.competitorA.slug, entry.data.competitorB.slug);
		map.set(key, {
			title: entry.data.title,
			description: entry.data.description,
			canonicalHref: entry.data.canonicalHref,
		});
	}

	for (const entry of collections.pricingBreakdowns) {
		map.set(buildPricingPath(entry.data.competitor.slug), {
			title: entry.data.title,
			description: entry.data.description,
			canonicalHref: entry.data.canonicalHref,
		});
	}

	for (const entry of collections.listicles) {
		map.set(buildListiclePath(contentEntrySlug(entry)), {
			title: entry.data.title,
			description: entry.data.description,
			canonicalHref: entry.data.canonicalHref,
		});
	}

	for (const entry of collections.guides) {
		map.set(buildGuidePath(contentEntrySlug(entry)), {
			title: entry.data.title,
			description: entry.data.description,
			canonicalHref: entry.data.canonicalHref,
		});
	}

	for (const entry of collections.statePages) {
		map.set(buildStatePagePath(contentEntrySlug(entry)), {
			title: entry.data.title,
			description: entry.data.description,
			canonicalHref: entry.data.canonicalHref,
		});
	}

	for (const entry of collections.leadMagnets) {
		map.set(buildLeadMagnetPath(contentEntrySlug(entry)), {
			title: entry.data.title,
			description: entry.data.description,
			canonicalHref: entry.data.canonicalHref,
		});
	}

	if (collections.features) {
		for (const entry of collections.features) {
			map.set(buildFeaturePath(contentEntrySlug(entry)), {
				title: entry.data.title,
				description: entry.data.description,
				canonicalHref: entry.data.canonicalHref,
			});
		}
	}

	if (collections.cityPages) {
		for (const entry of collections.cityPages) {
			map.set(buildCityPagePath(contentEntrySlug(entry)), {
				title: entry.data.title,
				description: entry.data.description,
				canonicalHref: entry.data.canonicalHref,
			});
		}
	}

	return map;
}

function normalizePath(path: string): string {
	if (path === "/") return "/";
	return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function resolveRelatedLinksWithFallback({
	currentPath,
	relatedPages,
	contentMap,
	minLinks = 4,
}: {
	currentPath: string;
	relatedPages: string[];
	contentMap: Map<string, ContentEntry>;
	minLinks?: number;
}) {
	const current = normalizePath(currentPath);
	const seen = new Set<string>();
	const links: Array<{ title: string; href: string; description: string }> = [];
	const missingAuthoredLinks: string[] = [];

	function addHref(href: string, source: RelatedLinkSource): void {
		const normalized = normalizePath(href);
		if (!normalized || normalized === current || seen.has(normalized)) return;
		const trailingHref = `${normalized}/`;
		const entry = contentMap.get(normalized) ?? contentMap.get(trailingHref);
		if (entry === undefined) {
			if (source === "authored") missingAuthoredLinks.push(normalized);
			return;
		}
		const resolvedHref = contentMap.has(normalized) ? normalized : trailingHref;
		seen.add(normalized);
		links.push({
			title: entry.title,
			href: entry.canonicalHref ?? resolvedHref,
			description: entry.description,
		});
	}

	for (const href of relatedPages) addHref(href, "authored");
	if (missingAuthoredLinks.length > 0) {
		throw new Error(
			`Missing related page link(s) for ${current}: ${missingAuthoredLinks.join(", ")}`,
		);
	}

	for (const href of contentMap.keys()) {
		if (links.length >= minLinks) break;
		addHref(href, "fallback");
	}

	return links;
}

export interface StatePageDefaults {
	topMetros: Array<{ name: string; count: number }>;
	establishmentCount: number | undefined;
	licensingNotes: string;
	seasonalNotes: string;
}

export function resolveStatePageDefaults(data: {
	topMetros?: Array<{ name: string; count: number }>;
	establishmentCount?: number;
	licensingNotes?: string;
	seasonalNotes?: string;
}): StatePageDefaults {
	return {
		topMetros: data.topMetros ?? [],
		establishmentCount: data.establishmentCount,
		licensingNotes: data.licensingNotes ?? "",
		seasonalNotes: data.seasonalNotes ?? "",
	};
}

export function padToolIndex(index: number): string {
	return String(index + 1).padStart(2, "0");
}

export function buildOptionalHowToSchema(
	steps: { title: string; content: string }[] | undefined,
	name: string,
	description: string,
): Record<string, unknown> | null {
	if (!steps || steps.length === 0) return null;
	return buildHowToSchema({ name, description, steps });
}
