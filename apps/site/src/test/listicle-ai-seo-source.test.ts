import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const listicles = [
	{
		slug: "best-preschool-management-software",
		requiredCriteria: ["billing", "subsidy", "ratio", "price transparency", "implementation"],
	},
	{
		slug: "best-childcare-billing-software",
		requiredCriteria: [
			"tuition collection",
			"subsidy",
			"attendance",
			"late fees",
			"price transparency",
		],
	},
	{
		slug: "best-daycare-billing-software",
		requiredCriteria: ["tuition", "subsidy", "attendance", "late fees", "price transparency"],
	},
	{
		slug: "best-childcare-scheduling-software",
		requiredCriteria: [
			"ratio",
			"shift planning",
			"break coverage",
			"enrollment",
			"price transparency",
		],
	},
	{
		slug: "best-childcare-attendance-software",
		requiredCriteria: ["time-stamped", "room-level", "licensing", "subsidy", "price transparency"],
	},
	{
		slug: "best-childcare-management-software-centers",
		requiredCriteria: ["ratio", "audit", "subsidy", "compliance", "price transparency"],
		relatedSlugs: [
			"best-daycare-apps",
			"best-free-daycare-management-software",
			"best-childcare-software-small-centers",
			"best-childcare-software-home-daycare-providers",
		],
	},
	{
		slug: "best-free-daycare-management-software",
		requiredCriteria: ["free tier", "trial", "parent communication", "attendance", "licensing"],
		relatedSlugs: [
			"best-daycare-apps",
			"best-childcare-management-software-centers",
			"best-childcare-software-small-centers",
			"best-childcare-software-home-daycare-providers",
			"best-parent-communication-apps-centers",
		],
	},
	{
		slug: "best-parent-communication-apps-centers",
		requiredCriteria: [
			"daily reports",
			"messaging",
			"attendance",
			"compliance",
			"price transparency",
		],
		relatedSlugs: [
			"best-daycare-apps",
			"best-free-daycare-management-software",
			"best-childcare-software-parent-portal",
		],
	},
	{
		slug: "best-childcare-software-parent-portal",
		requiredCriteria: [
			"guardian records",
			"billing visibility",
			"daily reports",
			"compliance",
			"price transparency",
		],
		relatedSlugs: [
			"best-daycare-apps",
			"best-parent-communication-apps-centers",
			"best-free-daycare-management-software",
		],
	},
	{
		slug: "best-daycare-apps",
		requiredCriteria: [
			"parent communication",
			"attendance",
			"billing",
			"licensing",
			"price transparency",
		],
		relatedSlugs: [
			"best-free-daycare-management-software",
			"best-parent-communication-apps-centers",
			"best-childcare-software-parent-portal",
			"best-childcare-management-software-centers",
		],
	},
	{
		slug: "best-childcare-software-small-centers",
		requiredCriteria: ["ratio", "subsidy", "audit", "setup", "price transparency"],
		relatedSlugs: [
			"best-childcare-management-software-centers",
			"best-free-daycare-management-software",
			"best-childcare-software-home-daycare-providers",
		],
	},
	{
		slug: "best-childcare-software-home-daycare-providers",
		requiredCriteria: ["home daycare", "licensing", "subsidy", "attendance", "price transparency"],
		relatedSlugs: [
			"best-childcare-management-software-centers",
			"best-free-daycare-management-software",
			"best-childcare-software-small-centers",
		],
	},
] as const;

const stalePricingOnlyListicles = [
	"best-affordable-daycare-software-home-providers",
	"best-childcare-software-home-daycare",
	"best-ratio-tracking-software-daycare",
	"best-subsidy-tracking-childcare-apps",
] as const;

const internalProcessTerms = [
	"GSC",
	"opportunity data",
	"buyer searches",
	"fake quotes",
	"unsupported feature promises",
	"plan tokens",
	"keyword",
	"SEO",
];

