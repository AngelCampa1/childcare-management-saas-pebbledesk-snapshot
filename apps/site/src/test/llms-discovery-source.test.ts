import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("LLM discovery source", () => {
	it("advertises both llms files in robots.txt", () => {
		const robots = readFileSync(join(process.cwd(), "public/robots.txt"), "utf8");

		expect(robots).toContain("Llms-Txt: https://pebbledesk.app/llms.txt");
		expect(robots).toContain("Llms-Txt: https://pebbledesk.app/llms-full.txt");
	});

	it("links machine-readable AI JSON resources from both llms routes", () => {
		for (const route of ["llms.txt.ts", "llms-full.txt.ts"]) {
			const source = readFileSync(join(process.cwd(), "src/pages", route), "utf8");

			expect(source).toContain('heading: "Machine-Readable AI Data"');
			for (const file of [
				"marketing.json",
				"lead-magnets.json",
				"content-index.json",
				"manifest.json",
				"full.json",
			]) {
				expect(source).toContain(`/ai/${file}`);
			}
			expect(source).toContain('title: "Pricing Markdown"');
			expect(source).toContain("/pricing.md");
			expect(source).toContain("/pricing.txt");
			expect(source).not.toContain("/ai/pricing.md");
		}
	});

	it("includes city pages in llms-full.txt", () => {
		const source = readFileSync(join(process.cwd(), "src/pages/llms-full.txt.ts"), "utf8");

		expect(source).toContain('getCollection("city-pages")');
		expect(source).toContain("buildCityPageLlmsItems");
		expect(source).toContain('heading: "City Pages"');
	});
});
