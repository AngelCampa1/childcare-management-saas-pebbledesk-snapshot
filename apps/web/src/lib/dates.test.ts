import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLocalDate, formatLocalDatetime } from "./dates";

describe("formatLocalDate", () => {
	beforeEach(() => {
		// 2026-04-20T06:00:00.000Z — This is 2026-04-20 in UTC but still
		// 2026-04-19 in America/Los_Angeles (UTC-7 in PDT).
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-20T06:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns a YYYY-MM-DD formatted string", () => {
		const result = formatLocalDate("UTC");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("returns today's date (2026-04-20) in UTC", () => {
		expect(formatLocalDate("UTC")).toBe("2026-04-20");
	});

	it("returns yesterday's date (2026-04-19) for America/Los_Angeles at 06:00 UTC", () => {
		// At 06:00 UTC, Los Angeles (UTC-7 PDT) is at 23:00 the previous day
		expect(formatLocalDate("America/Los_Angeles")).toBe("2026-04-19");
	});

	it("returns the correct date for America/New_York at 06:00 UTC (02:00 local)", () => {
		// 06:00 UTC = 02:00 EDT (UTC-4), still same calendar day as LA but different from UTC
		expect(formatLocalDate("America/New_York")).toBe("2026-04-20");
	});

	it("shows date divergence: at 01:00 UTC, New York (UTC-4) is still the previous calendar day", () => {
		// At 2026-04-20T01:00:00.000Z → UTC is 2026-04-20, but NY (UTC-4) is still 2026-04-19
		vi.setSystemTime(new Date("2026-04-20T01:00:00.000Z"));
		expect(formatLocalDate("America/New_York")).toBe("2026-04-19");
		// Los Angeles (UTC-7) is also still the previous day at 01:00 UTC
		expect(formatLocalDate("America/Los_Angeles")).toBe("2026-04-19");
	});

	it("falls back to UTC when an invalid timezone is provided", () => {
		// Invalid timezone should not throw — it returns the UTC date instead
		expect(formatLocalDate("Not/A_Timezone")).toBe("2026-04-20");
	});
});

describe("formatLocalDatetime", () => {
	beforeEach(() => {
		// 2026-04-20T15:30:00.000Z
		// UTC     => "2026-04-20T15:30"
		// America/Chicago (UTC-5 CDT) => "2026-04-20T10:30"
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-20T15:30:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns a YYYY-MM-DDTHH:MM formatted string", () => {
		const result = formatLocalDatetime("UTC");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
	});

	it("returns the correct UTC datetime", () => {
		expect(formatLocalDatetime("UTC")).toBe("2026-04-20T15:30");
	});

	it("returns a different (earlier) time in a UTC-offset timezone", () => {
		// America/Chicago is UTC-5 (CDT) at this moment: 10:30
		const chicago = formatLocalDatetime("America/Chicago");
		const utc = formatLocalDatetime("UTC");
		expect(chicago).toBe("2026-04-20T10:30");
		expect(chicago).not.toBe(utc);
	});

	it("falls back gracefully for an invalid timezone", () => {
		// Should not throw; returns UTC fallback
		const result = formatLocalDatetime("Not/ATimezone");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
	});
});
