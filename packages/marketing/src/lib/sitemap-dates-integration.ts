import { type Dirent, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

export interface SitemapDatesIntegrationOptions {
	resolveCanonicalPath?: (contentSlug: string, content: string) => string | null | undefined;
}

/**
 * Extracts the `updatedAt` value from markdown frontmatter YAML.
 * Handles quoted and unquoted values. Returns null if not found.
 */
export function extractUpdatedAt(markdownContent: string): string | null {
	// Must start with ---
	if (!markdownContent.startsWith("---")) {
		return null;
	}
	// Find the closing --- delimiter
	const closingIndex = markdownContent.indexOf("---", 3);
	if (closingIndex === -1) {
		return null;
	}
	const frontmatter = markdownContent.slice(3, closingIndex);
	// Match: updatedAt: "value" | 'value' | value
	const match = frontmatter.match(/^updatedAt:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m);
	if (!match) {
		return null;
	}
	// Exactly one of the three capture groups will be defined (the regex requires it)
	return match[1] ?? match[2] ?? match[3] ?? /* c8 ignore next */ null;
}

/**
 * Extracts the pathname (without leading slash) from a full URL string.
 * e.g. "https://crewroute.app/compare/alternatives/servicetitan" → "compare/alternatives/servicetitan"
 * For homepage or bare domain, returns an empty string.
 */
export function extractPathFromUrl(url: string): string {
	const parsed = new URL(url);
	return parsed.pathname.replace(/^\/|\/$/g, "");
}

/**
 * Builds a relativeSlug→date map from an array of {slug, content} file objects.
 * The slug should be the file's relative path from the content root, without
 * the .md extension and using forward slashes
 * (e.g. "guides/perimenopause-anxiety" not "perimenopause-anxiety").
 * Files without `updatedAt` in frontmatter are omitted.
 */
export function buildSlugDateMap(
	files: Array<{ slug: string; content: string }>,
): Record<string, string> {
	const map: Record<string, string> = {};
	for (const file of files) {
		const date = extractUpdatedAt(file.content);
		if (date !== null) {
			map[file.slug] = date;
		}
	}
	return map;
}

/**
 * Rewrites <lastmod> entries in sitemap XML where a URL's pathname suffix
 * matches a key in the slug→date map. Non-matching URLs are left unchanged.
 *
 * Matches by suffix: URL path "resources/guides/foo" matches slug key
 * "guides/foo" because the URL ends with that relative path.
 *
 * Uses simple string replacement; no XML parser required since @astrojs/sitemap
 * produces a predictable format.
 */
export function rewriteSitemapDates(
	sitemapXml: string,
	slugDateMap: Record<string, string>,
): string {
	if (!sitemapXml || Object.keys(slugDateMap).length === 0) {
		return sitemapXml;
	}

	// Match each <url>...</url> block and rewrite the <lastmod> if slug matches
	return sitemapXml.replace(/(<url>[\s\S]*?<\/url>)/g, (urlBlock: string): string => {
		const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/);
		if (!locMatch) {
			return urlBlock;
		}
		const urlPath = extractPathFromUrl(locMatch[1].trim());
		const canonicalPath = `/${urlPath}`;
		const matchedKey = Object.keys(slugDateMap).find((key) => {
			const normalizedKey = key.startsWith("/") ? key : `/${key}`;
			return canonicalPath === normalizedKey || `${canonicalPath}/` === normalizedKey;
		});
		if (!matchedKey) {
			return urlBlock;
		}
		const date = slugDateMap[matchedKey];
		/* c8 ignore next 3; matchedKey came from Object.keys(slugDateMap).find(), so date is always defined */
		if (!date) {
			return urlBlock;
		}
		const lastmod = `<lastmod>${date}</lastmod>`;
		if (/<lastmod>\s*[^<]*\s*<\/lastmod>/.test(urlBlock)) {
			return urlBlock.replace(/<lastmod>\s*[^<]*\s*<\/lastmod>/, lastmod);
		}

		return urlBlock.replace(/(<loc>[^<]+<\/loc>)/, `$1${lastmod}`);
	});
}

/**
 * Astro integration that rewrites sitemap <lastmod> entries using
 * real content dates from markdown frontmatter `updatedAt` fields.
 *
 * Requires Node 18.17+ for readdirSync recursive option.
 */