const playgroundStalePricingPatterns = [
	/\bPlayground\b[^\n]*\$2\/student\/month/i,
	/\bPlayground\b[^\n]*\$60\/month/i,
	/\bPlayground\b[^\n]*\$80\/month/i,
	/\bPlayground\b[^\n]*\$60\/mo/i,
	/\bPlayground\b[^\n]*\$2\/student/i,
	/\|\s*\d+\s*\|\s*\$\d+\/mo\s*\|\s*\{\{plan\.home\.priceLabel\}\}\s*\|\s*\$0\s*\|/i,
	/\bname:\s*"Playground"[\s\S]*?\bpricing:\s*"[^"]*(?:free base tier|paid plans from|\/child\/mo|\$2\/student|\$2\/child)[^"]*"/i,
	/\bPlayground\b[^\n]*free base tier/i,
	/\bfree base tier\b[^\n]*\bPlayground\b/i,
	/\bPlayground is cheaper\b/i,
] as const;

const stalePricingPatterns = [
	...playgroundStalePricingPatterns,
	/\bProcare\b[^\n]*\$200\+\/month/i,
	/\bProcare\b[^\n]*\$25-\$249/i,
	/\bProcare\b[^\n]*\$129-\$299/i,
	/\bBrightwheel\b[^\n]*\$90-120\/month/i,
	/\bKangarootime\b[^\n]*estimated \$80\+\/month/i,
	/\bSawyer Basic\b/i,
	/\bBasic plan\b/i,
	/\bProcare\b[^\n]*(?:expensive|high cost|higher cost)/i,
	/\b(?:expensive|high cost|higher cost)[^\n]*\bProcare\b/i,
	/\bProcare\b[^\n]*highest cost/i,
	/\bhighest cost[^\n]*\bProcare\b/i,
	/\bwithout Procare's cost\b/i,
	/\bsignificantly below Procare\b/i,
	/\bat this price point\b/i,
	/\$36-\$1,800/i,
	/\$200-\$400/i,
	/\$200-\$350/i,
	/\$200-\$300/i,
	/\$300-500/i,
	/~\$85/i,
	/~\$29-99/i,
	/\broughly \$29-99/i,
	/\bapproximately \$29-99/i,
	/\bestimated \$\d+/i,
	/~\$\d+/i,
] as const;

const unsupportedStaleClaimPatterns = [
	/\bdirector communit(?:y|ies)\b/i,
	/\buser reports?\b/i,
	/\bmarket reports?\b/i,
	/\bdirectors?\b[^\n.]{0,80}\bdescrib(?:e|ed|ing)\b/i,
	/\breport having to\b/i,
	/\breport varying experiences\b/i,
	/\breport handling\b/i,
	/\breal monthly cost\b/i,
	/\bmarket estimates based on user reports\b/i,
	/\btalking to directors\b/i,
	/\bcategory leader\b/i,
	/\bwidely recognized\b/i,
	/\bwell-known\b/i,
	/\bwell-known platform\b/i,
	/\bwell-known brand\b/i,
	/\brecognized brand\b/i,
	/\bmost recognized name\b/i,
	/\bmost widely used\b/i,
	/\bfamilies recognize\b/i,
	/\bfamilies\b[^\n.]{0,80}\bfamiliar\b/i,
	/\bfamilies\b[^\n.]{0,80}\bknow\b/i,
	/\bparent recognition\b/i,
	/\blargest name\b/i,
	/\bbest-known platforms?\b/i,
	/\bmarket is not well-served\b/i,
	/\bbrand recognition\b/i,
	/\bscales aggressively\b/i,
	/\bmarket delivers\b/i,
	/\bmarket leader\b/i,
	/\bpricing scales aggressively\b/i,
	/\bper-child pricing adds up quickly\b/i,
	/\bexpensive at \d+\+ children\b/i,
	/\bgets expensive above \d+ children\b/i,
];

function readListicle(slug: string): string {
	return readFileSync(resolve(process.cwd(), "src/content/listicles", `${slug}.md`), "utf8");
}

