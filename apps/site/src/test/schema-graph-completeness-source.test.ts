import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layouts = [
	"article-layout.astro",
	"comparison-layout.astro",
	"listicle-layout.astro",
	"pricing-breakdown-layout.astro",
	"content-layout.astro",
];

describe("article schema graph completeness", () => {
	for (const layout of layouts) {
		it(`${layout} includes resolvable publisher graph nodes`, () => {
			const source = readFileSync(
				join(process.cwd(), "../../packages/marketing/src/layouts", layout),
				"utf8",
			);

			expect(source).toContain("buildPublisherGraphNodes");
			expect(source).toContain("...buildPublisherGraphNodes");
		});
	}
});
