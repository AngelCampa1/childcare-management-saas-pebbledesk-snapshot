import { describe, expect, it, vi } from "vitest";
import {
	calculateWorkedHours,
	getScheduledHoursForDate,
	upsertTimeEntryFromClockOut,
} from "./time-entries.js";

function collectNumericValues(value: unknown, seen = new Set<object>()): number[] {
	if (typeof value === "number") return [value];
	if (!value || typeof value !== "object") return [];
	if (seen.has(value)) return [];
	seen.add(value);

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectNumericValues(item, seen));
	}

	return Object.values(value).flatMap((item) => collectNumericValues(item, seen));
}

function collectStringValues(value: unknown, seen = new Set<object>()): string[] {
	if (typeof value === "string") return [value];
	if (!value || typeof value !== "object") return [];
	if (seen.has(value)) return [];
	seen.add(value);

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectStringValues(item, seen));
	}

	return Object.values(value).flatMap((item) => collectStringValues(item, seen));
}

function sqlConditionColumnNames(value: unknown, seen = new WeakSet<object>()): string[] {
	if (!value || typeof value !== "object" || seen.has(value)) return [];
	seen.add(value);

	if (!("queryChunks" in value) || !Array.isArray(value.queryChunks)) {
		return [];
	}

	const names: string[] = [];
	for (const chunk of value.queryChunks) {
		if (!chunk || typeof chunk !== "object") continue;
		if ("name" in chunk && typeof chunk.name === "string") {
			names.push(chunk.name);
		}
		names.push(...sqlConditionColumnNames(chunk, seen));
	}

	return names;
}

