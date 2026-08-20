import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const siteRoot = fileURLToPath(new URL("../..", import.meta.url));
const repoRoot = join(siteRoot, "..", "..");
const scannedFiles = [
	join(siteRoot, "src", "config", "site.ts"),
	join(siteRoot, "src", "pages", "pricing.astro"),
	join(siteRoot, "src", "pages", "resources", "guides", "[...page].astro"),
	join(siteRoot, "src", "pages", "resources", "best", "[...page].astro"),
	join(siteRoot, "src", "pages", "childcare-software", "[slug].astro"),
	join(siteRoot, "public", "pricing.md"),
];
const stalePriceScannedFiles = [
	...scannedFiles,
	join(repoRoot, "apps", "web", "src", "components", "plan-picker.tsx"),
	join(repoRoot, "apps", "web", "src", "components", "subscription-required.tsx"),
	join(repoRoot, "packages", "marketing", "src", "components", "pricing-cards.tsx"),
	join(repoRoot, "docs", "go-live-external-setup-runbook.md"),
	join(repoRoot, "docs", "go-live-fill-values.md"),
	join(repoRoot, "docs", "go-live-missing-steps.md"),
	join(repoRoot, "docs", "stripe-setup.md"),
	join(repoRoot, "docs", "pebbledesk-pricing.md"),
	join(repoRoot, "docs", "getting-badges", "README.md"),
	join(repoRoot, "docs", "getting-badges", "requirements-matrix.md"),
	join(repoRoot, "docs", "getting-badges", "review-notes.md"),
];
const contentRoot = join(siteRoot, "src", "content");
const thisTestPath = join("apps", "site", "src", "test", "limited-offer-copy-source.test.ts");
const oldOfferCodes = [`LAUNCH${50}`, `LAUNCH${30}`, `LAUNCH${15}`];
const oldLaunchOfferPattern = new RegExp(["launch", "offer"].join(" "), "i");
const oldPromoPattern = new RegExp(["launch", "promotion"].join(" "), "i");
const oldPricingPhrase = `current ${oldOfferCodes[0]} pricing`;
const oldDiscountPhrases = [
	`${50}% off`,
	"50 percent off",
	`${30}% off`,
	"30 percent off",
	`${15}% off`,
	"15 percent off",
	["off", "for", "life"].join(" "),
	`${30}% off the first year`,
	`${30}% off first year`,
];

function findFiles(dir: string, extensions: readonly string[]): string[] {
	return readdirSync(dir)
		.flatMap((entry) => {
			const path = join(dir, entry);
			return statSync(path).isDirectory() ? findFiles(path, extensions) : path;
		})
		.filter((path) => extensions.some((extension) => path.endsWith(extension)))
		.filter((path) => !/\.test\.[cm]?[jt]sx?$/.test(path));
}

function relativePath(path: string): string {
	return path.replace(`${repoRoot}\\`, "").replace(`${repoRoot}/`, "");
}

function markdownTableRows(source: string): { headers: string[]; cells: string[]; line: number }[] {
	const lines = source.split(/\r?\n/);
	const rows: { headers: string[]; cells: string[]; line: number }[] = [];

	for (let index = 0; index < lines.length - 2; index++) {
		const headerLine = lines[index];
		const dividerLine = lines[index + 1];
		if (!headerLine.startsWith("|") || !headerLine.includes("PebbleDesk")) continue;
		if (!/^\|[- :|]+\|$/.test(dividerLine)) continue;

		const headers = headerLine
			.split("|")
			.slice(1, -1)
			.map((cell) => cell.trim());
		for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex++) {
			const rowLine = lines[rowIndex];
			if (!rowLine.startsWith("|")) break;
			rows.push({
				headers,
				cells: rowLine
					.split("|")
					.slice(1, -1)
					.map((cell) => cell.trim()),
				line: rowIndex + 1,
			});
		}
	}

	return rows;
}

function arrayTableRows(source: string): { headers: string[]; cells: string[]; line: number }[] {
	const lines = source.split(/\r?\n/);
	const rows: { headers: string[]; cells: string[]; line: number }[] = [];

	for (let index = 0; index < lines.length; index++) {
		const columnsMatch = lines[index].match(/columns:\s*\[(.+)\]/);
		if (!columnsMatch?.[1]?.includes("PebbleDesk")) continue;

		const headers = [...columnsMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
		for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex++) {
			const line = lines[rowIndex];
			if (/^\S/.test(line)) break;
			if (!line.trimStart().startsWith("- [")) continue;

			rows.push({
				headers,
				cells: [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? ""),
				line: rowIndex + 1,
			});
		}
	}

	return rows;
}

