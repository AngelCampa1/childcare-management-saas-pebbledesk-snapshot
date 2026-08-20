import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
	DEFAULT_PUBLIC_SIGNUP_MESSAGE,
	getProductSignupUrl,
	resolvePublicSignupCta,
	sanitizePublicSignupCtaText,
	sanitizePublicSignupMessage,
} from "./public-signup-cta";

describe("resolvePublicSignupCta", () => {
	beforeEach(() => {
		delete (import.meta.env as Record<string, unknown>).PUBLIC_APP_URL;
	});

	afterEach(() => {
		delete (import.meta.env as Record<string, unknown>).PUBLIC_APP_URL;
	});

	it("uses the product signup URL for homepage CTAs", () => {
		expect(resolvePublicSignupCta({ sourcePage: "/" })).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?source=%2F",
		});
	});

	it("uses the product signup URL for non-home pages by default", () => {
		expect(resolvePublicSignupCta({ sourcePage: "/resources/guides/example" })).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?source=%2Fresources%2Fguides%2Fexample",
		});
	});

	it("preserves paginated hub paths in the source parameter", () => {
		expect(resolvePublicSignupCta({ sourcePage: "/resources/guides/2" })).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?source=%2Fresources%2Fguides%2F2",
		});
	});

	it("preserves trial-oriented CTA copy when routing to signup", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/resources/guides/example",
				explicitTarget: "/?plan=center#pricing",
				explicitText: "Start Center Trial",
			}),
		).toEqual({
			text: "Start Center Trial",
			target:
				"https://my.pebbledesk.app/signup?plan=center_starter&source=%2Fresources%2Fguides%2Fexample",
		});
	});

	it("preserves explicit center starter plan targets from marketing hubs", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/compare",
				explicitTarget: "/signup?plan=center_starter",
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?plan=center_starter&source=%2Fcompare",
		});
	});

	it("preserves annual billing cadence from explicit pricing CTA targets", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				explicitTarget: "/signup?plan=center_starter&billing=annual",
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target:
				"https://my.pebbledesk.app/signup?plan=center_starter&billing=annual&source=%2Fpricing",
		});
	});

	it("canonicalizes authored plan aliases before building the signup target", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				explicitTarget: "/signup?plan=center pro",
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?plan=center_pro&source=%2Fpricing",
		});
	});

	it("preserves the center starter plan when routing a compare CTA to signup", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/compare",
				explicitTarget: "https://my.pebbledesk.app/signup?plan=center_starter&source=%2F",
				explicitText: "Create Center Account",
			}),
		).toEqual({
			text: "Create Center Account",
			target: "https://my.pebbledesk.app/signup?plan=center_starter&source=%2Fcompare",
		});
	});

	it("preserves safe CTA copy while routing to signup", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/resources/guides/example",
				explicitText: "Create account",
			}),
		).toEqual({
			text: "Create account",
			target: "https://my.pebbledesk.app/signup?source=%2Fresources%2Fguides%2Fexample",
		});
	});

	it("infers the home plan from non-URL targets", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				explicitTarget: "/plans/home-provider",
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?plan=home&source=%2Fpricing",
		});
	});

	it("does not infer enterprise as a selectable signup plan", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				explicitTarget: "https://pebbledesk.app/enterprise-demo",
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?source=%2Fpricing",
		});
	});

	it("falls back to keyword matching when the target is not a valid URL (starter)", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				explicitTarget: "%%%center_starter%%%",
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?plan=center_starter&source=%2Fpricing",
		});
	});

	it("falls back to keyword matching when the target contains 'center-pro'", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				explicitTarget: "%%%center-pro%%%",
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?plan=center_pro&source=%2Fpricing",
		});
	});

	it("omits the plan when an invalid target does not match a known plan", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				explicitTarget: "%%%invalid%%%",
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?source=%2Fpricing",
		});
	});

	it("preserves UTM attribution when it is provided", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				attribution: {
					utmSource: "google",
					utmMedium: "cpc",
					utmCampaign: "spring",
					utmTerm: "childcare",
					utmContent: "ad-a",
				},
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target:
				"https://my.pebbledesk.app/signup?source=%2Fpricing&utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=childcare&utm_content=ad-a",
		});
	});

	it("preserves referral attribution when it is provided", () => {
		expect(
			resolvePublicSignupCta({
				sourcePage: "/pricing",
				attribution: {
					referredBy: "partner-ally",
				},
			}),
		).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "https://my.pebbledesk.app/signup?source=%2Fpricing&ref=partner-ally",
		});
	});

	it("uses PUBLIC_APP_URL as the base for direct signup links when set", () => {
		(import.meta.env as Record<string, unknown>).PUBLIC_APP_URL = "http://127.0.0.1:4173";

		expect(resolvePublicSignupCta({ sourcePage: "/pricing" })).toEqual({
			text: DEFAULT_PUBLIC_SIGNUP_CTA_TEXT,
			target: "http://127.0.0.1:4173/signup?source=%2Fpricing",
		});
	});
});

