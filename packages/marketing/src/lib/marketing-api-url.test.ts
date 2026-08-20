import { describe, expect, it } from "vitest";
import { resolveMarketingApiUrl } from "./marketing-api-url";

describe("resolveMarketingApiUrl", () => {
	it("uses the configured public API URL without a trailing slash", () => {
		expect(resolveMarketingApiUrl("https://api.pebbledesk.app/", "https://pebbledesk.app")).toBe(
			"https://api.pebbledesk.app",
		);
	});

	it("falls back to the current origin when no public API URL is configured", () => {
		expect(resolveMarketingApiUrl(undefined, "https://pebbledesk.app/")).toBe(
			"https://pebbledesk.app",
		);
	});

	it("trims blank configured values before falling back", () => {
		expect(resolveMarketingApiUrl("   ", "https://pebbledesk.app")).toBe("https://pebbledesk.app");
	});

	it("keeps same-origin lead capture relative when current origin is empty at build time", () => {
		expect(resolveMarketingApiUrl("", "")).toBe("");
	});
});
