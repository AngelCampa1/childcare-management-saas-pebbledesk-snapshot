import { describe, expect, it } from "vitest";
import { inferPageTrack } from "./page-track.js";

describe("inferPageTrack — explicit override", () => {
	it("returns override track regardless of other signals", () => {
		expect(inferPageTrack({ track: "billing" })).toBe("billing");
		expect(inferPageTrack({ track: "hr", pageType: "compare" })).toBe("hr");
		expect(inferPageTrack({ track: "buying", hubId: "audit-licensing" })).toBe("buying");
	});
});

describe("inferPageTrack — /free/[slug] lead magnet pages", () => {
	it("uses the magnet's own track for known slugs", () => {
		expect(inferPageTrack({ pageType: "free", slug: "licensing-compliance-checklist" })).toBe(
			"compliance",
		);
		expect(inferPageTrack({ pageType: "free", slug: "ccdf-billing-error-prevention" })).toBe(
			"billing",
		);
		expect(
			inferPageTrack({ pageType: "free", slug: "childcare-software-pricing-comparison" }),
		).toBe("buying");
		expect(inferPageTrack({ pageType: "free", slug: "childcare-staff-handbook-template" })).toBe(
			"hr",
		);
	});

	it("falls back to compliance for unknown free slug", () => {
		expect(inferPageTrack({ pageType: "free", slug: "mystery-tool" })).toBe("compliance");
	});

	it("falls back to compliance for free page type with no slug", () => {
		expect(inferPageTrack({ pageType: "free" })).toBe("compliance");
	});
});

describe("inferPageTrack — /compare/* and /childcare-software/*", () => {
	it("returns buying for compare page type", () => {
		expect(inferPageTrack({ pageType: "compare" })).toBe("buying");
	});

	it("returns buying for childcare-software page type", () => {
		expect(inferPageTrack({ pageType: "childcare-software" })).toBe("buying");
	});
});

describe("inferPageTrack — hub id mapping", () => {
	it("maps audit-licensing to compliance", () => {
		expect(inferPageTrack({ hubId: "audit-licensing" })).toBe("compliance");
	});

	it("maps state-local to compliance", () => {
		expect(inferPageTrack({ hubId: "state-local" })).toBe("compliance");
	});

	it("maps attendance-ratios to compliance", () => {
		expect(inferPageTrack({ hubId: "attendance-ratios" })).toBe("compliance");
	});

	it("maps subsidy-billing to billing", () => {
		expect(inferPageTrack({ hubId: "subsidy-billing" })).toBe("billing");
	});

	it("maps compare-pricing to buying", () => {
		expect(inferPageTrack({ hubId: "compare-pricing" })).toBe("buying");
	});

	it("maps software-buying to buying", () => {
		expect(inferPageTrack({ hubId: "software-buying" })).toBe("buying");
	});

	it("maps staff-operations to hr", () => {
		expect(inferPageTrack({ hubId: "staff-operations" })).toBe("hr");
	});

	it("maps free-tools to compliance", () => {
		expect(inferPageTrack({ hubId: "free-tools" })).toBe("compliance");
	});
});

describe("inferPageTrack — precedence", () => {
	it("explicit track beats page type", () => {
		expect(inferPageTrack({ track: "hr", pageType: "compare" })).toBe("hr");
	});

	it("page type beats hub id", () => {
		// compare overrides whatever hub the page belongs to
		expect(inferPageTrack({ pageType: "compare", hubId: "audit-licensing" })).toBe("buying");
	});

	it("hub id beats fallback", () => {
		expect(inferPageTrack({ hubId: "subsidy-billing" })).toBe("billing");
	});
});

describe("inferPageTrack — fallback", () => {
	it("returns compliance when no signals present", () => {
		expect(inferPageTrack({})).toBe("compliance");
	});

	it("returns compliance for unrecognised pageType", () => {
		expect(inferPageTrack({ pageType: "unknown" as "guide" })).toBe("compliance");
	});
});
