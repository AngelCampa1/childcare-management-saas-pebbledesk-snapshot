import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leadMagnets = [
	{
		file: "childcare-software-pricing-comparison.md",
		requiredSources: [
			"https://help.mybrightwheel.com/en/articles/5599079-how-payments-in-brightwheel-work",
			"https://mybrightwheel.com/terms/",
			"https://help.mybrightwheel.com/en/articles/5599596-billing-v3-configure-billing-settings/",
			"https://help.mybrightwheel.com/en/articles/11878423-deposit-a-check",
			"https://stripe.com/us/pricing",
			"https://www.procaresoftware.com/pricing/",
			"https://www.famly.co/us/pricing",
			"https://www.hisawyer.com/for-business/pricing",
			"https://help.hisawyer.com/en/articles/11105562-what-fees-does-sawyer-charge",
		],
		requiredPatterns: [
			/\bProcare Cloud\s*\|\s*Quote required\b/i,
			/\bSawyer Launch\s*\|\s*3% transaction fee\b/i,
			/\bprocessor benchmark\b/i,
		],
	},
	{
		file: "brightwheel-cost-calculator.md",
		requiredSources: [
			"https://help.mybrightwheel.com/en/articles/5599079-how-payments-in-brightwheel-work",
			"https://mybrightwheel.com/terms/",
			"https://help.mybrightwheel.com/en/articles/5599596-billing-v3-configure-billing-settings/",
			"https://help.mybrightwheel.com/en/articles/11878423-deposit-a-check",
			"https://stripe.com/us/pricing",
		],
		requiredPatterns: [
			/\bbenchmark scenario\b/i,
			/\bprogram-specific service fees\b/i,
			/\bplanning scenario\b/i,
		],
	},
];

const blockedPublicTerms = [
	/\bGSC\b/i,
	/\bkeyword\b/i,
	/\bopportunity data\b/i,
	/\bfake quote/i,
	/\bplan tokens?\b/i,
	/\bdirector communit(?:y|ies)\b/i,
	/\bSawyer Basic\b/i,
	/\bBasic plan\b/i,
	/\bPlayground\b[^\n]*Quote only\b/i,
	/\bPlayground\b[^\n]*\$2\/student\/month\b/i,
	/\bPlayground\b[^\n]*\$60\/month\b/i,
	/\bPlayground\b[^\n]*\$80\/month\b/i,
	/\$25-\$249/,
	/\$129-\$299/,
	/\b2\.9% \+ \$0\.30 CC\b/i,
	/\bBrightwheel knows this\b/i,
	/\bfriction vendors are counting on\b/i,
	/\bhide their processing fees\b/i,
	/\bThis data reflects April 2026\b/i,
];

const blockedMetadataOverclaims = [/\breal annual cost\b/i, /\breal pricing\b/i, /\breal costs\b/i];

function readLeadMagnet(file: string) {
	return readFileSync(resolve(process.cwd(), "src/content/lead-magnets", file), "utf8");
}

function frontmatterText(source: string): string {
	return source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

describe("pricing lead magnet source methodology", () => {
	it.each(leadMagnets)("keeps $file source-backed and free of internal process terms", ({
		file,
		requiredPatterns,
		requiredSources,
	}) => {
		const source = readLeadMagnet(file);
		const frontmatter = frontmatterText(source);

		expect(source).toMatch(/^## (?:Calculation notes|Source notes)$/m);

		for (const requiredSource of requiredSources) {
			expect(source).toContain(`](${requiredSource})`);
		}

		for (const requiredPattern of requiredPatterns) {
			expect(source).toMatch(requiredPattern);
		}

		for (const blockedTerm of blockedPublicTerms) {
			expect(source).not.toMatch(blockedTerm);
		}

		for (const blockedOverclaim of blockedMetadataOverclaims) {
			expect(frontmatter).not.toMatch(blockedOverclaim);
		}
	});
});
