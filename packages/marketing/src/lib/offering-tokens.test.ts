import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getSupportedOfferingTokens, resolveOfferingTokens } from "./offering-tokens";

describe("getSupportedOfferingTokens", () => {
	it("returns at least 10 tokens", () => {
		const tokens = getSupportedOfferingTokens();
		expect(tokens.length).toBeGreaterThanOrEqual(10);
	});

	it("includes expected plan tokens", () => {
		const tokens = getSupportedOfferingTokens();
		expect(tokens).toContain("{{plan.home.label}}");
		expect(tokens).toContain("{{plan.center_starter.label}}");
		expect(tokens).toContain("{{plan.center_pro.label}}");
		expect(tokens).toContain("{{plan.group.label}}");
		expect(tokens).toContain("{{plan.enterprise.label}}");
		expect(tokens).toContain("{{plan.home.priceLabel}}");
		expect(tokens).toContain("{{plan.center_starter.priceLabel}}");
		expect(tokens).toContain("{{plan.center_pro.priceLabel}}");
		expect(tokens).toContain("{{plan.group.priceLabel}}");
		expect(tokens).toContain("{{plan.home.promoPriceLabel}}");
		expect(tokens).toContain("{{plan.home.renewalPriceLabel}}");
		expect(tokens).toContain("{{plan.home.capacityLabel}}");
		expect(tokens).toContain("{{plan.center_starter.capacityLabel}}");
		expect(tokens).toContain("{{plan.center_pro.capacityLabel}}");
		expect(tokens).toContain("{{plan.home.tagline}}");
		expect(tokens).toContain("{{plan.center_starter.tagline}}");
	});

	it("includes promo tokens", () => {
		const tokens = getSupportedOfferingTokens();
		expect(tokens).toContain("{{promo.code}}");
		expect(tokens).toContain("{{promo.label}}");
		expect(tokens).toContain("{{promo.urgencyLabel}}");
		expect(tokens).toContain("{{promo.durationLabel}}");
	});

	it("includes trial and guarantee tokens", () => {
		const tokens = getSupportedOfferingTokens();
		expect(tokens).toContain("{{trial.label}}");
		expect(tokens).toContain("{{trial.days}}");
		expect(tokens).toContain("{{trial.reminderLabel}}");
		expect(tokens).toContain("{{trial.disclosure}}");
		expect(tokens).toContain("{{trial.startDisclosure}}");
		expect(tokens).toContain("{{guarantee.label}}");
		expect(tokens).toContain("{{guarantee.days}}");
	});

	it("includes shared claim tokens", () => {
		const tokens = getSupportedOfferingTokens();
		expect(tokens).toContain("{{claim.onlineOnlyV1}}");
		expect(tokens).toContain("{{claim.stateSupport}}");
		expect(tokens).toContain("{{claim.migrationSupport}}");
		expect(tokens).toContain("{{claim.quickBooksSupport}}");
	});

	it("includes brand tokens", () => {
		const tokens = getSupportedOfferingTokens();
		expect(tokens).toContain("{{brand.publicOrigin}}");
		expect(tokens).toContain("{{brand.appOrigin}}");
		expect(tokens).toContain("{{brand.domain}}");
	});

	it("includes positioning tokens", () => {
		const tokens = getSupportedOfferingTokens();
		expect(tokens).toContain("{{positioning.tagline}}");
		expect(tokens).toContain("{{positioning.targetAudience}}");
	});
});

