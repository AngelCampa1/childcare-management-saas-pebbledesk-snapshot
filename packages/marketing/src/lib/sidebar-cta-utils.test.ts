import { describe, expect, it } from "vitest";
import type { BuyerStage, FunnelStage, SiteConfig } from "../types";
import { buildSidebarCtaProps } from "./sidebar-cta-utils";

const funnel: Record<BuyerStage, FunnelStage> & { ctaSubtitle: string } = {
	tofu: { ctaMode: "educate", ctaText: "Learn More", ctaTarget: "/guides" },
	mofu: {
		ctaMode: "evaluate",
		ctaText: "Compare Plans",
		ctaTarget: "/pricing",
	},
	bofu: {
		ctaMode: "convert",
		ctaText: "Start Free Trial",
		ctaTarget: "/signup",
	},
	ctaSubtitle:
		"30-day free trial. No credit card required. We email you 3 days before the trial ends.",
};

function makeConfig(overrides?: Partial<SiteConfig>): SiteConfig {
	return {
		name: "TestSite",
		domain: "testsite.com",
		tagline: "Test tagline",
		theme: {
			primary: "#000",
			accent: "#fff",
			fonts: { heading: "sans-serif", body: "sans-serif" },
		},
		product: {
			category: "SaaS",
			price: "$49/mo",
			targetAudience: "Developers",
			trustSignals: [],
		},
		competitors: [],
		funnel,
		survey: { questions: [] },
		faqs: [],
		discoveryCallUrl: "/call",
		discoveryCallIncentive: "Free 30-min call",
		problemAgitation: {
			heading: "The problem",
			closingLine: "We fix that",
			painPoints: [],
		},
		referral: { enabled: false, rewards: [] },
		...overrides,
	} satisfies SiteConfig;
}

describe("buildSidebarCtaProps", () => {
	it("returns correct ctaText and ctaTarget for tofu stage", () => {
		const config = makeConfig();
		const result = buildSidebarCtaProps(config, "tofu", "/resources/guides/example");
		expect(result.ctaText).toBe("Learn More");
		expect(result.ctaTarget).toBe(
			"https://my.pebbledesk.app/signup?source=%2Fresources%2Fguides%2Fexample",
		);
	});

	it("returns correct ctaText and ctaTarget for mofu stage", () => {
		const config = makeConfig();
		const result = buildSidebarCtaProps(config, "mofu", "/compare/alternatives/example");
		expect(result.ctaText).toBe("Compare Plans");
		expect(result.ctaTarget).toBe(
			"https://my.pebbledesk.app/signup?source=%2Fcompare%2Falternatives%2Fexample",
		);
	});

	it("returns resolved signup target with preserved plan inference for bofu stage", () => {
		const config = makeConfig({
			funnel: {
				...funnel,
				bofu: {
					ctaMode: "convert",
					ctaText: "Start Free Trial",
					ctaTarget: "https://my.pebbledesk.app/signup?plan=center&source=%2F",
				},
			},
		});
		const result = buildSidebarCtaProps(config, "bofu", "/childcare-software/texas");
		expect(result.ctaText).toBe("Start Free Trial");
		expect(result.ctaTarget).toBe(
			"https://my.pebbledesk.app/signup?plan=center_starter&source=%2Fchildcare-software%2Ftexas",
		);
	});

	it("returns subtitle from config.copy.funnelCta.subtitle when present", () => {
		const config = makeConfig({
			copy: {
				funnelCta: {
					subtitle:
						"30-day free trial. No credit card required. We email you 3 days before the trial ends.",
				},
			},
		});
		const result = buildSidebarCtaProps(config, "mofu", "/compare/example");
		expect(result.subtitle).toBe(
			"30-day free trial. No credit card required. We email you 3 days before the trial ends.",
		);
	});

	it("returns undefined for subtitle when config.copy is absent", () => {
		const config = makeConfig({ copy: undefined });
		const result = buildSidebarCtaProps(config, "mofu", "/compare/example");
		expect(result.subtitle).toBeUndefined();
	});

	it("returns bullets from config.copy.funnelCta.benefitBullets when present", () => {
		const config = makeConfig({
			copy: { funnelCta: { benefitBullets: ["Fast setup", "No contracts"] } },
		});
		const result = buildSidebarCtaProps(config, "bofu", "/pricing/example");
		expect(result.bullets).toEqual(["Fast setup", "No contracts"]);
	});

	it("returns undefined for bullets when not configured", () => {
		const config = makeConfig({ copy: undefined });
		const result = buildSidebarCtaProps(config, "bofu", "/pricing/example");
		expect(result.bullets).toBeUndefined();
	});

	it("returns trustNote from config.copy.funnelCta.trustNote when present", () => {
		const config = makeConfig({
			copy: { funnelCta: { trustNote: "SOC 2 compliant" } },
		});
		const result = buildSidebarCtaProps(config, "mofu", "/compare/example");
		expect(result.trustNote).toBe("SOC 2 compliant");
	});

	it("builds shared CTA analytics context from the selected funnel stage", () => {
		const config = makeConfig();
		const result = buildSidebarCtaProps(config, "bofu", "/compare/example");

		expect(result.analytics).toEqual({
			buyerStage: "bofu",
			intent: "convert",
			placement: "sidebar",
		});
	});
});
