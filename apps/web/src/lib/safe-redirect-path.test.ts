import { describe, expect, it } from "vitest";
import { sanitizeRedirectPath } from "./safe-redirect-path";

describe("sanitizeRedirectPath", () => {
	it("returns /dashboard for undefined", () => {
		expect(sanitizeRedirectPath(undefined)).toBe("/dashboard");
	});

	it("returns /dashboard for empty string", () => {
		expect(sanitizeRedirectPath("")).toBe("/dashboard");
	});

	it("returns /dashboard for absolute URL with ://", () => {
		expect(sanitizeRedirectPath("https://evil.com")).toBe("/dashboard");
	});

	it("returns /dashboard for http absolute URL", () => {
		expect(sanitizeRedirectPath("http://evil.com/steal")).toBe("/dashboard");
	});

	it("returns /dashboard for protocol-relative path starting with //", () => {
		expect(sanitizeRedirectPath("//evil.com")).toBe("/dashboard");
	});

	it("returns /dashboard for backslash-prefixed path", () => {
		expect(sanitizeRedirectPath("/\\evil")).toBe("/dashboard");
	});

	it("returns /dashboard for path containing javascript:", () => {
		expect(sanitizeRedirectPath("/foo?javascript:alert(1)")).toBe("/dashboard");
	});

	it("returns /dashboard for javascript: without leading slash", () => {
		expect(sanitizeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
	});

	it("returns /dashboard for path containing newline", () => {
		expect(sanitizeRedirectPath("/billing\nX-Injected: header")).toBe("/dashboard");
	});

	it("returns /dashboard for path containing carriage return", () => {
		expect(sanitizeRedirectPath("/billing\rX-Injected: header")).toBe("/dashboard");
	});

	it("returns the path as-is for /billing", () => {
		expect(sanitizeRedirectPath("/billing")).toBe("/billing");
	});

	it("returns the path as-is for /dashboard", () => {
		expect(sanitizeRedirectPath("/dashboard")).toBe("/dashboard");
	});

	it("returns the path as-is for /ratios", () => {
		expect(sanitizeRedirectPath("/ratios")).toBe("/ratios");
	});

	it("returns / for the root path", () => {
		expect(sanitizeRedirectPath("/")).toBe("/");
	});

	it("returns /billing?foo=bar for a path with query string", () => {
		expect(sanitizeRedirectPath("/billing?foo=bar")).toBe("/billing?foo=bar");
	});

	it("returns /dashboard for a path without a leading slash", () => {
		expect(sanitizeRedirectPath("no-leading-slash")).toBe("/dashboard");
	});

	it("returns /dashboard for a path containing :// after a leading slash", () => {
		expect(sanitizeRedirectPath("/foo://bar")).toBe("/dashboard");
	});

	// Scheme-injection hardening
	it("returns /dashboard for vbscript: without leading slash", () => {
		expect(sanitizeRedirectPath("vbscript:msgbox(1)")).toBe("/dashboard");
	});

	it("returns /dashboard for vbscript: injected after a leading slash", () => {
		expect(sanitizeRedirectPath("/vbscript:msgbox(1)")).toBe("/dashboard");
	});

	it("returns /dashboard for vbscript: with mixed case", () => {
		expect(sanitizeRedirectPath("/VbScript:msgbox(1)")).toBe("/dashboard");
	});

	it("returns /dashboard for data: URI without leading slash", () => {
		expect(sanitizeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe("/dashboard");
	});

	it("returns /dashboard for data: injected after a leading slash", () => {
		expect(sanitizeRedirectPath("/data:text/html,evil")).toBe("/dashboard");
	});

	it("returns /dashboard for data: with mixed case", () => {
		expect(sanitizeRedirectPath("/DATA:text/html,evil")).toBe("/dashboard");
	});

	it("returns /dashboard for javascript: with mixed case injected after a slash", () => {
		expect(sanitizeRedirectPath("/JavaScript:alert(1)")).toBe("/dashboard");
	});

	it("returns /dashboard for double-slash open-redirect //evil.com", () => {
		expect(sanitizeRedirectPath("//evil.com")).toBe("/dashboard");
	});

	it("returns /dashboard for backslash open-redirect \\\\evil.com (no leading slash)", () => {
		expect(sanitizeRedirectPath("\\\\evil.com")).toBe("/dashboard");
	});

	it("returns /dashboard for backslash open-redirect /\\\\evil.com", () => {
		expect(sanitizeRedirectPath("/\\\\evil.com")).toBe("/dashboard");
	});
});
