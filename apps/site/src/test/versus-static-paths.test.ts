import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every file in src/content/comparisons describes a head-to-head comparison
 * page that must be emitted at /compare/versus/{competitorA.slug}-vs-{competitorB.slug}/.
 * Historically the page generator filtered to slugA < slugB to dedupe canonical
 * pairs, but that silently dropped intentional comparisons (e.g. playground-vs-procare,
 * sandbox-vs-pebbledesk) and produced 404s for links from listing/related-page widgets.
 *
 * Contract: every comparison file emits a unique URL; only self-comparisons (a === b)
 * are excluded.
 */

interface FrontmatterPair {
	slugA: string;
	slugB: string;
}

function parsePair(filePath: string): FrontmatterPair {
	const src = readFileSync(filePath, "utf8");
	const slugA = src.match(/competitorA:[\s\S]*?slug:\s*"([^"]+)"/)?.[1];
	const slugB = src.match(/competitorB:[\s\S]*?slug:\s*"([^"]+)"/)?.[1];
	if (!slugA || !slugB) {
		throw new Error(`Missing competitor slugs in ${filePath}`);
	}
	return { slugA, slugB };
}

function urlFor(pair: FrontmatterPair): string {
	return `/compare/versus/${pair.slugA}-vs-${pair.slugB}/`;
}

describe("versus page static paths", () => {
	const dir = resolve(__dirname, "../content/comparisons");
	const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

	it("has at least one comparison file", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it("every comparison emits a versus page (no silent dropping)", () => {
		const skipped: string[] = [];
		const seen = new Map<string, string>();
		for (const file of files) {
			const pair = parsePair(resolve(dir, file));
			if (pair.slugA === pair.slugB) {
				skipped.push(file);
				continue;
			}
			const url = urlFor(pair);
			const prior = seen.get(url);
			if (prior) {
				throw new Error(
					`URL collision at ${url}: both ${prior} and ${file} would emit at this path. Rename one file's competitor slugs.`,
				);
			}
			seen.set(url, file);
		}
		expect(seen.size).toBe(files.length - skipped.length);
	});

	it("emits links that match those referenced from related-pages metadata", () => {
		const validUrls = new Set<string>();
		for (const file of files) {
			const pair = parsePair(resolve(dir, file));
			if (pair.slugA !== pair.slugB) validUrls.add(urlFor(pair));
		}

		const broken: string[] = [];
		for (const file of files) {
			const src = readFileSync(resolve(dir, file), "utf8");
			// Strip redirectFrom blocks — those are historical paths, not outbound links.
			const stripped = src.replace(/redirectFrom:[\s\S]*?(?=^\w|\n---)/gm, "");
			const refs = stripped.match(/\/compare\/versus\/[a-z0-9-]+-vs-[a-z0-9-]+\/?/g) ?? [];
			for (const ref of refs) {
				const normalized = ref.endsWith("/") ? ref : `${ref}/`;
				if (!validUrls.has(normalized) && !normalized.endsWith(`/${file.replace(".md", "")}/`)) {
					broken.push(`${file} → ${ref}`);
				}
			}
		}
		expect(broken).toEqual([]);
	});
});
