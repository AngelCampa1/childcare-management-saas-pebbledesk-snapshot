import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const legalPageFiles = ["privacy.astro", "terms.astro"] as const;

describe("legal page header source", () => {
	for (const file of legalPageFiles) {
		it(`${file} keeps the full marketing header actions`, () => {
			const source = readFileSync(resolve(process.cwd(), "src/pages", file), "utf8");

			expect(source).toContain("navItems={siteConfig.nav?.items}");
			expect(source).toContain("signInHref={siteConfig.nav?.signInHref}");
			expect(source).toContain("ctaText={siteConfig.nav?.ctaText ?? headerCta.text}");
		});
	}
});
