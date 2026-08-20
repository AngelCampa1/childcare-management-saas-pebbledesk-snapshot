import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;
const MIN_INDEXED_WORDS = 125;
const MIN_TARGETED_BOFU_WORDS = 220;
const TARGETED_BOFU_SLUGS = new Set([
	"childpilot-pricing",
	"famly-pricing",
	"messaging-alerts",
	"audit-reports",
	"enrollment-records",
	"imports-migration",
]);

const contentDir = resolve(process.cwd(), "src/content");
const pagesDir = resolve(process.cwd(), "src/pages");

function collectMarkdownFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectMarkdownFiles(full));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".md")) {
			out.push(full);
		}
	}
	return out;
}

function collectAstroPages(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectAstroPages(full));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".astro")) {
			out.push(full);
		}
	}
	return out;
}

function relative(file: string): string {
	return file
		.replace(`${process.cwd()}\\`, "")
		.replace(`${process.cwd()}/`, "")
		.replace(/\\/g, "/");
}

/**
 * Extract a scalar value from simple YAML frontmatter (supports unquoted, double-quoted,
 * and single-quoted forms on a single line). Returns null when missing.
 */
function extractFrontmatterScalar(source: string, key: string): string | null {
	const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatterMatch) return null;
	const body = frontmatterMatch[1];
	const pattern = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m");
	const match = body.match(pattern);
	if (!match) return null;
	let value = match[1];
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}
	return value.replace(/\\"/g, '"').replace(/\\'/g, "'");
}

/**
 * Extract a double-quoted prop value from an Astro file's frontmatter or JSX opening tag.
 * Only matches string literals ("..."), not expressions ({...}) or template literals,
 * because only static literals are subject to SERP length limits.
 * Returns null when the prop is missing or dynamically computed.
 */
function extractLiteralProp(source: string, propName: string): string | null {
	const pattern = new RegExp(`\\b${propName}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`);
	const match = source.match(pattern);
	return match ? match[1] : null;
}

function pathSlug(file: string): string {
	return relative(file).split("/").pop()?.replace(/\.md$/, "") ?? "";
}

function collectionName(file: string): string {
	return relative(file).split("/").at(-2) ?? "";
}

function extractNestedFrontmatterScalar(
	source: string,
	section: string,
	key: string,
): string | null {
	const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatterMatch) return null;
	const lines = frontmatterMatch[1].split(/\r?\n/);
	let collecting = false;

	for (const line of lines) {
		if (!collecting) {
			if (line.trim() === `${section}:`) {
				collecting = true;
			}
			continue;
		}

		if (/^\S/.test(line)) break;

		const match = line.match(new RegExp(`^\\s+${key}:\\s*(.+?)\\s*$`));
		if (!match) continue;

		let value = match[1];
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		return value;
	}

	return null;
}

function bodyWordCount(source: string): number {
	const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
	return body
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/<[^>]+>/g, " ")
		.split(/\s+/)
		.filter((word) => /[A-Za-z0-9]/.test(word)).length;
}

function effectiveCanonicalPath(file: string, source: string): string | null {
	const canonicalHref = extractFrontmatterScalar(source, "canonicalHref");
	if (canonicalHref) return canonicalHref.replace(/\/+$/, "");

	const collection = collectionName(file);
	const slug = pathSlug(file);
	const competitorSlug = extractNestedFrontmatterScalar(source, "competitor", "slug");

	if (collection === "alternatives") {
		return competitorSlug ? `/compare/alternatives/${competitorSlug}` : null;
	}

	if (collection === "pricing-breakdowns") {
		return competitorSlug ? `/compare/pricing/${competitorSlug}` : null;
	}

	if (collection === "features") {
		return `/features/${slug}`;
	}

	if (collection === "state-pages") {
		return `/childcare-software/${slug}`;
	}

	return null;
}

