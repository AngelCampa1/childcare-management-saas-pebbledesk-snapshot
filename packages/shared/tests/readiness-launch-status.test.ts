import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

function readRepoFile(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

describe("production readiness launch status", () => {
	it("records PebbleDesk as decommissioned instead of launch-ready", () => {
		const readiness = readRepoFile("docs/production-readiness.md");

		expect(readiness).toContain("RETIRED RUNBOOK");
		expect(readiness).toContain("PebbleDesk has been decommissioned");
		expect(readiness).toContain("docs/decommissioning/2026-06-11-pebbledesk-shutdown.md");
		expect(readiness).not.toContain("is live at `https://api.pebbledesk.app");
		expect(readiness).not.toContain("is live at `https://my.pebbledesk.app");
		expect(readiness).not.toContain("is live at `https://pebbledesk.app");
		expect(readiness).not.toContain("serves production R2 assets");
		expect(readiness).not.toContain("Production database connectivity verified");
	});
});
