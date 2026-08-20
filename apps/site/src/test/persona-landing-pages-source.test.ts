import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-lint tests for the persona landing pages implementation.
 * Written FIRST (TDD) — these tests must fail before implementation exists.
 */

const pagesForDir = resolve(process.cwd(), "src/pages/for");
const componentPath = resolve(process.cwd(), "src/components/persona-landing.astro");
const indexAstroPath = resolve(process.cwd(), "src/pages/index.astro");
const llmsTxtPath = resolve(process.cwd(), "src/pages/llms.txt.ts");
const siteTsPath = resolve(process.cwd(), "src/config/site.ts");

const PERSONA_ROUTES = [
	"/for/childcare-center-directors/",
	"/for/in-home-daycare-providers/",
	"/for/multi-site-childcare-operators/",
];

const PERSONA_PAGE_FILES = [
	"index.astro",
	"childcare-center-directors.astro",
	"in-home-daycare-providers.astro",
	"multi-site-childcare-operators.astro",
];

describe("persona landing pages — source lint", () => {
	describe("page files exist under src/pages/for/", () => {
		for (const file of PERSONA_PAGE_FILES) {
			it(`src/pages/for/${file} exists`, () => {
				expect(existsSync(resolve(pagesForDir, file))).toBe(true);
			});
		}
	});

	describe("persona page sources contain required patterns", () => {
		for (const file of [
			"childcare-center-directors.astro",
			"in-home-daycare-providers.astro",
			"multi-site-childcare-operators.astro",
		]) {
			it(`${file} contains LandingLayout`, () => {
				const src = readFileSync(resolve(pagesForDir, file), "utf8");
				expect(src).toContain("LandingLayout");
			});

			it(`${file} contains schemaMode="product"`, () => {
				const src = readFileSync(resolve(pagesForDir, file), "utf8");
				expect(src).toContain('schemaMode="product"');
			});

			it(`${file} contains PersonaLanding`, () => {
				const src = readFileSync(resolve(pagesForDir, file), "utf8");
				expect(src).toContain("PersonaLanding");
			});

			it(`${file} contains canonicalPath usage`, () => {
				const src = readFileSync(resolve(pagesForDir, file), "utf8");
				expect(src).toContain("canonicalPath");
			});
		}
	});

	describe("hub index page", () => {
		it("src/pages/for/index.astro contains canonicalPath", () => {
			const src = readFileSync(resolve(pagesForDir, "index.astro"), "utf8");
			expect(src).toContain("canonicalPath");
		});

		it("src/pages/for/index.astro uses LandingLayout", () => {
			const src = readFileSync(resolve(pagesForDir, "index.astro"), "utf8");
			expect(src).toContain("LandingLayout");
		});
	});

	describe("persona-landing.astro component imports required components", () => {
		it("imports BreadcrumbNav", () => {
			const src = readFileSync(componentPath, "utf8");
			expect(src).toContain("BreadcrumbNav");
		});

		it("imports RelatedPages", () => {
			const src = readFileSync(componentPath, "utf8");
			expect(src).toContain("RelatedPages");
		});

		it("imports FaqSection", () => {
			const src = readFileSync(componentPath, "utf8");
			expect(src).toContain("FaqSection");
		});

		it("imports StickyMobileCta", () => {
			const src = readFileSync(componentPath, "utf8");
			expect(src).toContain("StickyMobileCta");
		});
	});

	describe("siteConfig organizes persona pages under Product and About", () => {
		it("site.ts keeps Who it's for as a Product menu section, not a top-level nav item", () => {
			const src = readFileSync(siteTsPath, "utf8");
			expect(src).toContain("Who it's for");
			expect(src).toContain('label: "Product"');
			expect(src).not.toContain(`label: "Who it's for"`);
		});

		for (const route of PERSONA_ROUTES) {
			it(`site.ts organized marketing surfaces contain route ${route}`, () => {
				const src = readFileSync(siteTsPath, "utf8");
				expect(src).toContain(route);
			});
		}

		it("site.ts footer has an About group for company and audience links", () => {
			const src = readFileSync(siteTsPath, "utf8");
			expect(src).toContain('heading: "About"');
			expect(src).toContain('label: "Who PebbleDesk is for"');
		});

		it("site.ts footer About group includes /for/", () => {
			const src = readFileSync(siteTsPath, "utf8");
			expect(src).toContain('href: "/for/"');
		});
	});

	describe("index.astro homepage internal links", () => {
		for (const route of PERSONA_ROUTES) {
			it(`index.astro contains link to ${route}`, () => {
				const src = readFileSync(indexAstroPath, "utf8");
				expect(src).toContain(route);
			});
		}
	});

	describe("llms.txt.ts Who It's For section", () => {
		it("contains 'Who It's For' heading", () => {
			const src = readFileSync(llmsTxtPath, "utf8");
			expect(src).toContain("Who It's For");
		});

		it("imports personaPages as the data source", () => {
			const src = readFileSync(llmsTxtPath, "utf8");
			expect(src).toContain("personaPages");
		});

		it("maps persona routes into the section from config", () => {
			// Routes are emitted dynamically from personaPages, so assert the
			// wiring (route mapping) rather than literal strings. Each route's
			// exact value is covered by persona-pages-config.test.ts.
			const src = readFileSync(llmsTxtPath, "utf8");
			expect(src).toContain("p.route");
		});
	});
});
