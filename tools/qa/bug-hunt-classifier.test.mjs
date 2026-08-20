import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
	classifyRequestFailure,
	classifyResponseError,
	classifySmallTargets,
	isFirstParty,
	isTelemetry,
} from "./bug-hunt-classifier.mjs";

// --- Test helpers --------------------------------------------------------

function makeRequest({ url, method = "GET", errorText = null }) {
	return {
		url: () => url,
		method: () => method,
		failure: () => (errorText === null ? null : { errorText }),
	};
}

function makePage(url) {
	return { url: () => url };
}

function makeResponse({ url, status, method = "GET" }) {
	return {
		url: () => url,
		status: () => status,
		request: () => ({ method: () => method }),
	};
}

// --- isFirstParty --------------------------------------------------------

describe("isFirstParty", () => {
	it("matches pebbledesk.app", () => {
		assert.equal(isFirstParty("https://pebbledesk.app/"), true);
	});

	it("matches www.pebbledesk.app", () => {
		assert.equal(isFirstParty("https://www.pebbledesk.app/about"), true);
	});

	it("matches my.pebbledesk.app", () => {
		assert.equal(isFirstParty("https://my.pebbledesk.app/dashboard"), true);
	});

	it("matches api.pebbledesk.app", () => {
		assert.equal(isFirstParty("https://api.pebbledesk.app/v1/health"), true);
	});

	it("rejects unrelated origins", () => {
		assert.equal(isFirstParty("https://example.com/"), false);
	});

	it("rejects similarly-named lookalikes", () => {
		assert.equal(isFirstParty("https://pebbledesk.app.evil.com/"), false);
	});

	it("returns false for non-URL strings", () => {
		assert.equal(isFirstParty("not a url"), false);
	});
});

// --- isTelemetry ---------------------------------------------------------

describe("isTelemetry", () => {
	it("matches Cloudflare RUM", () => {
		assert.equal(isTelemetry("https://static.cloudflareinsights.com/beacon.min.js"), true);
		assert.equal(isTelemetry("https://cloudflareinsights.com/cdn-cgi/rum"), true);
	});

	it("matches Sentry ingest hosts", () => {
		assert.equal(isTelemetry("https://o123.ingest.sentry.io/api/1/envelope/"), true);
		assert.equal(isTelemetry("https://o456.ingest.us.sentry.io/api/1/envelope/"), true);
		assert.equal(isTelemetry("https://o789.ingest.de.sentry.io/api/1/envelope/"), true);
	});

	it("matches Google Analytics family", () => {
		assert.equal(isTelemetry("https://www.google-analytics.com/g/collect"), true);
		assert.equal(isTelemetry("https://analytics.google.com/g/collect"), true);
		assert.equal(isTelemetry("https://www.googletagmanager.com/gtag/js"), true);
	});

	it("matches Segment", () => {
		assert.equal(isTelemetry("https://api.segment.io/v1/t"), true);
		assert.equal(isTelemetry("https://cdn.segment.com/analytics.js/v1/key/analytics.min.js"), true);
	});

	it("matches PostHog", () => {
		assert.equal(isTelemetry("https://us.i.posthog.com/e/"), true);
		assert.equal(isTelemetry("https://app.posthog.com/decide/"), true);
	});

	it("rejects non-telemetry first-party URL", () => {
		assert.equal(isTelemetry("https://api.pebbledesk.app/v1/centers"), false);
	});

	it("returns false for malformed input", () => {
		assert.equal(isTelemetry("garbage"), false);
	});
});

// --- classifyRequestFailure ----------------------------------------------

describe("classifyRequestFailure", () => {
	it("drops third-party telemetry failures", () => {
		const result = classifyRequestFailure({
			request: makeRequest({
				url: "https://o123.ingest.sentry.io/api/1/envelope/",
				errorText: "net::ERR_FAILED",
			}),
			page: makePage("https://my.pebbledesk.app/dashboard"),
		});
		assert.equal(result, null);
	});

	it("drops third-party non-telemetry failures (out of scope)", () => {
		const result = classifyRequestFailure({
			request: makeRequest({
				url: "https://cdn.example.com/script.js",
				errorText: "net::ERR_FAILED",
			}),
			page: makePage("https://my.pebbledesk.app/dashboard"),
		});
		assert.equal(result, null);
	});

	it("classifies first-party ERR_ABORTED after navigation as P3 benign", () => {
		const result = classifyRequestFailure({
			request: makeRequest({
				url: "https://api.pebbledesk.app/v1/children",
				errorText: "net::ERR_ABORTED",
			}),
			// page has navigated to /staff after request was issued for /children context
			page: makePage("https://my.pebbledesk.app/staff"),
		});
		assert.deepEqual(result, { severity: "P3", reason: "benign navigation abort" });
	});

	it("classifies first-party ERR_ABORTED on same page as P2", () => {
		const result = classifyRequestFailure({
			request: makeRequest({
				url: "https://my.pebbledesk.app/dashboard",
				errorText: "net::ERR_ABORTED",
			}),
			page: makePage("https://my.pebbledesk.app/dashboard"),
		});
		assert.deepEqual(result, { severity: "P2", reason: "in-page request aborted" });
	});

	it("classifies cross-origin first-party API ERR_ABORTED as P3 (origin mismatch)", () => {
		// Per the spec rule, the heuristic compares request origin against page
		// origin+pathname. An API call from a UI page never matches, so all
		// API aborts are treated as benign navigation collateral.
		const result = classifyRequestFailure({
			request: makeRequest({
				url: "https://api.pebbledesk.app/v1/children",
				errorText: "net::ERR_ABORTED",
			}),
			page: makePage("https://my.pebbledesk.app/dashboard"),
		});
		assert.deepEqual(result, { severity: "P3", reason: "benign navigation abort" });
	});

	it("classifies generic first-party failures as P1 with errorText reason", () => {
		const result = classifyRequestFailure({
			request: makeRequest({
				url: "https://api.pebbledesk.app/v1/children",
				errorText: "net::ERR_CONNECTION_REFUSED",
			}),
			page: makePage("https://my.pebbledesk.app/dashboard"),
		});
		assert.deepEqual(result, { severity: "P1", reason: "net::ERR_CONNECTION_REFUSED" });
	});

	it("classifies ERR_ABORTED with unparseable page URL as P3 benign", () => {
		const result = classifyRequestFailure({
			request: makeRequest({
				url: "https://my.pebbledesk.app/dashboard",
				errorText: "net::ERR_ABORTED",
			}),
			page: makePage(""),
		});
		assert.deepEqual(result, { severity: "P3", reason: "benign navigation abort" });
	});

	it("returns P1 with fallback reason when failure() is null", () => {
		const result = classifyRequestFailure({
			request: makeRequest({
				url: "https://api.pebbledesk.app/v1/x",
				errorText: null,
			}),
			page: makePage("https://my.pebbledesk.app/dashboard"),
		});
		assert.equal(result.severity, "P1");
		assert.ok(typeof result.reason === "string" && result.reason.length > 0);
	});
});

