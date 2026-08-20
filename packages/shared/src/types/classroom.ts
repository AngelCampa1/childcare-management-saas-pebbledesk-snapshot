import type { AgeGroup } from "../constants/enums.js";

export interface Classroom {
	id: string;
	centerId: string;
	name: string;
	ageGroup: AgeGroup;
	maxCapacity: number;
	minRatioStaff: number;
	minRatioChildren: number;
	createdAt: string;
	archivedAt: string | null;
}

export interface ClassroomWithCounts extends Classroom {
	childCount: number;
	staffCount: number;
}
