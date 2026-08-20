import { describe, expect, it } from "vitest";
import {
	buildMarketingSearch,
	getSelectedPlanLabel,
	normalizeMarketingAttribution,
} from "./marketing-attribution";

describe("normalizeMarketingAttribution", () => {
	it("keeps supported plan and attribution fields", () => {
		expect(
			normalizeMarketingAttribution({
				plan: "center_starter",
				billing: "annual",
				source: "/compare",
				utm_source: "seo",
				utm_medium: "organic",
				utm_campaign: "spring",
				ref: "partner-ally",
			}),
		).toEqual({
			plan: "center_starter",
			billing: "annual",
			source: "/compare",
			utm_source: "seo",
			utm_medium: "organic",
			utm_campaign: "spring",
			ref: "partner-ally",
		});
	});

	it("drops unknown plans and non-string values", () => {
		expect(
			normalizeMarketingAttribution({
				plan: "starter",
				billing: "weekly",
				source: 42,
				utm_source: ["seo"],
			}),
		).toEqual({});
	});

	it("drops enterprise so signup attribution cannot preselect a sales-led plan", () => {
		expect(
			normalizeMarketingAttribution({
				plan: "enterprise",
				source: "/pricing",
			}),
		).toEqual({
			source: "/pricing",
		});
	});

	it("maps the legacy center plan alias onto center_starter", () => {
		expect(
			normalizeMarketingAttribution({
				plan: "center",
				source: "/pricing",
			}),
		).toEqual({
			plan: "center_starter",
			source: "/pricing",
		});
	});

	it("keeps a well-formed promo code", () => {
		expect(
			normalizeMarketingAttribution({
				plan: "home",
				promo: "LAUNCH_50",
			}),
		).toEqual({ plan: "home", promo: "LAUNCH_50" });
	});

	it("drops promo codes with disallowed characters", () => {
		expect(
			normalizeMarketingAttribution({
				promo: "bad promo!",
			}),
		).toEqual({});
	});

	it("drops promo codes longer than 64 characters", () => {
		expect(
			normalizeMarketingAttribution({
				promo: "A".repeat(65),
			}),
		).toEqual({});
	});

	it("drops non-string promo values", () => {
		expect(
			normalizeMarketingAttribution({
				promo: 12345,
			}),
		).toEqual({});
	});
});

describe("buildMarketingSearch", () => {
	it("returns only defined params", () => {
		expect(
			buildMarketingSearch({
				plan: "home",
				source: "/",
				utm_campaign: "launch",
				ref: "partner-ally",
			}),
		).toEqual({
			plan: "home",
			source: "/",
			utm_campaign: "launch",
			ref: "partner-ally",
		});
	});

	it("propagates the promo code when provided", () => {
		expect(
			buildMarketingSearch({
				plan: "center_starter",
				promo: "PARTNER30",
			}),
		).toEqual({ plan: "center_starter", promo: "PARTNER30" });
	});
});

describe("getSelectedPlanLabel", () => {
	it("formats supported plans for UI labels", () => {
		expect(getSelectedPlanLabel("home")).toBe("Home");
		expect(getSelectedPlanLabel("center_starter")).toBe("Center Starter");
		expect(getSelectedPlanLabel("center_pro")).toBe("Center Pro");
		expect(getSelectedPlanLabel("group")).toBe("Group");
	});

	it("returns null when plan is missing", () => {
		expect(getSelectedPlanLabel(undefined)).toBeNull();
	});
});
