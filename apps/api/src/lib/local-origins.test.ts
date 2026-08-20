import { describe, expect, it } from "vitest";
import { getAllowedWebOrigins, resolveAuthBaseUrl } from "./local-origins.js";

describe("getAllowedWebOrigins", () => {
	it("includes localhost, 127.0.0.1, and IPv6 loopback variants for localhost app URLs", () => {
		expect(getAllowedWebOrigins("http://localhost:6500")).toEqual([
			"http://localhost:6500",
			"http://127.0.0.1:6500",
			"http://[::1]:6500",
		]);
	});

	it("includes localhost, 127.0.0.1, and IPv6 loopback variants for IPv6 app URLs", () => {
		expect(getAllowedWebOrigins("http://[::1]:6500")).toEqual([
			"http://[::1]:6500",
			"http://localhost:6500",
			"http://127.0.0.1:6500",
		]);
	});

	it("preserves non-loopback origins without adding aliases", () => {
		expect(getAllowedWebOrigins("https://app.pebbledesk.app")).toEqual([
			"https://app.pebbledesk.app",
		]);
	});

	it("falls back to the default local app origin when none is configured", () => {
		expect(getAllowedWebOrigins("")).toEqual([
			"http://localhost:3040",
			"http://127.0.0.1:3040",
			"http://[::1]:3040",
		]);
	});
});

describe("resolveAuthBaseUrl", () => {
	it("uses the incoming loopback request origin for local auth URLs", () => {
		expect(resolveAuthBaseUrl("http://localhost:8787", "http://127.0.0.1:8788/api/health")).toBe(
			"http://127.0.0.1:8788",
		);
	});

	it("supports IPv6 loopback requests", () => {
		expect(resolveAuthBaseUrl("http://localhost:8787", "http://[::1]:8788/api/health")).toBe(
			"http://[::1]:8788",
		);
	});

	it("preserves non-loopback auth URLs", () => {
		expect(
			resolveAuthBaseUrl("https://auth.pebbledesk.app", "https://api.pebbledesk.app/api/health"),
		).toBe("https://auth.pebbledesk.app");
	});

	it("falls back to configuredBaseUrl when request URL is not a valid loopback origin", () => {
		// The request URL parses to a non-loopback origin — falls back to configuredBaseUrl
		expect(
			resolveAuthBaseUrl("http://localhost:8787", "https://external.example.com/api/health"),
		).toBe("http://localhost:8787");
	});

	it("falls back to configuredBaseUrl when request URL is malformed", () => {
		// normalizeOrigin returns null for unparseable URLs — falls back to configuredBaseUrl
		expect(resolveAuthBaseUrl("http://localhost:8787", "not-a-url")).toBe("http://localhost:8787");
	});

	it("preserves a malformed configured auth URL", () => {
		expect(resolveAuthBaseUrl("not-a-url", "http://localhost:8788/api/health")).toBe("not-a-url");
	});
});

describe("getAllowedWebOrigins — edge cases", () => {
	it("falls back gracefully when app URL is an invalid string", () => {
		// normalizeOrigin returns null → falls back to DEFAULT_LOCAL_APP_ORIGIN
		expect(getAllowedWebOrigins("not-a-url")).toEqual([
			"http://localhost:3040",
			"http://127.0.0.1:3040",
			"http://[::1]:3040",
		]);
	});
});

describe("getAllowedWebOrigins — production HTTPS guard", () => {
	it("returns only the configured origin for HTTPS production URLs — no loopback siblings", () => {
		expect(getAllowedWebOrigins("https://my.pebbledesk.app")).toEqual([
			"https://my.pebbledesk.app",
		]);
	});

	it("returns only the configured origin for any HTTPS URL with a port", () => {
		expect(getAllowedWebOrigins("https://staging.pebbledesk.app:8443")).toEqual([
			"https://staging.pebbledesk.app:8443",
		]);
	});

	it("still returns loopback variants for HTTP localhost URLs", () => {
		const origins = getAllowedWebOrigins("http://localhost:3040");
		expect(origins).toContain("http://localhost:3040");
		expect(origins).toContain("http://127.0.0.1:3040");
		expect(origins.length).toBeGreaterThan(1);
	});
});