describe("resolveOfferingTokens", () => {
	it("returns unchanged string with no tokens", () => {
		expect(resolveOfferingTokens("Hello world")).toBe("Hello world");
	});

	it("resolves {{plan.home.label}}", () => {
		const result = resolveOfferingTokens("Plan: {{plan.home.label}}");
		expect(result).toBe("Plan: Home");
	});

	it("resolves {{plan.center_starter.label}}", () => {
		const result = resolveOfferingTokens("{{plan.center_starter.label}}");
		expect(result).toBe("Center Starter");
	});

	it("resolves {{plan.center_pro.label}}", () => {
		const result = resolveOfferingTokens("{{plan.center_pro.label}}");
		expect(result).toBe("Center Pro");
	});

	it("resolves {{plan.group.label}}", () => {
		const result = resolveOfferingTokens("{{plan.group.label}}");
		expect(result).toBe("Group");
	});

	it("resolves {{plan.enterprise.label}}", () => {
		const result = resolveOfferingTokens("{{plan.enterprise.label}}");
		expect(result).toBe("Enterprise");
	});

	it("resolves {{plan.enterprise.priceLabel}}", () => {
		const result = resolveOfferingTokens("Price: {{plan.enterprise.priceLabel}}");
		expect(result).toBe("Price: Custom");
	});

	it("resolves price labels to non-empty strings containing /mo", () => {
		for (const id of ["home", "center_starter", "center_pro", "group"] as const) {
			const result = resolveOfferingTokens(`{{plan.${id}.priceLabel}}`);
			expect(result).toBeTruthy();
			expect(result).toContain("/mo");
			expect(result).toContain("then");
		}
	});

	it("resolves separate promo and renewal price labels", () => {
		expect(resolveOfferingTokens("{{plan.home.promoPriceLabel}}")).toBe("$8/mo when paid yearly");
		expect(resolveOfferingTokens("{{plan.home.renewalPriceLabel}}")).toBe(
			"Then $39/mo when paid yearly ($468/year)",
		);
	});

	it("resolves taglines to non-empty strings", () => {
		for (const id of ["home", "center_starter", "center_pro", "group", "enterprise"] as const) {
			const result = resolveOfferingTokens(`{{plan.${id}.tagline}}`);
			expect(result).toBeTruthy();
		}
	});

	it("resolves capacity labels from shared plan entitlements", () => {
		expect(resolveOfferingTokens("{{plan.home.capacityLabel}}")).toBe("up to 15 active children");
		expect(resolveOfferingTokens("{{plan.center_starter.capacityLabel}}")).toBe(
			"up to 50 active children",
		);
		expect(resolveOfferingTokens("{{plan.center_pro.capacityLabel}}")).toBe(
			"up to 100 active children",
		);
	});

	it("resolves {{promo.code}}", () => {
		const result = resolveOfferingTokens("Use {{promo.code}} at checkout");
		expect(result).toBe("Use Y80OFF at checkout");
	});

	it("resolves {{trial.label}}", () => {
		const result = resolveOfferingTokens("Start your {{trial.label}}");
		expect(result).toContain("free trial");
	});

	it("resolves {{trial.days}} to a numeric string", () => {
		const result = resolveOfferingTokens("{{trial.days}} days");
		expect(Number(result.split(" ")[0])).toBeGreaterThan(0);
	});

	it("resolves trial disclosure tokens", () => {
		expect(resolveOfferingTokens("{{trial.reminderLabel}}")).toBe(
			"We email you 3 days before the trial ends.",
		);
		expect(resolveOfferingTokens("{{trial.disclosure}}")).toBe(
			"30-day free trial. No credit card required. We email you 3 days before the trial ends.",
		);
		expect(resolveOfferingTokens("{{trial.startDisclosure}}")).toBe(
			"Start your 30-day free trial. No credit card required. We email you 3 days before the trial ends.",
		);
	});

	it("resolves {{guarantee.label}}", () => {
		const result = resolveOfferingTokens("{{guarantee.label}}");
		expect(result).toContain("money-back guarantee");
	});

	it("resolves shared claim tokens", () => {
		expect(resolveOfferingTokens("{{claim.onlineOnlyV1}}")).toBe(
			"PebbleDesk is online-only in V1. Centers should keep a temporary outage fallback.",
		);
		expect(resolveOfferingTokens("{{claim.stateSupport}}")).toContain(
			"verified state-specific ratio and licensing-report support today for Texas, California, and Florida",
		);
		expect(resolveOfferingTokens("{{claim.migrationSupport}}")).toContain("Brightwheel");
		expect(resolveOfferingTokens("{{claim.quickBooksSupport}}")).toBe(
			"QuickBooks support is available on qualifying setups.",
		);
	});

	it("resolves brand tokens from public brand knowledge", () => {
		expect(resolveOfferingTokens("{{brand.publicOrigin}}")).toBe("https://pebbledesk.app");
		expect(resolveOfferingTokens("{{brand.appOrigin}}")).toBe("https://my.pebbledesk.app");
		expect(resolveOfferingTokens("{{brand.domain}}")).toBe("pebbledesk.app");
	});

	it("resolves multiple tokens in a single string", () => {
		const result = resolveOfferingTokens(
			"{{plan.center_starter.label}} at {{plan.center_starter.priceLabel}}",
		);
		expect(result).toBe(
			`Center Starter at ${resolveOfferingTokens("{{plan.center_starter.priceLabel}}")}`,
		);
	});

	it("resolves mid-sentence token", () => {
		const result = resolveOfferingTokens(
			"Plans start at {{plan.home.priceLabel}} for home programs.",
		);
		expect(result).not.toContain("{{");
		expect(result).not.toContain("}}");
		expect(result).toContain("Plans start at");
	});

	it("throws for unknown token", () => {
		expect(() => resolveOfferingTokens("{{plan.unknown.priceLabel}}")).toThrow();
	});

	it("throws for malformed partial token that matches pattern", () => {
		expect(() => resolveOfferingTokens("{{totally.unknown}}")).toThrow();
	});

	it("does not mutate strings without tokens", () => {
		const input = "No tokens here. $200/month. Center Starter.";
		expect(resolveOfferingTokens(input)).toBe(input);
	});
});

