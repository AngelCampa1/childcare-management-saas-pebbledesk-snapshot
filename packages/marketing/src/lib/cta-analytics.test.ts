import { describe, expect, it } from "vitest";

import { buildCtaAnalyticsAttributes, buildCtaClickEventProperties } from "./cta-analytics";

describe("buildCtaAnalyticsAttributes", () => {
	it("maps shared CTA analytics context into data attributes", () => {
		expect(
			buildCtaAnalyticsAttributes({
				pageFamily: "comparison",
				buyerStage: "mofu",
				placement: "mid-article-routing",
				intent: "evaluate",
				target: "/compare/vendors",
			}),
		).toEqual({
			"data-cta-button": "",
			"data-cta-page-family": "comparison",
			"data-cta-buyer-stage": "mofu",
			"data-cta-placement": "mid-article-routing",
			"data-cta-intent": "evaluate",
			"data-cta-target": "/compare/vendors",
		});
	});

	it("omits undefined analytics fields while keeping CTA tracking enabled", () => {
		expect(buildCtaAnalyticsAttributes()).toEqual({
			"data-cta-button": "",
		});
	});
});

describe("buildCtaClickEventProperties", () => {
	it("merges CTA analytics context from the clicked element", () => {
		document.body.innerHTML = `
      <a
        href="/book-demo"
        data-cta-button
        data-cta-page-family="pricing"
        data-cta-buyer-stage="bofu"
        data-cta-placement="inline-routing"
        data-cta-intent="convert"
        data-cta-target="/book-demo"
      >
        Book a demo
      </a>
    `;

		const ctaElement = document.querySelector("a");
		if (!(ctaElement instanceof HTMLElement)) {
			throw new Error("Expected CTA element to be present");
		}

		expect(
			buildCtaClickEventProperties(ctaElement, {
				href: "/book-demo",
				section: "decision-cta-card",
				pagePath: "/pricing",
			}),
		).toEqual({
			href: "/book-demo",
			section: "decision-cta-card",
			page_path: "/pricing",
			page_family: "pricing",
			buyer_stage: "bofu",
			placement: "inline-routing",
			intent: "convert",
			target: "/book-demo",
		});
	});

	it("falls back to the closest ancestor for shared analytics attributes", () => {
		document.body.innerHTML = `
      <section
        data-cta-page-family="guide"
        data-cta-buyer-stage="tofu"
        data-cta-placement="sidebar"
      >
        <a href="/guides" data-cta-button>Explore guides</a>
      </section>
    `;

		const ctaElement = document.querySelector("a");
		if (!(ctaElement instanceof HTMLElement)) {
			throw new Error("Expected CTA element to be present");
		}

		expect(
			buildCtaClickEventProperties(ctaElement, {
				href: "/guides",
				section: "sidebar-cta",
				pagePath: "/resources",
			}),
		).toEqual({
			href: "/guides",
			section: "sidebar-cta",
			page_path: "/resources",
			page_family: "guide",
			buyer_stage: "tofu",
			placement: "sidebar",
		});
	});
});
