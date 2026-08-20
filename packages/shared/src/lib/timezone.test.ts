import { describe, expect, it } from "vitest";
import { toLocalDay, toUtcMidnightForLocalDate } from "./timezone.js";

describe("toUtcMidnightForLocalDate", () => {
	it("returns midnight UTC for UTC timezone", () => {
		const result = toUtcMidnightForLocalDate("2026-04-15", "UTC");
		expect(result.toISOString()).toBe("2026-04-15T00:00:00.000Z");
	});

	it("returns correct UTC instant for America/New_York (UTC-5 in winter)", () => {
		// America/New_York is UTC-5 in standard time
		// midnight New_York on 2026-01-15 = 05:00 UTC
		const result = toUtcMidnightForLocalDate("2026-01-15", "America/New_York");
		expect(result.toISOString()).toBe("2026-01-15T05:00:00.000Z");
	});

	it("returns correct UTC instant for America/New_York (UTC-4 in summer/DST)", () => {
		// America/New_York is UTC-4 in DST (summer)
		// midnight New_York on 2026-07-15 = 04:00 UTC
		const result = toUtcMidnightForLocalDate("2026-07-15", "America/New_York");
		expect(result.toISOString()).toBe("2026-07-15T04:00:00.000Z");
	});

	it("returns correct UTC instant for America/Chicago (UTC-6 in winter)", () => {
		// America/Chicago is UTC-6 in standard time
		// midnight Chicago on 2026-01-15 = 06:00 UTC
		const result = toUtcMidnightForLocalDate("2026-01-15", "America/Chicago");
		expect(result.toISOString()).toBe("2026-01-15T06:00:00.000Z");
	});

	it("returns correct UTC instant for America/Chicago (UTC-5 in summer/DST)", () => {
		// America/Chicago is UTC-5 in DST
		// midnight Chicago on 2026-07-15 = 05:00 UTC
		const result = toUtcMidnightForLocalDate("2026-07-15", "America/Chicago");
		expect(result.toISOString()).toBe("2026-07-15T05:00:00.000Z");
	});

	it("returns correct UTC instant for America/Los_Angeles (UTC-8 in winter)", () => {
		// America/Los_Angeles is UTC-8 in standard time
		// midnight LA on 2026-01-15 = 08:00 UTC
		const result = toUtcMidnightForLocalDate("2026-01-15", "America/Los_Angeles");
		expect(result.toISOString()).toBe("2026-01-15T08:00:00.000Z");
	});

	it("returns correct UTC instant for America/Los_Angeles (UTC-7 in summer/DST)", () => {
		// America/Los_Angeles is UTC-7 in DST
		// midnight LA on 2026-07-15 = 07:00 UTC
		const result = toUtcMidnightForLocalDate("2026-07-15", "America/Los_Angeles");
		expect(result.toISOString()).toBe("2026-07-15T07:00:00.000Z");
	});

	it("returns correct UTC instant for Australia/Sydney (UTC+11 in summer/DST)", () => {
		// Australia/Sydney is UTC+11 in AEDT (DST, Southern Hemisphere summer = Dec/Jan)
		// midnight Sydney on 2026-01-15 = previous day 13:00 UTC
		const result = toUtcMidnightForLocalDate("2026-01-15", "Australia/Sydney");
		expect(result.toISOString()).toBe("2026-01-14T13:00:00.000Z");
	});

	it("returns correct UTC instant for Australia/Sydney (UTC+10 in winter)", () => {
		// Australia/Sydney is UTC+10 in AEST (winter, July)
		// midnight Sydney on 2026-07-15 = previous day 14:00 UTC
		const result = toUtcMidnightForLocalDate("2026-07-15", "Australia/Sydney");
		expect(result.toISOString()).toBe("2026-07-14T14:00:00.000Z");
	});

	it("returns a Date object", () => {
		const result = toUtcMidnightForLocalDate("2026-04-15", "UTC");
		expect(result).toBeInstanceOf(Date);
	});

	// Regression: DST spring-forward days. Sampling a fixed mid-day offset and
	// applying it to midnight returned the wrong UTC instant (and wrong local
	// day) because midnight is pre-transition while mid-day is post-transition.
	it("returns true local midnight on the US spring-forward day (New York 2026-03-08)", () => {
		// Transition is at 02:00 local; midnight is still EST (UTC-5).
		const result = toUtcMidnightForLocalDate("2026-03-08", "America/New_York");
		expect(result.toISOString()).toBe("2026-03-08T05:00:00.000Z");
		expect(toLocalDay(result, "America/New_York")).toBe("2026-03-08");
	});

	it("returns true local midnight on the US spring-forward day (Chicago 2026-03-08)", () => {
		const result = toUtcMidnightForLocalDate("2026-03-08", "America/Chicago");
		expect(result.toISOString()).toBe("2026-03-08T06:00:00.000Z");
		expect(toLocalDay(result, "America/Chicago")).toBe("2026-03-08");
	});

	it("returns true local midnight on the US fall-back day (New York 2026-11-01)", () => {
		// Midnight is still EDT (UTC-4); transition to EST is at 02:00 local.
		const result = toUtcMidnightForLocalDate("2026-11-01", "America/New_York");
		expect(result.toISOString()).toBe("2026-11-01T04:00:00.000Z");
		expect(toLocalDay(result, "America/New_York")).toBe("2026-11-01");
	});

	it("round-trips every day across both 2026 US DST transitions for all supported zones", () => {
		const zones = [
			"America/New_York",
			"America/Chicago",
			"America/Denver",
			"America/Phoenix",
			"America/Los_Angeles",
			"America/Anchorage",
			"Pacific/Honolulu",
			"America/Indiana/Indianapolis",
			"America/Boise",
		];
		// Cover both the March spring-forward and November fall-back windows.
		const pad = (n: number) => String(n).padStart(2, "0");
		const days: string[] = [];
		for (let d = 6; d <= 10; d++) days.push(`2026-03-${pad(d)}`);
		for (let d = 30; d <= 31; d++) days.push(`2026-10-${pad(d)}`);
		for (let d = 1; d <= 3; d++) days.push(`2026-11-${pad(d)}`);
		for (const zone of zones) {
			for (const day of days) {
				const utc = toUtcMidnightForLocalDate(day, zone);
				expect(toLocalDay(utc, zone), `${zone} ${day}`).toBe(day);
			}
		}
	});
});

