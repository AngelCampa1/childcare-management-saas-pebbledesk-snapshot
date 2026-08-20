import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const deployProjectPath = resolve(process.cwd(), "../../scripts/cloudflare/deploy-project.ps1");

describe("Cloudflare touched deploy script", () => {
	it("refuses to recreate retired Cloudflare projects", () => {
		const source = readFileSync(deployProjectPath, "utf-8");

		expect(source).toContain("PebbleDesk has been decommissioned");
		expect(source).toContain("Refusing to deploy");
		expect(source).not.toContain("wrangler deploy");
		expect(source).not.toContain("RunMigrations");
	});
});
