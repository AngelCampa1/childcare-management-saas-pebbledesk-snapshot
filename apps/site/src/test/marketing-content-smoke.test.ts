import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const featureDir = resolve(process.cwd(), "src/content/features");
const contentDir = resolve(process.cwd(), "src/content");
const coreFiles = [
	resolve(process.cwd(), "src/pages/index.astro"),
	resolve(process.cwd(), "src/pages/pricing.astro"),
	resolve(process.cwd(), "src/pages/features/index.astro"),
];

const blockedPhrases = [
	"PebbleDesk ($20-50/month",
	"PebbleDesk ($20-$50/month",
	"PebbleDesk $20/month",
	"PebbleDesk $20/mo",
	"PebbleDesk Center runs $50/month",
	"PebbleDesk Center is $50/month",
	"PebbleDesk Center ($50/month",
	"PebbleDesk Center ($50/mo",
	"PebbleDesk Home ($20/month",
	"PebbleDesk Home ($20/mo",
	"PebbleDesk Home | $240",
	"Home $20/month, Center $50/month",
	"Home $20/month or Center $50/month",
	"Center is $50/month",
	"$20 (Home) / $50 (Center)",
	"PebbleDesk Center | $600",
	"PebbleDesk Center | $50",
	"PebbleDesk at $29/mo",
	'pricing: "$29/mo (Home tier)"',
	"shows {{plan.center_starter.priceLabel}} on the pricing page for in-home daycares",
	"DHS voucher tracking and subsidy reconciliation built into the Home plan",
	"Subsidy reconciliation and attendance audit trail included in the Home plan",
	"PebbleDesk Home at {{plan.home.priceLabel}} adds subsidy",
	"PebbleDesk Home at {{plan.home.priceLabel}} flat (up to 15 children) is the lowest-cost option that includes subsidy reconciliation",
	"PebbleDesk Home at {{plan.home.priceLabel}} flat (up to 15 children) is the most affordable option in this comparison that includes subsidy reconciliation",
	"Home plan is priced for FCH economics and includes compliance tools, subsidy reconciliation",
	"built-in subsidy reconciliation and audit trail",
	"| 6 | $12/mo | {{plan.center_starter.priceLabel}} |",
	"| 8 | $16/mo | {{plan.center_starter.priceLabel}} |",
	"| 10 | $20/mo | {{plan.center_starter.priceLabel}} |",
	"| 12 | $24/mo | {{plan.center_starter.priceLabel}} |",
	"| 14 | $28/mo | {{plan.center_starter.priceLabel}} |",
	"| 15 | $30/mo | {{plan.center_starter.priceLabel}} |",
	"No (roadmap)",
	"offline capability roadmap",
	"Full native offline is on the roadmap",
	"Brightwheel still has the stronger parent app",
	"Parent communication is functional but not the showpiece",
	"Parent communication is functional, not the headline product",
	"Parent communication is functional but not category-leading",
	"Parent app polish is intentionally not the headline feature",
	"Parent communication is functional, not learning-portfolio-grade",
	"Parent communication is functional rather than category-leading",
	"Parent app polish is not the marketing focus",
	"Parent app is functional, not as polished as Playground's",
	"Parent-facing experience is intentionally simpler",
	"Parent communication is functional but not as polished as parent-first apps",
	"Parent communication is functional rather than polished",
	"Parent experience is functional but intentionally not the focus",
	"Parent engagement features are functional",
	"Parent-facing app is functional but not the focus",
	"Parent engagement features are intentionally lighter than category leaders",
	"Family communication is functional rather than the headline product",
	"PebbleDesk covers those basics",
];

const unsupportedPebbleDeskParentPortalClaims = [
	/PebbleDesk[^.\n]{0,120}\bparents?\s+(?:can|receive|access|see|view|log in|login)\b/i,
	/PebbleDesk[^.\n]{0,160}\b(?:parent portal|parent app)\s+(?:connects|gives|lets|shows|includes|is functional|is modern)\b/i,
	/PebbleDesk[^.\n]{0,160}\bincludes\b[^.\n]{0,100}\b(?:daily reports?|daily activity reports?|photo sharing|photos?)\b/i,
	/PebbleDesk[^.\n]{0,160}\b(?:multilingual interface|Full multilingual)\b/i,
	/PebbleDesk[^.\n]{0,160}\b(?:documents?|forms?)\s+(?:collected|stored|accessible|submitted)\b/i,
	/\badoption rates?\b[^.\n]{0,120}\bPebbleDesk\b/i,
];

