export interface CheckIn {
	id: string;
	centerId: string;
	childId: string;
	classroomId: string;
	checkedInAt: string;
	checkedOutAt?: string;
	checkedInBy: string;
	checkedOutBy?: string;
	notes?: string;
	isLate?: boolean;
	checkInSignature?: string | null;
	checkOutSignature?: string | null;
}

export interface StaffCheckIn {
	id: string;
	centerId: string;
	membershipId: string;
	classroomId: string;
	clockedInAt: string;
	clockedOutAt?: string;
}

export interface RatioSnapshot {
	id: string;
	centerId: string;
	classroomId: string;
	snapshotAt: string;
	staffCount: number;
	childrenCount: number;
	ratioRequired: number;
	ratioActual: number;
	inCompliance: boolean;
}

export interface RatioViolation {
	id: string;
	centerId: string;
	classroomId: string;
	detectedAt: string;
	staffCount?: number;
	childrenCount?: number;
	ratioRequired?: number;
	ratioActual?: number;
	resolvedAt?: string;
	resolvedBy?: string;
	resolutionNotes?: string;
}

export type RatioRuleSource = "classroom" | "state:TX" | "state:CA" | "state:FL";

export interface RoomRatioStatus {
	classroomId: string;
	classroomName: string;
	ageGroup: string;
	maxCapacity: number;
	minRatioStaff: number;
	minRatioChildren: number;
	currentChildCount: number;
	currentStaffCount: number;
	ratioRequired: number;
	ratioActual: number;
	inCompliance: boolean;
	nearLimit: boolean;
	openViolationId?: string;
	ratioRuleSource: RatioRuleSource;
}
