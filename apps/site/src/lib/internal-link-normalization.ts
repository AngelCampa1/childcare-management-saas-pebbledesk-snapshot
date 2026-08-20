import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import type { AstroIntegration } from "astro";

const INTERNAL_ASSET_PREFIXES = ["/_astro/", "/cdn-cgi/"];

export function normalizeInternalHref(
	href: string,
	siteOrigin: string = PUBLIC_BRAND_KNOWLEDGE.publicOrigin,
): string {
	if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
		return href;
	}

	try {
		if (href.startsWith("//")) {
			return href;
		}
		const isAbsolute = /^https?:\/\//.test(href);
		const url = isAbsolute ? new URL(href) : new URL(href, siteOrigin);
		if (url.origin !== siteOrigin) {
			return href;
		}
		if (!isAbsolute && !href.startsWith("/")) {
			return href;
		}
		if (INTERNAL_ASSET_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
			return href;
		}
		const lastSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
		if (url.pathname === "/" || url.pathname.endsWith("/") || lastSegment.includes(".")) {
			return href;
		}
		url.pathname = `${url.pathname}/`;
		return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return href;
	}
}

export function normalizeInternalLinksInHtml(html: string, siteOrigin?: string): string {
	return html.replace(/\bhref=(["'])([^"']+)\1/g, (match, quote: string, href: string) => {
		const normalized = normalizeInternalHref(href, siteOrigin);
		return normalized === href ? match : `href=${quote}${normalized}${quote}`;
	});
}

function rewriteHtmlFiles(directory: string, siteOrigin: string): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolutePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			rewriteHtmlFiles(absolutePath, siteOrigin);
			continue;
		}
		if (extname(entry.name) !== ".html") {
			continue;
		}
		const html = readFileSync(absolutePath, "utf-8");
		const normalized = normalizeInternalLinksInHtml(html, siteOrigin);
		if (normalized !== html) {
			writeFileSync(absolutePath, normalized, "utf-8");
		}
	}
}

export function internalLinkNormalizationIntegration(siteOrigin: string): AstroIntegration {
	return {
		name: "@pebbledesk/internal-link-normalization",
		hooks: {
			"astro:build:done": ({ dir, logger }) => {
				rewriteHtmlFiles(fileURLToPath(dir), siteOrigin);
				logger.info("Internal links: normalized trailing slashes in generated HTML");
			},
		},
	};
}
