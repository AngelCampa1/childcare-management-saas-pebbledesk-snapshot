import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const deployApiScript = readFileSync(
	resolve(import.meta.dirname, "../../../scripts/cloudflare/deploy-api.ps1"),
	"utf8",
);

describe("API deploy production database guardrails", () => {
	it("does not connect to the production database or deploy after decommissioning", () => {
		expect(deployApiScript).toContain("PebbleDesk has been decommissioned");
		expect(deployApiScript).toContain("Refusing to deploy");
		expect(deployApiScript).not.toContain("wrangler deploy");
		expect(deployApiScript).not.toContain("PEBBLEDESK_PRODUCTION_DATABASE_URL");
		expect(deployApiScript).not.toContain("Import-RootEnvLocalValue");
		expect(deployApiScript).not.toContain("DATABASE_URL");
		expect(deployApiScript).not.toContain("pnpm db:migrate");
		expect(deployApiScript).not.toContain("pnpm db:verify:production-schema");
	});
});
