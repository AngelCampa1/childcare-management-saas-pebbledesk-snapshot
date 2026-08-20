import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

function readRepoFile(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

describe("production readiness Sentry status", () => {
	it("marks Sentry launch setup as retired external cleanup risk", () => {
		const readiness = readRepoFile("docs/production-readiness.md");
		const goLiveChecklist = readRepoFile(
			"docs/go-live-manual-checklist.md",
		);

		expect(readiness).toContain("RETIRED RUNBOOK");
		expect(readiness).toContain("unverified Stripe, Sentry, PostHog, Resend");
		expect(goLiveChecklist).toContain("RETIRED RUNBOOK");
		expect(readiness).not.toContain("Sentry wired in Worker, web, and site");
		expect(goLiveChecklist).not.toContain("the code does **not** currently ship with Sentry");
		expect(goLiveChecklist).not.toContain("wire the Sentry SDK into all three apps");
		expect(goLiveChecklist).not.toContain("Add DSNs to:");
		expect(goLiveChecklist).not.toContain("enable Cloudflare Web Analytics");
	});
});
