import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildRedirectFile,
	collectRedirectRules,
	contentRedirectsIntegration,
	extractFrontmatterBlock,
} from "./content-redirects";

const tempDirs: string[] = [];

describe("extractFrontmatterBlock", () => {
	it("returns the frontmatter section when present", () => {
		const source = `---
title: "Guide"
redirectFrom:
  - "/old-guide"
---

Body`;

		expect(extractFrontmatterBlock(source)).toContain('title: "Guide"');
	});

	it("returns null when no frontmatter exists", () => {
		expect(extractFrontmatterBlock("# No frontmatter")).toBeNull();
	});
});

describe("collectRedirectRules", () => {
	it("builds redirect rules for slug-based collections", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Childcare Billing"
canonicalHref: "/resources/guides/childcare-billing"
redirectFrom:
  - "/resources/guides/old-billing"
  - "/resources/guides/legacy-billing"
---`,
			},
		]);

		expect(rules).toEqual([
			{
				from: "/resources/guides/legacy-billing",
				to: "/resources/guides/childcare-billing/",
			},
			{
				from: "/resources/guides/old-billing",
				to: "/resources/guides/childcare-billing/",
			},
		]);
	});

	it("builds redirect rules for listicle, state-page, and lead-magnet collections", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "listicles/best-billing.md",
				content: `---
title: "Listicle"
redirectFrom:
  - "/resources/best/old-best-billing"
---`,
			},
			{
				relativePath: "state-pages/texas.md",
				content: `---
title: "Texas"
redirectFrom:
  - "/childcare-software/tx"
---`,
			},
			{
				relativePath: "lead-magnets/licensing-checklist.md",
				content: `---
title: "Lead magnet"
redirectFrom:
  - "/free/daycare-licensing-checklist"
---`,
			},
		]);

		expect(rules).toEqual([
			{
				from: "/childcare-software/tx",
				to: "/childcare-software/texas/",
			},
			{
				from: "/free/daycare-licensing-checklist",
				to: "/free/licensing-checklist/",
			},
			{
				from: "/resources/best/old-best-billing",
				to: "/resources/best/best-billing/",
			},
		]);
	});

	it("builds redirect rules for competitor and comparison collections", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "alternatives/brightwheel-alt.md",
				content: `---
title: "Alt"
competitor:
  name: "Brightwheel"
  slug: "brightwheel-center-directors"
redirectFrom:
  - "/compare/alternatives/brightwheel"
---`,
			},
			{
				relativePath: "comparisons/brightwheel-vs-procare.md",
				content: `---
title: "Compare"
competitorA:
  name: "Brightwheel"
  slug: "brightwheel"
competitorB:
  name: "Procare"
  slug: "procare-small-centers"
redirectFrom:
  - "/compare/versus/brightwheel-vs-procare"
---`,
			},
		]);

		expect(rules).toEqual([
			{
				from: "/compare/alternatives/brightwheel",
				to: "/compare/alternatives/brightwheel-center-directors/",
			},
			{
				from: "/compare/versus/brightwheel-vs-procare",
				to: "/compare/versus/brightwheel-vs-procare-small-centers/",
			},
		]);
	});

	it("builds redirect rules for pricing-breakdown collections", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "pricing-breakdowns/brightwheel-pricing.md",
				content: `---
title: "Pricing"
competitor:
  name: "Brightwheel"
  slug: "brightwheel-hidden-costs"
redirectFrom:
  - "/compare/pricing/brightwheel"
---`,
			},
		]);

		expect(rules).toEqual([
			{
				from: "/compare/pricing/brightwheel",
				to: "/compare/pricing/brightwheel-hidden-costs/",
			},
		]);
	});

	it("supports inline redirectFrom arrays and nested YAML indentation", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "alternatives/brightwheel-alt.md",
				content: `---
title: "Alt"
canonicalHref: "/compare/alternatives/brightwheel-center-directors"
redirectFrom: ["/compare/alternatives/brightwheel"]
competitor:
    name: "Brightwheel"
    slug: "brightwheel-center-directors"
---`,
			},
		]);

		expect(rules).toEqual([
			{
				from: "/compare/alternatives/brightwheel",
				to: "/compare/alternatives/brightwheel-center-directors/",
			},
		]);
	});

	it("normalizes redirectFrom entries that omit the leading slash", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Billing"
canonicalHref: "/resources/guides/childcare-billing"
redirectFrom: ["resources/guides/old-billing"]
---`,
			},
		]);

		expect(rules).toEqual([
			{
				from: "/resources/guides/old-billing",
				to: "/resources/guides/childcare-billing/",
			},
		]);
	});

	it("stops collecting redirectFrom entries at the next top-level key", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Billing"
redirectFrom:
  - "/resources/guides/old-billing"
canonicalHref: "/resources/guides/childcare-billing"
---`,
			},
		]);

		expect(rules).toEqual([
			{
				from: "/resources/guides/old-billing",
				to: "/resources/guides/childcare-billing/",
			},
		]);
	});

	it("skips redirect rules when the content path cannot be resolved", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "unsupported/custom-page.md",
				content: `---
title: "Custom"
redirectFrom:
  - "/legacy/custom-page"
---`,
			},
		]);

		expect(rules).toEqual([]);
	});

	it("skips files without frontmatter or redirectFrom metadata", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/no-frontmatter.md",
				content: "# Missing frontmatter",
			},
			{
				relativePath: "guides/no-redirects.md",
				content: `---
title: "No redirects"
---`,
			},
		]);

		expect(rules).toEqual([]);
	});

	it("stops reading a nested section when the next top-level key starts", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "alternatives/missing-slug.md",
				content: `---
title: "Missing slug"
competitor:
  name: "Brightwheel"
redirectFrom:
  - "/compare/alternatives/brightwheel"
---`,
			},
		]);

		expect(rules).toEqual([]);
	});

	it("skips pricing-breakdown redirects when the competitor slug is missing", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "pricing-breakdowns/missing-slug.md",
				content: `---
title: "Pricing"
competitor:
  name: "Brightwheel"
redirectFrom:
  - "/compare/pricing/brightwheel"
---`,
			},
		]);

		expect(rules).toEqual([]);
	});

	it("skips comparison redirects when either comparison slug is missing", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "comparisons/missing-slug.md",
				content: `---
title: "Compare"
competitorA:
  name: "Brightwheel"
  slug: "brightwheel"
competitorB:
  name: "Procare"
redirectFrom:
  - "/compare/versus/brightwheel-vs-procare"
---`,
			},
		]);

		expect(rules).toEqual([]);
	});

	it("skips self-redirects when redirectFrom matches the canonical target", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Billing"
canonicalHref: "/resources/guides/childcare-billing"
redirectFrom:
  - "/resources/guides/childcare-billing"
---`,
			},
		]);

		expect(rules).toEqual([]);
	});
});

