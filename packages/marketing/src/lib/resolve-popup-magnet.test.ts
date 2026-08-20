import { describe, expect, it } from "vitest";
import type { LeadMagnet } from "../types.js";
import { resolvePopupMagnet, resolvePopupMagnetForSlug } from "./resolve-popup-magnet.js";

const fallback: LeadMagnet = {
	title: "Site Default Guide",
	description: "A fallback guide.",
	slug: "site-default-guide",
};

describe("resolvePopupMagnet", () => {
	it("returns the track's default magnet when a track is given", () => {
		const result = resolvePopupMagnet("billing", fallback);
		expect(result?.slug).toBe("ccdf-billing-error-prevention");
	});

	it("returns the default magnet for each track", () => {
		expect(resolvePopupMagnet("compliance", fallback)?.slug).toBe("licensing-compliance-checklist");
		expect(resolvePopupMagnet("buying", fallback)?.slug).toBe(
			"childcare-software-pricing-comparison",
		);
		expect(resolvePopupMagnet("hr", fallback)?.slug).toBe("childcare-staff-handbook-template");
	});

	it("returns the fallback when no track is given", () => {
		expect(resolvePopupMagnet(undefined, fallback)).toBe(fallback);
	});

	it("returns undefined when no track and no fallback are given", () => {
		expect(resolvePopupMagnet(undefined, undefined)).toBeUndefined();
	});
});

describe("resolvePopupMagnetForSlug", () => {
	it("maps a magnet slug to its track's default magnet", () => {
		expect(resolvePopupMagnetForSlug("ccdf-billing-error-prevention").slug).toBe(
			"ccdf-billing-error-prevention",
		);
	});

	it("falls back to the compliance default for an unknown slug", () => {
		expect(resolvePopupMagnetForSlug("unknown-slug").slug).toBe("licensing-compliance-checklist");
	});
});
