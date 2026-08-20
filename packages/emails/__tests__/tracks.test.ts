import {
	getLeadMagnetBySlug,
	leadMagnetCatalog,
} from "@pebbledesk/shared/public-knowledge/lead-magnets";
import { describe, expect, it } from "vitest";
import { getTrackForMagnet, MAGNET_TRACKS, type MagnetTrack } from "../src/tracks.js";

const VALID_TRACKS: ReadonlySet<MagnetTrack> = new Set(["compliance", "billing", "buying", "hr"]);

describe("MAGNET_TRACKS", () => {
	it("maps every slug to one of the three valid tracks", () => {
		for (const [slug, track] of Object.entries(MAGNET_TRACKS)) {
			expect(VALID_TRACKS.has(track), `${slug} track invalid: ${track}`).toBe(true);
		}
	});

	it("covers all sixteen launch magnets", () => {
		expect(Object.keys(MAGNET_TRACKS)).toHaveLength(16);
		expect(Object.keys(MAGNET_TRACKS).sort()).toEqual(
			leadMagnetCatalog.map((magnet) => magnet.slug).sort(),
		);
	});

	it("groups magnets into the designed tracks", () => {
		expect(MAGNET_TRACKS["licensing-compliance-checklist"]).toBe("compliance");
		expect(MAGNET_TRACKS["ratio-tracking-cheatsheet"]).toBe("compliance");
		expect(MAGNET_TRACKS["state-audit-preparation-toolkit"]).toBe("compliance");
		expect(MAGNET_TRACKS["parent-handbook-template"]).toBe("compliance");
		expect(MAGNET_TRACKS["cacfp-compliance-checklist"]).toBe("compliance");
		expect(MAGNET_TRACKS["childcare-enrollment-agreement-template"]).toBe("compliance");
		expect(MAGNET_TRACKS["incident-report-log-template"]).toBe("compliance");
		expect(MAGNET_TRACKS["head-start-self-assessment-checklist"]).toBe("compliance");
		expect(MAGNET_TRACKS["ccdf-billing-error-prevention"]).toBe("billing");
		expect(MAGNET_TRACKS["state-subsidy-billing-guide"]).toBe("billing");
		expect(MAGNET_TRACKS["childcare-fee-policy-template"]).toBe("billing");
		expect(MAGNET_TRACKS["childcare-software-pricing-comparison"]).toBe("buying");
		expect(MAGNET_TRACKS["childcare-software-scorecard"]).toBe("buying");
		expect(MAGNET_TRACKS["brightwheel-cost-calculator"]).toBe("buying");
		expect(MAGNET_TRACKS["childcare-staff-handbook-template"]).toBe("hr");
		expect(MAGNET_TRACKS["staff-credential-tracker"]).toBe("hr");
	});

	it("re-exports the canonical shared lead magnet track map", () => {
		for (const [slug, track] of Object.entries(MAGNET_TRACKS)) {
			expect(getLeadMagnetBySlug(slug)?.track).toBe(track);
		}
	});
});

describe("getTrackForMagnet", () => {
	it("returns the mapped track for known slugs", () => {
		expect(getTrackForMagnet("licensing-compliance-checklist")).toBe("compliance");
		expect(getTrackForMagnet("ccdf-billing-error-prevention")).toBe("billing");
		expect(getTrackForMagnet("brightwheel-cost-calculator")).toBe("buying");
	});

	it("falls back to 'compliance' for unknown slugs", () => {
		expect(getTrackForMagnet("not-a-real-magnet")).toBe("compliance");
		expect(getTrackForMagnet("")).toBe("compliance");
	});
});
