import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
	internalLinkNormalizationIntegration,
	normalizeInternalHref,
	normalizeInternalLinksInHtml,
} from "./internal-link-normalization";

describe("normalizeInternalHref", () => {
	it("adds trailing slashes to internal page links while preserving query strings and hashes", () => {
		expect(normalizeInternalHref("/compare/pricing/brightwheel")).toBe(
			"/compare/pricing/brightwheel/",
		);
		expect(normalizeInternalHref("/features/ratio-tracking?source=nav#demo")).toBe(
			"/features/ratio-tracking/?source=nav#demo",
		);
		expect(normalizeInternalHref("https://pebbledesk.app/resources/guides/foo")).toBe(
			"https://pebbledesk.app/resources/guides/foo/",
		);
	});

	it("leaves assets, non-http links, fragments, and external URLs alone", () => {
		expect(normalizeInternalHref("/logo-light.svg")).toBe("/logo-light.svg");
		expect(normalizeInternalHref("/_astro/app.js")).toBe("/_astro/app.js");
		expect(normalizeInternalHref("/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1")).toBe(
			"/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1",
		);
		expect(normalizeInternalHref("#pricing")).toBe("#pricing");
		expect(normalizeInternalHref("mailto:angel.campa@pebbledesk.app")).toBe(
			"mailto:angel.campa@pebbledesk.app",
		);
		expect(normalizeInternalHref("tel:+15555555555")).toBe("tel:+15555555555");
		expect(normalizeInternalHref("pricing")).toBe("pricing");
		expect(normalizeInternalHref("https://my.pebbledesk.app/signup")).toBe(
			"https://my.pebbledesk.app/signup",
		);
		expect(normalizeInternalHref("//pebbledesk.app/resources/guides/foo")).toBe(
			"//pebbledesk.app/resources/guides/foo",
		);
		expect(normalizeInternalHref("//my.pebbledesk.app/signup")).toBe("//my.pebbledesk.app/signup");
	});

	it("leaves roots, already-normalized links, and malformed absolute URLs alone", () => {
		expect(normalizeInternalHref("/")).toBe("/");
		expect(normalizeInternalHref("/resources/")).toBe("/resources/");
		expect(normalizeInternalHref("http://%")).toBe("http://%");
	});
});

describe("normalizeInternalLinksInHtml", () => {
	it("normalizes href attributes in generated HTML", () => {
		const html =
			'<a href="/resources/guides/foo">Guide</a><a href="https://pebbledesk.app/free/tool">Tool</a>';

		expect(normalizeInternalLinksInHtml(html)).toBe(
			'<a href="/resources/guides/foo/">Guide</a><a href="https://pebbledesk.app/free/tool/">Tool</a>',
		);
	});

	it("preserves unchanged href attributes", () => {
		const html = '<a href="/resources/">Resources</a><a href="/logo.svg">Logo</a>';

		expect(normalizeInternalLinksInHtml(html)).toBe(html);
	});
});

describe("internalLinkNormalizationIntegration", () => {
	it("rewrites generated HTML files recursively and skips non-HTML files", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pebbledesk-links-"));
		const nestedDirectory = join(directory, "resources");
		mkdirSync(nestedDirectory);
		const rootHtmlPath = join(directory, "index.html");
		const nestedHtmlPath = join(nestedDirectory, "index.html");
		const textPath = join(directory, "robots.txt");
		writeFileSync(rootHtmlPath, '<a href="/free/tool">Tool</a>', "utf8");
		writeFileSync(nestedHtmlPath, '<a href="/resources/">Resources</a>', "utf8");
		writeFileSync(textPath, "Sitemap: /sitemap-index.xml", "utf8");
		const logger = { info: vi.fn() };

		try {
			const integration = internalLinkNormalizationIntegration("https://pebbledesk.app");
			const hook = integration.hooks["astro:build:done"];
			if (!hook) throw new Error("astro:build:done hook missing");

			await hook({
				dir: pathToFileURL(`${directory}/`),
				logger: logger as never,
				pages: [],
				assets: new Map(),
			});

			expect(readFileSync(rootHtmlPath, "utf8")).toBe('<a href="/free/tool/">Tool</a>');
			expect(readFileSync(nestedHtmlPath, "utf8")).toBe('<a href="/resources/">Resources</a>');
			expect(readFileSync(textPath, "utf8")).toBe("Sitemap: /sitemap-index.xml");
			expect(logger.info).toHaveBeenCalledWith(
				"Internal links: normalized trailing slashes in generated HTML",
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
