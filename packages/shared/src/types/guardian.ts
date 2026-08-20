export interface Guardian {
	id: string;
	centerId: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface GuardianWithChildren extends Guardian {
	children: Array<{
		id: string;
		firstName: string;
		lastName: string;
		enrollmentStatus: string;
		classroomName: string | null;
		isPrimary: boolean;
		authorizedPickup: boolean;
		relationship: string | null;
	}>;
}

export interface GuardianDirectoryChildSummary {
	id: string;
	firstName: string;
	lastName: string;
	authorizedPickup: boolean;
}

export interface GuardianDirectoryEntry extends Guardian {
	children: GuardianDirectoryChildSummary[];
}

export interface GuardianDirectoryListResponse {
	guardians: GuardianDirectoryEntry[];
}
