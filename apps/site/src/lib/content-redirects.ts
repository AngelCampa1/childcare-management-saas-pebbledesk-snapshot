import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import {
	buildAlternativePath,
	buildComparisonPath,
	buildGuidePath,
	buildLeadMagnetPath,
	buildListiclePath,
	buildPricingPath,
	buildStatePagePath,
} from "./content-paths";

export interface ContentSourceFile {
	relativePath: string;
	content: string;
}

export interface RedirectRule {
	from: string;
	to: string;
}

interface RedirectFrontmatterData {
	canonicalHref?: string;
	redirectFrom?: string[];
	competitor?: { slug?: string };
	competitorA?: { slug?: string };
	competitorB?: { slug?: string };
}

const GENERATED_REDIRECTS_HEADER =
	"# Generated from content redirectFrom metadata. Do not edit by hand.";

export function extractFrontmatterBlock(source: string): string | null {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match?.[1] ?? null;
}

function parseFrontmatterData(source: string): RedirectFrontmatterData | null {
	const frontmatter = extractFrontmatterBlock(source);
	if (!frontmatter) {
		return null;
	}

	return {
		canonicalHref: extractScalar(frontmatter, "canonicalHref"),
		redirectFrom: extractList(frontmatter, "redirectFrom"),
		competitor: {
			slug: extractNestedScalar(frontmatter, "competitor", "slug"),
		},
		competitorA: {
			slug: extractNestedScalar(frontmatter, "competitorA", "slug"),
		},
		competitorB: {
			slug: extractNestedScalar(frontmatter, "competitorB", "slug"),
		},
	};
}

function extractScalar(frontmatter: string, key: string): string | undefined {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Single-quoted YAML: 'value with it''s apostrophes' — doubled single quote is an escaped apostrophe
	const singleQuotedMatch = frontmatter.match(
		new RegExp(`^${escapedKey}:\\s*'((?:[^']|'')*)'\\s*$`, "m"),
	);
	if (singleQuotedMatch?.[1] !== undefined) {
		return singleQuotedMatch[1].replace(/''/g, "'").trim();
	}

	// Double-quoted YAML: "value"
	const doubleQuotedMatch = frontmatter.match(
		new RegExp(`^${escapedKey}:\\s*"([^"\\r\\n]*)"\\s*$`, "m"),
	);
	if (doubleQuotedMatch?.[1] !== undefined) {
		return doubleQuotedMatch[1].trim();
	}

	// Unquoted: strip inline comments (only strip ` #` preceded by whitespace, not # within values)
	const unquotedMatch = frontmatter.match(
		new RegExp(`^${escapedKey}:\\s*([^\\r\\n]+?)(?:\\s+#[^\\r\\n]*)?\\s*$`, "m"),
	);
	return unquotedMatch?.[1]?.trim();
}

