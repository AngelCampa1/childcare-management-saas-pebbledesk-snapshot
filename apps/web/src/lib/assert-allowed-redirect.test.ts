import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertAllowedRedirect } from "./assert-allowed-redirect";

describe("assertAllowedRedirect", () => {
	const originalWindow = globalThis.window;

	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: {
				location: {
					origin: "https://my.pebbledesk.app",
				},
			},
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: originalWindow,
			writable: true,
			configurable: true,
		});
	});

	it("allows Stripe checkout URLs", () => {
		expect(() =>
			assertAllowedRedirect("https://checkout.stripe.com/pay/cs_test_abc123"),
		).not.toThrow();
	});

	it("allows Stripe billing portal URLs", () => {
		expect(() =>
			assertAllowedRedirect("https://billing.stripe.com/p/session/abc123"),
		).not.toThrow();
	});

	it("allows Stripe Connect onboarding URLs", () => {
		expect(() =>
			assertAllowedRedirect("https://connect.stripe.com/setup/s/acct_123"),
		).not.toThrow();
	});

	it("allows same-origin URLs", () => {
		expect(() => assertAllowedRedirect("https://my.pebbledesk.app/dashboard")).not.toThrow();
	});

	it("allows same-origin root", () => {
		expect(() => assertAllowedRedirect("https://my.pebbledesk.app/")).not.toThrow();
	});

	it("blocks arbitrary external URLs", () => {
		expect(() => assertAllowedRedirect("https://evil.example.com/steal")).toThrow(
			"Redirect to disallowed origin blocked: https://evil.example.com/steal",
		);
	});

	it("blocks javascript: protocol", () => {
		expect(() => assertAllowedRedirect("javascript:alert(1)")).toThrow(
			"Redirect to disallowed origin blocked: javascript:alert(1)",
		);
	});

	it("blocks data: URLs", () => {
		expect(() => assertAllowedRedirect("data:text/html,<script>alert(1)</script>")).toThrow(
			"Redirect to disallowed origin blocked",
		);
	});

	it("blocks malformed URLs", () => {
		expect(() => assertAllowedRedirect("not a url")).toThrow(
			"Redirect to disallowed origin blocked: not a url",
		);
	});

	it("blocks http (non-https) Stripe lookalike", () => {
		expect(() => assertAllowedRedirect("http://checkout.stripe.com/pay/cs_test_abc123")).toThrow(
			"Redirect to disallowed origin blocked",
		);
	});

	it("blocks URLs that merely contain an allowed prefix substring", () => {
		expect(() =>
			assertAllowedRedirect("https://evil.com/?redirect=https://checkout.stripe.com"),
		).toThrow("Redirect to disallowed origin blocked");
	});

	it("blocks hostile origins that start with an allowed Stripe host name", () => {
		expect(() =>
			assertAllowedRedirect("https://connect.stripe.com.evil.example/setup/s/acct_123"),
		).toThrow("Redirect to disallowed origin blocked");
	});
});
