import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "./article-meta.astro"), "utf8");

describe("article meta source", () => {
	it("renders linked author attribution when an author URL is provided", () => {
		expect(source).toContain("author?: SiteAuthor");
		expect(source).toContain("href={author.url}");
		expect(source).toContain("By {author.name}");
	});

	it("keeps last-updated metadata visible with the byline", () => {
		expect(source).toContain("Last updated:");
		expect(source).toContain("formatArticleDate(normalizeDateInput(updatedAt))");
	});
});
