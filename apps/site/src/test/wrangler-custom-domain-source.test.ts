import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("marketing site Worker custom domain config", () => {
	it("does not retain marketing custom domains after decommissioning", () => {
		const source = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");

		expect(source).not.toContain('"pattern": "pebbledesk.app"');
		expect(source).not.toContain('"pattern": "www.pebbledesk.app"');
		expect(source).not.toContain('"custom_domain": true');
		expect(source).not.toContain('"pattern": "pebbledesk.app/*"');
		expect(source).not.toContain('"pattern": "www.pebbledesk.app/*"');
		expect(source).not.toContain('"zone_name": "pebbledesk.app"');
	});
});
