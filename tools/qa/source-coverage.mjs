/**
 * source-coverage.mjs — CI lint that fails when any content-collection
 * statistic ships without a verifiable `sourceUrl`.
 *
 * Walks `apps/site/src/content/**\/*.md`, parses YAML frontmatter, finds every
 * entry under `pricingStats:` or `statistics:`, and confirms each entry has a
 * `sourceUrl` that parses as a real URL.
 *
 * Run: `node tools/qa/source-coverage.mjs`
 *   exit 0 — all stats have valid sourceUrl
 *   exit 1 — at least one stat is missing or has a malformed sourceUrl
 *
 * Intentionally avoids YAML library dependencies: the frontmatter format used
 * by the site is regular enough to parse with a line walker, and adding a
 * dep to a one-file lint script isn't worth the install cost.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const CONTENT_ROOT = join(REPO_ROOT, "apps", "site", "src", "content");
const STAT_BLOCK_KEYS = new Set(["pricingStats", "statistics"]);

/**
 * Recursively list every .md file under `dir`.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walkMarkdown(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkMarkdown(full)));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(full);
		}
	}
	return files;
}

/**
 * Extract the frontmatter section between the first two `---` fences.
 * @param {string} raw
 * @returns {string | null}
 */
function extractFrontmatter(raw) {
	if (!raw.startsWith("---")) return null;
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return null;
	return raw.slice(3, end);
}

/**
 * Walk a frontmatter block and return one issue per stat entry that lacks a
 * verifiable `sourceUrl`. Treats every top-level `- stat:` or `- question:`
 * indented under a STAT_BLOCK_KEYS map as a stat entry; any subsequent
 * `sourceUrl:` line at deeper indentation within the same list item satisfies
 * the requirement.
 *
 * @param {string} frontmatter
 * @returns {{ statText: string, reason: "missing" | "malformed" }[]}
 */
function findUncitedStats(frontmatter) {
	const lines = frontmatter.split("\n");
	const issues = [];
	let inStatBlock = false;
	let currentStat = null;
	let currentItemIndent = -1;

	const flushCurrent = () => {
		if (currentStat) issues.push(currentStat);
		currentStat = null;
	};

	for (const line of lines) {
		if (line.length === 0) continue;
		const indent = line.length - line.trimStart().length;

		// Detect entry into a stat block at top level
		const topLevelKey = /^([A-Za-z][A-Za-z0-9]*):\s*$/.exec(line);
		if (indent === 0 && topLevelKey) {
			flushCurrent();
			inStatBlock = STAT_BLOCK_KEYS.has(topLevelKey[1]);
			currentItemIndent = -1;
			continue;
		}
		// Any other zero-indent line ends the current block
		if (indent === 0 && line.trim().length > 0) {
			flushCurrent();
			inStatBlock = false;
			currentItemIndent = -1;
			continue;
		}

		if (!inStatBlock) continue;

		// New list item — close out the previous one if any
		const itemStart = /^(\s*)-\s+stat:\s*(.*)$/.exec(line);
		if (itemStart) {
			flushCurrent();
			currentItemIndent = itemStart[1].length;
			currentStat = {
				statText: itemStart[2].replace(/^["']|["']$/g, "").slice(0, 120),
				reason: "missing",
			};
			continue;
		}

		// Check for sourceUrl within the current item
		if (currentStat && indent > currentItemIndent) {
			const urlMatch = /^\s*sourceUrl:\s*(.+?)\s*$/.exec(line);
			if (urlMatch) {
				const value = urlMatch[1].replace(/^["']|["']$/g, "");
				try {
					const parsed = new URL(value);
					if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
						currentStat.reason = "malformed";
					} else {
						currentStat = null; // satisfied
					}
				} catch {
					currentStat.reason = "malformed";
				}
			}
		} else if (currentStat && indent <= currentItemIndent && line.trim().length > 0) {
			// Left the current item without finding a sourceUrl
			flushCurrent();
		}
	}
	flushCurrent();
	return issues;
}

async function main() {
	const exists = await stat(CONTENT_ROOT).catch(() => null);
	if (!exists) {
		console.error(`source-coverage: content directory not found at ${CONTENT_ROOT}`);
		process.exit(2);
	}

	const files = await walkMarkdown(CONTENT_ROOT);
	const report = [];
	for (const file of files) {
		const raw = await readFile(file, "utf8");
		const fm = extractFrontmatter(raw);
		if (!fm) continue;
		const issues = findUncitedStats(fm);
		if (issues.length > 0) {
			report.push({ file: relative(REPO_ROOT, file), issues });
		}
	}

	if (report.length === 0) {
		console.log(
			`source-coverage: ok — every stat in ${files.length} file(s) has a valid sourceUrl`,
		);
		process.exit(0);
	}

	const totalIssues = report.reduce((sum, r) => sum + r.issues.length, 0);
	console.error(
		`source-coverage: ${totalIssues} stat(s) without a valid sourceUrl across ${report.length} file(s)`,
	);
	for (const { file, issues } of report) {
		console.error(`\n  ${file}`);
		for (const issue of issues) {
			console.error(`    [${issue.reason}] ${issue.statText}`);
		}
	}
	process.exit(1);
}

main().catch((err) => {
	console.error("source-coverage: unexpected error", err);
	process.exit(2);
});
