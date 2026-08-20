import { describe, expect, it } from "vitest";
import {
	computeClaimAmount,
	computeInvoiceTotals,
	filterAttendanceEntriesForPeriod,
	summarizeAttendance,
} from "./billing-subsidy.js";

describe("computeInvoiceTotals", () => {
	it("sums line items and subtracts subsidy credit", () => {
		const result = computeInvoiceTotals([{ amount: 100 }, { amount: 50 }, { amount: 25 }], 30);
		expect(result.subtotal).toBe(175);
		expect(result.amountDue).toBe(145);
	});

	it("floors amountDue at 0 when credit exceeds subtotal", () => {
		const result = computeInvoiceTotals([{ amount: 50 }], 200);
		expect(result.subtotal).toBe(50);
		expect(result.amountDue).toBe(0);
	});

	it("returns 0 subtotal and 0 amountDue for empty line items", () => {
		const result = computeInvoiceTotals([], 0);
		expect(result.subtotal).toBe(0);
		expect(result.amountDue).toBe(0);
	});

	it("avoids float drift: three string '33.33' items yield subtotal exactly 99.99", () => {
		const result = computeInvoiceTotals(
			[{ amount: "33.33" }, { amount: "33.33" }, { amount: "33.33" }],
			0,
		);
		expect(result.subtotal).toBe(99.99);
		expect(result.subtotal).not.toBe(99.99000000000001);
	});

	it("avoids float drift: subsidyCredit reduces amountDue exactly", () => {
		const result = computeInvoiceTotals(
			[{ amount: "33.33" }, { amount: "33.33" }, { amount: "33.33" }],
			"9.99",
		);
		expect(result.subtotal).toBe(99.99);
		expect(result.amountDue).toBe(90);
	});

	it("floors amountDue at 0 when string subsidy exceeds string subtotal", () => {
		const result = computeInvoiceTotals([{ amount: "10.00" }], "999.99");
		expect(result.amountDue).toBe(0);
	});

	it("handles mixed number and string inputs without drift", () => {
		const result = computeInvoiceTotals([{ amount: 10.1 }, { amount: "20.20" }], "5.30");
		expect(result.subtotal).toBe(30.3);
		expect(result.amountDue).toBe(25);
	});
});

describe("summarizeAttendance", () => {
	it("counts days and hours for basic UTC entries", () => {
		const entries = [
			{
				checkedInAt: new Date("2026-04-15T08:00:00Z"),
				checkedOutAt: new Date("2026-04-15T16:00:00Z"),
			},
			{
				checkedInAt: new Date("2026-04-16T08:00:00Z"),
				checkedOutAt: new Date("2026-04-16T16:00:00Z"),
			},
		];
		const result = summarizeAttendance(entries, "UTC");
		expect(result.daysAttended).toBe(2);
		expect(result.hoursAttended).toBe(16);
	});

	it("correctly assigns day using local timezone (not UTC) for late-night check-in", () => {
		// 11 PM UTC = 6 PM America/Chicago (UTC-5 CDT), same local day
		// 11 PM UTC on April 15 = April 15 in Chicago
		// Without timezone fix, toISOString gives April 16 (UTC)
		// Actually: 23:00 UTC Apr 15 = 18:00 CDT Apr 15 — still Apr 15 locally
		// So a check-in at 23:00 UTC Apr 15 and another at 00:30 UTC Apr 16
		// 00:30 UTC Apr 16 = 19:30 CDT Apr 15 — still Apr 15 locally!
		// Without fix: dayKeys would have "2026-04-15" and "2026-04-16" (2 days)
		// With fix: both are "2026-04-15" locally (1 day)
		const entries = [
			{
				checkedInAt: new Date("2026-04-15T23:00:00Z"), // 6 PM CDT Apr 15
				checkedOutAt: new Date("2026-04-16T00:00:00Z"), // 7 PM CDT Apr 15
			},
			{
				checkedInAt: new Date("2026-04-16T00:30:00Z"), // 7:30 PM CDT Apr 15
				checkedOutAt: new Date("2026-04-16T01:00:00Z"), // 8 PM CDT Apr 15
			},
		];
		const result = summarizeAttendance(entries, "America/Chicago");
		// Both entries are on April 15 in Chicago time (CDT = UTC-5)
		expect(result.daysAttended).toBe(1);
	});

	it("counts entries without checkout (open check-ins) in day count but not hours", () => {
		const entries = [
			{
				checkedInAt: new Date("2026-04-15T08:00:00Z"),
				checkedOutAt: null,
			},
		];
		const result = summarizeAttendance(entries, "UTC");
		expect(result.daysAttended).toBe(1);
		expect(result.hoursAttended).toBe(0);
	});

	it("ignores negative duration entries (checkedOut before checkedIn)", () => {
		const entries = [
			{
				checkedInAt: new Date("2026-04-15T16:00:00Z"),
				checkedOutAt: new Date("2026-04-15T08:00:00Z"), // reversed
			},
		];
		const result = summarizeAttendance(entries, "UTC");
		expect(result.daysAttended).toBe(1);
		expect(result.hoursAttended).toBe(0);
	});

	it("deduplicates multiple check-ins on the same local day", () => {
		const entries = [
			{
				checkedInAt: new Date("2026-04-15T08:00:00Z"),
				checkedOutAt: new Date("2026-04-15T12:00:00Z"),
			},
			{
				checkedInAt: new Date("2026-04-15T13:00:00Z"),
				checkedOutAt: new Date("2026-04-15T17:00:00Z"),
			},
		];
		const result = summarizeAttendance(entries, "UTC");
		expect(result.daysAttended).toBe(1);
		expect(result.hoursAttended).toBe(8);
	});

	it("returns 0 days and 0 hours for empty entries", () => {
		const result = summarizeAttendance([], "UTC");
		expect(result.daysAttended).toBe(0);
		expect(result.hoursAttended).toBe(0);
	});

	it("rounds hours to 2 decimal places", () => {
		const entries = [
			{
				checkedInAt: new Date("2026-04-15T08:00:00Z"),
				checkedOutAt: new Date("2026-04-15T09:40:00Z"), // 1h 40m = 1.666... hours
			},
		];
		const result = summarizeAttendance(entries, "UTC");
		expect(result.hoursAttended).toBe(1.67);
	});
});