function extractList(frontmatter: string, key: string): string[] {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const inlineMatch = frontmatter.match(new RegExp(`^${escapedKey}:\\s*\\[(.+)\\]\\s*$`, "m"));

	if (inlineMatch?.[1]) {
		return inlineMatch[1]
			.split(",")
			.map((item) => item.trim().replace(/^["']|["']$/g, ""))
			.filter((item) => item.length > 0);
	}

	const lines = frontmatter.split(/\r?\n/);
	const values: string[] = [];
	let collecting = false;

	for (const line of lines) {
		if (!collecting) {
			if (line.trim() === `${key}:`) {
				collecting = true;
			}
			continue;
		}

		if (/^\S/.test(line)) {
			break;
		}

		// Single-quoted item: '- ''value''': doubled single quote is an escaped apostrophe
		const singleQuotedItem = line.match(/^\s*-\s*'((?:[^']|'')*)'\s*$/);
		if (singleQuotedItem?.[1] !== undefined) {
			values.push(singleQuotedItem[1].replace(/''/g, "'").trim());
			continue;
		}
		// Double-quoted item
		const doubleQuotedItem = line.match(/^\s*-\s*"([^"\r\n]*)"\s*$/);
		if (doubleQuotedItem?.[1] !== undefined) {
			values.push(doubleQuotedItem[1].trim());
			continue;
		}
		// Unquoted item: only strip inline comments preceded by whitespace
		const unquotedItem = line.match(/^\s*-\s*([^\r\n]+?)(?:\s+#[^\r\n]*)?\s*$/);
		if (unquotedItem?.[1]) {
			values.push(unquotedItem[1].trim());
		}
	}

	return values;
}

function extractNestedScalar(
	frontmatter: string,
	section: string,
	key: string,
): string | undefined {
	const lines = frontmatter.split(/\r?\n/);
	let collecting = false;

	for (const line of lines) {
		if (!collecting) {
			if (line.trim() === `${section}:`) {
				collecting = true;
			}
			continue;
		}

		if (/^\S/.test(line)) {
			break;
		}

		// Single-quoted nested scalar
		const singleQuotedMatch = line.match(new RegExp(`^\\s+${key}:\\s*'((?:[^']|'')*)'\\s*$`));
		if (singleQuotedMatch?.[1] !== undefined) {
			return singleQuotedMatch[1].replace(/''/g, "'").trim();
		}
		// Double-quoted nested scalar
		const doubleQuotedMatch = line.match(new RegExp(`^\\s+${key}:\\s*"([^"\\r\\n]*)"\\s*$`));
		if (doubleQuotedMatch?.[1] !== undefined) {
			return doubleQuotedMatch[1].trim();
		}
		// Unquoted nested scalar: strip inline comments preceded by whitespace
		const unquotedMatch = line.match(
			new RegExp(`^\\s+${key}:\\s*([^\\r\\n]+?)(?:\\s+#[^\\r\\n]*)?\\s*$`),
		);
		if (unquotedMatch?.[1]) {
			return unquotedMatch[1].trim();
		}
	}

	return undefined;
}

function normalizePath(path: string): string {
	return `/${path}`.replace(/^\/+/, "/").replace(/\/+$/, "");
}

function normalizeTargetPath(path: string): string {
	const normalized = normalizePath(path);
	if (normalized === "/" || normalized.includes("#")) {
		return normalized;
	}
	return `${normalized}/`;
}

function resolveTargetPath(
	relativePath: string,
	data: RedirectFrontmatterData,
): string | undefined {
	const normalizedPath = relativePath.replace(/\\/g, "/");
	const slug = basename(normalizedPath, extname(normalizedPath));

	if (normalizedPath.startsWith("guides/")) {
		return buildGuidePath(slug);
	}

	if (normalizedPath.startsWith("listicles/")) {
		return buildListiclePath(slug);
	}

	if (normalizedPath.startsWith("state-pages/")) {
		return buildStatePagePath(slug);
	}

	if (normalizedPath.startsWith("lead-magnets/")) {
		return buildLeadMagnetPath(slug);
	}

	if (normalizedPath.startsWith("alternatives/")) {
		const competitorSlug = data.competitor?.slug;
		return competitorSlug ? buildAlternativePath(competitorSlug) : undefined;
	}

	if (normalizedPath.startsWith("pricing-breakdowns/")) {
		const competitorSlug = data.competitor?.slug;
		return competitorSlug ? buildPricingPath(competitorSlug) : undefined;
	}

	if (normalizedPath.startsWith("comparisons/")) {
		const competitorASlug = data.competitorA?.slug;
		const competitorBSlug = data.competitorB?.slug;
		return competitorASlug && competitorBSlug
			? buildComparisonPath(competitorASlug, competitorBSlug)
			: undefined;
	}

	return undefined;
}

export function collectRedirectRules(files: ContentSourceFile[]): RedirectRule[] {
	const rules = new Map<string, RedirectRule>();

	for (const file of files) {
		const data = parseFrontmatterData(file.content);
		if (!data) {
			continue;
		}

		const redirectFrom = data.redirectFrom ?? [];
		if (redirectFrom.length === 0) {
			continue;
		}

		const targetPath = data.canonicalHref ?? resolveTargetPath(file.relativePath, data);

		if (!targetPath) {
			continue;
		}

		for (const from of redirectFrom) {
			const normalizedFrom = normalizePath(from);
			const normalizedTo = normalizeTargetPath(targetPath);

			if (normalizeTargetPath(normalizedFrom) === normalizedTo) {
				continue;
			}

			rules.set(normalizedFrom, {
				from: normalizedFrom,
				to: normalizedTo,
			});
		}
	}

	return [...rules.values()].sort((a, b) => a.from.localeCompare(b.from));
}

export function buildRedirectFile(existingRedirects: string, rules: RedirectRule[]): string {
	const base = existingRedirects.trimEnd();
	const generatedBlock =
		rules.length === 0
			? GENERATED_REDIRECTS_HEADER
			: [GENERATED_REDIRECTS_HEADER, ...rules.map((rule) => `${rule.from} ${rule.to} 301`)].join(
					"\n",
				);

	return base.length > 0 ? `${base}\n\n${generatedBlock}\n` : `${generatedBlock}\n`;
}

function readContentSourceFiles(contentDir: string): ContentSourceFile[] {
	const files: ContentSourceFile[] = [];

	for (const entry of readdirSync(contentDir, { withFileTypes: true })) {
		const absolutePath = join(contentDir, entry.name);

		if (entry.isDirectory()) {
			for (const nestedFile of readContentSourceFiles(absolutePath)) {
				files.push({
					relativePath: join(entry.name, nestedFile.relativePath),
					content: nestedFile.content,
				});
			}
			continue;
		}

		if (extname(entry.name) !== ".md") {
			continue;
		}

		files.push({
			relativePath: entry.name,
			content: readFileSync(absolutePath, "utf-8"),
		});
	}

	return files;
}

export function contentRedirectsIntegration(): AstroIntegration {
	return {
		name: "@pebbledesk/content-redirects",
		hooks: {
			"astro:build:done": async ({ dir, logger }) => {
				const distPath = fileURLToPath(dir);
				const contentDir = join(process.cwd(), "src", "content");
				const publicRedirectsPath = join(process.cwd(), "public", "_redirects");
				const baseRedirects = readFileSync(publicRedirectsPath, "utf-8");
				const rules = collectRedirectRules(readContentSourceFiles(contentDir));
				const finalRedirects = buildRedirectFile(baseRedirects, rules);

				writeFileSync(join(distPath, "_redirects"), finalRedirects, "utf-8");
				logger.info(`Content redirects: wrote ${rules.length} generated redirects`);
			},
		},
	};
}
