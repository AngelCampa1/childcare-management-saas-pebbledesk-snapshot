import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

const scannedExtensions = new Set([
	".cjs",
	".css",
	".env",
	".example",
	".html",
	".js",
	".json",
	".jsonc",
	".md",
	".mjs",
	".ps1",
	".ts",
	".tsx",
	".txt",
	".yaml",
	".yml",
]);

const intentionallyAllowedLegacyPortReferences = [
	{
		path: "apps/api/src/lib/local-origins.test.ts",
		port: "8787",
		text: 'expect(resolveAuthBaseUrl("http://localhost:8787", "http://127.0.0.1:8788/api/health")).toBe(',
	},
	{
		path: "apps/api/src/lib/local-origins.test.ts",
		port: "8787",
		text: 'expect(resolveAuthBaseUrl("http://localhost:8787", "http://[::1]:8788/api/health")).toBe(',
	},
	{
		path: "apps/api/src/lib/local-origins.test.ts",
		port: "8787",
		text: 'resolveAuthBaseUrl("http://localhost:8787", "https://external.example.com/api/health"),',
	},
	{
		path: "apps/api/src/lib/local-origins.test.ts",
		port: "8787",
		text: ').toBe("http://localhost:8787");',
	},
	{
		path: "apps/api/src/lib/local-origins.test.ts",
		port: "8787",
		text: 'expect(resolveAuthBaseUrl("http://localhost:8787", "not-a-url")).toBe("http://localhost:8787");',
	},
	{
		path: "packages/shared/src/public-knowledge/public-knowledge.test.ts",
		port: "8787",
		text: 'entries: [{ title: "Internal", url: "http://localhost:8787/private" }],',
	},
];

function readRepoFile(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

function getExtension(path: string) {
	const lastDotIndex = path.lastIndexOf(".");
	return lastDotIndex === -1 ? "" : path.slice(lastDotIndex);
}

function listScannedFiles(): string[] {
	const trackedFiles = execFileSync("git", ["ls-files"], {
		cwd: repoRoot,
		encoding: "utf8",
	}).split(/\r?\n/);

	return trackedFiles.filter((path) => {
		const filename = path.split("/").at(-1) ?? path;

		return (
			path !== "packages/shared/tests/port-drift.test.ts" &&
			!filename.endsWith("-lock.yaml") &&
			!filename.endsWith("-lock.json") &&
			scannedExtensions.has(getExtension(filename))
		);
	});
}

function isIntentionallyAllowed(path: string, port: string, lineText: string) {
	return intentionallyAllowedLegacyPortReferences.some(
		(reference) =>
			reference.path === path && reference.port === port && reference.text === lineText.trim(),
	);
}

function findLegacyPortReferences(path: string) {
	const source = readRepoFile(path);
	const isDoc =
		path.endsWith(".md") || path === "AGENTS.md" || path === "CLAUDE.md" || path === "README.md";
	const hostPattern = /(?:localhost|127\.0\.0\.1|\[::1\]):(5040|5173|8787)\b/g;
	const configPattern =
		/\b(?:api|backend|Backend|baseURL|BETTER_AUTH_URL|origin|port|Port|ports|Ports|QUICKBOOKS_REDIRECT_URI|target|url|URL|--port)\b[^\n]*(5040|5173|8787)\b/g;

	return source
		.split("\n")
		.flatMap((lineText, index) => {
			const lineMatches = [
				...[...lineText.matchAll(hostPattern)].map((match) => match[1]),
				...[...lineText.matchAll(configPattern)].map((match) => match[1]),
				...(isDoc ? [...lineText.matchAll(/\b(5040|5173|8787)\b/g)].map((match) => match[1]) : []),
			];

			return lineMatches.map((port) => ({
				path,
				port,
				line: index + 1,
				text: lineText.trim(),
			}));
		})
		.filter((match) => !isIntentionallyAllowed(match.path, match.port, match.text));
}

describe("local development port references", () => {
	it("keeps active docs and fixtures aligned to the current port table", () => {
		const violations = listScannedFiles().flatMap(findLegacyPortReferences);

		expect(violations).toEqual([]);
	}, 30000);

	it("documents intentional legacy-port allowlist entries by exact line", () => {
		for (const reference of intentionallyAllowedLegacyPortReferences) {
			const line = readRepoFile(reference.path)
				.split("\n")
				.some((fileLine) => fileLine.trim() === reference.text);

			expect(line, `${reference.path} should include allowed ${reference.port} fixture`).toBe(true);
		}
	});
});
