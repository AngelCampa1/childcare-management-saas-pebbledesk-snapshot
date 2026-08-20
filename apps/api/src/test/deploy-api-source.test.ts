import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const deployApiPath = resolve(process.cwd(), "../../scripts/cloudflare/deploy-api.ps1");
const apiPackagePath = resolve(process.cwd(), "package.json");

describe("API deployment script", () => {
	it("refuses to recreate the retired API Worker", () => {
		const source = readFileSync(deployApiPath, "utf-8");
		const packageSource = readFileSync(apiPackagePath, "utf-8");

		expect(packageSource).toContain("../../scripts/cloudflare/deploy-api.ps1");
		expect(packageSource).not.toContain('"build": "wrangler deploy --dry-run --outdir dist"');
		expect(packageSource).not.toContain('"deploy": "wrangler deploy --env production"');
		expect(source).toContain("PebbleDesk has been decommissioned");
		expect(source).toContain("Refusing to deploy");
		expect(source).not.toContain("wrangler deploy");
		expect(source).not.toContain("PEBBLEDESK_PRODUCTION_DATABASE_URL");
		expect(source).not.toContain("pnpm db:migrate");
		expect(source).not.toContain("pnpm db:verify:production-schema");
		expect(source).not.toContain("wrangler d1 migrations apply");
	});
});