const contextScopedPebbleDeskParentPortalClaims = [
	/\bparents?\s+(?:can|receive|access|see|view|log in|login|message)\b/i,
	/\b(?:daily reports?|daily activity reports?|photo sharing|photos?|parent messaging)\b/i,
];

const unsupportedPebbleDeskTableValues = new Set([
	"functional",
	"modern",
	"polished",
	"strong",
	"best in category",
	"excellent",
]);

const unsupportedPebbleDeskWaitlistClaims = [
	/\bautomates?\s+waitlist\s+communication\b/i,
	/\bautomated\s+waitlist\s+communication\b/i,
	/\bcollects?\s+hold\s+fees?\b/i,
	/\bhold\s+fee\s+(?:collection|payment request)\b/i,
	/\bone-click\s+(?:waitlist-to-enrollment\s+)?conversion\b/i,
	/\bconverts?\s+(?:the\s+confirmed\s+family|waitlist|families?)\s+to\s+(?:active\s+)?enrollment\b/i,
	/\b(?:embed|embedded|embeds?|embeddable)\b.{0,80}\b(?:waitlist|capture|inquiry)\s+form\b/i,
	/\b(?:set|adjust)\s+priority\s+order\b/i,
	/\blog\s+follow-up\s+contact\b/i,
	/\bsurfaces?\s+(?:which\s+families|the\s+relevant\s+waitlisted\s+families|who\s+is\s+next)\b/i,
	/\bnotifies?\s+(?:the\s+appropriate\s+)?families\s+from\s+within\s+the\s+waitlist\s+view\b/i,
	/\bautomation\s+handles\s+most\s+of\s+the\s+pipeline\b/i,
	/\bpriority\s+scoring\b/i,
	/\bautomated\s+offer\s+sequencing\b/i,
	/\bnotes?\b/i,
	/\b(?:notes?|follow-up history|decline history)\b.{0,80}\b(?:live|stay|stored|attached|against|in the same file|in the record)\b/i,
];

const unsupportedPebbleDeskQuickBooksClaims = [
	/\bchart of accounts mapping\b/i,
	/\bconfigured?\s+(?:chart of accounts|account mapping)\b/i,
	/\b(?:private-pay tuition|subsidy reimbursements?)\b.{0,120}\bseparate\s+(?:QuickBooks\s+)?income accounts?\b/i,
	/\bseparate\s+(?:QuickBooks\s+)?income accounts?\b.{0,120}\b(?:private-pay tuition|subsidy reimbursements?)\b/i,
	/\bfunding-stream separation\b/i,
	/\brevenue separated by funding source\b/i,
	/\bP&L\b.{0,120}\b(?:separate accounts|private-pay|subsidy reimbursement)\b/i,
	/\bQuickBooks\b.{0,120}\b(?:available|included|enabled|supported|support)\b.{0,80}\b(?:all plans|every plan|every center|all centers|all PebbleDesk customers|all customers)\b/i,
	/\b(?:all plans|every plan|every center|all centers|all PebbleDesk customers|all customers)\b.{0,80}\b(?:include|includes|support|supports|enable|enabled|available)\b.{0,120}\bQuickBooks\b/i,
	/\bQuickBooks\b.{0,120}\bIncluded on Center plan\b/i,
	/\bIncluded on Center plan\b.{0,120}\bQuickBooks\b/i,
	/\bCenter Starter\b.{0,120}\bQuickBooks\b/i,
	/\bQuickBooks\b.{0,120}\bCenter Starter\b/i,
];

const qualifyingPebbleDeskQuickBooksAvailabilityClaims = [
	/\bQuickBooks\b.{0,120}\b(?:available|support|supported|enabled|exists)\b.{0,120}\b(?:qualifying plans|rollout-supported|production setup|plan entitlement)\b/i,
	/\b(?:qualifying plans|rollout-supported|production setup|plan entitlement)\b.{0,120}\bQuickBooks\b/i,
];

function collectMarkdownFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectMarkdownFiles(fullPath));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(fullPath);
		}
	}

	return files;
}

function getPipeTableCells(line: string): string[] | null {
	if (!line.trim().startsWith("|")) {
		return null;
	}

	return line
		.split("|")
		.map((cell) => cell.trim())
		.filter(Boolean);
}

