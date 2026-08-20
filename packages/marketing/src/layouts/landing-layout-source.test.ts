import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("landing layout SEO source regressions", () => {
	it("requires explicit canonical paths and schema modes", () => {
		const source = readSource("./landing-layout.astro");

		expect(source).toContain("canonicalPath: string");
		expect(source).toContain('type LandingSchemaMode = "brand" | "product"');
		expect(source).not.toContain("canonicalPath?: string");
		expect(source).not.toContain('canonicalPath ?? "/"');
	});

	it("emits product schema only for product-mode landing pages", () => {
		const source = readSource("./landing-layout.astro");

		expect(source).toContain('schemaMode === "product"');
		expect(source.match(/withId\(buildProductSchema\(/g)).toHaveLength(1);
		expect(source.match(/withId\(buildSoftwareApplicationSchema\(/g)).toHaveLength(1);
		expect(source).not.toContain("buildFaqPageSchema");
		expect(source).not.toContain("articleAuthor={config.author?.name}");
		expect(source).toContain("noindex={noindex}");
	});
});
