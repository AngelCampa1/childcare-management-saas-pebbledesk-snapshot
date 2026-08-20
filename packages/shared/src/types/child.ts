import type { AgeGroup, EnrollmentStatus } from "../constants/enums.js";

export interface Child {
	id: string;
	centerId: string;
	firstName: string;
	lastName: string;
	dateOfBirth: string;
	ageGroup: AgeGroup;
	enrollmentStatus: EnrollmentStatus;
	subsidyEligible: boolean;
	enrolledAt: string | null;
	withdrawnAt: string | null;
	createdAt: string;
	allergies: string | null;
	immunizations: string | null;
	notes: string | null;
}

export interface ChildWithDetails extends Child {
	currentClassroom: {
		id: string;
		name: string;
		ageGroup: AgeGroup;
		assignmentId: string;
		effectiveDate: string;
	} | null;
	guardians: Array<{
		id: string;
		firstName: string;
		lastName: string;
		email: string | null;
		phone: string | null;
		isPrimary: boolean;
		authorizedPickup: boolean;
		relationship: string | null;
	}>;
	primaryGuardianName: string | null;
}
