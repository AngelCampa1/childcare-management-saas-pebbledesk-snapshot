import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("web Cloudflare Worker deployment config", () => {
	it("refuses to recreate the retired web Worker", () => {
		const packageSource = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
		const deployScriptSource = readFileSync(
			resolve(process.cwd(), "../../scripts/cloudflare/deploy-web.ps1"),
			"utf8",
		);

		expect(packageSource).toContain("scripts/cloudflare/deploy-web.ps1");
		expect(packageSource).not.toContain("wrangler pages deploy");
		expect(deployScriptSource).toContain("PebbleDesk has been decommissioned");
		expect(deployScriptSource).toContain("Refusing to deploy");
		expect(deployScriptSource).not.toContain("wrangler deploy");
		expect(deployScriptSource).not.toContain("pnpm --filter @pebbledesk/web build");
		expect(deployScriptSource).not.toContain("wrangler pages deploy");
		expect(deployScriptSource).not.toContain("--project-name");
	});

	it("keeps the retired web Worker config detached from the app custom domain", () => {
		const wranglerSource = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");

		expect(wranglerSource).toContain("PebbleDesk has been decommissioned");
		expect(wranglerSource).not.toContain('"name": "pebbledesk-web"');
		expect(wranglerSource).not.toContain('"main"');
		expect(wranglerSource).not.toContain('"assets"');
		expect(wranglerSource).not.toContain('"directory": "./dist"');
		expect(wranglerSource).not.toContain('"run_worker_first": true');
		expect(wranglerSource).not.toContain('"pattern": "my.pebbledesk.app"');
		expect(wranglerSource).not.toContain('"custom_domain": true');
		expect(wranglerSource).not.toContain("VITE_POSTHOG_KEY");
		expect(wranglerSource).not.toContain("pages_build_output_dir");
	});
});
