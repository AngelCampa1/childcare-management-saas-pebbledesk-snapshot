import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const deploySitePath = resolve(process.cwd(), "../../scripts/cloudflare/deploy-site.ps1");
const sitePackagePath = resolve(process.cwd(), "package.json");

describe("marketing site deployment script", () => {
	it("refuses to recreate the retired marketing Worker", () => {
		const source = readFileSync(deploySitePath, "utf-8");
		const packageSource = readFileSync(sitePackagePath, "utf-8");

		expect(packageSource).toContain("../../scripts/cloudflare/deploy-site.ps1");
		expect(packageSource).not.toContain("pnpm run build && pnpm exec wrangler deploy");
		expect(source).toContain("PebbleDesk has been decommissioned");
		expect(source).toContain("Refusing to deploy");
		expect(source).not.toContain("wrangler deploy");
		expect(source).not.toContain("pnpm --filter @pebbledesk/site build");
		expect(source).not.toContain("Publish-LeadMagnetAssets");
		expect(source).not.toContain("wrangler r2 object put");
		expect(source).not.toContain("wrangler d1 migrations apply");
		expect(source).not.toContain("TURNSTILE_SECRET_KEY");
		expect(source).not.toContain("PUBLIC_SENTRY_DSN");
	});
});
