import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const wranglerConfigPath = resolve(process.cwd(), "wrangler.jsonc");
describe("marketing Worker D1 config", () => {
	it("keeps the retired marketing Worker config detached from domains and bindings", () => {
		const source = readFileSync(wranglerConfigPath, "utf-8");

		expect(source).toContain("PebbleDesk has been decommissioned");
		expect(source).not.toContain('"name": "pebbledesk-site"');
		expect(source).not.toContain('"main"');
		expect(source).not.toContain('"routes"');
		expect(source).not.toContain('"custom_domain": true');
		expect(source).not.toContain('"compatibility_flags": ["nodejs_compat"]');
		expect(source).not.toContain('"binding": "ASSETS"');
		expect(source).not.toContain('"run_worker_first": true');
		expect(source).not.toContain('"MARKETING_FROM_EMAIL"');
		expect(source).not.toContain('"R2_PUBLIC_URL"');
		expect(source).not.toContain('"binding": "MARKETING_DB"');
		expect(source).not.toContain('"database_name": "pebbledesk-db"');
		expect(source).not.toContain('"database_id": "72cdf01e-5eb0-45b3-840c-35edd0e2e22f"');
		expect(source).not.toContain('"migrations_dir": "migrations"');
		expect(source).not.toContain('"SEQUENCER_BASE_URL"');
		expect(source).not.toContain('"*/15 * * * *"');
		expect(source).not.toContain('"0 * * * *"');
	});

	it("does not register local app signup trial sequence state requirements", () => {
		const source = readFileSync(wranglerConfigPath, "utf-8");

		const retiredTable = ["marketing", "app", "signup", "scheduled", "sends"].join("_");
		expect(source).not.toContain(retiredTable);
	});
});
