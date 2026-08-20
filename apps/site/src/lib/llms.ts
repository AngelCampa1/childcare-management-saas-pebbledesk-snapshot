import { shouldIndexContent } from "@pebbledesk/marketing/lib/content-helpers";
import type { LlmsTxtItem } from "@pebbledesk/marketing/lib/llms-txt";
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

type BaseEntry = {
	id?: string;
	slug?: string;
	data: {
		title: string;
		description: string;
		noindex?: boolean;
	};
};

type AlternativeEntry = BaseEntry & {
	data: BaseEntry["data"] & {
		competitor: { slug: string };
	};
};

type ComparisonEntry = BaseEntry & {
	data: BaseEntry["data"] & {
		competitorA: { slug: string };
		competitorB: { slug: string };
	};
};

type PricingEntry = BaseEntry & {
	data: BaseEntry["data"] & {
		competitor: { slug: string };
	};
};

function buildLlmsItems<T extends BaseEntry>(
	siteUrl: string,
	entries: T[],
	getPath: (entry: T) => string,
): LlmsTxtItem[] {
	const normalizedSiteUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
	return entries.filter(shouldIndexContent).map((entry) => ({
		title: entry.data.title,
		url: `${normalizedSiteUrl}${withTrailingSlash(getPath(entry))}`,
		description: entry.data.description,
	}));
}

function withTrailingSlash(path: string): string {
	return path.endsWith("/") ? path : `${path}/`;
}

export function buildGuideLlmsItems(siteUrl: string, entries: BaseEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildGuidePath(contentEntrySlug(entry));
	});
}

export function buildListicleLlmsItems(siteUrl: string, entries: BaseEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildListiclePath(contentEntrySlug(entry));
	});
}

export function buildAlternativeLlmsItems(siteUrl: string, entries: AlternativeEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildAlternativePath(entry.data.competitor.slug);
	});
}

export function buildComparisonLlmsItems(siteUrl: string, entries: ComparisonEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildComparisonPath(entry.data.competitorA.slug, entry.data.competitorB.slug);
	});
}

export function buildPricingLlmsItems(siteUrl: string, entries: PricingEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildPricingPath(entry.data.competitor.slug);
	});
}

export function buildStatePageLlmsItems(siteUrl: string, entries: BaseEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildStatePagePath(contentEntrySlug(entry));
	});
}

export function buildCityPageLlmsItems(siteUrl: string, entries: BaseEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildCityPagePath(contentEntrySlug(entry));
	});
}

export function buildLeadMagnetLlmsItems(siteUrl: string, entries: BaseEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildLeadMagnetPath(contentEntrySlug(entry));
	});
}

export function buildFeatureLlmsItems(siteUrl: string, entries: BaseEntry[]) {
	return buildLlmsItems(siteUrl, entries, (entry) => {
		return buildFeaturePath(contentEntrySlug(entry));
	});
}
