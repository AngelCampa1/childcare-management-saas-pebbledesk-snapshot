#!/usr/bin/env tsx
/**
 * Crawl the pebbledesk marketing site and report every broken link.
 *
 * Seeds from sitemap-index.xml, follows internal links breadth-first, and
 * validates external URLs and in-page #anchors. Outputs JSON + a console table.
 *
 * Usage: tsx scripts/check-links.ts [--base <public-site-origin>]
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";

interface Finding {
	source: string;
	url: string;
	status: number | string;
	reason: string;
}

interface CrawlOptions {
	base: string;
	concurrency: number;
	timeoutMs: number;
	userAgent: string;
}

const args = process.argv.slice(2);
const baseFlagIdx = args.indexOf("--base");
const base = (
	baseFlagIdx >= 0 ? args[baseFlagIdx + 1] : PUBLIC_BRAND_KNOWLEDGE.publicOrigin
).replace(/\/$/, "");
const opts: CrawlOptions = {
	base,
	concurrency: 8,
	timeoutMs: 15000,
	userAgent: `PebbleDeskLinkChecker/1.0 (+${PUBLIC_BRAND_KNOWLEDGE.publicOrigin})`,
};

const baseOrigin = new URL(opts.base).origin;
const siteOrigin = PUBLIC_BRAND_KNOWLEDGE.publicOrigin;
const botProtectedExternalHosts = new Set(["www.acf.hhs.gov"]);

const findings: Finding[] = [];
const visitedPages = new Set<string>();
const checkedExternals = new Map<string, { status: number | string; reason: string }>();
const pageHtmlCache = new Map<string, string | null>();
const pageAnchorCache = new Map<string, Set<string>>();

function normalizeUrl(href: string, fromPage: string): string | null {
	try {
		return new URL(href, fromPage).toString();
	} catch {
		return null;
	}
}

function stripHash(url: string): string {
	const u = new URL(url);
	u.hash = "";
	return u.toString();
}

function localizeInternalUrl(url: string): string {
	const u = new URL(url);
	if (u.origin !== siteOrigin) {
		return url;
	}
	const base = new URL(opts.base);
	u.protocol = base.protocol;
	u.host = base.host;
	return u.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), opts.timeoutMs);
	try {
		return await fetch(url, {
			...init,
			signal: ctrl.signal,
			headers: { "user-agent": opts.userAgent, ...(init.headers ?? {}) },
			redirect: "follow",
		});
	} finally {
		clearTimeout(t);
	}
}

async function fetchHtml(url: string): Promise<string | null> {
	if (pageHtmlCache.has(url)) return pageHtmlCache.get(url) ?? null;
	try {
		const res = await fetchWithTimeout(url);
		if (!res.ok) {
			pageHtmlCache.set(url, null);
			return null;
		}
		const ct = res.headers.get("content-type") ?? "";
		if (!ct.includes("text/html")) {
			pageHtmlCache.set(url, null);
			return null;
		}
		const html = await res.text();
		pageHtmlCache.set(url, html);
		return html;
	} catch {
		pageHtmlCache.set(url, null);
		return null;
	}
}

function extractAnchors(html: string): Set<string> {
	const ids = new Set<string>();
	for (const m of html.matchAll(/\sid=["']([^"']+)["']/g)) ids.add(m[1]);
	for (const m of html.matchAll(/<a\s+[^>]*name=["']([^"']+)["']/g)) ids.add(m[1]);
	return ids;
}

function extractLinks(html: string): string[] {
	return Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"'#][^"']*|#[^"']*)["']/gi), (m) => m[1]);
}

async function checkExternal(url: string): Promise<{ status: number | string; reason: string }> {
	const cached = checkedExternals.get(url);
	if (cached) return cached;
	const attempt = async (method: "HEAD" | "GET") => {
		try {
			const res = await fetchWithTimeout(url, { method });
			return { status: res.status, ok: res.ok };
		} catch (err) {
			return { status: "NETWORK", ok: false, err: String(err) };
		}
	};
	let r = await attempt("HEAD");
	// Many edge servers reject HEAD with assorted statuses (400/403/404/405/429/501).
	// Retry with GET on any non-2xx so we don't false-flag GET-only endpoints.
	if (!r.ok) {
		r = await attempt("GET");
	}
	const host = new URL(url).host;
	if (r.status === 403 && botProtectedExternalHosts.has(host)) {
		const result = { status: r.status, reason: "bot_protected" };
		checkedExternals.set(url, result);
		return result;
	}
	const result = r.ok
		? { status: r.status, reason: "ok" }
		: { status: r.status, reason: "external_unreachable" };
	checkedExternals.set(url, result);
	return result;
}

async function getSeeds(): Promise<string[]> {
	const seeds = new Set<string>([`${opts.base}/`]);
	const sitemapUrls = [`${opts.base}/sitemap-index.xml`, `${opts.base}/sitemap-0.xml`];
	for (const sm of sitemapUrls) {
		try {
			const res = await fetchWithTimeout(sm);
			if (!res.ok) continue;
			const xml = await res.text();
			for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
				const u = m[1].trim();
				if (u.endsWith(".xml")) {
					try {
						const child = await fetchWithTimeout(localizeInternalUrl(u));
						if (child.ok) {
							const cx = await child.text();
							for (const cm of cx.matchAll(/<loc>([^<]+)<\/loc>/g)) {
								seeds.add(localizeInternalUrl(cm[1].trim()));
							}
						}
					} catch {}
				} else if (u.startsWith(baseOrigin) || u.startsWith(siteOrigin)) {
					seeds.add(localizeInternalUrl(u));
				}
			}
		} catch {}
	}
	return [...seeds];
}

async function crawlPage(pageUrl: string): Promise<void> {
	if (visitedPages.has(pageUrl)) return;
	visitedPages.add(pageUrl);

	const res = await (async () => {
		try {
			return await fetchWithTimeout(pageUrl);
		} catch (err) {
			findings.push({ source: "(seed)", url: pageUrl, status: "NETWORK", reason: String(err) });
			return null;
		}
	})();
	if (!res) return;
	if (!res.ok) {
		findings.push({ source: "(seed)", url: pageUrl, status: res.status, reason: "page_failed" });
		return;
	}
	const html = await res.text();
	pageHtmlCache.set(pageUrl, html);
	pageAnchorCache.set(stripHash(pageUrl), extractAnchors(html));

	const hrefs = extractLinks(html);
	for (const href of hrefs) {
		if (href.startsWith("mailto:")) {
			if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+/.test(href)) {
				findings.push({ source: pageUrl, url: href, status: "MAILTO", reason: "malformed mailto" });
			}
			continue;
		}
		if (href.startsWith("tel:") || href.startsWith("javascript:")) continue;
		if (href.startsWith("#")) {
			const ids = pageAnchorCache.get(stripHash(pageUrl)) ?? new Set();
			const frag = href.slice(1);
			if (frag && !ids.has(frag)) {
				findings.push({
					source: pageUrl,
					url: href,
					status: "ANCHOR",
					reason: "missing #fragment on same page",
				});
			}
			continue;
		}
		const abs = normalizeUrl(href, pageUrl);
		if (!abs) {
			findings.push({ source: pageUrl, url: href, status: "INVALID", reason: "unparseable href" });
			continue;
		}
		const u = new URL(abs);
		if (u.origin === baseOrigin || u.origin === siteOrigin) {
			const internalUrl = localizeInternalUrl(abs);
			// Cloudflare auto-injects /cdn-cgi/l/email-protection?... wrappers around mailto: links.
			// They render correctly in browsers via Cloudflare JS but bot fetches return 404. Skip.
			if (u.pathname.startsWith("/cdn-cgi/")) continue;
			const noHash = stripHash(internalUrl);
			// validate the page exists
			let target = pageHtmlCache.get(noHash);
			if (target === undefined) {
				target = (await fetchHtml(noHash)) ?? "";
			}
			if (!target) {
				findings.push({
					source: pageUrl,
					url: internalUrl,
					status: "INTERNAL",
					reason: "internal page failed (404/non-html)",
				});
				continue;
			}
			pageAnchorCache.set(noHash, pageAnchorCache.get(noHash) ?? extractAnchors(target));
			if (u.hash) {
				const ids = pageAnchorCache.get(noHash) ?? new Set();
				const frag = decodeURIComponent(u.hash.slice(1));
				if (frag && !ids.has(frag)) {
					findings.push({
						source: pageUrl,
						url: abs,
						status: "ANCHOR",
						reason: `missing #${frag} on ${noHash}`,
					});
				}
			}
			// enqueue for further crawling if not yet visited
			if (!visitedPages.has(noHash)) queueInternal.add(noHash);
		} else {
			const r = await checkExternal(abs);
			if (r.reason !== "ok" && r.reason !== "bot_protected") {
				findings.push({ source: pageUrl, url: abs, status: r.status, reason: r.reason });
			}
		}
	}
}

const queueInternal = new Set<string>();
let inFlight = 0;

async function runWorker(): Promise<void> {
	while (true) {
		if (queueInternal.size === 0) {
			if (inFlight === 0) return;
			await new Promise((r) => setTimeout(r, 25));
			continue;
		}
		const next = queueInternal.values().next().value as string;
		queueInternal.delete(next);
		inFlight++;
		try {
			await crawlPage(next);
		} finally {
			inFlight--;
		}
	}
}

async function main(): Promise<void> {
	console.log(`Crawling ${opts.base}...`);
	const seeds = await getSeeds();
	console.log(`Seeded ${seeds.length} URLs from sitemap`);
	for (const s of seeds) queueInternal.add(s);

	const workers = Array.from({ length: opts.concurrency }, () => runWorker());
	await Promise.all(workers);

	const reportPath = resolve(process.cwd(), "link-check-report.json");
	writeFileSync(
		reportPath,
		JSON.stringify({ base: opts.base, visited: visitedPages.size, findings }, null, 2),
	);
	console.log(`\nVisited ${visitedPages.size} pages, ${findings.length} broken links\n`);
	if (findings.length > 0) {
		console.table(
			findings.map((f) => ({
				source: f.source.replace(opts.base, ""),
				url: f.url.length > 80 ? `${f.url.slice(0, 77)}...` : f.url,
				status: f.status,
				reason: f.reason,
			})),
		);
		process.exitCode = 1;
	} else {
		console.log("No broken links.");
	}
	console.log(`Report written to ${reportPath}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(2);
});
