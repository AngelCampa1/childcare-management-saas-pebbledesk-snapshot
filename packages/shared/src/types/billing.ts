import type {
	InvoiceStatus,
	PaymentMethod,
	PaymentProvider,
	PaymentStatus,
} from "../constants/enums.js";

export interface InvoiceLineItem {
	childId?: string;
	description: string;
	quantity: number;
	unitPrice: number;
	amount: number;
}

export interface InvoiceTemplateLineItem {
	description: string;
	quantity: number;
	unitPrice: number;
	amount: number;
}

export interface InvoiceTemplate {
	id: string;
	centerId: string;
	name: string;
	description?: string;
	dueDays: number;
	isDefault: boolean;
	lineItems: InvoiceTemplateLineItem[];
	createdAt: string;
	updatedAt: string;
}

export interface Invoice {
	id: string;
	centerId: string;
	guardianId: string;
	periodStart: string;
	periodEnd: string;
	status: InvoiceStatus;
	dueDate?: string;
	paidAt?: string;
	lineItems?: InvoiceLineItem[];
	subtotal: number;
	subsidyCredit: number;
	amountDue: number;
	balanceRemaining?: number;
	publicLinkToken?: string;
	publicPayToken?: string;
	publicLinkVersion: number;
	publicLinkRotatedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export type SubscriptionStatus =
	| "none"
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "unpaid"
	| "incomplete"
	| "incomplete_expired";

export type SubscriptionPlan =
	| "trial"
	| "home"
	| "center_starter"
	| "center_pro"
	| "group"
	| "enterprise";

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
	"none",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
	"incomplete",
	"incomplete_expired",
] as const;

export const SUBSCRIPTION_PLANS_LIST: readonly SubscriptionPlan[] = [
	"trial",
	"home",
	"center_starter",
	"center_pro",
	"group",
	"enterprise",
] as const;

export interface Payment {
	id: string;
	centerId: string;
	invoiceId: string;
	amount: number;
	method: PaymentMethod;
	provider: PaymentProvider;
	status: PaymentStatus;
	providerReferenceId?: string;
	providerTransactionId?: string;
	reference?: string;
	paidAt: string;
	reversedAt?: string;
	createdAt: string;
	updatedAt: string;
}
