import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { authSessionQuery } from "../hooks/use-auth-session";
import {
	EMPTY_DATE,
	formatDate,
	formatDateKey,
	formatDateTime,
	formatTime,
	useCenterTimezone,
} from "./format-date";

describe("formatDate", () => {
	it("returns short month-day-year in the explicit center timezone", () => {
		// 2026-03-14T06:00:00Z is 2026-03-13 22:00 in America/Los_Angeles (UTC-8 PST)
		expect(formatDate("2026-03-14T06:00:00Z", { centerTimezone: "America/Los_Angeles" })).toBe(
			"Mar 13, 2026",
		);
	});

	it("respects the explicit centerTimezone over browser zone", () => {
		// Same instant, different center zone → different rendered date.
		expect(formatDate("2026-03-14T06:00:00Z", { centerTimezone: "Europe/London" })).toBe(
			"Mar 14, 2026",
		);
	});

	it("treats a date-only ISO as wall-clock (no prev-day shift in any zone)", () => {
		// "2020-12-31" must render Dec 31 even in negative-UTC zones.
		expect(formatDate("2020-12-31", { centerTimezone: "America/Los_Angeles" })).toBe(
			"Dec 31, 2020",
		);
		expect(formatDate("2020-12-31", { centerTimezone: "Pacific/Honolulu" })).toBe("Dec 31, 2020");
		expect(formatDate("2020-12-31", { centerTimezone: "Asia/Tokyo" })).toBe("Dec 31, 2020");
	});

	it("returns the empty sentinel for empty or null input", () => {
		expect(formatDate("")).toBe(EMPTY_DATE);
		// biome-ignore lint/suspicious/noExplicitAny: deliberately exercising null-ish runtime input
		expect(formatDate(null as any)).toBe(EMPTY_DATE);
		// biome-ignore lint/suspicious/noExplicitAny: deliberately exercising null-ish runtime input
		expect(formatDate(undefined as any)).toBe(EMPTY_DATE);
	});

	it("returns the empty sentinel for invalid ISO", () => {
		expect(formatDate("not-a-date")).toBe(EMPTY_DATE);
		expect(formatDate("2026-13-99T00:00:00Z")).toBe(EMPTY_DATE);
	});

	it("falls back to UTC for invalid timezone (no throw)", () => {
		expect(formatDate("2026-03-14T12:00:00Z", { centerTimezone: "Not/A_Zone" })).toBe(
			"Mar 14, 2026",
		);
	});
});

describe("formatTime", () => {
	it("returns 12h time with am/pm in the center timezone", () => {
		// 2026-03-14T13:30:00Z is 09:30 AM in America/New_York (EDT, UTC-4).
		// Note: 2026-03-14 is before US DST starts (Mar 8) — actually 2026 DST starts Mar 8,
		// so 03-14 is in EDT (-4). 13:30Z → 09:30 EDT.
		expect(formatTime("2026-03-14T13:30:00Z", { centerTimezone: "America/New_York" })).toBe(
			"9:30 AM",
		);
	});

	it("renders a different time when zone changes", () => {
		const ny = formatTime("2026-03-14T13:30:00Z", { centerTimezone: "America/New_York" });
		const la = formatTime("2026-03-14T13:30:00Z", { centerTimezone: "America/Los_Angeles" });
		expect(ny).not.toBe(la);
	});

	it("returns the empty sentinel for empty/invalid input", () => {
		expect(formatTime("")).toBe(EMPTY_DATE);
		expect(formatTime("garbage")).toBe(EMPTY_DATE);
	});
});

describe("formatDateTime", () => {
	it("combines date and time in the center timezone", () => {
		expect(formatDateTime("2026-03-14T13:30:00Z", { centerTimezone: "America/New_York" })).toBe(
			"Mar 14, 2026 9:30 AM",
		);
	});

	it("treats date-only ISO as wall-clock (date stays Dec 31 regardless of zone)", () => {
		// Date-only ISOs have no time component; the helper anchors at noon UTC
		// so the calendar date is stable across all zones. The time portion is
		// implementation-defined ("12:00 PM"), but the date must not shift.
		expect(
			formatDateTime("2020-12-31", { centerTimezone: "America/Los_Angeles" }).startsWith(
				"Dec 31, 2020",
			),
		).toBe(true);
		expect(
			formatDateTime("2020-12-31", { centerTimezone: "Asia/Tokyo" }).startsWith("Dec 31, 2020"),
		).toBe(true);
	});

	it("returns the empty sentinel for invalid input", () => {
		expect(formatDateTime("")).toBe(EMPTY_DATE);
		expect(formatDateTime("nope")).toBe(EMPTY_DATE);
	});
});

describe("formatDateKey", () => {
	it("returns YYYY-MM-DD in the center timezone", () => {
		// 2026-03-14T06:00Z → 2026-03-13 in LA
		expect(formatDateKey("2026-03-14T06:00:00Z", { centerTimezone: "America/Los_Angeles" })).toBe(
			"2026-03-13",
		);
	});

	it("preserves date-only ISO as wall-clock", () => {
		expect(formatDateKey("2020-12-31", { centerTimezone: "America/Los_Angeles" })).toBe(
			"2020-12-31",
		);
		expect(formatDateKey("2020-12-31", { centerTimezone: "Asia/Tokyo" })).toBe("2020-12-31");
	});

	it("returns empty string for invalid input", () => {
		expect(formatDateKey("")).toBe("");
		expect(formatDateKey("bogus")).toBe("");
	});
});

describe("useCenterTimezone", () => {
	it("returns undefined when no QueryClient is in context", () => {
		const { result } = renderHook(() => useCenterTimezone());
		expect(result.current).toBeUndefined();
	});

	it("returns undefined when the auth session is not cached", () => {
		const client = new QueryClient();
		const Wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client }, children);
		const { result } = renderHook(() => useCenterTimezone(), { wrapper: Wrapper });
		expect(result.current).toBeUndefined();
	});

	it("returns the cached center timezone when the auth session is loaded", () => {
		const client = new QueryClient();
		client.setQueryData(authSessionQuery.queryKey, {
			user: { id: "u-1", name: "Dir", email: "d@example.com" },
			membership: { id: "m-1", centerId: "c-1", role: "owner" },
			center: { id: "c-1", name: "Center", state: "CA", timezone: "America/Los_Angeles" },
			classroomIds: [],
		});
		const Wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client }, children);
		const { result } = renderHook(() => useCenterTimezone(), { wrapper: Wrapper });
		expect(result.current).toBe("America/Los_Angeles");
	});
});
