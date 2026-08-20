import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
	"src/pages/resources/guides/[slug].astro",
	"src/pages/resources/best/[slug].astro",
	"src/pages/compare/alternatives/[slug].astro",
	"src/pages/compare/pricing/[slug].astro",
	"src/pages/compare/versus/[slugA]-vs-[slugB].astro",
	"src/pages/childcare-software/[slug].astro",
];

describe("canonical path source", () => {
	it("lets content entries override the rendered canonical path", () => {
		for (const file of files) {
			const source = readFileSync(resolve(process.cwd(), file), "utf8");
			expect(source).toContain("entry.data.canonicalHref ??");
		}
	});
});