describe("toLocalDay", () => {
	it("returns the local date string in YYYY-MM-DD format for UTC", () => {
		const date = new Date("2026-04-15T10:00:00Z");
		expect(toLocalDay(date, "UTC")).toBe("2026-04-15");
	});

	it("returns the next day for late-night UTC timestamp in US/Central (UTC-5)", () => {
		// 11 PM UTC-5 = midnight UTC+1 — but 11 PM US/Central is still the same day
		// Let's test: 23:00 UTC in America/Chicago (UTC-6) = 17:00 Chicago => same day
		const date = new Date("2026-04-15T23:00:00Z");
		// 23:00 UTC = 18:00 America/Chicago (UTC-5 CDT) => still 2026-04-15
		expect(toLocalDay(date, "America/Chicago")).toBe("2026-04-15");
	});

	it("crosses midnight: 05:30 UTC is previous day in America/Los_Angeles (UTC-7)", () => {
		// 05:30 UTC = 22:30 on previous day in America/Los_Angeles (UTC-7 PDT)
		const date = new Date("2026-07-16T05:30:00Z");
		expect(toLocalDay(date, "America/Los_Angeles")).toBe("2026-07-15");
	});

	it("crosses midnight: 01:00 UTC is previous day in Australia/Sydney (UTC+11)", () => {
		// 01:00 UTC = 12:00 same day in Australia/Sydney (UTC+11 AEDT in January)
		const date = new Date("2026-01-16T01:00:00Z");
		expect(toLocalDay(date, "Australia/Sydney")).toBe("2026-01-16");
	});

	it("crosses midnight: late night UTC crosses to next day in Australia/Sydney", () => {
		// Australia/Sydney UTC+10 in July: 14:01 UTC = 00:01 next day Sydney
		const date = new Date("2026-07-15T14:01:00Z");
		expect(toLocalDay(date, "Australia/Sydney")).toBe("2026-07-16");
	});

	it("returns correct date for America/New_York when UTC is ahead of local", () => {
		// 04:00 UTC = midnight New_York (UTC-4 in EDT summer)
		const date = new Date("2026-07-15T04:00:00Z");
		expect(toLocalDay(date, "America/New_York")).toBe("2026-07-15");
	});

	it("returns previous day for early UTC when local time is still previous day", () => {
		// 03:59 UTC = 23:59 previous day in New_York (UTC-4 in EDT)
		const date = new Date("2026-07-15T03:59:00Z");
		expect(toLocalDay(date, "America/New_York")).toBe("2026-07-14");
	});
});
