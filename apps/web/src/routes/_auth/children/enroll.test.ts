import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { suggestAgeGroup } from "./enroll";

describe("enrollment responsive layout", () => {
	it("does not force two-column grids on mobile form fields", () => {
		const source = readFileSync(resolve(__dirname, "enroll.tsx"), "utf8");

		expect(source).not.toContain("grid grid-cols-2 gap-4");
		expect(source).not.toContain("grid grid-cols-2 gap-3");
		expect(source).toContain("grid gap-4 sm:grid-cols-2");
		expect(source).toContain("grid gap-3 sm:grid-cols-2");
	});
});

// ---------------------------------------------------------------------------
// suggestAgeGroup unit tests
// ---------------------------------------------------------------------------

describe("suggestAgeGroup", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns null for empty string (#28)", () => {
		expect(suggestAgeGroup("")).toBeNull();
	});

	it("returns null for invalid date string (#28)", () => {
		expect(suggestAgeGroup("not-a-date")).toBeNull();
	});

	it("returns null when year parses to 0 (#32 — prevents 1900 default)", () => {
		// Splitting "0000-05-10" gives year=0 which is falsy
		expect(suggestAgeGroup("0000-05-10")).toBeNull();
	});

	it("returns infant for a child born 6 months ago", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
		// DOB = 6 months ago = Nov 27, 2025 → 6 months old → infant
		expect(suggestAgeGroup("2025-11-27")).toBe("infant");
	});

	it("returns young_toddler for a child aged 12-23 months", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
		// DOB = 15 months ago = Feb 27, 2025 → 15 months → young_toddler
		expect(suggestAgeGroup("2025-02-27")).toBe("young_toddler");
	});

	it("returns toddler for a child aged 24-35 months", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
		// DOB = 30 months ago = Nov 27, 2023 → 30 months → toddler
		expect(suggestAgeGroup("2023-11-27")).toBe("toddler");
	});

	it("returns preschool for a child aged 36-47 months", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
		// DOB = 42 months ago = Nov 27, 2022 → 42 months → preschool
		expect(suggestAgeGroup("2022-11-27")).toBe("preschool");
	});

	it("returns pre_k for a child aged 48-59 months", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
		// DOB = 54 months ago = Nov 27, 2021 → 54 months → pre_k
		expect(suggestAgeGroup("2021-11-27")).toBe("pre_k");
	});

	it("returns school_age for a child aged 60+ months", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
		// DOB = 72 months ago = May 27, 2020 → 72 months → school_age
		expect(suggestAgeGroup("2020-05-27")).toBe("school_age");
	});

	it("handles DST spring-forward boundary without off-by-one error", () => {
		vi.useFakeTimers();
		// US DST spring-forward: 2025-03-09 → clocks go forward
		// DOB = 2025-03-09 (exactly 1 year ago in 2026)
		vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));
		// 12 months old → young_toddler
		expect(suggestAgeGroup("2025-03-09")).toBe("young_toddler");
	});

	it("handles leap year DOB (Feb 29) without throwing", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
		// DOB = Feb 29, 2024 (leap year) → ~27 months → toddler
		const result = suggestAgeGroup("2024-02-29");
		expect(result).not.toBeNull();
	});

	it("handles exact-month boundary — day-of-month adjustment triggers correctly", () => {
		vi.useFakeTimers();
		// today = May 15, 2026; DOB = May 20, 2025 → 11 months (not yet 12)
		// because today.getDate(15) < dob.getDate(20) → ageInMonths decremented
		vi.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));
		expect(suggestAgeGroup("2025-05-20")).toBe("infant"); // 11 months
	});
});
