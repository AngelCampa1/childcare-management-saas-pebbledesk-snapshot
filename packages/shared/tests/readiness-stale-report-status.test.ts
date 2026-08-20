import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

function readRepoFile(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

describe("readiness historical report status", () => {
	it("marks superseded implementation reports as historical instead of current blockers", () => {
		const internalLinkingReport = readRepoFile("docs/internal-linking-report.md");
		const productionE2eReport = readRepoFile("docs/qa/production-e2e-bug-report-2026-05-07.md");
		const readiness = readRepoFile("docs/production-readiness.md");

		expect(internalLinkingReport).toContain("Status: Historical report");
		expect(internalLinkingReport).toContain("Merged to `master` and deployed");
		expect(internalLinkingReport).not.toContain("Blocking Before Merge/Deploy");
		expect(internalLinkingReport).not.toContain("not yet merged or deployed");

		expect(productionE2eReport).toContain("Status: Historical report");
		expect(productionE2eReport).toContain("superseded by the full production sweep");
		expect(productionE2eReport).not.toContain("redeployment is blocked");
		expect(productionE2eReport).not.toContain("final redeploy blocked");
		expect(productionE2eReport).not.toContain(
			"Production currently still needs a successful site redeploy",
		);
		expect(productionE2eReport).not.toContain("currently blocked");
		expect(productionE2eReport).not.toContain(" is blocked");
		expect(productionE2eReport).not.toContain("remains blocked");

		expect(readiness).toContain("RETIRED RUNBOOK");
		expect(readiness).toContain("PebbleDesk has been decommissioned");
		expect(readiness).not.toContain("serves production R2 assets");
		expect(readiness).not.toContain(
			"[ ] **Blocker** - `cdn.pebbledesk.app` attached to the production R2 bucket and stored as `R2_PUBLIC_URL`.",
		);
	});
});
