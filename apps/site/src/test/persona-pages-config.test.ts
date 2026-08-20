import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Unit tests for the persona-pages.ts data module.
 * Written FIRST (TDD) — these tests must fail before implementation exists.
 */

// Dynamic imports let the tests fail gracefully when the file doesn't exist yet.
const { personaPages, personaPagesBySlug } = await import("../config/persona-pages").catch(() => ({
	personaPages: undefined,
	personaPagesBySlug: undefined,
}));

const { personas } = await import("../config/personas").catch(() => ({ personas: undefined }));

const featuresDir = resolve(process.cwd(), "src/content/features");
const featureSlugs = new Set(
	existsSync(featuresDir)
		? readdirSync(featuresDir)
				.filter((f) => f.endsWith(".md"))
				.map((f) => f.replace(/\.md$/, ""))
		: [],
);

const VALID_PERSONA_SLUGS = [
	"childcare-center-directors",
	"in-home-daycare-providers",
	"multi-site-childcare-operators",
] as const;

type ValidPersonaSlug = (typeof VALID_PERSONA_SLUGS)[number];

const BANNED_PHRASES = [
	"customers report",
	"directors report",
	"trusted by",
	"#1",
	"best-in-class",
	"thousands of",
];

function allCopyStrings(page: Record<string, unknown>): string[] {
	const strings: string[] = [];
	function walk(value: unknown): void {
		if (typeof value === "string") {
			strings.push(value);
		} else if (Array.isArray(value)) {
			for (const item of value) walk(item);
		} else if (value !== null && typeof value === "object") {
			for (const v of Object.values(value)) walk(v);
		}
	}
	walk(page);
	return strings;
}

function getPage(slug: ValidPersonaSlug) {
	const page = personaPagesBySlug?.[slug];
	if (!page) throw new Error(`Persona page for slug "${slug}" not found`);
	return page;
}

describe("persona-pages-config", () => {
	it("exports personaPages array", () => {
		expect(personaPages).toBeDefined();
		expect(Array.isArray(personaPages)).toBe(true);
	});

	it("exports personaPagesBySlug map", () => {
		expect(personaPagesBySlug).toBeDefined();
		expect(typeof personaPagesBySlug).toBe("object");
	});

	it("has exactly 3 persona pages", () => {
		expect(personaPages).toHaveLength(3);
	});

	it("has the correct slugs in the right order", () => {
		const slugs = (personaPages ?? []).map((p: { slug: string }) => p.slug);
		expect(slugs).toEqual([...VALID_PERSONA_SLUGS]);
	});

	it("personaPagesBySlug keys match slugs", () => {
		for (const slug of VALID_PERSONA_SLUGS) {
			expect(personaPagesBySlug?.[slug]).toBeDefined();
		}
	});

	for (const slug of VALID_PERSONA_SLUGS) {
		describe(`persona: ${slug}`, () => {
			it("personaSlug exists in personas.ts", () => {
				const page = getPage(slug);
				const personaSlugs = (personas ?? []).map((p: { slug: string }) => p.slug);
				expect(personaSlugs).toContain(page.personaSlug);
			});

			it("title is <= 60 chars", () => {
				const page = getPage(slug);
				expect(page.title.length).toBeLessThanOrEqual(60);
			});

			it("description is >= 50 and <= 160 chars", () => {
				const page = getPage(slug);
				expect(page.description.length).toBeGreaterThanOrEqual(50);
				expect(page.description.length).toBeLessThanOrEqual(160);
			});

			it("has >= 3 pains", () => {
				const page = getPage(slug);
				expect(page.pains.length).toBeGreaterThanOrEqual(3);
			});

			it("has >= 3 helps each with >= 1 link", () => {
				const page = getPage(slug);
				expect(page.helps.length).toBeGreaterThanOrEqual(3);
				for (const help of page.helps) {
					expect(help.links.length).toBeGreaterThanOrEqual(1);
				}
			});

			it("has >= 3 takeaways", () => {
				const page = getPage(slug);
				expect(page.takeaways.length).toBeGreaterThanOrEqual(3);
			});

			it("has >= 4 faqs", () => {
				const page = getPage(slug);
				expect(page.faqs.length).toBeGreaterThanOrEqual(4);
			});

			it("every help link href starts with / and ends with /", () => {
				const page = getPage(slug);
				for (const help of page.helps) {
					for (const link of help.links) {
						expect(link.href, `help link: ${link.href}`).toMatch(/^\//);
						expect(link.href, `help link: ${link.href}`).toMatch(/\/$/);
					}
				}
			});

			it("every crossLink href starts with / and ends with /", () => {
				const page = getPage(slug);
				for (const cl of page.crossLinks) {
					expect(cl.href, `crossLink: ${cl.href}`).toMatch(/^\//);
					expect(cl.href, `crossLink: ${cl.href}`).toMatch(/\/$/);
				}
			});

			it("feature help links point to real feature slugs", () => {
				const page = getPage(slug);
				for (const help of page.helps) {
					for (const link of help.links) {
						if (!link.href.startsWith("/features/")) continue;
						const featureSlug = link.href.replace(/^\/features\//, "").replace(/\/$/, "");
						expect(
							featureSlugs.has(featureSlug),
							`Feature slug "${featureSlug}" referenced in help link "${link.href}" does not exist`,
						).toBe(true);
					}
				}
			});

			it("relatedPersonaSlugs references the other two valid persona slugs (not self)", () => {
				const page = getPage(slug);
				const others = VALID_PERSONA_SLUGS.filter((s) => s !== slug);
				expect(page.relatedPersonaSlugs).toHaveLength(2);
				for (const other of others) {
					expect(page.relatedPersonaSlugs).toContain(other);
				}
				expect(page.relatedPersonaSlugs).not.toContain(slug);
			});

			it("canonicalPath == route without trailing slash", () => {
				const page = getPage(slug);
				expect(page.canonicalPath).toBe(page.route.replace(/\/$/, ""));
			});

			it("route == /for/<slug>/", () => {
				const page = getPage(slug);
				expect(page.route).toBe(`/for/${page.slug}/`);
			});

			it("has no banned phrases in any copy string", () => {
				const page = getPage(slug);
				const copies = allCopyStrings(page as unknown as Record<string, unknown>);
				for (const phrase of BANNED_PHRASES) {
					const pattern = new RegExp(phrase, "i");
					for (const copy of copies) {
						expect(copy, `Banned phrase "${phrase}" found in copy: "${copy}"`).not.toMatch(pattern);
					}
				}
			});
		});
	}
});