export function sitemapDatesIntegration(
	options: SitemapDatesIntegrationOptions = {},
): AstroIntegration {
	return {
		name: "sitemap-dates",
		hooks: {
			"astro:build:done": async ({ dir, logger }) => {
				const distPath = fileURLToPath(dir);

				// 1. Find sitemap XML files (skip sitemap-index.xml; only rewrite leaf sitemaps)
				let sitemapFiles: string[];
				try {
					const entries = readdirSync(distPath);
					sitemapFiles = entries.filter(
						(f) =>
							typeof f === "string" &&
							f.endsWith(".xml") &&
							f.startsWith("sitemap-") &&
							f !== "sitemap-index.xml",
					);
				} catch {
					logger.warn("sitemap-dates: could not read dist directory, skipping");
					return;
				}

				if (sitemapFiles.length === 0) {
					logger.warn("sitemap-dates: no sitemap XML files found in dist, skipping");
					return;
				}

				// 2. Read src/content/**/*.md and build slug→date map
				const contentDir = join(process.cwd(), "src", "content");
				let fileEntries: Dirent<string>[];
				try {
					fileEntries = readdirSync(contentDir, {
						recursive: true,
						withFileTypes: true,
						encoding: "utf-8",
					});
				} catch {
					logger.warn("sitemap-dates: src/content not found, skipping lastmod rewrite");
					return;
				}

				const contentFiles: Array<{ slug: string; content: string }> = [];
				for (const entry of fileEntries) {
					if (entry.isFile() && entry.name.endsWith(".md")) {
						// parentPath is available in Node 21.4+; path is the older equivalent
						const parentDir =
							"parentPath" in entry
								? entry.parentPath
								: (entry as unknown as { path: string }).path;
						const fullPath = join(parentDir, entry.name);
						// Build relative path from content root (e.g. "guides/perimenopause-anxiety")
						// so files with the same basename in different subdirs get distinct keys.
						const relPath = relative(contentDir, fullPath);
						try {
							const content = readFileSync(fullPath, "utf-8");
							const contentSlug = relPath.replace(/\.md$/, "").split(sep).join("/");
							const slug =
								options.resolveCanonicalPath?.(contentSlug, content) ?? `/${contentSlug}`;
							contentFiles.push({ slug, content });
						} catch {
							// skip unreadable files
						}
					}
				}

				const slugDateMap = buildSlugDateMap(contentFiles);
				const matchCount = Object.keys(slugDateMap).length;

				if (matchCount === 0) {
					logger.info("sitemap-dates: no updatedAt frontmatter found, skipping lastmod rewrite");
					return;
				}

				// 3. Rewrite each leaf sitemap file
				let rewrittenUrls = 0;
				for (const sitemapFile of sitemapFiles) {
					const sitemapPath = join(distPath, sitemapFile);
					let xml: string;
					try {
						xml = readFileSync(sitemapPath, "utf-8");
					} catch {
						logger.warn(`sitemap-dates: could not read ${sitemapFile}`);
						continue;
					}

					const rewritten = rewriteSitemapDates(xml, slugDateMap);
					if (rewritten !== xml) {
						try {
							writeFileSync(sitemapPath, rewritten, "utf-8");
						} catch (err) {
							logger.warn(
								`sitemap-dates: failed to write ${sitemapFile}: ${err instanceof Error ? err.message : String(err)}`,
							);
							continue;
						}
						const originalDateBlocks = xml.match(/<lastmod>[^<]+<\/lastmod>/g) ?? [];
						const rewrittenDateBlocks = rewritten.match(/<lastmod>[^<]+<\/lastmod>/g) ?? [];
						const insertedDates = Math.max(
							0,
							rewrittenDateBlocks.length - originalDateBlocks.length,
						);
						rewrittenUrls += insertedDates;
						for (let i = 0; i < originalDateBlocks.length; i++) {
							if (originalDateBlocks[i] !== rewrittenDateBlocks[i]) {
								rewrittenUrls++;
							}
						}
					}
				}

				logger.info(
					`sitemap-dates: rewrote ${rewrittenUrls} lastmod entries across ${sitemapFiles.length} sitemap file(s)`,
				);
			},
		},
	};
}
