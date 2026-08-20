/**
 * Bug-hunt classification helpers shared across date-stamped Playwright bug-hunt
 * scripts (e.g. .playwright-cli/prod-bug-hunt-YYYYMMDD.mjs).
 *
 * Goal: keep severity rules in ONE place so individual run scripts stay short
 * and consistent. Future runs should import from this module rather than
 * reimplement first-party / telemetry / abort heuristics.
 *
 * See tools/qa/README.md for rationale and usage.
 */

// --- URL helpers ---------------------------------------------------------

/**
 * Safely parse a URL. Returns `null` on malformed input rather than throwing,
 * so call sites can treat unparseable URLs as "definitely not first-party"
 * and "definitely not telemetry."
 *
 * @param {string} url
 * @returns {URL | null}
 */
function safeParse(url) {
	try {
		return new URL(url);
	} catch {
		return null;
	}
}

const FIRST_PARTY_HOSTS = new Set([
	"pebbledesk.app",
	"www.pebbledesk.app",
	"my.pebbledesk.app",
	"api.pebbledesk.app",
]);

/**
 * True when the URL points at a PebbleDesk-controlled origin.
 * Only `https://` is considered first-party; we don't ship plain HTTP in prod.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isFirstParty(url) {
	const parsed = safeParse(url);
	if (parsed === null) return false;
	if (parsed.protocol !== "https:") return false;
	return FIRST_PARTY_HOSTS.has(parsed.hostname);
}

// Telemetry endpoints we deliberately ignore in bug-hunt reports. Failures
// or 4xx/5xx from these are out-of-scope noise (ad blockers, sampling,
// rate limits) and would drown the real signal.
const TELEMETRY_HOST_SUFFIXES = [
	// Cloudflare RUM
	"cloudflareinsights.com",
	// Sentry ingest (regional + multi-tenant)
	".ingest.sentry.io",
	".ingest.us.sentry.io",
	".ingest.de.sentry.io",
	// Google Analytics family
	"google-analytics.com",
	"analytics.google.com",
	"googletagmanager.com",
	// Segment
	"api.segment.io",
	"cdn.segment.com",
	// PostHog
	".posthog.com",
	"app.posthog.com",
];

function hostMatchesSuffix(host, suffix) {
	if (suffix.startsWith(".")) {
		// Wildcard subdomain pattern like ".ingest.sentry.io"
		return host.endsWith(suffix);
	}
	return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * True when the URL targets a known telemetry / analytics / RUM endpoint.
 * Used to silence vendor noise in bug-hunt reports.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isTelemetry(url) {
	const parsed = safeParse(url);
	if (parsed === null) return false;
	const host = parsed.hostname;
	for (const suffix of TELEMETRY_HOST_SUFFIXES) {
		if (hostMatchesSuffix(host, suffix)) return true;
	}
	return false;
}

// --- Request failure classification --------------------------------------

/**
 * Classify a Playwright `requestfailed` event.
 *
 * @param {{
 *   request: { url(): string, method(): string, failure(): { errorText: string } | null },
 *   page: { url(): string },
 * }} input
 * @returns {{ severity: "P0"|"P1"|"P2"|"P3", reason: string } | null}
 */
export function classifyRequestFailure({ request, page }) {
	const reqUrl = request.url();
	if (!isFirstParty(reqUrl)) {
		// Telemetry and other third-party noise: drop. Bug-hunt scope is our app.
		return null;
	}

	const errorText = request.failure()?.errorText ?? "unknown failure";

	if (errorText === "net::ERR_ABORTED") {
		// ERR_ABORTED is ambiguous: it can be a SPA route change cancelling an
		// in-flight fetch (benign) OR a real in-page abort (worth investigating).
		//
		// Heuristic from the 2026-04-23 prod bug-hunt: compare the request's
		// `origin + pathname` against the page's `origin + pathname`. If they
		// match exactly, the request and the page are still on the same path
		// → in-page abort (P2). Otherwise the page has navigated to a
		// different path/origin and the abort is benign route-change
		// collateral (P3). API calls (different origin) and stale fetches to
		// other pathnames both fall into the P3 bucket.
		// `reqUrl` already parsed cleanly via isFirstParty; only the page URL
		// could realistically be unparseable (e.g. about:blank), in which case
		// we conservatively treat it as a benign abort — there's no page
		// pathname to anchor to.
		const pageUrl = safeParse(page.url());
		const requestedUrl = safeParse(reqUrl);
		if (pageUrl === null || requestedUrl === null) {
			return { severity: "P3", reason: "benign navigation abort" };
		}
		const pageScope = `${pageUrl.origin}${pageUrl.pathname}`;
		const requestScope = `${requestedUrl.origin}${requestedUrl.pathname}`;
		if (pageScope === requestScope) {
			return { severity: "P2", reason: "in-page request aborted" };
		}
		return { severity: "P3", reason: "benign navigation abort" };
	}

	return { severity: "P1", reason: errorText };
}

// --- Response error classification ---------------------------------------

const AUTH_PROBE_PATH_PREFIX = "/api/auth/";
const INTENTIONAL_404_PATTERN = /\/bughunt-missing-(page|route)-/;

/**
 * Classify a Playwright `response` event for HTTP-level errors.
 * Returns `null` for benign / out-of-scope / expected responses.
 *
 * @param {{
 *   response: {
 *     url(): string,
 *     status(): number,
 *     request(): { method(): string },
 *   },
 * }} input
 * @returns {{ severity: "P0"|"P1", reason: string } | null}
 */
export function classifyResponseError({ response }) {
	const url = response.url();
	if (isTelemetry(url)) return null;
	if (!isFirstParty(url)) return null;

	const status = response.status();
	if (status < 400) return null;

	const parsed = safeParse(url);
	const pathname = parsed === null ? "" : parsed.pathname;
	const method = response.request().method();

	if (status === 401 && pathname.startsWith(AUTH_PROBE_PATH_PREFIX)) {
		// Bug-hunt scripts deliberately hit /api/auth/* unauthenticated to
		// confirm the gate works. 401 here is the success signal, not a bug.
		return null;
	}

	if (status === 404 && INTENTIONAL_404_PATTERN.test(url)) {
		// Bug-hunt scripts probe well-known fake paths to confirm 404 handling.
		return null;
	}

	if (status >= 500) {
		return { severity: "P0", reason: `${method} ${pathname} → ${status}` };
	}

	return { severity: "P1", reason: `${method} ${pathname} → ${status}` };
}

// --- Small-target filter -------------------------------------------------

/**
 * Filter a list of UI targets to those that are too small for comfortable
 * touch input, while skipping intentional decorative icons.
 *
 * @template T
 * @param {Array<T & { width: number, height: number, visible: boolean }>} targets
 * @param {{ iconButtonMaxPx?: number, smallTargetMaxPx?: number }} [options]
 * @returns {Array<T & { width: number, height: number, visible: boolean }>}
 */
export function classifySmallTargets(targets, options = {}) {
	const iconButtonMaxPx = options.iconButtonMaxPx ?? 20;
	const smallTargetMaxPx = options.smallTargetMaxPx ?? 36;

	return targets.filter((target) => {
		if (!target.visible) return false;
		// Drop tiny icon-only buttons: both dimensions below the icon threshold.
		// These are typically decorative or paired with a larger hit area.
		if (target.width < iconButtonMaxPx && target.height < iconButtonMaxPx) {
			return false;
		}
		// Flag anything where either dimension is below the comfortable-touch threshold.
		return target.width < smallTargetMaxPx || target.height < smallTargetMaxPx;
	});
}
