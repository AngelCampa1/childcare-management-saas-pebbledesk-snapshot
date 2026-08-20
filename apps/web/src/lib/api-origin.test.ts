import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl, resolveDevApiProxyTarget } from "./api-origin";

describe("resolveApiBaseUrl", () => {
	it("keeps browser API calls same-origin during development", () => {
		expect(
			resolveApiBaseUrl({
				DEV: true,
				VITE_API_URL: "http://localhost:4318",
			}),
		).toBe("");
	});

	it("supports an explicit absolute API override for non-proxied dev setups", () => {
		expect(
			resolveApiBaseUrl({
				DEV: true,
				VITE_API_URL: "http://localhost:4318",
				VITE_DEV_USE_ABSOLUTE_API: "true",
			}),
		).toBe("http://localhost:4318");
	});

	it("uses the configured absolute API URL outside development", () => {
		expect(
			resolveApiBaseUrl({
				DEV: false,
				VITE_API_URL: "https://api.pebbledesk.app",
			}),
		).toBe("https://api.pebbledesk.app");
	});
});

describe("resolveDevApiProxyTarget", () => {
	it("prefers an explicit dev proxy target", () => {
		expect(
			resolveDevApiProxyTarget({
				VITE_DEV_API_TARGET: "http://localhost:4318",
				VITE_API_URL: "http://localhost:9999",
			}),
		).toBe("http://localhost:4318");
	});

	it("does not reuse the browser API URL for the dev proxy target", () => {
		expect(
			resolveDevApiProxyTarget({
				VITE_API_URL: "https://api.pebbledesk.app",
			}),
		).toBe("http://127.0.0.1:8790");
	});

	it("uses the committed local worker port by default", () => {
		expect(resolveDevApiProxyTarget({})).toBe("http://127.0.0.1:8790");
	});
});
