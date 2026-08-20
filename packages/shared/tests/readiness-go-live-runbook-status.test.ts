import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

function readRepoFile(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

describe("go-live external setup runbook status", () => {
	it("marks old go-live runbooks as retired non-operational records", () => {
		const runbook = readRepoFile("docs/go-live-external-setup-runbook.md");
		const checklist = readRepoFile("docs/go-live-manual-checklist.md");
		const missingSteps = readRepoFile("docs/go-live-missing-steps.md");
		const fillValues = readRepoFile("docs/go-live-fill-values.md");

		for (const source of [runbook, checklist, missingSteps, fillValues]) {
			expect(source).toContain("RETIRED RUNBOOK");
			expect(source).toContain("PebbleDesk has been decommissioned");
			expect(source).toContain("docs/decommissioning/2026-06-11-pebbledesk-shutdown.md");
			expect(source).not.toContain("wrangler secret put");
			expect(source).not.toContain("wrangler deploy");
			expect(source).not.toContain("Attach this to the Worker");
			expect(source).not.toContain("Cloudflare resources already created");
		}
	});

	it("marks Stripe setup docs as retired instead of operational setup steps", () => {
		const docs = readRepoFile("docs/stripe-setup.md");

		expect(docs).toContain("RETIRED RUNBOOK");
		expect(docs).toContain("PebbleDesk has been decommissioned");
		expect(docs).toContain("docs/decommissioning/2026-06-11-pebbledesk-shutdown.md");
		expect(docs).not.toContain("wrangler secret put");
		expect(docs).not.toContain("Stripe Dashboard");
	});
});
