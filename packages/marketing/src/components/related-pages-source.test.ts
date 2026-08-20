import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("related-pages source", () => {
	it("uses Astro.site to emit absolute ItemList urls when available", () => {
		const source = readFileSync(
			resolve(process.cwd(), "src/components/related-pages.astro"),
			"utf8",
		);

		expect(source).toContain("const siteUrl = Astro.site?.toString()");
		expect(source).toContain("})), siteUrl)");
	});
});
