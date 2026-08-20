import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("shared copy source regressions", () => {
	it("does not hardcode the old B2B eyebrow into ProblemAgitation", () => {
		const source = readSource("./problem-agitation.astro");

		expect(source).not.toContain("The Planning Problem");
		expect(source).toContain("config.eyebrow");
	});

	it("hardens ProblemAgitation against long-copy overflow in the pain-point grid", () => {
		const source = readSource("./problem-agitation.astro");

		expect(source).toContain("min-w-0");
		expect(source).toContain("overflow-wrap:anywhere");
	});

	it("does not default FAQ headings to team-evaluation language", () => {
		const source = readSource("./faq-section.astro");

		expect(source).not.toContain("Answers for teams evaluating the fit");
		expect(source).toContain("resolveFaqHeading");
	});

	it("keeps PublicSignupCta focused on CTA-only props in the React island", () => {
		const source = readSource("./public-signup-cta.tsx");

		expect(source).not.toContain("surveyQuestions");
		expect(source).not.toContain("discoveryCallUrl");
		expect(source).toContain("sourcePage: string;");
		expect(source).toContain("ctaTarget?: string;");
	});

	it("keeps PublicSignupCta focused on CTA-only props in the Astro wrapper", () => {
		const source = readSource("./public-signup-cta.astro");

		expect(source).not.toContain("surveyQuestions");
		expect(source).not.toContain("discoveryCallUrl");
		expect(source).toContain("sourcePage: string;");
		expect(source).toContain("ctaTarget?: string;");
	});

	it("keeps FunnelCta source-page aware", () => {
		const source = readSource("./funnel-cta.astro");

		expect(source).toContain("sourcePage?: string");
		expect(source).toContain("resolvePublicSignupCta({");
	});

	it("keeps the homepage CTA surfaces free of client-side signup link syncing", () => {
		const source = readSource("../layouts/base-layout.astro");

		expect(source).not.toContain("syncPublicSignupLinks");
		expect(source).not.toContain("astro:after-swap");
	});
});
