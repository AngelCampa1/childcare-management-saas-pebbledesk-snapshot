import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const wranglerConfigPath = resolve(process.cwd(), "wrangler.jsonc");
const indexPath = resolve(process.cwd(), "src", "index.ts");
const retiredPromotionRefreshJob = ["launch", "promo", "refresh"].join("-");

describe("API wrangler production config", () => {
	it("keeps the retired API Worker config detached from custom domains and bindings", () => {
		const source = readFileSync(wranglerConfigPath, "utf-8");

		expect(source).toContain("PebbleDesk has been decommissioned");
		expect(source).not.toContain('"name": "pebbledesk-api"');
		expect(source).not.toContain('"main"');
		expect(source).not.toContain('"pattern": "api.pebbledesk.app"');
		expect(source).not.toContain('"custom_domain": true');
		expect(source).not.toContain('"pattern": "api.pebbledesk.app/*"');
		expect(source).not.toContain('"zone_name": "pebbledesk.app"');
		expect(source).not.toContain('"R2_PUBLIC_URL"');
		expect(source).not.toContain('"DATABASE_URL"');
		expect(source).not.toContain('"HYPERDRIVE"');
		expect(source).not.toContain('"durable_objects"');
		expect(source).not.toContain('"migrations"');
		expect(source).not.toContain("RateLimiterDO");
		expect(source).not.toContain('"MARKETING_DB"');
		expect(source).not.toContain('"REPORTS_BUCKET"');
		expect(source).not.toContain('"LEAD_MAGNETS_BUCKET"');
		expect(source).not.toContain('"crons"');
		expect(source).not.toContain("signup-trial-dispatcher");
		expect(source).not.toContain(retiredPromotionRefreshJob);
		expect(source).not.toContain("trial-expirer");
	});

	it("does not retain the retired promotion refresh scheduled handler", () => {
		const source = readFileSync(indexPath, "utf-8");

		expect(source).not.toContain('"0 * * * *"');
		expect(source).not.toContain("runLaunchPromoRefresh");
		expect(source).not.toContain(retiredPromotionRefreshJob);
	});
});