describe("filterAttendanceEntriesForPeriod", () => {
	it("keeps entries within the period", () => {
		const entries = [
			{
				checkedInAt: new Date("2026-04-14T10:00:00Z"),
				checkedOutAt: new Date("2026-04-14T18:00:00Z"),
			},
			{
				checkedInAt: new Date("2026-04-15T10:00:00Z"),
				checkedOutAt: new Date("2026-04-15T18:00:00Z"),
			},
			{
				checkedInAt: new Date("2026-04-16T10:00:00Z"),
				checkedOutAt: new Date("2026-04-16T18:00:00Z"),
			},
		];
		const result = filterAttendanceEntriesForPeriod(entries, "2026-04-15", "2026-04-15", "UTC");
		expect(result).toHaveLength(1);
		expect(result[0]?.checkedInAt.toISOString()).toContain("2026-04-15");
	});

	it("uses local timezone for boundary checking", () => {
		// 00:30 UTC Apr 16 = Apr 15 in Chicago (UTC-5 CDT) — should be included in Apr 15 filter
		const entries = [
			{
				checkedInAt: new Date("2026-04-16T00:30:00Z"), // Apr 15 locally in Chicago
				checkedOutAt: new Date("2026-04-16T01:00:00Z"),
			},
		];
		const result = filterAttendanceEntriesForPeriod(
			entries,
			"2026-04-15",
			"2026-04-15",
			"America/Chicago",
		);
		expect(result).toHaveLength(1);
	});
});

describe("computeClaimAmount", () => {
	it("computes daily rate claim", () => {
		const result = computeClaimAmount(
			{ rateDaily: 25, rateWeekly: null, authorizedHoursWeekly: null },
			{ daysAttended: 5, hoursAttended: 40 },
		);
		expect(result.amountClaimed).toBe(125);
		expect(result.requiresManualAmount).toBe(false);
		expect(result.rateType).toBe("daily");
	});

	it("computes weekly rate claim based on hours", () => {
		const result = computeClaimAmount(
			{ rateDaily: null, rateWeekly: 200, authorizedHoursWeekly: 40 },
			{ daysAttended: 5, hoursAttended: 30 },
		);
		expect(result.amountClaimed).toBe(150); // 30/40 * 200
		expect(result.requiresManualAmount).toBe(false);
		expect(result.rateType).toBe("weekly");
	});

	it("returns manual when no rate is set", () => {
		const result = computeClaimAmount(
			{ rateDaily: null, rateWeekly: null, authorizedHoursWeekly: null },
			{ daysAttended: 5, hoursAttended: 40 },
		);
		expect(result.amountClaimed).toBe(0);
		expect(result.requiresManualAmount).toBe(true);
		expect(result.rateType).toBe("manual");
	});

	it("returns manual when authorizedHoursWeekly is 0 (avoids division by zero)", () => {
		const result = computeClaimAmount(
			{ rateDaily: null, rateWeekly: 200, authorizedHoursWeekly: 0 },
			{ daysAttended: 5, hoursAttended: 40 },
		);
		expect(result.amountClaimed).toBe(0);
		expect(result.requiresManualAmount).toBe(true);
		expect(result.rateType).toBe("manual");
	});
});
