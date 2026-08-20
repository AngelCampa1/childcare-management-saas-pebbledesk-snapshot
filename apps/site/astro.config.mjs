import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { indexNowIntegration } from "@pebbledesk/marketing/lib/indexnow-integration";
import { remarkOfferingTokens } from "@pebbledesk/marketing/lib/remark-offering-tokens";
import { sitemapDatesIntegration } from "@pebbledesk/marketing/lib/sitemap-dates-integration";
import { createSitemapSerializer } from "@pebbledesk/marketing/lib/sitemap-utils";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { buildCanonicalPathFromContentSlug } from "./src/lib/content-paths.ts";
import { contentRedirectsIntegration } from "./src/lib/content-redirects.ts";
import { internalLinkNormalizationIntegration } from "./src/lib/internal-link-normalization.ts";
import {
	getGeneratedContentNoindexPaths,
	shouldIncludeInSitemap,
} from "./src/lib/sitemap-paths.ts";

const generatedContentNoindexPaths = getGeneratedContentNoindexPaths();

export default defineConfig({
	site: PUBLIC_BRAND_KNOWLEDGE.publicOrigin,
	output: "static",
	trailingSlash: "always",
	integrations: [
		react(),
		sitemap({
			filter: (page) => {
				const pathname = new URL(page).pathname;
				return shouldIncludeInSitemap(pathname, generatedContentNoindexPaths);
			},
			serialize: createSitemapSerializer(),
		}),
		contentRedirectsIntegration(),
		internalLinkNormalizationIntegration(PUBLIC_BRAND_KNOWLEDGE.publicOrigin),
		indexNowIntegration(),
		sitemapDatesIntegration({ resolveCanonicalPath: buildCanonicalPathFromContentSlug }),
	],
	markdown: {
		remarkPlugins: [remarkOfferingTokens],
	},
	vite: {
		plugins: [tailwindcss()],
	},
});
