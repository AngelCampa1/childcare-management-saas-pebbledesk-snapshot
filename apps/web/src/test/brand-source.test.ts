import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "..");

describe("web brand source usage", () => {
	it("uses shared public brand knowledge for marketing terms and privacy origins", () => {
		const source = readFileSync(resolve(appRoot, "routes/signup.tsx"), "utf8");

		expect(source).toContain("PUBLIC_BRAND_KNOWLEDGE.publicOrigin");
		expect(source).not.toContain('"https://pebbledesk.app"');
	});
});
