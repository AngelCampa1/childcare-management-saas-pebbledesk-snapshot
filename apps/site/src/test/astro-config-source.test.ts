import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("astro config", () => {
	it("forces trailing slashes for internal routes", () => {
		const source = readFileSync(resolve(process.cwd(), "astro.config.mjs"), "utf8");

		expect(source).toContain('trailingSlash: "always"');
	});
});