describe("public signup source ownership", () => {
	it("uses shared public brand knowledge for the product app fallback", () => {
		const source = readFileSync(resolve(__dirname, "public-signup-cta.ts"), "utf8");

		expect(source).toContain("PUBLIC_BRAND_KNOWLEDGE.appOrigin");
		expect(source).not.toContain('"https://my.pebbledesk.app"');
	});
});

describe("getProductSignupUrl", () => {
	it("normalizes PUBLIC_APP_URL before appending the signup path", () => {
		(import.meta.env as Record<string, unknown>).PUBLIC_APP_URL = "http://127.0.0.1:4173/";

		expect(getProductSignupUrl()).toBe("http://127.0.0.1:4173/signup");
	});

	it("falls back to production URL when PUBLIC_APP_URL has an invalid scheme", () => {
		(import.meta.env as Record<string, unknown>).PUBLIC_APP_URL = "javascript:alert(1)";

		expect(getProductSignupUrl()).toBe("https://my.pebbledesk.app/signup");
	});

	it("falls back to production URL when PUBLIC_APP_URL is empty", () => {
		(import.meta.env as Record<string, unknown>).PUBLIC_APP_URL = "";

		expect(getProductSignupUrl()).toBe("https://my.pebbledesk.app/signup");
	});

	it("accepts https:// scheme", () => {
		(import.meta.env as Record<string, unknown>).PUBLIC_APP_URL = "https://staging.pebbledesk.app";

		expect(getProductSignupUrl()).toBe("https://staging.pebbledesk.app/signup");
	});
});

describe("sanitizePublicSignupCtaText", () => {
	it("replaces waitlist CTA copy with account-creation copy", () => {
		expect(sanitizePublicSignupCtaText("Join the waitlist")).toBe(DEFAULT_PUBLIC_SIGNUP_CTA_TEXT);
	});

	it("replaces book-walkthrough CTA copy with account-creation copy", () => {
		expect(sanitizePublicSignupCtaText("Book walkthrough")).toBe(DEFAULT_PUBLIC_SIGNUP_CTA_TEXT);
	});

	it("preserves trial CTA copy now that a 30-day trial exists", () => {
		expect(sanitizePublicSignupCtaText("Start free trial")).toBe("Start free trial");
		expect(sanitizePublicSignupCtaText("Start your 30-day trial")).toBe("Start your 30-day trial");
	});

	it("preserves safe CTA copy", () => {
		expect(sanitizePublicSignupCtaText("See pricing")).toBe("See pricing");
	});
});

describe("sanitizePublicSignupMessage", () => {
	it("preserves free-trial message copy now that a real trial exists", () => {
		expect(
			sanitizePublicSignupMessage(
				"Start your 30-day free trial. No credit card required. We email you 3 days before the trial ends.",
			),
		).toBe(
			"Start your 30-day free trial. No credit card required. We email you 3 days before the trial ends.",
		);
	});

	it("replaces follow-up message copy with neutral fake-door copy", () => {
		expect(
			sanitizePublicSignupMessage("Quick follow-up, then a free trial with no credit card"),
		).toBe(DEFAULT_PUBLIC_SIGNUP_MESSAGE);
	});

	it("replaces waitlist-oriented helper copy with neutral fake-door copy", () => {
		expect(
			sanitizePublicSignupMessage("Join the waitlist and we will let you know when it opens."),
		).toBe(DEFAULT_PUBLIC_SIGNUP_MESSAGE);
	});

	it("preserves safe helper copy", () => {
		expect(sanitizePublicSignupMessage("Create your account and finish setup.")).toBe(
			"Create your account and finish setup.",
		);
	});

	it("returns undefined when no helper copy is provided", () => {
		expect(sanitizePublicSignupMessage(undefined)).toBeUndefined();
	});
});
