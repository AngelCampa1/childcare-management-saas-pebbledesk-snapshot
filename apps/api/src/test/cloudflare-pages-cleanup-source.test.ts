import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptsRoot = resolve(process.cwd(), "../../scripts/cloudflare");
const repoRoot = resolve(process.cwd(), "../..");

describe("Cloudflare Pages cleanup and bootstrap scripts", () => {
	it("does not create Pages projects during production bootstrap", () => {
		const source = readFileSync(resolve(scriptsRoot, "bootstrap-production.ps1"), "utf8");

		expect(source).toContain("PebbleDesk has been decommissioned");
		expect(source).toContain("Refusing to bootstrap");
		expect(source).not.toContain("wrangler r2 bucket create");
		expect(source).not.toContain("Ensure-PagesProject");
		expect(source).not.toContain("wrangler pages project create");
		expect(source).not.toContain("pebbledesk-web");
		expect(source).not.toContain("pebbledesk-reports");
	});

	it("deletes only confirmed PebbleDesk Pages projects after Worker domain verification", () => {
		const source = readFileSync(resolve(scriptsRoot, "cleanup-pages.ps1"), "utf8");

		expect(source).toContain("Assert-WorkersOwnProductionDomains");
		expect(source).toContain("-WorkerDomainsConfirmed");
		expect(source).toContain("wrangler pages project list --json");
		expect(source).toContain("wrangler pages project delete");
		expect(source).toContain("-ConfirmedProjectNames");
		expect(source).toContain("pebbledesk-web");
		expect(source).toContain("pebbledesk-site");
		expect(source).toContain("pebbledesk");
		expect(source).not.toContain("ideas-validation");
	});

	it("marks old launch runbooks and agent deploy instructions as retired", () => {
		const agents = readFileSync(resolve(repoRoot, "AGENTS.md"), "utf8");
		const missingSteps = readFileSync(resolve(repoRoot, "docs/go-live-missing-steps.md"), "utf8");
		const fillValues = readFileSync(resolve(repoRoot, "docs/go-live-fill-values.md"), "utf8");
		const claude = readFileSync(resolve(repoRoot, "CLAUDE.md"), "utf8");
		const externalSetup = readFileSync(
			resolve(repoRoot, "docs/go-live-external-setup-runbook.md"),
			"utf8",
		);
		const manualChecklist = readFileSync(
			resolve(repoRoot, "docs/go-live-manual-checklist.md"),
			"utf8",
		);

		expect(agents).toContain("PebbleDesk is decommissioned");
		expect(agents).toContain("Do not deploy PebbleDesk Cloudflare projects");
		expect(agents).toContain("Cloudflare cleanup commands are historical only");
		expect(agents).not.toContain(
			"Run `pnpm cf:deploy:touched` after completing work so only projects affected",
		);
		expect(agents).not.toContain(
			"After the Workers custom domains are verified live and Cloudflare inventory confirms",
		);
		expect(claude).toContain("PebbleDesk is decommissioned");
		expect(claude).toContain("Do not deploy PebbleDesk Cloudflare projects");
		expect(claude).not.toContain("Cloudflare Pages");
		expect(missingSteps).toContain("RETIRED RUNBOOK");
		expect(missingSteps).not.toContain("This is the only document you should follow");
		expect(fillValues).toContain("RETIRED RUNBOOK");
		expect(externalSetup).toContain("RETIRED RUNBOOK");
		expect(externalSetup).not.toContain(
			"Use this document for the work that cannot be fully automated",
		);
		expect(manualChecklist).toContain("RETIRED RUNBOOK");
	});
});
