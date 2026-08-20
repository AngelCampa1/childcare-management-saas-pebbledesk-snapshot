import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PublicKnowledgeContentIndexArtifact } from "../src/public-knowledge/types.ts";
import {
	buildContentIndexEntry,
	createPublicKnowledgeArtifacts,
	getContentIndexArtifact,
	getPublicPath,
	resolvePublicKnowledgeTokens,
	run,
	validatePublicKnowledgeSourceUrl,
} from "./generate-public-knowledge.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("generate public knowledge", () => {
	it("uses Astro route params for competitor collection public paths", () => {
		expect(
			getPublicPath(
				"alternatives",
				{ competitor: { slug: "brightwheel" } },
				"brightwheel-alternative",
			),
		).toBe("/compare/alternatives/brightwheel/");
		expect(
			getPublicPath(
				"pricing-breakdowns",
				{ competitor: { slug: "brightwheel" } },
				"brightwheel-pricing",
			),
		).toBe("/compare/pricing/brightwheel/");
		expect(
			getPublicPath(
				"comparisons",
				{ competitorA: { slug: "pebbledesk" }, competitorB: { slug: "brightwheel" } },
				"pebbledesk-vs-brightwheel",
			),
		).toBe("/compare/versus/pebbledesk-vs-brightwheel/");
		expect(getPublicPath("guides", { canonicalHref: "/custom-guide" }, "ignored-slug")).toBe(
			"/custom-guide/",
		);
	});

	it("uses the fresh content index artifact when building the manifest", () => {
		const contentIndexArtifact: PublicKnowledgeContentIndexArtifact = {
			schemaVersion: 1,
			generatedFrom: "apps/site/src/content/**/*.md",
			entries: [
				{
					id: "guides.fresh",
					title: "Fresh guide",
					description: "Fresh description",
					collection: "guides",
					slug: "fresh",
					tags: [],
					publicPaths: ["/resources/guides/fresh/"],
					lastReviewed: "2026-05-09",
					sourceRefs: [],
					competitorSlugs: [],
				},
			],
		};

		const manifest = createPublicKnowledgeArtifacts(contentIndexArtifact).find(
			([fileName]) => fileName === "manifest.json",
		)?.[1];
		const contentIndexEntry = manifest?.artifacts.find(
			(artifact) => artifact.file === "content-index.json",
		);

		expect(contentIndexEntry?.documentCount).toBe(1);
	});

	it("resolves offering tokens before content enters the generated AI index", async () => {
		const resolvedPrice = resolvePublicKnowledgeTokens("Plans start at {{plan.home.priceLabel}}");
		expect(resolvedPrice).not.toContain("{{plan.");
		expect(resolvedPrice).toContain("then $39/mo when paid yearly");

		const entry = await buildContentIndexEntry(
			join(repoRoot, "apps/site/src/content/alternatives/brightwheel-alternative-preschools.md"),
		);

		expect(entry?.description).not.toContain("{{plan.");
		expect(entry?.description).toMatch(/\$[0-9]+\/mo/);
		expect(entry?.description).toContain("then");
	});

	it("rejects unknown offering tokens before content enters the generated AI index", () => {
		expect(() =>
			resolvePublicKnowledgeTokens("Plans start at {{plan.unknown.priceLabel}}"),
		).toThrow(/Unknown public knowledge token/);
	});

	it("checks committed generated artifacts without rewriting them", async () => {
		const originalArgv = [...process.argv];
		process.argv = [...process.argv, "--check"];
		try {
			await expect(run()).resolves.toBeUndefined();
		} finally {
			process.argv = originalArgv;
		}
	}, 90000);

	it("fails check mode when committed generated artifacts are stale", async () => {
		const manifestPath = join(
			repoRoot,
			"packages/shared/src/public-knowledge/generated/manifest.json",
		);
		const original = await readFile(manifestPath, "utf8");
		const originalArgv = [...process.argv];

		await writeFile(
			manifestPath,
			original.replace('"schemaVersion": 1', '"schemaVersion": 999'),
			"utf8",
		);
		process.argv = [...process.argv, "--check"];
		try {
			await expect(run()).rejects.toThrow(/manifest\.json/);
		} finally {
			process.argv = originalArgv;
			await writeFile(manifestPath, original, "utf8");
		}
	}, 90000);

	it("regenerates committed artifacts deterministically", async () => {
		const originalArgv = [...process.argv];
		process.argv = process.argv.filter((arg) => arg !== "--check");
		try {
			await expect(run()).resolves.toBeUndefined();
		} finally {
			process.argv = originalArgv;
		}
	}, 90000);

	it("builds content index entries from real marketing content files", async () => {
		const alternative = await buildContentIndexEntry(
			join(repoRoot, "apps/site/src/content/alternatives/brightwheel-alternative.md"),
		);
		const pricing = await buildContentIndexEntry(
			join(repoRoot, "apps/site/src/content/pricing-breakdowns/brightwheel-pricing.md"),
		);
		const comparison = await buildContentIndexEntry(
			join(repoRoot, "apps/site/src/content/comparisons/pebbledesk-vs-brightwheel.md"),
		);
		const guide = await buildContentIndexEntry(
			join(repoRoot, "apps/site/src/content/guides/how-to-choose-childcare-management-software.md"),
		);

		if (!alternative || !pricing || !comparison || !guide) {
			throw new Error("Expected public marketing content entries");
		}

		expect(alternative.publicPaths).toEqual(["/compare/alternatives/brightwheel/"]);
		expect(alternative.competitorSlugs).toEqual(["brightwheel"]);
		expect(
			alternative.sourceRefs.every((sourceRef) => sourceRef.id.startsWith("alternatives.")),
		).toBe(true);
		expect(pricing.publicPaths).toEqual(["/compare/pricing/brightwheel/"]);
		expect(comparison.publicPaths).toEqual(["/compare/versus/pebbledesk-vs-brightwheel/"]);
		expect(comparison.competitorSlugs).toEqual(["brightwheel", "pebbledesk"]);
		expect(guide.publicPaths).toEqual([
			"/resources/guides/how-to-choose-childcare-management-software/",
		]);
		expect(guide.sourceRefs.every((sourceRef) => sourceRef.url.startsWith("/"))).toBe(true);
	});

	it("scans every marketing content file into the generated content index", async () => {
		const artifact = await getContentIndexArtifact();

		expect(artifact.entries.length).toBeGreaterThan(200);
		expect(artifact.entries.map((entry) => entry.publicPaths[0])).toEqual(
			expect.arrayContaining([
				"/compare/alternatives/brightwheel/",
				"/compare/pricing/brightwheel/",
				"/compare/versus/pebbledesk-vs-brightwheel/",
				"/resources/guides/how-to-choose-childcare-management-software/",
			]),
		);
	});

	it("rejects indexed content with competitor slugs missing from the public registry", async () => {
		const missingRegistryFile = join(
			repoRoot,
			"apps/site/src/content/alternatives/missing-registry-entry.md",
		);

		await writeFile(
			missingRegistryFile,
			[
				"---",
				"publicKnowledge: true",
				"title: Missing registry",
				"description: Missing competitor registry",
				"updatedAt: 2026-05-09",
				"competitor:",
				"  name: Missing",
				"  slug: missing-registry-entry",
				"  pricing: Unknown",
				"  weakness: Unknown",
				"---",
				"Body",
			].join("\n"),
			"utf8",
		);

		try {
			await expect(getContentIndexArtifact()).rejects.toThrow(/missing-registry-entry/);
		} finally {
			await rm(missingRegistryFile, { force: true });
		}
	});

	it("rejects malformed route frontmatter for route-param collections", () => {
		expect(() => getPublicPath("alternatives", {}, "missing-competitor")).toThrow(
			/Missing competitor\.slug/,
		);
		expect(() => getPublicPath("pricing-breakdowns", {}, "missing-competitor")).toThrow(
			/Missing competitor\.slug/,
		);
		expect(() => getPublicPath("comparisons", {}, "missing-competitors")).toThrow(
			/Missing competitorA\.slug or competitorB\.slug/,
		);
		expect(() =>
			getPublicPath("alternatives", { competitor: { slug: "../private" } }, "bad-competitor"),
		).toThrow(/lowercase public URL slug/);
		expect(() =>
			getPublicPath(
				"comparisons",
				{ competitorA: { slug: "pebbledesk" }, competitorB: { slug: "bad/slug" } },
				"bad-comparison",
			),
		).toThrow(/lowercase public URL slug/);
		expect(() => getPublicPath("unknown", {}, "unknown")).toThrow(/Unknown content collection/);
	});

	it("requires explicit public knowledge eligibility before indexing markdown", async () => {
		const tempRoot = await mkdtemp(join(tmpdir(), "pebbledesk-public-knowledge-"));
		const ambiguous = join(tempRoot, "apps/site/src/content/guides/ambiguous.md");
		const excluded = join(tempRoot, "apps/site/src/content/guides/excluded.md");
		const conflicting = join(tempRoot, "apps/site/src/content/guides/conflicting.md");

		await mkdir(dirname(ambiguous), { recursive: true });
		await writeFile(
			ambiguous,
			"---\ntitle: Ambiguous\ndescription: Missing public knowledge flag\nupdatedAt: 2026-05-09\n---\nBody",
			"utf8",
		);
		await writeFile(
			excluded,
			"---\ntitle: Excluded\ndescription: Private note\nupdatedAt: 2026-05-09\nnoPublicKnowledge: true\n---\nBody",
			"utf8",
		);
		await writeFile(
			conflicting,
			"---\npublicKnowledge: true\nnoPublicKnowledge: true\ntitle: Conflicting\ndescription: Conflicting public knowledge flags\nupdatedAt: 2026-05-09\n---\nBody",
			"utf8",
		);

		try {
			await expect(buildContentIndexEntry(ambiguous)).rejects.toThrow(/publicKnowledge: true/);
			await expect(buildContentIndexEntry(excluded)).resolves.toBeNull();
			await expect(buildContentIndexEntry(conflicting)).rejects.toThrow(/must not set both/);
		} finally {
			await rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("validates source URLs before they enter the content index", () => {
		expect(validatePublicKnowledgeSourceUrl("/resources/guides/safe/")).toBe(
			"/resources/guides/safe/",
		);
		expect(validatePublicKnowledgeSourceUrl("https://www.acf.hhs.gov/occ/data")).toBe(
			"https://www.acf.hhs.gov/occ/data",
		);
		expect(validatePublicKnowledgeSourceUrl("https://fda.gov/food")).toBe("https://fda.gov/food");
		expect(() => validatePublicKnowledgeSourceUrl("")).toThrow(/must not be empty/);
		expect(() => validatePublicKnowledgeSourceUrl("not a url")).toThrow(/public https URL/);
		expect(() => validatePublicKnowledgeSourceUrl("/../private")).toThrow(/safe public path/);
		expect(() => validatePublicKnowledgeSourceUrl("/private\\source")).toThrow(/safe public path/);
		expect(() => validatePublicKnowledgeSourceUrl("/Users/dev/private.md")).toThrow(
			/safe public path/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("/home/runner/work/private.md")).toThrow(
			/safe public path/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("/c:/Users/dev/private.md")).toThrow(
			/safe public path/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("http://example.com")).toThrow(/https/);
		expect(() => validatePublicKnowledgeSourceUrl("https://staging.pebbledesk.app")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://internal.example.com/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://example.local/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://localhost.example.com/source")).toThrow(
			/public host/,
		);
		expect(() =>
			validatePublicKnowledgeSourceUrl("https://example.com/source?token=secret"),
		).toThrow(/query parameter/);
		expect(() => validatePublicKnowledgeSourceUrl("/resource?sig=abc")).toThrow(/query parameter/);
		expect(() => validatePublicKnowledgeSourceUrl("/resource?authCode=abc")).toThrow(
			/query parameter/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://[::1]/source")).toThrow(/public host/);
		expect(() => validatePublicKnowledgeSourceUrl("https://[fd00::1]/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://[fe80::1]/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://[fe90::1]/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://[febf::1]/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://169.254.1.1/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://10.0.0.1/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://172.16.0.1/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://192.168.0.1/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://0.0.0.0/source")).toThrow(/public host/);
		expect(() => validatePublicKnowledgeSourceUrl("https://[::]/source")).toThrow(/public host/);
		expect(() => validatePublicKnowledgeSourceUrl("https://[::ffff:127.0.0.1]/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://[::ffff:7f00:1]/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://[::ffff:a9fe:1]/source")).toThrow(
			/public host/,
		);
		expect(() => validatePublicKnowledgeSourceUrl("https://[::ffff:0:0]/source")).toThrow(
			/public host/,
		);
	});

	it("requires canonical href content paths to stay same-site relative", () => {
		expect(getPublicPath("guides", { canonicalHref: "/safe-guide" }, "ignored-slug")).toBe(
			"/safe-guide/",
		);
		expect(() =>
			getPublicPath("guides", { canonicalHref: "/safe-guide?sig=abc" }, "ignored-slug"),
		).toThrow(/query strings/);
		expect(() =>
			getPublicPath("guides", { canonicalHref: "https://example.com/safe-guide" }, "ignored-slug"),
		).toThrow(/same-site relative/);
	});

	it("rejects malformed markdown content while building entries", async () => {
		const tempRoot = await mkdtemp(join(tmpdir(), "pebbledesk-public-knowledge-"));
		const missingFrontmatter = join(tempRoot, "apps/site/src/content/guides/missing.md");
		const invalidFrontmatter = join(tempRoot, "apps/site/src/content/guides/invalid.md");
		const missingTitle = join(tempRoot, "apps/site/src/content/guides/missing-title.md");
		const missingCollection = join(repoRoot, "__public-knowledge-temp.md");

		await mkdir(dirname(missingFrontmatter), { recursive: true });
		await writeFile(missingFrontmatter, "No frontmatter", "utf8");
		await writeFile(invalidFrontmatter, "---\n- invalid\n---\nBody", "utf8");
		await writeFile(
			missingTitle,
			"---\npublicKnowledge: true\ndescription: Has description\nupdatedAt: 2026-05-09\n---\nBody",
			"utf8",
		);
		await writeFile(
			missingCollection,
			"---\npublicKnowledge: true\ntitle: Missing collection\ndescription: Missing collection\nupdatedAt: 2026-05-09\n---\nBody",
			"utf8",
		);

		try {
			await expect(buildContentIndexEntry(missingFrontmatter)).rejects.toThrow(
				/Missing frontmatter/,
			);
			await expect(buildContentIndexEntry(invalidFrontmatter)).rejects.toThrow(
				/Invalid frontmatter/,
			);
			await expect(buildContentIndexEntry(missingTitle)).rejects.toThrow(/Missing title/);
			await expect(buildContentIndexEntry(missingCollection)).rejects.toThrow(
				/Unable to infer content collection and slug/,
			);
		} finally {
			await rm(tempRoot, { recursive: true, force: true });
			await rm(missingCollection, { force: true });
		}
	});
});
