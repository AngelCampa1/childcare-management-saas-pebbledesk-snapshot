import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("product SPA is excluded from search engines", () => {
	it("index.html declares noindex/nofollow for crawlers", () => {
		const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

		expect(html).toMatch(/<meta\s+name="robots"\s+content="noindex,\s*nofollow"\s*\/?>/);
	});

	it("index.html uses an unambiguous title for the SPA shell", () => {
		const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

		expect(html).toContain("<title>PebbleDesk App</title>");
	});

	it("public/robots.txt disallows all crawlers", () => {
		const robots = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8");

		expect(robots).toContain("User-agent: *");
		expect(robots).toContain("Disallow: /");
	});

	it("public/_headers sets X-Robots-Tag for all routes", () => {
		const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");

		expect(headers).toContain("X-Robots-Tag: noindex, nofollow");
	});
});
