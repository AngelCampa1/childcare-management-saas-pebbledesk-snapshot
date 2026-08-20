import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("alternative comparison page source", () => {
	const source = readFileSync(
		resolve(import.meta.dirname, "../pages/compare/alternatives/[slug].astro"),
		"utf-8",
	);

	it("does not use a side-stripe border on the Quick Verdict callout", () => {
		expect(source).not.toContain("border-left:");
		expect(source).not.toContain("border-l-4");
		expect(source).toContain("Quick Verdict");
	});
});

describe("alternatives hub source", () => {
	it("closes the CategoryHub component", () => {
		const source = readFileSync(
			resolve(import.meta.dirname, "../pages/compare/alternatives/[...page].astro"),
			"utf-8",
		);

		expect(source).toContain("<CategoryHub");
		expect(source).toContain("</CategoryHub>");
		expect(source).not.toContain("</ContentHub>");
	});
});
