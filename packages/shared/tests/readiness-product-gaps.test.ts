import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

function readRepoFile(path: string) {
	return readFileSync(join(repoRoot, path), "utf8");
}

describe("production readiness product gaps", () => {
	it("marks launch readiness docs as retired instead of current product gap trackers", () => {
		const readiness = readRepoFile("docs/production-readiness.md");
		const featureGaps = readRepoFile("docs/feature-gaps.md");
		const goLiveChecklist = readRepoFile(
			"docs/go-live-manual-checklist.md",
		);

		expect(readiness).toContain("RETIRED RUNBOOK");
		expect(readiness).toContain("PebbleDesk has been decommissioned");
		expect(goLiveChecklist).toContain("RETIRED RUNBOOK");
		expect(goLiveChecklist).toContain("PebbleDesk has been decommissioned");
		expect(readiness).not.toContain("## 4. Product Gaps");
		expect(readiness).not.toContain("- [ ] **Blocker** - Password change UI in settings.");
		expect(readiness).not.toContain("- [ ] **Soft** - Account deletion flow.");
		expect(readiness).not.toContain("- [ ] **Soft** - Bulk invoice actions.");
		expect(goLiveChecklist).not.toContain("Messages are send-only (no inbound replies)");
		expect(goLiveChecklist).not.toContain("No in-app account deletion flow");
		expect(goLiveChecklist).not.toContain("No in-app password change UI");

		expect(featureGaps).toContain("Account deletion is support-mediated");
		expect(featureGaps).toContain("Billing supports multi-select batch send");
	});
});