describe("limited offer public copy", () => {
	it("does not ship stale launch codes or old discount copy", () => {
		const files = [
			...findFiles(join(siteRoot, "src"), [".astro", ".ts", ".tsx", ".md", ".mdx"]),
			...findFiles(join(siteRoot, "public"), [".md", ".txt"]),
			...findFiles(join(repoRoot, "packages", "marketing", "src"), [".astro", ".ts", ".tsx"]),
		].filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file));

		for (const file of files) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);

			if (label === thisTestPath) {
				continue;
			}

			for (const code of oldOfferCodes) {
				expect(source, label).not.toContain(code);
			}
			for (const phrase of oldDiscountPhrases) {
				expect(source, label).not.toContain(phrase);
			}
			expect(source, label).not.toContain("May 31, 2026");
		}
	});

	it("uses limited-offer wording for public subscription promotion copy", () => {
		const files = [
			join(siteRoot, "src", "pages", "pricing.astro"),
			join(siteRoot, "public", "pricing.md"),
			...findFiles(join(repoRoot, "packages", "marketing", "src"), [".astro", ".ts", ".tsx"]),
			...findFiles(join(repoRoot, "packages", "shared", "src", "public-knowledge"), [
				".ts",
				".json",
			]),
		].filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file));

		for (const file of files) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);

			expect(source, label).not.toMatch(oldLaunchOfferPattern);
			expect(source, label).not.toMatch(oldPromoPattern);
		}
	});

	it("lists regular renewal prices on the limited-offer terms page", () => {
		const source = readFileSync(join(siteRoot, "src", "pages", "terms.astro"), "utf8");

		expect(source).toContain("formatLimitedOfferTerms");
		expect(source).not.toContain("Home renews at $39/mo when paid yearly ($468/year)");
		expect(source).not.toContain("Center Starter renews at $129/mo when paid yearly ($1548/year)");
		expect(source).not.toContain("Center Pro renews at $199/mo when paid yearly ($2388/year)");
		expect(source).not.toContain("Group renews at $399/mo when paid yearly ($4788/year)");
	});

	it("keeps markdown content from hardcoding PebbleDesk public prices", () => {
		const stalePebbleDeskPriceCellPattern =
			/\$20-50\/mo|\$29\/mo|\$29 Home|\$39 \/ \$129|\$39\/mo|\$39\/month|\$99\/mo|\$99 Center Starter|\$129\/mo|\$159\/mo|\$199\/mo|\$239\/mo|\$399\/mo|\$479\/mo|Flat rate \(\$39/;
		const stalePebbleDeskRowPricePattern = /"\$50"|"\$64"|"\$65"|"\$99"/;
		const staleSourcePricePattern =
			/Home \$39\/mo|Home plan at \$39\/month|Center Starter \$129\/mo|starts at \$39\/mo|\$129\/mo billed annually|Home at \$39\/mo|Center Starter at \$129\/mo/;
		const oldPlanPricesPattern = String.raw`(\$29\/mo|\$99\/mo)`;
		const mixedOldPromoAndStalePricePattern = new RegExp(
			`${oldPricingPhrase}[^\\n]*${oldPlanPricesPattern}|${oldPlanPricesPattern}[^\\n]*${oldPricingPhrase}`,
		);
		const competitorOldPricingPattern = new RegExp(
			[
				`Playground at ${oldPricingPhrase}`,
				`Procare starts at ${oldPricingPhrase}`,
				`Illumine (costs|pays|is approximately) ${oldPricingPhrase}`,
				`iCare[^\\n]*(pays|costs|pay approximately) ${oldPricingPhrase}`,
				`${oldPricingPhrase} on Playground`,
				`${oldPricingPhrase} per additional user`,
				`~${oldPricingPhrase}`,
			].join("|"),
		);

		for (const file of stalePriceScannedFiles) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);

			expect(source, label).not.toMatch(staleSourcePricePattern);
		}

		for (const file of findFiles(join(siteRoot, "src"), [".astro", ".ts", ".tsx", ".md", ".mdx"])) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);
			if (label === thisTestPath) {
				continue;
			}

			expect(source, label).not.toMatch(staleSourcePricePattern);
		}

		for (const file of findFiles(contentRoot, [".md", ".mdx"])) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);

			expect(source, label).not.toMatch(/\["PebbleDesk"[^\n]*\$20-50\/mo/);
			expect(source, label).not.toMatch(/Flat pricing \u2014 \$29 Home/);

			for (const row of [...markdownTableRows(source), ...arrayTableRows(source)]) {
				row.cells.forEach((cell, index) => {
					const header = row.headers[index] ?? "";
					const context = `${label}:${row.line}`;

					if (header.includes("PebbleDesk")) {
						expect(cell, context).not.toMatch(stalePebbleDeskPriceCellPattern);
						return;
					}

					expect(cell, context).not.toContain(oldPricingPhrase);
				});
			}

			for (const line of source.split(/\r?\n/)) {
				if (!line.includes("PebbleDesk")) continue;
				expect(line, label).not.toMatch(mixedOldPromoAndStalePricePattern);
				if (line.includes('"PebbleDesk')) {
					expect(line, label).not.toMatch(stalePebbleDeskRowPricePattern);
				}
			}

			for (const line of source.split(/\r?\n/)) {
				expect(line, label).not.toMatch(competitorOldPricingPattern);
			}
		}
	});

	it("keeps badge docs from hardcoding current limited-offer prices", () => {
		const badgeDocs = [
			join(repoRoot, "docs", "getting-badges", "README.md"),
			join(repoRoot, "docs", "getting-badges", "review-notes.md"),
			join(repoRoot, "docs", "getting-badges", "submission-copy.md"),
			join(repoRoot, "docs", "getting-badges", "requirements-matrix.md"),
		];
		const currentOfferPricePattern = /Home at \$8\/mo|Center Starter at \$26\/mo/;

		for (const file of badgeDocs) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);

			expect(source, label).toContain("apps/site/public/pricing.md");
			expect(source, label).not.toMatch(currentOfferPricePattern);
		}
	});

	it("keeps visible public content free of em dash and en dash characters", () => {
		const files = [
			...findFiles(join(siteRoot, "src", "content"), [".md", ".mdx"]),
			...findFiles(join(siteRoot, "src", "config"), [".ts"]),
			...findFiles(join(siteRoot, "src", "pages"), [".astro", ".ts"]),
			...findFiles(join(siteRoot, "public"), [".md", ".txt"]),
		].filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file));

		for (const file of files) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);

			expect(source, label).not.toMatch(/[\u2014\u2013]/);
			expect(source, label).not.toContain("  -  ");
			expect(source, label).not.toContain("|; |");
			expect(source, label).not.toMatch(/;\s+(without|because|so)\b/);
			expect(source, label).not.toMatch(/;\s+starting\b/);
			expect(source, label).not.toContain("; Updates");
			expect(source, label).not.toContain("written quote required by written quote");
			expect(source, label).not.toContain("prior public entry price");
			expect(source, label).not.toMatch(/\.\s+starting at \{\{plan\./);
			expect(source, label).not.toMatch(/;\s+(before|showing|plus)\b/);
			expect(source, label).not.toMatch(
				/;\s+(CCDF|Pre-K|audit documentation|proactive ratio alerts)\b/,
			);
			expect(source, label).not.toMatch(/;\s+we(?:\s+(?:just|will)|'ll)\b/i);
			expect(source, label).not.toContain("Trustpilot; brightwheel.com");
			expect(source, label).not.toContain("BBB-documented security breach");
			expect(source, label).not.toContain("$2,300/month");
			expect(source, label).not.toMatch(
				/\b\w+;\s+(which|the same|the billing|valuable|paying|justifies)\b/,
			);
		}
	});

	it("keeps evergreen public content from hardcoding third-party review scores", () => {
		const files = [
			...findFiles(join(siteRoot, "src", "content"), [".md", ".mdx"]),
			...findFiles(join(siteRoot, "src", "config"), [".ts"]),
			...findFiles(join(siteRoot, "src", "pages"), [".astro", ".ts"]),
			...findFiles(join(siteRoot, "public"), [".md", ".txt"]),
			...findFiles(join(repoRoot, "packages", "shared", "src", "public-knowledge"), [
				".ts",
				".json",
			]),
		].filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file));
		const volatileReviewProofPattern =
			/(Trustpilot|Capterra|G2)[^\n]*(\d\.\d\/5|\d+\+? reviews)|(\d\.\d\/5|\d+\+? reviews)[^\n]*(Trustpilot|Capterra|G2)|documented security breach|BBB-documented security breach/;

		for (const file of files) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);

			expect(source, label).not.toMatch(volatileReviewProofPattern);
		}
	});

	it("keeps public content from shipping unsourced competitor subscription estimates", () => {
		const files = [
			...findFiles(join(siteRoot, "src", "content"), [".md", ".mdx"]),
			...findFiles(join(siteRoot, "src", "config"), [".ts"]),
			...findFiles(join(repoRoot, "packages", "shared", "src", "public-knowledge", "generated"), [
				".json",
			]),
			join(repoRoot, "packages", "shared", "src", "public-knowledge", "data.ts"),
		];
		const unsupportedEstimatePattern = new RegExp(
			[
				"Director-reported",
				"director-reported",
				"reported quotes",
				"reported costs",
				"operator-reported",
				"Not published[:;] estimated",
				String.raw`pricing:\s*"[^"]*estimated \$`,
				String.raw`\$200\+\/mo estimated`,
				String.raw`Brightwheel[^\n]*(?:\$36-\$1,800|\$36\/month|\$1,800|estimated \$2-4|Est\. \$|\$108-\$228|\$228\/month|\$540\/month|\$228-\$300\/month|\$400-\$500\/month|directors reporting costs ranging from \$|charges 2\.9%|published payment|published terms)`,
				String.raw`(?:\$36-\$1,800|\$36\/month|\$1,800|\$108-\$228|\$228\/month|\$540\/month|\$228-\$300\/month|\$400-\$500\/month)[^\n]*Brightwheel`,
				"Calculated from Brightwheel published",
				"Brightwheel processing fees",
				String.raw`Procare[^\n]*(?:\$25(?![0-9.])|\$60(?![0-9.])|\$85(?![0-9.])|\$99(?![0-9.])|\$399(?![0-9.])|~\$85(?![0-9.])|\$99-\$399)`,
				String.raw`(?:\$25(?![0-9.])|\$60(?![0-9.])|\$85(?![0-9.])|\$99(?![0-9.])|\$399(?![0-9.])|~\$85(?![0-9.])|\$99-\$399)[^\n]*Procare`,
				String.raw`\$99-\$399\+?\/mo`,
				String.raw`\$399\+\/month`,
				String.raw`\$85\/month`,
				String.raw`~\$85\/mo`,
				String.raw`directors report[^\n]*\$`,
				String.raw`estimated minimum \$36`,
				String.raw`budget \$200`,
				String.raw`At an estimated \$[0-9].*\/month`,
				"BBB-documented security breach",
				oldPricingPhrase.replace("current", "Current"),
				oldPricingPhrase,
				String.raw`\$25-\$249\/mo`,
				String.raw`\$100-\$300\/mo`,
				String.raw`\$100-\$250\/mo`,
				String.raw`\$200-\$400\/mo`,
				String.raw`roughly \$1,200(?:\/year| a year| for PebbleDesk)`,
				String.raw`\$3,000-\$8,000`,
				String.raw`\$3,000-\$5,000`,
				String.raw`\$2,400-\$3,600`,
				String.raw`\$1,800-\$3,000`,
				String.raw`between \$3,000 and \$8,000`,
				String.raw`\$3K-\$8K`,
				String.raw`\$3k-\$8k`,
				"all-in monthly cost drops by 30-60%",
				"2-3x more",
				String.raw`\$1\.86B`,
				String.raw`\$3\.35M`,
				String.raw`~\$8\/class`,
				"Acquired by Roper",
				"Acquired by Plug Smart",
			].join("|"),
		);

		for (const file of files) {
			const source = readFileSync(file, "utf8");
			const label = relativePath(file);

			if (label === thisTestPath) {
				continue;
			}

			expect(source, label).not.toMatch(unsupportedEstimatePattern);
		}
	});
});