function markdownBody(source: string): string {
	return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function sectionText(body: string, heading: string): string {
	const lines = body.split(/\r?\n/);
	const startIndex = lines.findIndex((line) => line.trim() === `### ${heading}`);
	if (startIndex === -1) return "";

	const endIndex = lines.findIndex((line, index) => index > startIndex && /^#{2,3}\s+/.test(line));
	const sectionLines =
		endIndex === -1 ? lines.slice(startIndex + 1) : lines.slice(startIndex + 1, endIndex);

	return sectionLines.join("\n").trim();
}

describe("AI-SEO listicle source improvements", () => {
	for (const listicle of listicles) {
		it(`${listicle.slug} includes extractable buyer recommendation and evaluation methodology`, () => {
			const body = markdownBody(readListicle(listicle.slug));
			const firstMajorSection = body.search(/^###\s+/m);
			const quickRecommendation = sectionText(body, "Quick recommendation");
			const methodology = sectionText(body, "How we evaluated");

			expect(quickRecommendation, "missing ### Quick recommendation").not.toBe("");
			expect(
				body.indexOf("### Quick recommendation"),
				"quick recommendation should appear near the top of the article",
			).toBeGreaterThanOrEqual(0);
			expect(
				body.indexOf("### Quick recommendation"),
				"quick recommendation should be the first body section",
			).toBe(firstMajorSection);
			expect(
				quickRecommendation.split(/\s+/).filter(Boolean).length,
				"quick recommendation should be concise enough for extraction",
			).toBeLessThanOrEqual(130);
			expect(quickRecommendation).toMatch(/\bPebbleDesk\b/);
			expect(quickRecommendation).toMatch(/\b(?:best|pick|recommend)/i);

			expect(methodology, "missing ### How we evaluated").not.toBe("");
			for (const term of listicle.requiredCriteria) {
				expect(methodology.toLowerCase(), `methodology should mention ${term}`).toContain(term);
			}
			for (const term of internalProcessTerms) {
				expect(body.toLowerCase(), `public content should not mention ${term}`).not.toContain(
					term.toLowerCase(),
				);
			}
			for (const stalePricingPattern of playgroundStalePricingPatterns) {
				expect(body, `public content should not include ${stalePricingPattern}`).not.toMatch(
					stalePricingPattern,
				);
			}
			for (const unsupportedStaleClaimPattern of unsupportedStaleClaimPatterns) {
				expect(
					body,
					`public content should not include ${unsupportedStaleClaimPattern}`,
				).not.toMatch(unsupportedStaleClaimPattern);
			}
			expect(methodology).toMatch(/\bpublished prices\b|\bpricing is not public\b/i);

			const fullSource = readListicle(listicle.slug);
			for (const relatedSlug of "relatedSlugs" in listicle ? listicle.relatedSlugs : []) {
				expect(fullSource, `management-core listicle should link to ${relatedSlug}`).toContain(
					`/resources/best/${relatedSlug}`,
				);
			}
			for (const stalePricingPattern of stalePricingPatterns) {
				expect(
					fullSource,
					`public source, including frontmatter, should not include ${stalePricingPattern}`,
				).not.toMatch(stalePricingPattern);
			}
			for (const unsupportedStaleClaimPattern of unsupportedStaleClaimPatterns) {
				expect(
					fullSource,
					`public source, including frontmatter, should not include ${unsupportedStaleClaimPattern}`,
				).not.toMatch(unsupportedStaleClaimPattern);
			}
			expect(fullSource).not.toContain("/compare/versus/lillio-vs-playground/");
		});
	}

	for (const slug of stalePricingOnlyListicles) {
		it(`${slug} does not reintroduce stale Playground pricing claims`, () => {
			const fullSource = readListicle(slug);

			for (const stalePricingPattern of playgroundStalePricingPatterns) {
				expect(
					fullSource,
					`public source, including frontmatter, should not include ${stalePricingPattern}`,
				).not.toMatch(stalePricingPattern);
			}
		});
	}
});
