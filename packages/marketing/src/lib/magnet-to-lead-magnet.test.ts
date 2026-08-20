import { getDefaultMagnetForTrack } from "@pebbledesk/shared/public-knowledge";
import { describe, expect, it } from "vitest";
import { magnetToLeadMagnet } from "./magnet-to-lead-magnet.js";

describe("magnetToLeadMagnet", () => {
	it("maps slug, title, description from LeadMagnetKnowledge", () => {
		const magnet = getDefaultMagnetForTrack("compliance");
		const result = magnetToLeadMagnet(magnet);
		expect(result.slug).toBe("licensing-compliance-checklist");
		expect(result.title).toBe("Licensing Compliance Checklist");
		expect(typeof result.description).toBe("string");
		expect(result.description.length).toBeGreaterThan(0);
	});

	it("produces the correct slug for billing track default magnet", () => {
		const magnet = getDefaultMagnetForTrack("billing");
		const result = magnetToLeadMagnet(magnet);
		expect(result.slug).toBe("ccdf-billing-error-prevention");
	});

	it("produces the correct slug for buying track default magnet", () => {
		const magnet = getDefaultMagnetForTrack("buying");
		const result = magnetToLeadMagnet(magnet);
		expect(result.slug).toBe("childcare-software-pricing-comparison");
	});

	it("produces the correct slug for hr track default magnet", () => {
		const magnet = getDefaultMagnetForTrack("hr");
		const result = magnetToLeadMagnet(magnet);
		expect(result.slug).toBe("childcare-staff-handbook-template");
	});

	it("returned object has title, slug, description fields", () => {
		const magnet = getDefaultMagnetForTrack("hr");
		const result = magnetToLeadMagnet(magnet);
		expect(Object.keys(result)).toEqual(expect.arrayContaining(["title", "slug", "description"]));
	});
});