describe("time entry service", () => {
	it("calculates worked hours from a clock-in window", () => {
		expect(
			calculateWorkedHours(new Date("2026-04-07T08:00:00Z"), new Date("2026-04-07T16:30:00Z")),
		).toBe(8.5);
	});

	it("uses the center local day when calculating scheduled hours", async () => {
		const where = vi.fn().mockImplementation((condition: unknown) => {
			if (collectNumericValues(condition).includes(0)) {
				return Promise.resolve([{ startTime: "08:00", endTime: "12:00" }]);
			}

			return Promise.resolve([]);
		});
		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					innerJoin: vi.fn().mockReturnValue({
						where,
					}),
				}),
			}),
		};

		const scheduledHours = await getScheduledHoursForDate(
			db as never,
			"center-1",
			"membership-1",
			new Date("2026-04-06T03:00:00Z"),
			"America/Los_Angeles",
		);

		expect(scheduledHours).toBe(4);
	});

	it("center-scopes the schedule join when calculating scheduled hours", async () => {
		let scheduleJoinCondition: unknown;
		const db = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					innerJoin: vi.fn().mockImplementation((_table, condition) => {
						scheduleJoinCondition = condition;
						return {
							where: vi.fn().mockResolvedValue([]),
						};
					}),
				}),
			}),
		};

		const scheduledHours = await getScheduledHoursForDate(
			db as never,
			"center-1",
			"membership-1",
			new Date("2026-04-06T03:00:00Z"),
			"America/Los_Angeles",
		);

		expect(scheduledHours).toBe(0);
		expect(sqlConditionColumnNames(scheduleJoinCondition)).toContain("center_id");
	});

	it("upserts a derived time entry row using the childcare local date", async () => {
		const where = vi.fn().mockImplementation((condition: unknown) => {
			if (collectNumericValues(condition).includes(0)) {
				return Promise.resolve([{ startTime: "08:00", endTime: "12:00" }]);
			}

			return Promise.resolve([]);
		});
		const select = vi
			.fn()
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ timezone: "America/Los_Angeles" }]),
					}),
				}),
			})
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					innerJoin: vi.fn().mockReturnValue({
						where,
					}),
				}),
			});
		const onConflictDoUpdate = vi.fn().mockResolvedValue([{ id: "entry-1" }]);
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
		const insert = vi.fn().mockReturnValue({ values });
		const db = {
			select,
			insert,
		};

		await upsertTimeEntryFromClockOut(
			db as never,
			{
				centerId: "center-1",
				membershipId: "membership-1",
				clockedInAt: new Date("2026-04-06T00:30:00Z"),
				clockedOutAt: new Date("2026-04-06T05:30:00Z"),
			} as never,
		);

		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-1",
				membershipId: "membership-1",
				date: "2026-04-05",
				hoursWorked: 5,
				hoursScheduled: 4,
				overtimeHours: 1,
				status: "auto",
			}),
		);
		expect(onConflictDoUpdate).toHaveBeenCalled();
	});

	it("resets a conflicting approved time entry when another clock-out changes hours", async () => {
		const where = vi.fn().mockResolvedValue([{ startTime: "08:00", endTime: "12:00" }]);
		const select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				innerJoin: vi.fn().mockReturnValue({
					where,
				}),
			}),
		});
		const onConflictDoUpdate = vi.fn().mockResolvedValue([{ id: "entry-1" }]);
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
		const insert = vi.fn().mockReturnValue({ values });
		const db = {
			select,
			insert,
		};

		await upsertTimeEntryFromClockOut(
			db as never,
			{
				centerId: "center-1",
				membershipId: "membership-1",
				clockedInAt: new Date("2026-04-07T08:00:00Z"),
				clockedOutAt: new Date("2026-04-07T14:30:00Z"),
				timezone: "UTC",
			} as never,
		);

		expect(onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				set: expect.objectContaining({
					hoursWorked: 6.5,
					hoursScheduled: 4,
					overtimeHours: 2.5,
					status: "auto",
				}),
				setWhere: expect.anything(),
			}),
		);
		const conflictUpdate = onConflictDoUpdate.mock.calls[0]?.[0] as { setWhere?: unknown };
		expect(collectStringValues(conflictUpdate.setWhere).join(" ")).toContain("IS DISTINCT FROM");
	});

	it("falls back to UTC when a center timezone is missing", async () => {
		const where = vi.fn().mockImplementation((condition: unknown) => {
			if (collectNumericValues(condition).includes(2)) {
				return Promise.resolve([{ startTime: "09:00", endTime: "13:00" }]);
			}

			return Promise.resolve([]);
		});
		const db = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where,
						}),
					}),
				}),
		};

		const scheduledHours = await getScheduledHoursForDate(
			db as never,
			"center-1",
			"membership-1",
			new Date("2026-04-07T10:00:00Z"),
		);

		expect(scheduledHours).toBe(4);
	});

	it("throws when the local date cannot be formatted", async () => {
		const dateTimeFormatSpy = vi
			.spyOn(Intl, "DateTimeFormat")
			.mockImplementation(function dateTimeFormatMock() {
				return {
					formatToParts: () => [],
					format: () => "Sun",
				} as never;
			} as never);

		await expect(
			getScheduledHoursForDate(
				{
					select: vi.fn(),
				} as never,
				"center-1",
				"membership-1",
				new Date("2026-04-07T10:00:00Z"),
				"UTC",
			),
		).rejects.toThrow("Unable to format date");

		dateTimeFormatSpy.mockRestore();
	});

	it("anchors the time entry date and scheduled-hours lookup to the clock-IN day when the shift spans midnight", async () => {
		// 2026-06-08 22:00 America/Chicago = 2026-06-09T03:00:00Z
		// 2026-06-09 00:15 America/Chicago = 2026-06-09T05:15:00Z
		// The clock-out is Tuesday Chicago; the clock-in is Monday Chicago (dayOfWeek=1).
		// A shift exists on Monday covering 22:00-02:00 (but shifts schema enforces startTime<endTime
		// within one day, so we model it as a 22:00-23:59 shift = 1.98h for simplicity).
		// The bug: current code uses clockedOutAt → Tuesday → no shift found → hoursScheduled=0.
		// The fix: use clockedInAt → Monday → shift found → hoursScheduled > 0.

		const clockedInAt = new Date("2026-06-09T03:00:00Z"); // 2026-06-08 22:00 Chicago
		const clockedOutAt = new Date("2026-06-09T05:15:00Z"); // 2026-06-09 00:15 Chicago

		// dayOfWeek=1 is Monday (the clock-IN day in Chicago)
		const where = vi.fn().mockImplementation((condition: unknown) => {
			const nums = collectNumericValues(condition);
			if (nums.includes(1)) {
				// Monday shift: 22:00 → 23:00 (1 hour, simple clean number)
				return Promise.resolve([{ startTime: "22:00", endTime: "23:00" }]);
			}
			return Promise.resolve([]);
		});
		const onConflictDoUpdate = vi.fn().mockResolvedValue([{ id: "entry-1" }]);
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
		const insert = vi.fn().mockReturnValue({ values });
		const db = {
			select: vi
				.fn()
				// First call: getCenterTimezone
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
						}),
					}),
				})
				// Second call: getScheduledHoursForDate (shifts query)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where,
						}),
					}),
				}),
			insert,
		};

		await upsertTimeEntryFromClockOut(
			db as never,
			{
				centerId: "center-1",
				membershipId: "membership-1",
				clockedInAt,
				clockedOutAt,
			} as never,
		);

		// The inserted date must be the clock-IN Chicago date, not the clock-OUT date
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				date: "2026-06-08", // clock-IN day in America/Chicago, NOT 2026-06-09
				hoursScheduled: 1, // shift found on Monday
				overtimeHours: expect.any(Number),
			}),
		);

		// hoursScheduled must not be 0 (which the bug caused)
		const callArg = (values.mock.calls[0] as [Record<string, unknown>])[0];
		expect(callArg.hoursScheduled).toBeGreaterThan(0);
		// overtimeHours = max(0, workedHours - 1h) — workedHours ≈ 2.25h so overtime ≈ 1.25
		expect(callArg.overtimeHours).toBeLessThan(callArg.hoursWorked as number);
	});

	it("throws when the local weekday cannot be resolved", async () => {
		const dateTimeFormatSpy = vi
			.spyOn(Intl, "DateTimeFormat")
			.mockImplementation(function dateTimeFormatMock() {
				return {
					formatToParts: () => [
						{ type: "year", value: "2026" },
						{ type: "month", value: "04" },
						{ type: "day", value: "07" },
					],
					format: () => "Funday",
				} as never;
			} as never);

		await expect(
			getScheduledHoursForDate(
				{
					select: vi.fn(),
				} as never,
				"center-1",
				"membership-1",
				new Date("2026-04-07T10:00:00Z"),
				"UTC",
			),
		).rejects.toThrow("Unable to determine day of week");

		dateTimeFormatSpy.mockRestore();
	});
});
