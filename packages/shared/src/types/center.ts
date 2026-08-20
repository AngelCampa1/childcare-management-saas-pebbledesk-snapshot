import type { StripeAccountStatus } from "../constants/enums.js";

export interface Center {
	id: string;
	name: string;
	address: string;
	city: string;
	state: string;
	zip: string;
	phone: string;
	licenseNumber?: string;
	licensedCapacity?: number;
	timezone: string;
	stripeAccountId?: string;
	stripeAccountStatus?: StripeAccountStatus;
	stripeAccountLinkedAt?: string;
	stripeAccountDisabledReason?: string;
	createdAt: string;
	updatedAt: string;
}

export interface CenterMember {
	id: string;
	centerId: string;
	userId: string;
	role: string;
	joinedAt: string;
}
