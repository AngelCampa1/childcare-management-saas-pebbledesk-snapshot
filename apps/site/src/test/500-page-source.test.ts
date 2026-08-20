import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("500 page source", () => {
	it("renders warm recovery copy without exposing raw error details", () => {
		const source = readFileSync(resolve(process.cwd(), "src/pages/500.astro"), "utf8");

		expect(source).toContain("Something went wrong on our side");
		expect(source).toContain("Please try again in a moment");
		expect(source).toContain("Back to home");
		expect(source).not.toContain("stack");
		expect(source).not.toContain("exception");
		expect(source).not.toContain("trace");
		expect(source).not.toContain("raw");
	});
});
