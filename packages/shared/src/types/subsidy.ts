import type { ClaimStatus, SubsidyCaseStatus, SubsidyProgram } from "../constants/enums.js";

export interface SubsidyCase {
	id: string;
	centerId: string;
	childId: string;
	program: SubsidyProgram;
	caseNumber: string;
	agencyName: string;
	authorizedHoursWeekly?: number;
	rateDaily?: number;
	rateWeekly?: number;
	effectiveDate: string;
	expirationDate?: string;
	status: SubsidyCaseStatus;
	createdAt: string;
	updatedAt: string;
}

export interface SubsidyClaim {
	id: string;
	centerId: string;
	subsidyCaseId: string;
	periodStart: string;
	periodEnd: string;
	daysAttended: number;
	hoursAttended: number;
	amountClaimed: number;
	amountApproved?: number;
	amountPaid?: number;
	status: ClaimStatus;
	submittedAt?: string;
	paidAt?: string;
	createdAt: string;
	updatedAt: string;
}
