import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import { shouldIndexContent } from "@pebbledesk/marketing/lib/content-helpers";
import { ensureTrailingSlash } from "@pebbledesk/marketing/lib/meta";
import { buildRssFeedOptions, contentItemToRssItem } from "@pebbledesk/marketing/lib/rss-utils";
import type { APIContext } from "astro";
import { siteConfig } from "@/config/site";
import {
	buildAlternativePath,
	buildComparisonPath,
	buildFeaturePath,
	buildGuidePath,
	buildListiclePath,
	buildPricingPath,
	buildStatePagePath,
	contentEntrySlug,
} from "@/lib/content-paths";

export const prerender = true;

export async function GET(_context: APIContext) {
	const [alternatives, comparisons, pricingBreakdowns, listicles, guides, statePages, features] =
		await Promise.all([
			getCollection("alternatives"),
			getCollection("comparisons"),
			getCollection("pricing-breakdowns"),
			getCollection("listicles"),
			getCollection("guides"),
			getCollection("state-pages"),
			getCollection("features"),
		]);

	const siteUrl = `https://${siteConfig.domain}`;
	const canonicalRssUrl = (path: string) => ensureTrailingSlash(`${siteUrl}${path}`);

	const items = [
		...alternatives.filter(shouldIndexContent).map((e) =>
			contentItemToRssItem({
				title: e.data.title,
				description: e.data.description,
				publishedAt: e.data.publishedAt,
				link: canonicalRssUrl(buildAlternativePath(e.data.competitor.slug)),
			}),
		),
		...comparisons.filter(shouldIndexContent).map((e) =>
			contentItemToRssItem({
				title: e.data.title,
				description: e.data.description,
				publishedAt: e.data.publishedAt,
				link: canonicalRssUrl(
					buildComparisonPath(e.data.competitorA.slug, e.data.competitorB.slug),
				),
			}),
		),
		...pricingBreakdowns.filter(shouldIndexContent).map((e) =>
			contentItemToRssItem({
				title: e.data.title,
				description: e.data.description,
				publishedAt: e.data.publishedAt,
				link: canonicalRssUrl(buildPricingPath(e.data.competitor.slug)),
			}),
		),
		...listicles.filter(shouldIndexContent).map((e) =>
			contentItemToRssItem({
				title: e.data.title,
				description: e.data.description,
				publishedAt: e.data.publishedAt,
				link: canonicalRssUrl(buildListiclePath(contentEntrySlug(e))),
			}),
		),
		...guides.filter(shouldIndexContent).map((e) =>
			contentItemToRssItem({
				title: e.data.title,
				description: e.data.description,
				publishedAt: e.data.publishedAt,
				link: canonicalRssUrl(buildGuidePath(contentEntrySlug(e))),
			}),
		),
		...statePages.filter(shouldIndexContent).map((e) =>
			contentItemToRssItem({
				title: e.data.title,
				description: e.data.description,
				publishedAt: e.data.publishedAt,
				link: canonicalRssUrl(buildStatePagePath(contentEntrySlug(e))),
			}),
		),
		...features.filter(shouldIndexContent).map((e) =>
			contentItemToRssItem({
				title: e.data.title,
				description: e.data.description,
				publishedAt: e.data.publishedAt,
				link: canonicalRssUrl(buildFeaturePath(contentEntrySlug(e))),
			}),
		),
	].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

	return rss(buildRssFeedOptions(siteConfig, items));
}
