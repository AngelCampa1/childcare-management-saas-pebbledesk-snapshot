import type { TimeEntryStatus } from "../constants/enums.js";

export interface Schedule {
	id: string;
	centerId: string;
	name: string;
	effectiveFrom: string;
	effectiveUntil?: string;
	createdAt: string;
	updatedAt: string;
}

export interface Shift {
	id: string;
	centerId: string;
	scheduleId: string;
	membershipId: string;
	classroomId: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
}

export interface TimeEntry {
	id: string;
	centerId: string;
	membershipId: string;
	date: string;
	hoursWorked: number;
	hoursScheduled: number;
	overtimeHours: number;
	status: TimeEntryStatus;
	createdAt: string;
	updatedAt: string;
}
