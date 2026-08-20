import { describe, expect, it } from "vitest";
import {
	getDefaultMagnetForTrack,
	getNurtureSequenceForMagnet,
	LEAD_MAGNET_NURTURE_SEQUENCES,
	type LeadMagnetTrack,
} from "./lead-magnets.js";

describe("getDefaultMagnetForTrack", () => {
	it("returns compliance magnet for compliance track", () => {
		const magnet = getDefaultMagnetForTrack("compliance");
		expect(magnet.slug).toBe("licensing-compliance-checklist");
		expect(magnet.track).toBe("compliance");
	});

	it("returns billing magnet for billing track", () => {
		const magnet = getDefaultMagnetForTrack("billing");
		expect(magnet.slug).toBe("ccdf-billing-error-prevention");
		expect(magnet.track).toBe("billing");
	});

	it("returns buying magnet for buying track", () => {
		const magnet = getDefaultMagnetForTrack("buying");
		expect(magnet.slug).toBe("childcare-software-pricing-comparison");
		expect(magnet.track).toBe("buying");
	});

	it("returns hr magnet for hr track", () => {
		const magnet = getDefaultMagnetForTrack("hr");
		expect(magnet.slug).toBe("childcare-staff-handbook-template");
		expect(magnet.track).toBe("hr");
	});

	it("always returns a magnet with a publicPath", () => {
		for (const track of ["compliance", "billing", "buying", "hr"] as const) {
			const magnet = getDefaultMagnetForTrack(track);
			expect(magnet.publicPath).toMatch(/^\/free\//);
		}
	});

	it("throws when a track has no resolvable default magnet", () => {
		// Defensive guard: an unmapped track yields an undefined slug, which is
		// not in the catalog. Cast to exercise the otherwise-unreachable branch.
		expect(() => getDefaultMagnetForTrack("nonexistent" as LeadMagnetTrack)).toThrow(
			/not found in catalog/,
		);
	});
});

describe("LEAD_MAGNET_NURTURE_SEQUENCES", () => {
	it("maps compliance to pebbledesk-nurture-compliance", () => {
		expect(LEAD_MAGNET_NURTURE_SEQUENCES.compliance).toBe("pebbledesk-nurture-compliance");
	});

	it("maps billing to pebbledesk-nurture-billing", () => {
		expect(LEAD_MAGNET_NURTURE_SEQUENCES.billing).toBe("pebbledesk-nurture-billing");
	});

	it("maps buying to pebbledesk-nurture-buying", () => {
		expect(LEAD_MAGNET_NURTURE_SEQUENCES.buying).toBe("pebbledesk-nurture-buying");
	});

	it("maps hr to pebbledesk-nurture-hr", () => {
		expect(LEAD_MAGNET_NURTURE_SEQUENCES.hr).toBe("pebbledesk-nurture-hr");
	});
});

describe("getNurtureSequenceForMagnet", () => {
	it("returns compliance sequence for a compliance magnet slug", () => {
		expect(getNurtureSequenceForMagnet("licensing-compliance-checklist")).toBe(
			"pebbledesk-nurture-compliance",
		);
	});

	it("returns billing sequence for a billing magnet slug", () => {
		expect(getNurtureSequenceForMagnet("ccdf-billing-error-prevention")).toBe(
			"pebbledesk-nurture-billing",
		);
	});

	it("returns buying sequence for a buying magnet slug", () => {
		expect(getNurtureSequenceForMagnet("childcare-software-pricing-comparison")).toBe(
			"pebbledesk-nurture-buying",
		);
	});

	it("returns hr sequence for an hr magnet slug", () => {
		expect(getNurtureSequenceForMagnet("childcare-staff-handbook-template")).toBe(
			"pebbledesk-nurture-hr",
		);
	});

	it("falls back to compliance sequence for unknown slug", () => {
		expect(getNurtureSequenceForMagnet("unknown-magnet-slug")).toBe(
			"pebbledesk-nurture-compliance",
		);
	});

	it("routes all catalog magnets to a valid sequence", () => {
		const validSequences = new Set(Object.values(LEAD_MAGNET_NURTURE_SEQUENCES));
		for (const slug of [
			"ratio-tracking-cheatsheet",
			"state-subsidy-billing-guide",
			"childcare-software-scorecard",
			"staff-credential-tracker",
		]) {
			expect(validSequences.has(getNurtureSequenceForMagnet(slug))).toBe(true);
		}
	});
});