function getYamlArrayCells(line: string): string[] | null {
	const match = line.match(/^\s*-\s*\[(.*)\]\s*$/);
	if (!match) {
		return null;
	}

	return match[1].split('",').map((cell) => cell.replace(/^\s*"/, "").replace(/"\s*$/, "").trim());
}

function describesPebbleDeskParentAppTableClaim(file: string, cells: string[] | null): boolean {
	if (!cells || cells.length < 3) {
		return false;
	}

	const [feature] = cells;
	const pebbledeskValue = getPebbleDeskComparisonTableValue(file, cells);
	if (!pebbledeskValue) {
		return false;
	}
	const featureNamesParentApp = /\bparent app\b/i.test(feature);
	const valueClaimsParentAppCapability = unsupportedPebbleDeskTableValues.has(
		pebbledeskValue.toLowerCase(),
	);

	return featureNamesParentApp && valueClaimsParentAppCapability;
}

function getPebbleDeskComparisonTableValue(file: string, cells: string[]): string | null {
	if (/[\\/]pebbledesk-vs-[^\\/]+\.md$/.test(file)) {
		return cells[1] ?? null;
	}
	if (/[\\/][^\\/]+-vs-pebbledesk\.md$/.test(file)) {
		return cells[2] ?? null;
	}

	return null;
}

