import { describe, expect, it } from "vitest";

import { findPricingIntentTierFromSearch, getPricingIntentTierFromHref } from "./pricing-intent";

const tiers = [
	{ name: "Home", slug: "home" },
	{ name: "Center Starter", slug: "center_starter" },
	{ name: "Center Pro", slug: "center_pro" },
	{ name: "Group", slug: "group" },
	{ name: "Enterprise", slug: "enterprise" },
];

describe("pricing-intent", () => {
	describe("getPricingIntentTierFromHref", () => {
		it("returns the normalized plan query param when present", () => {
			expect(getPricingIntentTierFromHref("/?plan=center_starter#pricing")).toBe("center starter");
		});

		it("returns center pro from query param", () => {
			expect(getPricingIntentTierFromHref("/?plan=center_pro#pricing")).toBe("center pro");
		});

		it("returns undefined when the href has no plan query param", () => {
			expect(getPricingIntentTierFromHref("/#pricing")).toBeUndefined();
		});

		it("supports absolute urls", () => {
			expect(getPricingIntentTierFromHref("https://pebbledesk.app/?plan=enterprise#pricing")).toBe(
				"enterprise",
			);
		});

		it("returns home plan from query param", () => {
			expect(getPricingIntentTierFromHref("/?plan=home")).toBe("home");
		});
	});

	describe("findPricingIntentTierFromSearch", () => {
		it("matches Center Starter tier via slug", () => {
			expect(findPricingIntentTierFromSearch("?plan=center_starter", tiers)).toBe("Center Starter");
		});

		it("matches Center Pro tier via slug", () => {
			expect(findPricingIntentTierFromSearch("?plan=center_pro", tiers)).toBe("Center Pro");
		});

		it("matches Home tier via slug", () => {
			expect(findPricingIntentTierFromSearch("?plan=home", tiers)).toBe("Home");
		});

		it("matches Enterprise tier via slug", () => {
			expect(findPricingIntentTierFromSearch("?plan=enterprise", tiers)).toBe("Enterprise");
		});

		it("matches Group tier via slug", () => {
			expect(findPricingIntentTierFromSearch("?plan=group", tiers)).toBe("Group");
		});

		it("matches tier by name when slug is absent (hyphen/space normalized)", () => {
			const tiersNoSlug = [{ name: "Center Starter" }, { name: "Home" }] as typeof tiers;
			expect(findPricingIntentTierFromSearch("?plan=center-starter", tiersNoSlug)).toBe(
				"Center Starter",
			);
		});

		it("returns undefined when the plan param does not match any tier", () => {
			expect(findPricingIntentTierFromSearch("?plan=unknown", tiers)).toBeUndefined();
		});

		it("returns undefined when the search string has no plan param", () => {
			expect(findPricingIntentTierFromSearch("", tiers)).toBeUndefined();
		});
	});
});
