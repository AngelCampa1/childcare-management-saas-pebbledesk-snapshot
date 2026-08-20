import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage source", () => {
	it("keeps the hero and primary trial CTA tied to shared site config", () => {
		const source = readFileSync(resolve(process.cwd(), "src/pages/index.astro"), "utf8");

		expect(source).toContain("siteConfig.heroCopy?.headline");
		expect(source).toContain("siteConfig.heroCopy?.subheadline");
		expect(source).toContain("siteConfig.funnel.bofu.ctaTarget");
		expect(source).toContain("PEBBLEDESK_OFFERING.trial.label");
	});

	it("expands the homepage around the clear what, how, and who story", () => {
		const source = readFileSync(resolve(process.cwd(), "src/pages/index.astro"), "utf8");

		expect(source).toContain("What PebbleDesk solves");
		expect(source).toContain("How PebbleDesk solves it");
		expect(source).toContain("Who PebbleDesk is for");
		expect(source).toContain("1. Capture the day");
		expect(source).toContain("2. Keep context attached");
		expect(source).toContain("3. Turn records into proof");
		expect(source).toContain("4. Start without a rebuild");
		expect(source).toContain(
			"PebbleDesk is for center directors, owner/operators, family childcare providers, administrators, and multi-site operators",
		);
		expect(source).not.toContain("site reflects the product more honestly");
	});

	it("keeps plan-fit and evaluation-oriented secondary CTA framing", () => {
		const source = readFileSync(resolve(process.cwd(), "src/pages/index.astro"), "utf8");

		expect(source).toContain("Built for childcare operators who own the record");
		expect(source).toContain("Plan fit");
		expect(source).toContain("enterprisePricingNote");
		expect(source).not.toContain("Evaluate plans");
		expect(source).not.toContain(
			'<span class="sr-only">Audit-ready childcare records in one place</span>',
		);
		expect(source).not.toContain("Offline-ready attendance tools");
	});

	it("wires distinct self-serve signup plans for the homepage plan-fit cards", () => {
		const source = readFileSync(resolve(process.cwd(), "src/pages/index.astro"), "utf8");
		const tierSlugInterpolation = "$" + "{tier.slug}";

		expect(source).toContain(`\`/signup?plan=${tierSlugInterpolation}&source=%2F\``);
		expect(source).toContain("href={tier.cta.target}");
		expect(source).not.toContain('? "/pricing/"');
		expect(source).not.toContain(`siteConfig.funnel.bofu.ctaTarget}&plan=${tierSlugInterpolation}`);
	});
});
