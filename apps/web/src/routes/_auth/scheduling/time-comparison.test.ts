import { describe, expect, it } from "vitest";

/**
 * Unit tests for the minutes-since-midnight comparison logic used in the
 * scheduling shift form (#13 fix: numeric time comparison instead of string).
 *
 * The toMinutes helper lives inside handleAddShiftSubmit; we validate the
 * algorithm here in isolation so edge cases are pinned without needing a
 * full component render.
 */

function toMinutes(t: string): number {
	const [h, m] = t.split(":").map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

describe("toMinutes", () => {
	it("converts HH:MM to minutes since midnight", () => {
		expect(toMinutes("08:00")).toBe(480);
		expect(toMinutes("09:30")).toBe(570);
		expect(toMinutes("17:00")).toBe(1020);
		expect(toMinutes("00:00")).toBe(0);
		expect(toMinutes("23:59")).toBe(1439);
	});

	it("correctly handles midnight edge cases", () => {
		expect(toMinutes("00:01")).toBe(1);
		expect(toMinutes("00:30")).toBe(30);
	});

	it("parses unpadded single-digit hours the same as their padded form", () => {
		// A browser <input type="time"> always emits zero-padded "HH:MM", but a
		// programmatic or pasted value may arrive unpadded ("9:30"). The numeric
		// parse must treat "9:30" and "09:30" identically.
		expect(toMinutes("9:30")).toBe(570);
		expect(toMinutes("9:30")).toBe(toMinutes("09:30"));
		expect(toMinutes("9:00")).toBe(540);
		expect(toMinutes("9:05")).toBe(545);
	});
});

describe("numeric time comparison for shift validation", () => {
	it("treats equal start and end time as invalid (end not after start)", () => {
		const start = toMinutes("08:00");
		const end = toMinutes("08:00");
		// end <= start means invalid; same time is not "after"
		expect(end <= start).toBe(true);
	});

	it("treats end time before start time as invalid", () => {
		const start = toMinutes("10:00");
		const end = toMinutes("09:00");
		expect(end <= start).toBe(true);
	});

	it("treats end time after start time as valid", () => {
		const start = toMinutes("08:00");
		const end = toMinutes("17:00");
		expect(end <= start).toBe(false);
	});

	it("handles times where string comparison would be incorrect (single-digit vs double-digit)", () => {
		// String comparison: "9:30" > "10:00" is TRUE (wrong — "9" > "1" lexicographically)
		// Numeric comparison: 570 > 600 is FALSE (correct — 9:30 is before 10:00)
		const nineThirty = toMinutes("09:30");
		const tenOclock = toMinutes("10:00");
		expect(nineThirty < tenOclock).toBe(true);
	});
});
