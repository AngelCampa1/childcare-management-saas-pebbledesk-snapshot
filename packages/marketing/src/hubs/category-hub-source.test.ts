import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/hubs/category-hub.astro"), "utf8");

describe("CategoryHub source", () => {
	it("does not expose unfinished coming-soon empty-state copy", () => {
		expect(source).not.toContain("More content coming soon.");
		expect(source).not.toContain("we'll let you know when we publish new content");
	});
});