function describesContextScopedPebbleDeskClaim(
	lines: string[],
	line: string,
	lineNumber: number,
): boolean {
	const previousContext = lines[lineNumber - 2] ?? "";
	const contextIsPebbleDeskScoped =
		/\b(?:question|q):\s*["']?[^"'\n]*\bPebbleDesk\b/i.test(previousContext) &&
		/\b(?:parent app|parent portal|communication)\b/i.test(previousContext);
	const lineClaimsUnsupportedParentCapability = contextScopedPebbleDeskParentPortalClaims.some(
		(pattern) => pattern.test(line),
	);

	return contextIsPebbleDeskScoped && lineClaimsUnsupportedParentCapability;
}

function deniesPebbleDeskParentPortalClaim(line: string): boolean {
	return (
		/\bPebbleDesk\b/i.test(line) &&
		/\b(?:does not|not directly|not a|not the|No\. PebbleDesk|No standalone)\b/i.test(line) &&
		/\b(?:parent app|photo feed|daily report|in-app messaging|parent-facing)\b/i.test(line)
	);
}

function deniesPebbleDeskWaitlistClaim(text: string): boolean {
	return (
		/\b(?:does not|not a|not the|not built in|not directly|require a manual process|requires a manual process|separate CRM|dedicated enrollment CRM|manual director process)\b/i.test(
			text,
		) &&
		/\b(?:automated waitlist|hold-fee|hold fee|priority scoring|offer sequencing|CRM automation|waitlist campaigns|notes?)\b/i.test(
			text,
		)
	);
}

function getPebbleDeskScopedWaitlistTexts(source: string): string[] {
	const lines = source.split(/\r?\n/);
	const scopedTexts: string[] = [];
	let inPebbleDeskToolBlock = false;
	let inPebbleDeskSection = false;

	lines.forEach((line, index) => {
		if (/^\s{2}- name: "PebbleDesk"\s*$/.test(line)) {
			inPebbleDeskToolBlock = true;
		} else if (/^\s{2}- name: "/.test(line)) {
			inPebbleDeskToolBlock = false;
		}

		if (/^###\s+/.test(line)) {
			inPebbleDeskSection = /^### PebbleDesk\b/.test(line);
		}

		if (inPebbleDeskToolBlock) {
			scopedTexts.push(line);
		}

		if (inPebbleDeskSection) {
			scopedTexts.push(line);
			scopedTexts.push(lines.slice(index, Math.min(lines.length, index + 2)).join(" "));
		}

		if (/\bPebbleDesk\b/i.test(line)) {
			scopedTexts.push(lines.slice(index, Math.min(lines.length, index + 3)).join(" "));
		}
	});

	return scopedTexts
		.flatMap((text) =>
			text
				.replace(/\s+/g, " ")
				.trim()
				.split(/(?<=[.!?])\s+(?=[A-Z])/),
		)
		.map((text) => text.trim())
		.filter(Boolean);
}

function deniesPebbleDeskQuickBooksClaim(text: string): boolean {
	const claimsUnsupportedUniversalAvailability = unsupportedPebbleDeskQuickBooksClaims
		.slice(7, 9)
		.some((pattern) => pattern.test(text));
	const deniesUnsupportedCapability =
		/\b(?:does not|not built in|not automatic|not supported|is not supported)\b.{0,80}\b(?:chart of accounts|account mapping|income accounts|funding-stream|P&L)\b/i.test(
			text,
		) ||
		/\b(?:chart of accounts|account mapping|income accounts|funding-stream|P&L)\b.{0,80}\b(?:does not|not built in|not automatic|not supported|is not supported)\b/i.test(
			text,
		);
	const qualifiesAvailability =
		qualifyingPebbleDeskQuickBooksAvailabilityClaims.some((pattern) => pattern.test(text)) &&
		!/\b(?:chart of accounts|account mapping|income accounts|funding-stream|P&L|Center Starter)\b/i.test(
			text,
		);
	const explicitlyDeniesUniversalAvailability =
		/\b(?:not universally available|not available on all plans|not included on all plans|not enabled for every center)\b/i.test(
			text,
		) && /\bQuickBooks\b/i.test(text);

	return (
		deniesUnsupportedCapability ||
		(!claimsUnsupportedUniversalAvailability && qualifiesAvailability) ||
		(!claimsUnsupportedUniversalAvailability && explicitlyDeniesUniversalAvailability)
	);
}

function isQuickBooksClaimFile(file: string): boolean {
	const sourceRelativePath = relative(process.cwd(), file).replace(/\\/g, "/");
	return (
		sourceRelativePath === "src/pages/index.astro" ||
		sourceRelativePath === "src/content/features/billing-payments.md" ||
		sourceRelativePath.startsWith("src/content/comparisons/") ||
		sourceRelativePath.startsWith("src/content/guides/") ||
		/(^|\/)quickbooks[^/]*\.md$/.test(sourceRelativePath) ||
		/\/[^/]*quickbooks[^/]*\.md$/.test(sourceRelativePath)
	);
}

function describesPebbleDeskQuickBooksTableClaim(
	file: string,
	cells: string[] | null,
): string | null {
	if (!cells || cells.length < 3 || !/\bQuickBooks\b/i.test(cells[0])) {
		return null;
	}

	if (/[\\/]pebbledesk-vs-[^\\/]+\.md$/.test(file)) {
		return cells[1] ?? null;
	}
	if (/[\\/][^\\/]+-vs-pebbledesk\.md$/.test(file)) {
		return cells[2] ?? null;
	}

	return cells[cells.length - 1] ?? null;
}

function quickBooksTableValueNeedsQualification(value: string): boolean {
	const normalizedValue = value.trim().toLowerCase();
	if (
		!normalizedValue ||
		normalizedValue.includes("qualifying") ||
		normalizedValue.includes("rollout")
	) {
		return false;
	}

	return ["yes", "included", "included on center plan", "center plan"].includes(normalizedValue);
}

function getPebbleDeskScopedQuickBooksTexts(
	source: string,
	options?: { firstPartyPage?: boolean },
): string[] {
	const lines = source.split(/\r?\n/);
	const scopedTexts: string[] = [];
	let inPebbleDeskToolBlock = false;
	let inPebbleDeskSection = false;

	lines.forEach((line, index) => {
		if (/^\s{2}- name: "PebbleDesk"\s*$/.test(line)) {
			inPebbleDeskToolBlock = true;
		} else if (/^\s{2}- name: "/.test(line)) {
			inPebbleDeskToolBlock = false;
		}

		if (/^###\s+/.test(line)) {
			inPebbleDeskSection = /^### PebbleDesk\b/.test(line);
		}

		if (inPebbleDeskToolBlock) {
			scopedTexts.push(line);
		}

		if (inPebbleDeskSection) {
			scopedTexts.push(line);
			scopedTexts.push(lines.slice(index, Math.min(lines.length, index + 2)).join(" "));
		}

		if (options?.firstPartyPage && /\bQuickBooks\b/i.test(line)) {
			scopedTexts.push(line);
		}

		if (/\bPebbleDesk\b/i.test(line) && /\bQuickBooks\b/i.test(line)) {
			scopedTexts.push(lines.slice(index, Math.min(lines.length, index + 3)).join(" "));
		}
	});

	return scopedTexts
		.flatMap((text) =>
			text
				.replace(/\s+/g, " ")
				.trim()
				.split(/(?<=[.!?])\s+(?=[A-Z])/),
		)
		.map((text) => text.trim())
		.filter(Boolean);
}

describe("marketing content smoke", () => {
	it("keeps the expanded feature inventory on the site", () => {
		const slugs = readdirSync(featureDir)
			.filter((name) => name.endsWith(".md"))
			.map((name) => name.replace(/\.md$/, ""))
			.sort();

		expect(slugs).toEqual([
			"attendance-tracking",
			"audit-reports",
			"billing-payments",
			"cacfp-tracking",
			"child-development-logs",
			"classroom-management",
			"enrollment-records",
			"imports-migration",
			"incident-reporting",
			"messaging-alerts",
			"multi-location-oversight",
			"parent-portal",
			"ratio-tracking",
			"staff-credentials",
			"staff-scheduling",
			"subsidy-billing",
			"waitlist-management",
		]);
	});

	it("blocks stale PebbleDesk pricing and unsupported offline claims across first-party marketing content", () => {
		const markdownFiles = collectMarkdownFiles(contentDir);
		const files = [...coreFiles, ...markdownFiles];
		const sources = files.map((file) => readFileSync(file, "utf8"));
		const combined = sources.join("\n");

		for (const phrase of blockedPhrases) {
			expect(combined).not.toContain(phrase);
		}

		const unsupportedParentPortalClaims = files.flatMap((file) => {
			const source = readFileSync(file, "utf8");
			const lines = source.split(/\r?\n/);
			return source
				.split(/\r?\n/)
				.map((line, index) => ({ file, line, lineNumber: index + 1 }))
				.filter(
					({ line, lineNumber }) =>
						(unsupportedPebbleDeskParentPortalClaims.some((pattern) => pattern.test(line)) &&
							!deniesPebbleDeskParentPortalClaim(line)) ||
						describesPebbleDeskParentAppTableClaim(file, getYamlArrayCells(line)) ||
						(describesContextScopedPebbleDeskClaim(lines, line, lineNumber) &&
							!deniesPebbleDeskParentPortalClaim(line)),
				)
				.map(({ file, line, lineNumber }) => `${file}:${lineNumber}: ${line.trim()}`);
		});
		expect(unsupportedParentPortalClaims).toEqual([]);

		const unsupportedWaitlistClaims = files.flatMap((file) => {
			if (!/[\\/]waitlist/.test(file)) {
				return [];
			}

			const source = readFileSync(file, "utf8");
			return getPebbleDeskScopedWaitlistTexts(source)
				.map((text, index) => ({ file, text, index }))
				.filter(({ text }) =>
					unsupportedPebbleDeskWaitlistClaims.some((pattern) => pattern.test(text)),
				)
				.filter(({ text }) => !deniesPebbleDeskWaitlistClaim(text))
				.map(({ file, text, index }) => `${file}:waitlist-scope-${index + 1}: ${text}`);
		});
		expect(unsupportedWaitlistClaims).toEqual([]);

		const unsupportedQuickBooksClaims = files.flatMap((file) => {
			if (!isQuickBooksClaimFile(file)) {
				return [];
			}

			const source = readFileSync(file, "utf8");
			const sourceRelativePath = relative(process.cwd(), file).replace(/\\/g, "/");
			const textClaims = getPebbleDeskScopedQuickBooksTexts(source, {
				firstPartyPage: sourceRelativePath === "src/pages/index.astro",
			})
				.map((text, index) => ({ file, text, index }))
				.filter(({ text }) =>
					unsupportedPebbleDeskQuickBooksClaims.some((pattern) => pattern.test(text)),
				)
				.filter(({ text }) => !deniesPebbleDeskQuickBooksClaim(text))
				.map(({ file, text, index }) => `${file}:quickbooks-scope-${index + 1}: ${text}`);
			const tableClaims = source
				.split(/\r?\n/)
				.map((line, index) => ({
					file,
					line,
					lineNumber: index + 1,
					pebbledeskValue: describesPebbleDeskQuickBooksTableClaim(
						file,
						getPipeTableCells(line) ?? getYamlArrayCells(line),
					),
				}))
				.filter(
					({ pebbledeskValue }) =>
						pebbledeskValue &&
						(quickBooksTableValueNeedsQualification(pebbledeskValue) ||
							unsupportedPebbleDeskQuickBooksClaims.some((pattern) =>
								pattern.test(`QuickBooks ${pebbledeskValue}`),
							)) &&
						!deniesPebbleDeskQuickBooksClaim(`QuickBooks ${pebbledeskValue}`),
				)
				.map(({ file, line, lineNumber }) => `${file}:${lineNumber}: ${line.trim()}`);
			return [...textClaims, ...tableClaims];
		});
		expect(unsupportedQuickBooksClaims).toEqual([]);

		const tokenMisuse = files.flatMap((file) => {
			const source = readFileSync(file, "utf8");
			const lines = source.split(/\r?\n/);
			return lines
				.map((line, index) => ({ file, line, lineNumber: index + 1 }))
				.filter(({ line, lineNumber }) => {
					const mentionsCenterStarterPrice = line.includes("{{plan.center_starter.priceLabel}}");
					const previousContext = lines
						.slice(Math.max(0, lineNumber - 4), lineNumber - 1)
						.join("\n");
					const cells = getPipeTableCells(line) ?? getYamlArrayCells(line);
					const homeUsesCenterStarterToken =
						/{{plan\.center_starter\.priceLabel}}\s+for (?:the )?Home/.test(line) ||
						/{{plan\.center_starter\.priceLabel}}\s+\(home\)/i.test(line) ||
						/{{plan\.home\.priceLabel}}\s+for Home and Center Starter/.test(line) ||
						/Home(?: plan| tier| provider)?[^.\n|]{0,80}\b(?:at|costs|is|starts at)\s+\{\{plan\.center_starter\.priceLabel\}\}/.test(
							line,
						) ||
						/PebbleDesk Home[^.\n|]*\{\{plan\.center_starter\.priceLabel\}\}/.test(line) ||
						/Home plan \([^)]*\{\{plan\.center_starter\.priceLabel\}\}/.test(line) ||
						/Home: \{\{plan\.center_starter\.priceLabel\}\}/.test(line);
					const tableMispricesHome =
						previousContext.includes("PebbleDesk Home ({{plan.home.priceLabel}})") &&
						cells?.[2] === "{{plan.center_starter.priceLabel}}";
					const tableExceedsHomeCap =
						previousContext.includes('"Monthly Cost (20 children)"') &&
						cells?.[0] === "PebbleDesk Home" &&
						cells?.[2] === "{{plan.home.priceLabel}}";
					const mispricesCenterPro =
						line.includes("Center Pro") &&
						mentionsCenterStarterPrice &&
						!line.includes("{{plan.center_pro.priceLabel}}");
					const tiesSubsidyToHomePrice =
						line.includes("{{plan.home.priceLabel}}") &&
						(/\b(?:subsidy|CCDF|DHS voucher|voucher-funded|reconciliation)[^.\n]{0,100}\b(?:from|at|for)\s+\{\{plan\.home\.priceLabel\}\}/i.test(
							line,
						) ||
							/PebbleDesk Home (?:at|for)\s+\{\{plan\.home\.priceLabel\}\}[^.\n]{0,100}\b(?:includes|covers|handles|adds)[^.\n]{0,80}\b(?:subsidy|CCDF|DHS voucher|voucher-funded|reconciliation)/i.test(
								line,
							) ||
							/\b(?:covers|includes|does|handles)[^.\n]{0,40}\b(?:both|subsidy|reconciliation)[^.\n]{0,80}\b(?:from|at|for)\s+\{\{plan\.home\.priceLabel\}\}/i.test(
								line,
							) ||
							/starting at \{\{plan\.home\.priceLabel\}\} with subsidy/i.test(line) ||
							/Home[^.\n]{0,60}\{\{plan\.home\.priceLabel\}\}[^.\n]{0,100}\b(?:includes|covers|handles|adds)[^.\n]{0,80}\b(?:subsidy|CCDF|DHS voucher|voucher-funded|reconciliation)/i.test(
								line,
							));
					return (
						homeUsesCenterStarterToken ||
						tableMispricesHome ||
						tableExceedsHomeCap ||
						mispricesCenterPro ||
						tiesSubsidyToHomePrice
					);
				})
				.map(({ file, line, lineNumber }) => `${file}:${lineNumber}: ${line.trim()}`);
		});
		expect(tokenMisuse).toEqual([]);
	});
});
