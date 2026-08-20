import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPublicPricingMarkdown } from "@pebbledesk/shared/public-knowledge/marketing-surfaces";
import { describe, expect, it } from "vitest";

describe("public pricing markdown source", () => {
	it("matches the canonical shared public pricing markdown", () => {
		const pricingMarkdown = readFileSync(join(process.cwd(), "public", "pricing.md"), "utf8");

		expect(pricingMarkdown).toBe(buildPublicPricingMarkdown());
	});

	it("keeps enterprise as a note after the self-serve plan list", () => {
		const pricingMarkdown = readFileSync(join(process.cwd(), "public", "pricing.md"), "utf8");

		expect(pricingMarkdown).toContain("## Enterprise note");
		expect(pricingMarkdown).not.toContain("## Enterprise - Custom pricing");
		expect(pricingMarkdown.indexOf("## Enterprise note")).toBeGreaterThan(
			pricingMarkdown.indexOf("### Group"),
		);
	});

	it("serves a plain-text pricing alias from the same canonical pricing source", () => {
		const pricingTxtRoute = readFileSync(
			join(process.cwd(), "src", "pages", "pricing.txt.ts"),
			"utf8",
		);

		expect(pricingTxtRoute).toContain("buildPublicPricingMarkdown");
		expect(pricingTxtRoute).toContain('Content-Type": "text/plain; charset=utf-8"');
	});
});
