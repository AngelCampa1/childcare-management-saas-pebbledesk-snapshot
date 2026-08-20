import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("pricing page source", () => {
	it("keeps the visible pricing table aligned with current plan promises", () => {
		const source = readFileSync(new URL("../pages/pricing.astro", import.meta.url), "utf8");

		// Plan column headers are rendered via the HTML table (checked here) or via PricingCards
		expect(source).toContain("Home");
		expect(source).toContain("Center Starter");
		expect(source).toContain("Center Pro");
		expect(source).toContain("Group");
		// Comparison matrix now comes from buildComparisonRows(), the SSOT in offering.ts
		expect(source).toContain("buildComparisonRows()");
		expect(source).not.toContain("PEBBLEDESK_OFFERING.plans.map");
		expect(source).not.toContain("row.enterprise");
		expect(source).toContain("Enterprise stays sales-led");
	});

	it("renders enterprise as a sales-led note, not a selectable pricing card", () => {
		const source = readFileSync(new URL("../pages/pricing.astro", import.meta.url), "utf8");

		expect(source).toContain("buildEnterprisePricingNote");
		expect(source).toContain("enterprisePricingNote");
		expect(source).not.toContain('tier.slug === "enterprise"');
		expect(source).not.toContain('Contact sales" :');
	});

	it("keeps homepage plan-fit cards limited to self-serve pricing tiers", () => {
		const source = readFileSync(new URL("../pages/index.astro", import.meta.url), "utf8");

		expect(source).toContain("buildEnterprisePricingNote");
		expect(source).toContain("enterprisePricingNote");
		expect(source).not.toContain('tier.slug === "enterprise"');
		expect(source).not.toContain("Evaluate plans");
	});

	it("keeps trial and online-only disclosures visible", () => {
		const source = readFileSync(new URL("../pages/pricing.astro", import.meta.url), "utf8");

		// Trial label comes from PEBBLEDESK_OFFERING.trial (SSOT)
		expect(source).toContain("PEBBLEDESK_OFFERING.claims.trialDisclosure");
		expect(source).toContain("PEBBLEDESK_OFFERING.guarantee.label");
		expect(source).toContain("PebbleDesk is online-only in V1");
		expect(source).not.toContain("Offline check-in/out");
	});

	it("keeps the pricing page focused on program fit instead of internal claim language", () => {
		const source = readFileSync(new URL("../pages/pricing.astro", import.meta.url), "utf8");

		expect(source).toContain("Choose by the kind of childcare program you run now");
		expect(source).not.toContain("claims narrow enough to defend");
	});

	it("uses customer-facing annual savings copy", () => {
		const source = readFileSync(new URL("../config/site.ts", import.meta.url), "utf8");

		expect(source).toContain("annualSavingsText: formatAnnualSavingsLabel");
		expect(source).not.toContain('annualSavingsText: "2 months free"');
		expect(source).not.toContain("Annual default");
	});

	it("uses shared constants for trial reminder timing", () => {
		const source = readFileSync(new URL("../config/site.ts", import.meta.url), "utf8");

		expect(source).toContain("formatTrialEndReminderLabel");
		expect(source).not.toContain("3 days before the trial ends");
	});

	it("shows the limited offer with regular price after year one", () => {
		const source = readFileSync(new URL("../pages/pricing.astro", import.meta.url), "utf8");

		expect(source).toContain("limitedOfferSummary");
		expect(source).toContain("SUBSCRIPTION_PROMOTIONS");
		expect(source).toContain("homeAnnualPromo.renewalPriceLabel");
		expect(source).toContain("See each plan's regular price below");
		expect(source).not.toContain("M80OFF and Y80OFF give 80% off the first year");
		expect(source).not.toContain("80% off once");
		expect(source).not.toContain("80% off for 12 months");
	});
});