describe("regression: no old launch pricing literals remain in content files", () => {
	it("content collection markdown files contain no raw old launch pricing literals", async () => {
		// process.cwd() is packages/marketing/ when vitest runs via pnpm test
		const siteDir = resolve(process.cwd(), "../../apps/site/src/content");

		// Fail loudly if the content directory doesn't exist; a silent pass masks wrong cwd.
		try {
			await readdir(siteDir);
		} catch {
			throw new Error(
				`Content directory not found at ${siteDir}. Ensure vitest is invoked from packages/marketing/ (via pnpm test, not from the monorepo root).`,
			);
		}

		const bannedLiteral = new RegExp(`current LAUNCH${50} pricing`, "i");
		const violations: string[] = [];

		async function scanDir(dir: string): Promise<void> {
			let entries: string[];
			try {
				entries = await readdir(dir);
			} catch {
				return;
			}
			await Promise.all(
				entries.map(async (entry) => {
					const fullPath = join(dir, entry);
					if (entry.endsWith(".md") || entry.endsWith(".mdx")) {
						const contents = await readFile(fullPath, "utf8");
						if (bannedLiteral.test(contents)) {
							violations.push(fullPath.replace(siteDir, ""));
						}
					} else if (!entry.includes(".")) {
						await scanDir(fullPath);
					}
				}),
			);
		}

		await scanDir(siteDir);
		expect(
			violations,
			`Files still containing raw old launch pricing literals:\n${violations.join("\n")}`,
		).toHaveLength(0);
	});

	it("content collection markdown files use capacity tokens for PebbleDesk plan caps", async () => {
		const siteDir = resolve(process.cwd(), "../../apps/site/src/content");
		const bannedPatterns = [
			/{{plan\.home\.[^}]+}}[^.\n]*up to 15 children/i,
			/Home plan[^.\n]*up to 15 children/i,
			/Home tier[^.\n]*up to 15 children/i,
			/{{plan\.center_starter\.[^}]+}}[^.\n]*up to 50 active children/i,
			/Center Starter[^.\n]*up to 50 active children/i,
			/{{plan\.center_pro\.[^}]+}}[^.\n]*up to 100 active children/i,
			/Center Pro[^.\n]*up to 100 active children/i,
		];
		const violations: string[] = [];

		async function scanDir(dir: string): Promise<void> {
			let entries: string[];
			try {
				entries = await readdir(dir);
			} catch {
				return;
			}
			await Promise.all(
				entries.map(async (entry) => {
					const fullPath = join(dir, entry);
					if (entry.endsWith(".md") || entry.endsWith(".mdx")) {
						const contents = await readFile(fullPath, "utf8");
						if (bannedPatterns.some((pattern) => pattern.test(contents))) {
							violations.push(fullPath.replace(siteDir, ""));
						}
					} else if (!entry.includes(".")) {
						await scanDir(fullPath);
					}
				}),
			);
		}

		await scanDir(siteDir);
		expect(
			violations,
			`Files still containing raw PebbleDesk capacity claims:\n${violations.join("\n")}`,
		).toHaveLength(0);
	});

	it("active feature content uses shared claim tokens for first-party boundaries", async () => {
		const siteDir = resolve(process.cwd(), "../../apps/site/src/content");
		const requiredTokensByFile = new Map([
			["features/attendance-tracking.md", ["{{claim.onlineOnlyV1}}"]],
			["features/audit-reports.md", ["{{claim.onlineOnlyV1}}"]],
			["features/messaging-alerts.md", ["{{claim.onlineOnlyV1}}"]],
			["features/ratio-tracking.md", ["{{claim.stateSupport}}"]],
			["features/subsidy-billing.md", ["{{claim.stateSupport}}"]],
			["features/imports-migration.md", ["{{claim.migrationSupport}}"]],
			["features/enrollment-records.md", ["{{claim.migrationSupport}}"]],
			["features/billing-payments.md", ["{{claim.quickBooksSupport}}"]],
			["alternatives/jackrabbit-care-alternative.md", ["{{claim.quickBooksSupport}}"]],
		]);
		const missing: string[] = [];

		for (const [relativePath, requiredTokens] of requiredTokensByFile) {
			const source = await readFile(join(siteDir, relativePath), "utf8");
			for (const token of requiredTokens) {
				if (!source.includes(token)) {
					missing.push(`${relativePath}: ${token}`);
				}
			}
		}

		expect(
			missing,
			`Active content files missing shared first-party claim tokens:\n${missing.join("\n")}`,
		).toHaveLength(0);
	});
});