// --- classifyResponseError -----------------------------------------------

describe("classifyResponseError", () => {
	it("drops telemetry responses", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://o123.ingest.sentry.io/api/1/envelope/",
				status: 500,
			}),
		});
		assert.equal(result, null);
	});

	it("drops third-party non-telemetry responses", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://cdn.example.com/x.js",
				status: 500,
			}),
		});
		assert.equal(result, null);
	});

	it("drops responses with status < 400", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://api.pebbledesk.app/v1/children",
				status: 200,
			}),
		});
		assert.equal(result, null);
	});

	it("drops expected 401 on /api/auth/* probes", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://api.pebbledesk.app/api/auth/session",
				status: 401,
			}),
		});
		assert.equal(result, null);
	});

	it("drops intentional 404 page probes (bughunt-missing-page-)", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://my.pebbledesk.app/bughunt-missing-page-foo",
				status: 404,
			}),
		});
		assert.equal(result, null);
	});

	it("drops intentional 404 route probes (bughunt-missing-route-)", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://api.pebbledesk.app/v1/bughunt-missing-route-bar",
				status: 404,
			}),
		});
		assert.equal(result, null);
	});

	it("classifies 5xx as P0", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://api.pebbledesk.app/v1/children",
				status: 500,
				method: "POST",
			}),
		});
		assert.equal(result.severity, "P0");
		assert.ok(result.reason.includes("500"));
	});

	it("classifies 4xx as P1", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://api.pebbledesk.app/v1/children",
				status: 400,
			}),
		});
		assert.equal(result.severity, "P1");
		assert.ok(result.reason.includes("400"));
	});

	it("classifies 401 outside auth probe path as P1", () => {
		const result = classifyResponseError({
			response: makeResponse({
				url: "https://api.pebbledesk.app/v1/children",
				status: 401,
			}),
		});
		assert.equal(result.severity, "P1");
	});
});

// --- classifySmallTargets ------------------------------------------------

describe("classifySmallTargets", () => {
	it("filters out invisible targets", () => {
		const targets = [
			{ width: 30, height: 30, visible: false },
			{ width: 30, height: 30, visible: true },
		];
		const result = classifySmallTargets(targets);
		assert.equal(result.length, 1);
		assert.equal(result[0].width, 30);
	});

	it("drops tiny icon buttons (<20px both dimensions)", () => {
		const targets = [{ width: 16, height: 16, visible: true }];
		assert.deepEqual(classifySmallTargets(targets), []);
	});

	it("flags 22px button as small target", () => {
		const targets = [{ width: 22, height: 22, visible: true }];
		const result = classifySmallTargets(targets);
		assert.equal(result.length, 1);
	});

	it("does not flag a comfortably-sized 40x40 target", () => {
		const targets = [{ width: 40, height: 40, visible: true }];
		assert.deepEqual(classifySmallTargets(targets), []);
	});

	it("flags target small in only one dimension", () => {
		const targets = [{ width: 200, height: 24, visible: true }];
		assert.equal(classifySmallTargets(targets).length, 1);
	});

	it("respects custom thresholds", () => {
		const targets = [
			{ width: 18, height: 18, visible: true }, // below new icon threshold (24) → drop
			{ width: 30, height: 30, visible: true }, // below new small (48) → flag
			{ width: 50, height: 50, visible: true }, // above new small → drop
		];
		const result = classifySmallTargets(targets, {
			iconButtonMaxPx: 24,
			smallTargetMaxPx: 48,
		});
		assert.equal(result.length, 1);
		assert.equal(result[0].width, 30);
	});
});
