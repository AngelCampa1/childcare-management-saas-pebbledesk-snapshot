import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contentConfigPath = resolve(process.cwd(), "src/content.config.ts");
const slugPagePath = resolve(process.cwd(), "src/pages/childcare-software/[slug].astro");
const breadcrumbsPath = resolve(process.cwd(), "src/lib/breadcrumbs.ts");

describe("city pages infrastructure", () => {
	it("registers the city-pages collection in content.config.ts", () => {
		const source = readFileSync(contentConfigPath, "utf-8");

		expect(source).toContain('base: "./src/content/city-pages"');
		expect(source).toContain("cityPageSchema");
		expect(source).toContain('"city-pages": cityPages');
	});

	it("includes city-pages in getStaticPaths of [slug].astro", () => {
		const source = readFileSync(slugPagePath, "utf-8");

		expect(source).toContain('getCollection("city-pages")');
		expect(source).toContain("getStaticPaths");
		expect(source).toContain("city-pages");
	});

	it("exports buildCityBreadcrumbs from breadcrumbs.ts", () => {
		const source = readFileSync(breadcrumbsPath, "utf-8");

		expect(source).toContain("buildCityBreadcrumbs");
		expect(source).toContain(`{ label: "Childcare Software", href: "/childcare-software/" }`);
	});

	it("city page slug template uses city-specific inline signup heading", () => {
		const source = readFileSync(slugPagePath, "utf-8");

		expect(source).toContain("Running a childcare center in");
		expect(source).toContain("inlineSignupHeading");
	});

	it("city page slug template auto-prepends statePage to relatedPages", () => {
		const source = readFileSync(slugPagePath, "utf-8");

		expect(source).toContain("statePage");
		expect(source).toContain("relatedPages");
	});

	it("childcare software index surfaces city pages alongside state pages", () => {
		const indexSource = readFileSync(
			resolve(process.cwd(), "src/pages/childcare-software/index.astro"),
			"utf-8",
		);

		expect(indexSource).toContain('getCollection("city-pages")');
		expect(indexSource).toContain("City guide");
		expect(indexSource).toContain("cityItems");
		expect(indexSource).toContain("items =");
	});
});
