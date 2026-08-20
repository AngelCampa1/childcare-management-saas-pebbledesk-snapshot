import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("RSS canonical links source", () => {
	it("builds feed item links through the trailing-slash canonical helper", () => {
		const source = readFileSync(join(process.cwd(), "src", "pages", "rss.xml.ts"), "utf8");

		expect(source).toContain("ensureTrailingSlash");
		expect(source).toContain("canonicalRssUrl");
		expect(source).not.toContain("link: `");
	});
});
