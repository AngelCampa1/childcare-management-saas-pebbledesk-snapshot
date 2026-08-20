import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headersPath = resolve(process.cwd(), "public/_headers");

function readCspDirective(directive: string): string {
	const source = readFileSync(headersPath, "utf-8");
	const cspLine = source
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.startsWith("Content-Security-Policy:"));
	expect(cspLine, "Content-Security-Policy header must be defined").toBeDefined();
	const policy = (cspLine as string).slice("Content-Security-Policy:".length).trim();
	const match = policy
		.split(";")
		.map((part) => part.trim())
		.find((part) => part === directive || part.startsWith(`${directive} `));
	expect(match, `CSP must define a ${directive} directive`).toBeDefined();
	return match as string;
}

describe("marketing site CSP headers", () => {
	it("allows the Cloudflare Turnstile script so the widget can load", () => {
		expect(readCspDirective("script-src")).toContain("https://challenges.cloudflare.com");
	});

	it("allows the Cloudflare Turnstile challenge iframe to render", () => {
		expect(readCspDirective("frame-src")).toContain("https://challenges.cloudflare.com");
	});
});
