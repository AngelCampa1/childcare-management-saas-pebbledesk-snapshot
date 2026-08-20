import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import {
	buildIndexNowPayload,
	parseSitemap,
	parseSitemapIndex,
	submitToIndexNow,
} from "./indexnow.js";

export function indexNowIntegration(): AstroIntegration {
	return {
		name: "@pebbledesk/indexnow",
		hooks: {
			"astro:build:done": async ({ dir, logger }) => {
				// dir is a URL pointing to the build output directory
				const distPath = fileURLToPath(dir);

				// 1. Read sitemap-index.xml
				const sitemapIndexPath = join(distPath, "sitemap-index.xml");
				let sitemapIndexXml: string;
				try {
					sitemapIndexXml = readFileSync(sitemapIndexPath, "utf-8");
				} catch {
					logger.warn("IndexNow: no sitemap-index.xml found, skipping submission");
					return;
				}

				// 2. Parse child sitemap URLs
				const childSitemapUrls = parseSitemapIndex(sitemapIndexXml);
				if (childSitemapUrls.length === 0) {
					logger.warn("IndexNow: no sitemaps found in sitemap-index.xml");
					return;
				}

				// 3. Extract host from the first sitemap URL
				// e.g. "https://crewroute.app/sitemap-0.xml" → "crewroute.app"
				const firstUrl = new URL(childSitemapUrls[0]);
				const host = firstUrl.hostname;

				// 4. Collect all page URLs from child sitemaps
				const allUrls: string[] = [];
				for (const childUrl of childSitemapUrls) {
					// Sitemap URL: "https://crewroute.app/sitemap-0.xml"
					// Local file: join(distPath, "sitemap-0.xml")
					const sitemapFilename = new URL(childUrl).pathname.replace(/^\//, "");
					const sitemapPath = join(distPath, sitemapFilename);
					try {
						const xml = readFileSync(sitemapPath, "utf-8");
						allUrls.push(...parseSitemap(xml));
					} catch {
						logger.warn(`IndexNow: could not read ${sitemapPath}`);
					}
				}

				if (allUrls.length === 0) {
					logger.warn("IndexNow: no URLs found in sitemaps");
					return;
				}

				if (process.env.INDEXNOW_SUBMIT !== "1") {
					logger.info("IndexNow: skipping submission because INDEXNOW_SUBMIT is not enabled");
					return;
				}

				// 5. Submit to IndexNow
				logger.info(`IndexNow: submitting ${allUrls.length} URLs for ${host}`);
				const payload = buildIndexNowPayload(host, allUrls);
				const result = await submitToIndexNow(payload);

				if (result.success) {
					logger.info(`IndexNow: submitted successfully (${result.status})`);
				} else {
					logger.warn(`IndexNow: submission failed (${result.status}: ${result.message})`);
				}
			},
		},
	};
}