describe("SEO metadata lint — titles and descriptions fit SERP display", () => {
	const markdownFiles = collectMarkdownFiles(contentDir);

	describe("content collection frontmatter", () => {
		for (const file of markdownFiles) {
			const rel = relative(file);
			const source = readFileSync(file, "utf8");
			const title = extractFrontmatterScalar(source, "title");
			const description = extractFrontmatterScalar(source, "description");

			it(`${rel} has title ≤${MAX_TITLE} chars`, () => {
				expect(title, `${rel} is missing a title`).not.toBeNull();
				expect(title?.length ?? 0, `title: ${title}`).toBeLessThanOrEqual(MAX_TITLE);
			});

			it(`${rel} has description ≤${MAX_DESCRIPTION} chars`, () => {
				expect(description, `${rel} is missing a description`).not.toBeNull();
				expect(description?.length ?? 0, `description: ${description}`).toBeLessThanOrEqual(
					MAX_DESCRIPTION,
				);
			});
		}
	});

	describe("astro page literal props", () => {
		const pageFiles = collectAstroPages(pagesDir);

		for (const file of pageFiles) {
			const rel = relative(file);
			const source = readFileSync(file, "utf8");
			const title = extractLiteralProp(source, "title");
			const description = extractLiteralProp(source, "description");

			if (title !== null) {
				it(`${rel} has literal title ≤${MAX_TITLE} chars`, () => {
					expect(title.length, `title: ${title}`).toBeLessThanOrEqual(MAX_TITLE);
				});
			}

			if (description !== null) {
				it(`${rel} has literal description ≤${MAX_DESCRIPTION} chars`, () => {
					expect(description.length, `description: ${description}`).toBeLessThanOrEqual(
						MAX_DESCRIPTION,
					);
				});
			}
		}
	});

	describe("known duplicate metadata regressions", () => {
		const bySlug = new Map(
			markdownFiles.map((file) => [pathSlug(file), readFileSync(file, "utf8")] as const),
		);

		it("uses distinct titles for staff scheduling product and guide pages", () => {
			const featureTitle = extractFrontmatterScalar(bySlug.get("staff-scheduling") ?? "", "title");
			const guideTitle = extractFrontmatterScalar(
				bySlug.get("staff-scheduling-for-childcare-centers") ?? "",
				"title",
			);

			expect(featureTitle).toBe("Staff Scheduling Software for Childcare Centers");
			expect(featureTitle).not.toBe(guideTitle);
		});

		it("uses distinct descriptions for subsidy roundup pages", () => {
			const ccdfDescription = extractFrontmatterScalar(
				bySlug.get("best-childcare-software-ccdf-subsidy-centers") ?? "",
				"description",
			);
			const subsidyAppsDescription = extractFrontmatterScalar(
				bySlug.get("best-subsidy-tracking-childcare-apps") ?? "",
				"description",
			);

			expect(ccdfDescription).not.toBe(subsidyAppsDescription);
		});
	});

	describe("content SEO cleanup guards", () => {
		it("keeps alternative and pricing content on unique effective canonical paths", () => {
			const scopedFiles = markdownFiles.filter((file) =>
				["alternatives", "pricing-breakdowns"].includes(collectionName(file)),
			);
			const paths = new Map<string, string[]>();

			for (const file of scopedFiles) {
				const rel = relative(file);
				const source = readFileSync(file, "utf8");
				const canonicalPath = effectiveCanonicalPath(file, source);
				expect(canonicalPath, `${rel} needs a canonical path`).not.toBeNull();
				const existing = paths.get(canonicalPath ?? "") ?? [];
				paths.set(canonicalPath ?? "", [...existing, rel]);
			}

			const duplicates = [...paths.entries()].filter(([, files]) => files.length > 1);

			expect(duplicates).toEqual([]);
		});

		it("keeps every state page description state-specific", () => {
			const stateFiles = markdownFiles.filter((file) => collectionName(file) === "state-pages");

			expect(stateFiles).toHaveLength(50);

			for (const file of stateFiles) {
				const rel = relative(file);
				const source = readFileSync(file, "utf8");
				const state = extractFrontmatterScalar(source, "state");
				const description = extractFrontmatterScalar(source, "description");

				expect(description, `${rel} is missing description`).not.toBeNull();
				expect(description, `${rel} should name ${state}`).toContain(state);
				expect(description, `${rel} uses a generic template`).not.toContain(
					"focused on licensing, ratios, and subsidy billing",
				);
			}
		});

		it("keeps indexed BOFU feature and pricing pages from staying thin", () => {
			const scopedFiles = markdownFiles.filter((file) =>
				["features", "pricing-breakdowns"].includes(collectionName(file)),
			);
			const failures = scopedFiles
				.map((file) => {
					const source = readFileSync(file, "utf8");
					const noindex = extractFrontmatterScalar(source, "noindex") === "true";
					return { rel: relative(file), words: bodyWordCount(source), noindex };
				})
				.filter(({ noindex, words }) => !noindex && words < MIN_INDEXED_WORDS);

			expect(failures).toEqual([]);
		});

		it("expands named BOFU cleanup pages beyond placeholder-depth copy", () => {
			const failures = markdownFiles
				.filter((file) => TARGETED_BOFU_SLUGS.has(pathSlug(file)))
				.map((file) => {
					const source = readFileSync(file, "utf8");
					return { rel: relative(file), words: bodyWordCount(source) };
				})
				.filter(({ words }) => words < MIN_TARGETED_BOFU_WORDS);

			expect(failures).toEqual([]);
		});

		it("removes the placeholder customer story surface from indexed routing", () => {
			const redirects = readFileSync(resolve(process.cwd(), "public", "_redirects"), "utf8");

			expect(existsSync(resolve(pagesDir, "customers", "index.astro"))).toBe(false);
			expect(existsSync(resolve(pagesDir, "customers", "[slug].astro"))).toBe(false);
			expect(redirects).toContain("/customers /about/ 301");
			expect(redirects).toContain("/customers/ /about/ 301");
			expect(redirects).toContain("/customers/* /about/ 301");
		});
	});
});
