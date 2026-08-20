import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("marketing worker brand source", () => {
	it("uses shared public brand knowledge for first-party origins and contact details", () => {
		const source = readFileSync(resolve(process.cwd(), "src/worker.ts"), "utf8");

		expect(source).toContain("PUBLIC_BRAND_KNOWLEDGE");
		expect(source).not.toContain('const CANONICAL_HOST = "pebbledesk.app"');
		expect(source).not.toContain('new URL(value, "https://pebbledesk.app")');
		expect(source).not.toContain('"https://pebbledesk.app/contact/"');
		expect(source).not.toContain('"Founder sales contact: hello@pebbledesk.app."');
		expect(source).not.toContain("`https://my.pebbledesk.app/signup?");
		expect(source).not.toContain("`https://pebbledesk.app/api/unsubscribe?");
	});
});
