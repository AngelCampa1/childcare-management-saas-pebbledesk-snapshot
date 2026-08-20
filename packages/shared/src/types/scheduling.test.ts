import { describe, expect, it } from "vitest";
import type { Schedule, Shift, TimeEntry } from "./scheduling.js";

describe("Schedule interface", () => {
	it("matches the schedule template shape", () => {
		const schedule: Schedule = {
			id: "schedule-1",
			centerId: "center-1",
			name: "Weekday coverage",
			effectiveFrom: "2026-04-07",
			effectiveUntil: "2026-06-30",
			createdAt: "2026-04-07T12:00:00Z",
			updatedAt: "2026-04-07T12:00:00Z",
		};

		expect(schedule.name).toBe("Weekday coverage");
		expect(schedule.effectiveUntil).toBe("2026-06-30");
	});
});

describe("Shift interface", () => {
	it("matches the recurring staff shift shape", () => {
		const shift: Shift = {
			id: "shift-1",
			centerId: "center-1",
			scheduleId: "schedule-1",
			membershipId: "membership-1",
			classroomId: "classroom-1",
			dayOfWeek: 1,
			startTime: "08:00",
			endTime: "16:00",
		};

		expect(shift.membershipId).toBe("membership-1");
		expect(shift.scheduleId).toBe("schedule-1");
	});
});

describe("TimeEntry interface", () => {
	it("matches the derived/approved time entry shape", () => {
		const entry: TimeEntry = {
			id: "entry-1",
			centerId: "center-1",
			membershipId: "membership-1",
			date: "2026-04-07",
			hoursWorked: 8,
			hoursScheduled: 7.5,
			overtimeHours: 0.5,
			status: "approved",
			createdAt: "2026-04-07T12:00:00Z",
			updatedAt: "2026-04-07T12:00:00Z",
		};

		expect(entry.overtimeHours).toBe(0.5);
		expect(entry.status).toBe("approved");
	});
});