describe("extractScalar — parser edge cases", () => {
	it("handles apostrophes in single-quoted values", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Guide"
canonicalHref: '/resources/guides/it''s-a-guide'
redirectFrom:
  - "/old-guide"
---`,
			},
		]);
		expect(rules).toEqual([
			{
				from: "/old-guide",
				to: "/resources/guides/it's-a-guide/",
			},
		]);
	});

	it("does not strip # within unquoted values (only strips inline ` #` comments)", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Guide"
canonicalHref: /resources/guides/c#billing
redirectFrom:
  - /old-guide
---`,
			},
		]);
		// # not preceded by space should remain in the value
		expect(rules[0]?.to).toBe("/resources/guides/c#billing");
	});

	it("strips inline YAML comments (space-hash) from unquoted scalar values", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Guide"
canonicalHref: /resources/guides/billing # this is a comment
redirectFrom:
  - /old-guide
---`,
			},
		]);
		expect(rules[0]?.to).toBe("/resources/guides/billing/");
	});

	it("keeps redirect target paths canonical with a trailing slash", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Guide"
canonicalHref: /resources/guides/billing/
redirectFrom:
  - /old-guide
---`,
			},
		]);
		expect(rules[0]?.to).toBe("/resources/guides/billing/");
	});

	it("strips trailing slash from redirectFrom source paths", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Guide"
canonicalHref: /resources/guides/billing
redirectFrom:
  - /old-guide/
---`,
			},
		]);
		expect(rules[0]?.from).toBe("/old-guide");
	});

	it("handles apostrophes in redirectFrom list items", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Guide"
canonicalHref: /resources/guides/billing
redirectFrom:
  - '/resources/guides/it''s-old'
---`,
			},
		]);
		expect(rules[0]?.from).toBe("/resources/guides/it's-old");
	});

	it("strips inline comments from redirectFrom list items", () => {
		const rules = collectRedirectRules([
			{
				relativePath: "guides/childcare-billing.md",
				content: `---
title: "Guide"
canonicalHref: /resources/guides/billing
redirectFrom:
  - /old-guide # legacy URL
---`,
			},
		]);
		expect(rules[0]?.from).toBe("/old-guide");
	});
});

describe("buildRedirectFile", () => {
	it("keeps existing redirects and appends generated 301 rules", () => {
		const result = buildRedirectFile("# Base rules\n/sitemap.xml /sitemap-index.xml 301\n", [
			{
				from: "/resources/guides/old-billing",
				to: "/resources/guides/childcare-billing/",
			},
		]);

		expect(result).toContain("/sitemap.xml /sitemap-index.xml 301");
		expect(result).toContain(
			"/resources/guides/old-billing /resources/guides/childcare-billing/ 301",
		);
	});

	it("returns only the generated block when no base redirects exist", () => {
		expect(
			buildRedirectFile("", [
				{
					from: "/old",
					to: "/new",
				},
			]),
		).toBe("# Generated from content redirectFrom metadata. Do not edit by hand.\n/old /new 301\n");
	});

	it("returns only the header when no generated redirects exist", () => {
		expect(buildRedirectFile("", [])).toBe(
			"# Generated from content redirectFrom metadata. Do not edit by hand.\n",
		);
	});
});

describe("contentRedirectsIntegration", () => {
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes dist/_redirects with generated content redirects after the build", async () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "content-redirects-"));
		tempDirs.push(tempRoot);
		const contentDir = join(tempRoot, "src", "content", "guides");
		const publicDir = join(tempRoot, "public");
		const distDir = join(tempRoot, "dist");

		mkdirSync(contentDir, { recursive: true });
		mkdirSync(publicDir, { recursive: true });
		mkdirSync(distDir, { recursive: true });

		writeFileSync(join(publicDir, "_redirects"), "/sitemap.xml /sitemap-index.xml 301\n", {
			encoding: "utf-8",
		});
		writeFileSync(
			join(contentDir, "childcare-billing.md"),
			`---
title: "Billing"
redirectFrom:
  - "/resources/guides/old-billing"
---`,
			{ encoding: "utf-8" },
		);
		writeFileSync(join(contentDir, "notes.txt"), "ignore me", {
			encoding: "utf-8",
		});

		const originalCwd = process.cwd();
		process.chdir(tempRoot);

		try {
			const integration = contentRedirectsIntegration();
			const hook = integration.hooks["astro:build:done"];

			expect(hook).toBeDefined();

			await hook?.({
				dir: pathToFileURL(`${distDir}/`),
				logger: {
					info: () => {},
					warn: () => {},
					error: () => {},
				},
			} as never);

			const redirects = readFileSync(join(distDir, "_redirects"), "utf-8");
			expect(redirects).toContain("/sitemap.xml /sitemap-index.xml 301");
			expect(redirects).toContain(
				"/resources/guides/old-billing /resources/guides/childcare-billing/ 301",
			);
		} finally {
			process.chdir(originalCwd);
		}
	});
});

describe("live content redirect metadata", () => {
	it("emits redirects for the consolidated Sandbox and Playground routes", () => {
		const repoRoot = join(__dirname, "..", "..", "..", "..");
		const contentRoot = join(repoRoot, "apps", "site", "src", "content");

		const rules = collectRedirectRules([
			{
				relativePath: "alternatives/sandbox-alternative.md",
				content: readFileSync(join(contentRoot, "alternatives", "sandbox-alternative.md"), "utf-8"),
			},
			{
				relativePath: "pricing-breakdowns/sandbox-pricing.md",
				content: readFileSync(
					join(contentRoot, "pricing-breakdowns", "sandbox-pricing.md"),
					"utf-8",
				),
			},
			{
				relativePath: "alternatives/playground-alternative.md",
				content: readFileSync(
					join(contentRoot, "alternatives", "playground-alternative.md"),
					"utf-8",
				),
			},
			{
				relativePath: "comparisons/sandbox-vs-pebbledesk.md",
				content: readFileSync(
					join(contentRoot, "comparisons", "sandbox-vs-pebbledesk.md"),
					"utf-8",
				),
			},
		]);

		expect(rules).toEqual(
			expect.arrayContaining([
				{
					from: "/compare/alternatives/sandbox-childcare",
					to: "/compare/alternatives/sandbox/",
				},
				{
					from: "/compare/pricing/sandbox-childcare",
					to: "/compare/pricing/sandbox/",
				},
				{
					from: "/compare/alternatives/playground-full-featured",
					to: "/compare/alternatives/playground/",
				},
				{
					from: "/compare/versus/sandbox-childcare-vs-pebbledesk",
					to: "/compare/versus/sandbox-vs-pebbledesk/",
				},
			]),
		);
	});
});
