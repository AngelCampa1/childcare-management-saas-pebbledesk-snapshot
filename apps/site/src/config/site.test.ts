import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUBSCRIPTION_PROMOTIONS } from "@pebbledesk/shared/constants";
import { describe, expect, it } from "vitest";
import { siteConfig } from "./site";

const configDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(configDir, "..", "..", "public");
const ogImagePath = join(publicDir, siteConfig.defaultOgImage.replace(/^\//, ""));
const homepageSource = readFileSync(join(configDir, "..", "pages", "index.astro"), "utf8");

describe("pebbledesk site config", () => {
	it("keeps the homepage metadata inside the SEO validator range", () => {
		expect(siteConfig.metaDescription.length).toBeGreaterThanOrEqual(150);
		expect(siteConfig.metaDescription.length).toBeLessThanOrEqual(160);
	});

	it("references a real default OpenGraph image", () => {
		expect(siteConfig.defaultOgImage).toBe("/og-default.png");
		expect(existsSync(ogImagePath)).toBe(true);
	});

	it("keeps stable public logo asset paths for the site config", () => {
		expect(siteConfig.logo).toEqual({
			light: "/logo-light.svg",
			dark: "/logo-dark.svg",
		});
	});

	it("uses Angel Campa as the founder and SEO content author", () => {
		expect(siteConfig.author).toEqual({
			name: "Angel Campa",
			url: "/about/",
			jobTitle: "Founder",
			sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
		});
	});

	it("preserves the childcare compliance positioning and center-plan pricing", () => {
		expect(siteConfig.product.category).toBe("Childcare Center Administration Software");
		expect(siteConfig.product.price).toBe(
			"Plans start at $8/mo when paid yearly, then $39/mo when paid yearly ($468/year). Center plans start at $26/mo when paid yearly, then $129/mo when paid yearly ($1548/year). M80OFF and Y80OFF give 80% off the first year on eligible subscriptions.",
		);
		expect(siteConfig.pricingTiers.map((tier) => tier.name)).toEqual([
			"Home",
			"Center Starter",
			"Center Pro",
			"Group",
		]);
		expect(siteConfig.pricingTiers.map((tier) => tier.name)).not.toContain("Enterprise");
		expect(siteConfig.pricingTiers[1]?.price).toBe("$26/mo when paid yearly");
		expect(siteConfig.promoBanner.renewalLabel).toBe("Then $39/mo when paid yearly ($468/year)");
		expect(siteConfig.pricingTiers[1]?.promotionalPrice?.annual.badgeLabel).toBe(
			"80% off the first year",
		);
		expect(siteConfig.pricingTiers[1]?.promotionalPrice?.monthly.badgeLabel).toBe(
			"80% off the first year",
		);
		expect(siteConfig.pricingTiers[1]?.promotionalPrice?.annual.renewalPriceLabel).toBe(
			"Then $129/mo when paid yearly ($1548/year)",
		);
		expect(siteConfig.pricingTiers[1]?.promotionalPrice?.annual.discountedPriceLabel).toBe(
			"$26/mo when paid yearly",
		);
		expect(siteConfig.pricingTiers[1]?.annualPriceOverride).toBe("$1548/year");
		expect(siteConfig.pricingTiers[1]?.highlighted).toBe(true);
		expect(siteConfig.pricingTiers.map((t) => t.slug)).toEqual([
			"home",
			"center_starter",
			"center_pro",
			"group",
		]);
		expect(siteConfig.pricingTiers[0]?.price).toBe("$8/mo when paid yearly");
		expect(siteConfig.pricingTiers[2]?.price).toBe("$40/mo when paid yearly");
		expect(siteConfig.pricingTiers[3]?.price).toBe("$80/mo when paid yearly");
	});

	it("routes the primary conversion CTA into the product signup flow", () => {
		expect(siteConfig.funnel.bofu.ctaTarget).toBe(
			"https://my.pebbledesk.app/signup?plan=center_starter&source=%2F",
		);
		expect(siteConfig.copy.survey?.qualifiedCtaText).toBe("Create account");
		expect(siteConfig.survey.questions.map((question) => question.id)).toEqual([
			"role",
			"center_size",
			"pain",
		]);
		expect(siteConfig.survey.questions[1]?.options).toEqual([
			"1-15 children",
			"16-50 children",
			"51-100 children",
			"100+ children",
			"Planning a new center",
		]);
		expect(siteConfig.copy.survey?.qualifiedHeading).toBe(
			"You look like a fit for Home, Center Starter, or Center Pro.",
		);
		expect(siteConfig.survey.qualification?.rules[1]?.answers).toEqual([
			"1-15 children",
			"16-50 children",
			"51-100 children",
			"100+ children",
		]);
		expect(siteConfig.survey.qualification?.rules).toHaveLength(3);
	});

	it("uses trailing-slash hub links for marketing navigation", () => {
		expect(siteConfig.funnel.tofu.ctaTarget).toBe("/resources/");
		expect(siteConfig.funnel.mofu.ctaTarget).toBe("/compare/");
		expect(siteConfig.nav?.items?.map((item) => item.label)).toEqual([
			"Product",
			"Pricing",
			"Resources",
			"About",
		]);
		expect(siteConfig.nav?.items?.some((item) => item.label === "Who it's for")).toBe(false);
		expect(siteConfig.nav?.items?.some((item) => item.label === "Compare")).toBe(false);

		const megaItems = siteConfig.nav?.items?.filter((item) => "megaMenu" in item) ?? [];
		expect(megaItems).toHaveLength(2);
		const productMega = megaItems.find((item) => item.label === "Product");
		expect(productMega).toBeDefined();
		if (!productMega || !("megaMenu" in productMega)) {
			throw new Error("Product megamenu is missing");
		}
		expect(productMega.megaMenu?.map((category) => category.heading)).toEqual([
			"Features",
			"Who it's for",
		]);
		expect(productMega.megaMenu?.[0]?.links.map((link) => link.href)).toEqual([
			"/features/",
			"/features/ratio-tracking/",
			"/features/subsidy-billing/",
		]);
		const productAudienceCategory = productMega.megaMenu?.[1];
		if (!productAudienceCategory || !("viewAllHref" in productAudienceCategory)) {
			throw new Error("Product audience megamenu category is missing its hub link");
		}
		expect(productAudienceCategory.viewAllHref).toBe("/for/");
		expect(productAudienceCategory.links.map((link) => link.href)).toEqual([
			"/for/childcare-center-directors/",
			"/for/in-home-daycare-providers/",
			"/for/multi-site-childcare-operators/",
		]);

		const pricingItem = siteConfig.nav?.items?.find((item) => item.label === "Pricing");
		expect(pricingItem).toEqual({ label: "Pricing", href: "/pricing/" });
		const aboutItem = siteConfig.nav?.items?.find((item) => item.label === "About");
		expect(aboutItem).toEqual({ label: "About", href: "/about/" });

		const resourcesMega = megaItems.find((item) => item.label === "Resources");
		if (!resourcesMega || !("megaMenu" in resourcesMega)) {
			throw new Error("Resources megamenu is missing");
		}
		const resourceCategories = resourcesMega.megaMenu ?? [];
		expect(resourceCategories.map((category) => category.heading)).toEqual([
			"Compliance",
			"Compare & plan",
			"Operations",
		]);
		expect(
			resourceCategories.flatMap((category) => category.links.map((link) => link.href)),
		).toEqual([
			"/resources/audit-licensing/",
			"/resources/attendance-ratios/",
			"/resources/state-local/",
			"/resources/subsidy-billing/",
			"/resources/compare-pricing/",
			"/compare/",
			"/resources/free-tools/",
			"/resources/staff-operations/",
			"/resources/software-buying/",
		]);
		expect(siteConfig.nav?.signInHref).toBe("https://my.pebbledesk.app/login");
		expect(siteConfig.nav?.ctaText).toBe("Start free trial");
		expect(siteConfig.footer.linkGroups[0]?.links[0]).toEqual({
			label: "Features",
			href: "/features/",
		});
		expect(siteConfig.footer.linkGroups[1]?.links[2]).toEqual({
			label: "Compare Software",
			href: "/compare/",
		});
	});

	it("keeps secondary marketing surfaces organized outside the header", () => {
		expect(siteConfig.footer.linkGroups.map((group) => group.heading)).toEqual([
			"Product",
			"Resources",
			"About",
		]);
		expect(siteConfig.footer.linkGroups[0]?.links.map((link) => link.href)).toEqual([
			"/features/",
			"/features/ratio-tracking/",
			"/features/subsidy-billing/",
			"/pricing/",
		]);
		expect(siteConfig.footer.linkGroups[1]?.links.map((link) => link.href)).toEqual([
			"/resources/guides/how-to-choose-childcare-management-software/",
			"/resources/best/best-childcare-software-small-centers/",
			"/compare/",
			"/resources/compare-pricing/",
			"/childcare-software/texas/",
			"/free/licensing-compliance-checklist/",
		]);
		expect(siteConfig.footer.linkGroups[2]?.links.map((link) => link.href)).toEqual([
			"/about/",
			"/for/",
			"/for/childcare-center-directors/",
			"/for/in-home-daycare-providers/",
			"/for/multi-site-childcare-operators/",
		]);
	});

	it("keeps marketing copy aligned with the online-only product promise", () => {
		const internetOutageFaq = siteConfig.faqs.find(
			(entry) => entry.q === "What happens if my internet goes down?",
		);
		const serializedConfig = JSON.stringify(siteConfig);

		expect(internetOutageFaq?.a).not.toContain("available offline");
		expect(internetOutageFaq?.a).not.toContain("sync once the connection comes back");
		expect(internetOutageFaq?.a).toContain("online-only in V1");
		expect(serializedConfig).not.toContain("Offline check-in/out");
		expect(serializedConfig).not.toContain("$20/month");
		expect(serializedConfig).not.toContain("$50/month");
	});

	it("uses setup-walkthrough messaging instead of parity-only live-site trial language", () => {
		expect(siteConfig.discoveryCallIncentive).toContain("15-minute setup walkthrough");
		expect(siteConfig.copy.emailCapture?.whatHappensNext).toContain(
			"book a 15-minute setup walkthrough",
		);
		expect(siteConfig.copy.emailCapture?.whatHappensNext?.toLowerCase()).not.toContain("follow up");
		expect(siteConfig.copy.survey?.qualifiedBody).toContain(
			"continue into setup for the plan that fits your program",
		);
	});

	it("keeps the public trial promise aligned with the required billing disclosures", () => {
		expect(siteConfig.funnel.ctaSubtitle).toContain("30-day free trial");
		expect(siteConfig.funnel.ctaSubtitle).toContain("No credit card required");
		expect(siteConfig.funnel.ctaSubtitle).toContain("30-day money-back guarantee");
		expect(siteConfig.copy.emailCapture?.subtitle).toContain("30-day free trial");
		expect(siteConfig.copy.emailCapture?.subtitle).toContain("No credit card required");
		expect(siteConfig.copy.emailCapture?.whatHappensNext).toContain(
			"email you 3 days before the trial ends",
		);
		expect(siteConfig.pricingConfig?.trialBannerText).toContain("Y80OFF");
		expect(siteConfig.pricingConfig?.trialBannerText).toContain("80% off the first year");
		expect(siteConfig.pricingConfig?.trialBannerText).toContain(
			"Then $39/mo when paid yearly ($468/year)",
		);
		expect(siteConfig.pricingConfig?.trialBannerText).not.toContain("80% off once");
		expect(siteConfig.pricingConfig?.trialBannerText).toContain(
			SUBSCRIPTION_PROMOTIONS[1].urgencyLabel,
		);
		expect(siteConfig.pricingConfig?.trialBannerText).not.toContain("May 31");
		expect(siteConfig.pricingConfig?.trialBannerText).toContain("30-day free trial");
		expect(siteConfig.pricingConfig?.trialBannerText).toContain(
			"email you 3 days before the trial ends",
		);
		expect(siteConfig.funnel.bofu.ctaText).toBe("Start 30-day free trial");
	});

	it("keeps lead magnet capture copy focused only on the requested resource", () => {
		expect(siteConfig.copy.exitPopup?.successSubMessage).toContain("We will send the PDF");
		expect(siteConfig.copy.exitPopup?.successSubMessage?.toLowerCase()).not.toContain("follow-up");
		expect(siteConfig.copy.exitPopup?.successSubMessage?.toLowerCase()).not.toContain("sequence");
		expect(siteConfig.copy.exitPopup?.successSubMessage?.toLowerCase()).not.toContain(
			"unsubscribe",
		);
		expect(siteConfig.copy.exitPopup?.privacyNote).toContain("We will email the checklist");
		expect(siteConfig.copy.exitPopup?.privacyNote?.toLowerCase()).not.toContain("follow-up");
		expect(siteConfig.copy.exitPopup?.privacyNote?.toLowerCase()).not.toContain("sequence");
		expect(siteConfig.copy.exitPopup?.privacyNote?.toLowerCase()).not.toContain("unsubscribe");
		expect(siteConfig.copy.exitPopup?.privacyNote?.toLowerCase()).not.toContain("no spam");
		expect(siteConfig.copy.exitPopup?.privacyNote?.toLowerCase()).not.toContain("spam");
	});

	it("keeps the homepage trial disclosures consistent across metadata and key CTA sections", () => {
		expect(homepageSource).toContain("PEBBLEDESK_OFFERING.claims.trialDisclosure");
		expect(homepageSource).toContain("What PebbleDesk solves");
		expect(homepageSource).toContain("How PebbleDesk solves it");
		expect(homepageSource).toContain("Who PebbleDesk is for");
		expect(homepageSource).not.toContain(
			'<span class="sr-only">Audit-ready childcare records in one place</span>',
		);
		expect(siteConfig.heroCopy?.headline).toBe("Audit-ready childcare records in one place.");
		expect(homepageSource).not.toContain("site reflects the product more honestly");
		expect(homepageSource).not.toContain("This is not a flat icon grid");
	});

	it("keeps the shared landing copy direct and director-facing", () => {
		expect(siteConfig.heroCopy?.headline).toBe("Audit-ready childcare records in one place.");
		expect(siteConfig.heroCopy?.subheadline).toContain(
			"attendance, ratios, subsidy billing, family records, and reports",
		);
		expect(siteConfig.problemAgitation.heading).toBe(
			"Childcare records fall apart when the daily work is split across too many places.",
		);
		expect(siteConfig.product.targetAudience).toContain(
			"licensed childcare centers, family childcare homes, and multi-site childcare operators",
		);
	});
});
