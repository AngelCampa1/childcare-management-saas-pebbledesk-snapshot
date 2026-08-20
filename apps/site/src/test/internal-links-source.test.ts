import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resourceHubs } from "../config/resource-hubs";
import { siteConfig } from "../config/site";

/**
 * Catches the most common cause of broken-link rot: someone edits siteConfig.nav
 * or siteConfig.footer and the destination slug no longer exists, but the change
 * is invisible until production starts returning 404s. Validates every static
 * internal href in the site's chrome resolves to a real page or content slug.
 */

const pagesDir = resolve(__dirname, "../pages");
const contentDir = resolve(__dirname, "../content");

function listAstroPagePaths(dir: string, prefix = ""): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			out.push(...listAstroPagePaths(resolve(dir, entry.name), `${prefix}/${entry.name}`));
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(".astro")) continue;
		const stem = entry.name.replace(/\.astro$/, "");
		if (stem.startsWith("[") || stem.includes("[")) continue; // dynamic - handled via content collections
		const path = stem === "index" ? `${prefix}/` : `${prefix}/${stem}/`;
		out.push(path.startsWith("/") ? path : `/${path}`);
	}
	return out;
}

function listCollectionSlugs(collection: string): string[] {
	const dir = resolve(contentDir, collection);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.map((f) => f.replace(/\.md$/, ""));
}

function competitorSlug(
	file: string,
	key: "competitor" | "competitorA" | "competitorB",
): string | null {
	const src = readFileSync(file, "utf8");
	return src.match(new RegExp(`${key}:[\\s\\S]*?slug:\\s*"([^"]+)"`))?.[1] ?? null;
}

function buildKnownPaths(): Set<string> {
	const known = new Set<string>(listAstroPagePaths(pagesDir));
	for (const hub of resourceHubs) known.add(hub.href);

	for (const slug of listCollectionSlugs("state-pages")) known.add(`/childcare-software/${slug}/`);
	for (const slug of listCollectionSlugs("city-pages")) known.add(`/childcare-software/${slug}/`);
	for (const slug of listCollectionSlugs("features")) known.add(`/features/${slug}/`);
	known.add("/resources/guides/");
	known.add("/resources/best/");
	for (const slug of listCollectionSlugs("guides")) known.add(`/resources/guides/${slug}/`);
	for (const slug of listCollectionSlugs("listicles")) known.add(`/resources/best/${slug}/`);
	for (const slug of listCollectionSlugs("lead-magnets")) {
		known.add(`/free/${slug}/`);
		known.add(`/free/${slug}/print/`);
	}
	for (const file of readdirSync(resolve(contentDir, "alternatives")).filter((f) =>
		f.endsWith(".md"),
	)) {
		const slug = competitorSlug(resolve(contentDir, "alternatives", file), "competitor");
		if (slug) known.add(`/compare/alternatives/${slug}/`);
	}
	for (const file of readdirSync(resolve(contentDir, "pricing-breakdowns")).filter((f) =>
		f.endsWith(".md"),
	)) {
		const slug = competitorSlug(resolve(contentDir, "pricing-breakdowns", file), "competitor");
		if (slug) known.add(`/compare/pricing/${slug}/`);
	}
	for (const file of readdirSync(resolve(contentDir, "comparisons")).filter((f) =>
		f.endsWith(".md"),
	)) {
		const path = resolve(contentDir, "comparisons", file);
		const a = competitorSlug(path, "competitorA");
		const b = competitorSlug(path, "competitorB");
		if (a && b && a !== b) known.add(`/compare/versus/${a}-vs-${b}/`);
	}
	return known;
}

function normalize(href: string): string {
	if (!href.endsWith("/")) return `${href}/`;
	return href;
}

describe("siteConfig nav/footer internal links", () => {
	const known = buildKnownPaths();

	const collected: Array<{ source: string; href: string }> = [];
	for (const item of siteConfig.nav?.items ?? []) {
		if ("href" in item && item.href) {
			collected.push({ source: "nav", href: item.href });
		} else if ("megaMenu" in item && item.megaMenu) {
			for (const category of item.megaMenu) {
				for (const link of category.links) {
					collected.push({ source: `nav:${item.label}:${category.heading}`, href: link.href });
				}
			}
		}
	}
	for (const group of siteConfig.footer.linkGroups) {
		for (const link of group.links)
			collected.push({ source: `footer:${group.heading}`, href: link.href });
	}
	for (const link of siteConfig.footer.legalLinks)
		collected.push({ source: "footer:legal", href: link.href });
	for (const hub of resourceHubs) {
		for (const href of hub.startHere)
			collected.push({ source: `resourceHub:${hub.id}:startHere`, href });
	}

	for (const { source, href } of collected) {
		// Skip mailto:, tel:, external (https?://...), and #anchors - only validate site-relative paths.
		if (!href.startsWith("/")) continue;
		it(`${source} link "${href}" points to an existing page`, () => {
			const target = normalize(href.split("#")[0].split("?")[0]);
			expect(known.has(target), `Expected ${target} to be a generated page`).toBe(true);
		});
	}
});
