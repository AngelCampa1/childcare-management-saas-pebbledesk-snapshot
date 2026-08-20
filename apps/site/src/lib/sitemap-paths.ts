import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildCanonicalPathFromContentSlug } from "./content-paths";

const NOINDEX_PATHS = new Set([
	"/404/",
	"/404",
	"/500/",
	"/500",
	"/customers/",
	"/customers",
	"/llms.txt/",
	"/llms.txt",
	"/llms-full.txt/",
	"/llms-full.txt",
]);

type GeneratedContentNoindexEntry = {
	collection: string;
	slug: string;
	noindex: boolean;
	markdownContent?: string;
};

export function isLeadMagnetPrintPage(pathname: string): boolean {
	return /^\/free\/[^/]+\/print\/?$/.test(pathname);
}

export function shouldIncludeInSitemap(
	pathname: string,
	generatedContentNoindexPaths: ReadonlySet<string> = new Set(),
): boolean {
	return (
		!NOINDEX_PATHS.has(pathname) &&
		!generatedContentNoindexPaths.has(pathname) &&
		!isLeadMagnetPrintPage(pathname)
	);
}

export function buildGeneratedContentNoindexPathSet(
	entries: readonly GeneratedContentNoindexEntry[],
): Set<string> {
	const paths = new Set<string>();
	for (const entry of entries) {
		if (!entry.noindex) continue;
		const path = buildCanonicalPathFromContentSlug(
			`${entry.collection}/${entry.slug}`,
			entry.markdownContent ?? "",
		);
		if (!path) continue;
		paths.add(path);
		paths.add(path.endsWith("/") ? path : `${path}/`);
	}
	return paths;
}

export function getGeneratedContentNoindexPaths(contentDir = "src/content"): Set<string> {
	const entries: GeneratedContentNoindexEntry[] = [];
	for (const collection of [
		"alternatives",
		"comparisons",
		"pricing-breakdowns",
		"listicles",
		"guides",
		"state-pages",
		"city-pages",
		"lead-magnets",
		"features",
	]) {
		const dir = join(contentDir, collection);
		if (!existsSync(dir)) continue;
		for (const filePath of listMarkdownFiles(dir)) {
			const markdownContent = readFileSync(filePath, "utf8");
			entries.push({
				collection,
				slug: relative(dir, filePath)
					.replace(/\\/g, "/")
					.replace(/\.mdx?$/, ""),
				noindex: hasNoindexFrontmatter(markdownContent),
				markdownContent,
			});
		}
	}
	return buildGeneratedContentNoindexPathSet(entries);
}

export function hasNoindexFrontmatter(markdownContent: string): boolean {
	const frontmatterMatch = markdownContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatterMatch) return false;
	return /^noindex:\s*(?:"true"|'true'|true)\s*$/m.test(frontmatterMatch[1]);
}

function listMarkdownFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const entryPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listMarkdownFiles(entryPath));
			continue;
		}
		if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
			files.push(entryPath);
		}
	}
	return files;
}
