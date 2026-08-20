import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const enrollmentFormsSource = readFileSync(
	resolve(process.cwd(), "src/content/lead-magnets/childcare-enrollment-agreement-template.md"),
	"utf8",
);

const supportingSources = [
	"src/content/lead-magnets/parent-handbook-template.md",
	"src/content/guides/childcare-enrollment-contract-guide.md",
	"src/content/features/enrollment-records.md",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8"));

const enrollmentClusterSource = [enrollmentFormsSource, ...supportingSources].join("\n");

const body = enrollmentFormsSource.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

const requiredFormSetTerms = [
	"childcare enrollment forms",
	"daycare enrollment forms",
	"enrollment agreement",
	"registration form",
	"authorized pickup",
	"emergency contact",
	"medical authorization",
	"immunization",
	"tuition",
	"withdrawal",
];

const requiredRelatedSearchTerms = [
	"free printable daycare enrollment forms",
	"childcare enrollment forms pdf",
	"daycare enrollment form template",
	"daycare registration form template",
];

const blockedInternalProcessTerms = [
	"GSC",
	"DataForSEO",
	"keyword",
	"search volume",
	"opportunity data",
	"plan tokens",
];

const blockedLegalOverclaims = [
	"most states do not mandate",
	"nearly impossible to enforce",
	"almost always lose",
	"is enforceable",
	"late fees may apply' is not",
	"$300–$600",
	"$300-$600",
	"sufficient for most centers",
	"requires a court order in most states",
	"protect you legally",
	"local child protective services per [state] law",
	"medical or religious exemption form",
];

describe("enrollment forms lead magnet AI-SEO source", () => {
	it("positions the enrollment agreement as a complete forms packet for extractive searches", () => {
		expect(enrollmentFormsSource).toMatch(
			/title:\s*"Free Childcare Enrollment Forms and Agreement Template/,
		);
		expect(enrollmentFormsSource).toMatch(/description:.*daycare enrollment forms/i);
		expect(enrollmentFormsSource).toMatch(/bluf:.*childcare enrollment forms/i);
		expect(enrollmentFormsSource).toContain('lastReviewed: "2026-05-21"');
		expect(enrollmentFormsSource).toContain('schema: "Article"');

		for (const term of requiredFormSetTerms) {
			expect(enrollmentFormsSource.toLowerCase(), `missing ${term}`).toContain(term);
		}

		for (const term of requiredRelatedSearchTerms) {
			expect(body.toLowerCase(), `missing related search phrase ${term}`).toContain(term);
		}

		expect(body).toMatch(/^## What this enrollment forms packet includes$/m);
		expect(body).toMatch(/^## Before you use these forms$/m);
		expect(body).toMatch(/^## Childcare enrollment form$/m);
		expect(body).toMatch(/^## Childcare enrollment agreement$/m);
	});

	it("links the form packet to adjacent policy, fee, handbook, and digital-record resources", () => {
		const requiredLinks = [
			"/free/childcare-fee-policy-template",
			"/free/parent-handbook-template",
			"/resources/guides/childcare-enrollment-contract-guide",
			"/features/enrollment-records",
		];

		for (const requiredLink of requiredLinks) {
			expect(enrollmentFormsSource).toContain(requiredLink);
		}
	});

	it("earns reciprocal links from adjacent enrollment and handbook resources", () => {
		for (const source of supportingSources) {
			expect(source).toContain("/free/childcare-enrollment-agreement-template");
		}
	});

	it("avoids internal SEO process language in public lead magnet copy", () => {
		for (const term of blockedInternalProcessTerms) {
			expect(enrollmentFormsSource.toLowerCase()).not.toContain(term.toLowerCase());
		}
	});

	it("avoids unsupported legal overclaims across adjacent enrollment resources", () => {
		for (const term of blockedLegalOverclaims) {
			expect(enrollmentClusterSource.toLowerCase()).not.toContain(term.toLowerCase());
		}
	});
});
