import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const featuresDir = resolve(process.cwd(), "src/content/features");
const featureIndexPage = resolve(process.cwd(), "src/pages/features/index.astro");
const featureDetailPage = resolve(process.cwd(), "src/pages/features/[slug].astro");
const expectedFeatureCount = 17;
const minFeatureWords = 320;
const minRelatedPages = 4;
const minFaqs = 3;
const minAnswers = 2;
const bannedLiveFeatureTerms = [
	"BOFU",
	"TOFU",
	"MOFU",
	"search intent",
	"source of truth",
	"Methodology and source note",
	"current product surface",
	"internal links",
	"marketing site",
	"old marketing site",
	"this refresh",
	"The site markets",
	"sold from the compliance problem outward",
	"product story",
	"product surface",
	"supported surface",
	"verified in code",
	"entitlement source",
	"entitlement table",
	"site keeps the language",
	"hard-code every group entitlement",
	"rollout-supported",
];

function featureFiles(): string[] {
	return readdirSync(featuresDir)
		.filter((file) => file.endsWith(".md"))
		.sort()
		.map((file) => resolve(featuresDir, file));
}

function relative(file: string): string {
	return file
		.replace(`${process.cwd()}\\`, "")
		.replace(`${process.cwd()}/`, "")
		.replace(/\\/g, "/");
}

function slug(file: string): string {
	return file.split(/[\\/]/).pop()?.replace(/\.md$/, "") ?? "";
}

function body(source: string): string {
	return source.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim();
}

function bodyWordCount(source: string): number {
	return body(source)
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/<[^>]+>/g, " ")
		.split(/\s+/)
		.filter((word) => /[A-Za-z0-9]/.test(word)).length;
}

function frontmatter(source: string): string {
	return source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function countFrontmatterItems(source: string, section: string, key: string): number {
	const lines = frontmatter(source).split(/\r?\n/);
	let inSection = false;
	let count = 0;

	for (const line of lines) {
		if (!inSection) {
			if (line.trim() === `${section}:`) inSection = true;
			continue;
		}
		if (/^\S/.test(line) && !line.startsWith("-")) break;
		if (line.match(new RegExp(`^\\s+-\\s+${key}:\\s+`))) count += 1;
	}

	return count;
}

function relatedPages(source: string): string[] {
	const lines = frontmatter(source).split(/\r?\n/);
	const links: string[] = [];
	let inSection = false;

	for (const line of lines) {
		if (!inSection) {
			if (line.trim() === "relatedPages:") inSection = true;
			continue;
		}
		if (/^\S/.test(line) && !line.startsWith("-")) break;
		const match = line.match(/^\s+-\s+(\/[^\s#?]+)/);
		if (match) links.push(match[1].replace(/\/$/, ""));
	}

	return links;
}

function headings(source: string): string[] {
	return body(source)
		.split(/\r?\n/)
		.filter((line) => line.startsWith("## "))
		.map((line) => line.replace(/^##\s+/, "").trim());
}

describe("feature landing pages", () => {
	const files = featureFiles();

	it("keeps one indexable feature landing page per product feature", () => {
		expect(files).toHaveLength(expectedFeatureCount);
		for (const file of files) {
			const source = readFileSync(file, "utf8");
			expect(source, `${relative(file)} must be public knowledge`).toContain(
				"publicKnowledge: true",
			);
			expect(source, `${relative(file)} must stay indexable`).not.toMatch(/^noindex:\s+true/m);
		}
	});

	for (const file of files) {
		it(`${relative(file)} leads with problem then solution`, () => {
			const source = readFileSync(file, "utf8");
			const pageHeadings = headings(source);

			expect(pageHeadings[0], "first body section should frame the problem").toMatch(
				/^The problem:/,
			);
			expect(pageHeadings[1], "second body section should name the PebbleDesk solution").toMatch(
				/^The PebbleDesk solution:/,
			);
			expect(
				bodyWordCount(source),
				"feature pages need enough depth for search and AI answers",
			).toBeGreaterThanOrEqual(minFeatureWords);
		});

		it(`${relative(file)} has AI-extractable answers, FAQs, and strong links`, () => {
			const source = readFileSync(file, "utf8");
			const links = relatedPages(source);
			const ownPath = `/features/${slug(file)}`;

			expect(
				countFrontmatterItems(source, "faqs", "q"),
				"minimum FAQ count",
			).toBeGreaterThanOrEqual(minFaqs);
			expect(
				countFrontmatterItems(source, "answers", "q"),
				"minimum answer block count",
			).toBeGreaterThanOrEqual(minAnswers);
			expect(links, "relatedPages count").toHaveLength(minRelatedPages);
			expect(new Set(links).size, "relatedPages must be unique").toBe(links.length);
			expect(links, "relatedPages must not self-link").not.toContain(ownPath);
			expect(source, "body should include contextual markdown links").toMatch(
				/\[[^\]]+\]\(\/[^)]+\)/,
			);
			expect(source, "humanizer cleanup should not leave spaced punctuation").not.toMatch(/\s,/);
			for (const term of bannedLiveFeatureTerms) {
				expect(source, `feature content should not expose internal term: ${term}`).not.toContain(
					term,
				);
			}
		});

		it(`${relative(file)} avoids em dash and en dash copy`, () => {
			const source = readFileSync(file, "utf8");
			expect(source).not.toMatch(/[\u2014\u2013]/);
		});
	}

	it("uses the features index as a mobile-first clickable product hub", () => {
		const source = readFileSync(featureIndexPage, "utf8");

		expect(source).toContain("mapToContentItems");
		expect(source).toContain("<CategoryHub");
		expect(source).toContain("items={items}");
		expect(source).toContain("Feature links");
		expect(source).toContain("href={item.href}");
		expect(source).toContain("sm:grid-cols-2");
		expect(source).toContain("rounded-full");
		expect(source).toMatch(/problem/i);
		expect(source).toMatch(/solution/i);
		for (const term of bannedLiveFeatureTerms) {
			expect(source, `features index should not expose internal term: ${term}`).not.toContain(term);
		}
	});

	it("uses a dedicated feature landing template before the article body", () => {
		expect(existsSync(featureDetailPage)).toBe(true);
		const source = readFileSync(featureDetailPage, "utf8");

		expect(source).toContain("data-feature-landing");
		expect(source).toContain("buildSoftwareApplicationSchema");
		expect(source).toContain("schemaReadyTier");
		expect(source).toContain("featureSchemaOffer");
		expect(source).toContain("schemas={featureSchemas}");
		expect(source).toContain("<Content />");
		expect(source).not.toContain("This feature page starts with the daily admin problem");
		expect(source).not.toContain("price: siteConfig.product.price");
	});
});
