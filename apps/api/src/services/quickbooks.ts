import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import {
	guardians,
	invoiceLineItems,
	invoices,
	memberships,
	payments,
	quickbooksConnections,
	quickbooksEntityLinks,
	quickbooksReconciliationItems,
	quickbooksSyncLog,
} from "@pebbledesk/db";
import type {
	QuickBooksConnectionSummary,
	QuickBooksEntityLink,
	QuickBooksReconciliationItem,
	QuickBooksReviewReconciliationInput,
	QuickBooksStatusSnapshot,
	QuickBooksSyncLog,
	QuickBooksSyncResult,
} from "@pebbledesk/shared";
import { and, desc, eq } from "drizzle-orm";
import type { AppEnv } from "../lib/context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createPublicLinkNonce } from "../lib/public-billing.js";

type DbClient = AppEnv["Variables"]["db"];
type QuickBooksConnectionRecord = typeof quickbooksConnections.$inferSelect;
type QuickBooksEntityLinkRecord = typeof quickbooksEntityLinks.$inferSelect;
type QuickBooksReconciliationItemRecord = typeof quickbooksReconciliationItems.$inferSelect;
type QuickBooksSyncLogRecord = typeof quickbooksSyncLog.$inferSelect;
type QuickBooksIssueType = QuickBooksReconciliationItemRecord["issueType"];
type QuickBooksSyncAction = "export" | "import" | "full";
type QuickBooksOAuthConfig = {
	clientId: string;
	clientSecret?: string;
	redirectUri: string;
	appUrl: string;
	secret: string;
	legacySecret?: string;
};
type QuickBooksSyncConfig = {
	secret: string;
	legacySecret?: string;
	clientId?: string;
	clientSecret?: string;
};
type QuickBooksOAuthState = {
	centerId: string;
	membershipId: string;
	userId: string;
	issuedAt: number;
};
type QuickBooksOAuthCallbackInput = {
	code?: string;
	realmId?: string;
	state?: string;
	error?: string;
	errorDescription?: string;
};
type QuickBooksConnectionUpsertInput = {
	realmId: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: string;
	companyName?: string;
	scopes?: string[];
	syncDirection?: "push" | "pull";
};
type QuickBooksGuardianRecord = typeof guardians.$inferSelect;
type QuickBooksInvoiceRecord = typeof invoices.$inferSelect;
type QuickBooksInvoiceLineItemRecord = typeof invoiceLineItems.$inferSelect;
type QuickBooksPaymentRecord = typeof payments.$inferSelect;
const QUICKBOOKS_PLACEHOLDER_VALUES = new Set([
	"",
	"qb_client_id_replace_me",
	"qb_client_secret_replace_me",
]);

function getQuickBooksConfigurationIssue(
	config?: Pick<QuickBooksOAuthConfig, "clientId" | "clientSecret">,
	options?: { requireClientSecret?: boolean },
): string | null {
	if (!config) return null;
	const clientId = config.clientId?.trim();
	const clientSecret = config.clientSecret?.trim();
	if (!clientId || QUICKBOOKS_PLACEHOLDER_VALUES.has(clientId)) {
		return "QuickBooks isn't configured in this environment yet.";
	}
	if (
		options?.requireClientSecret !== false &&
		(!clientSecret || QUICKBOOKS_PLACEHOLDER_VALUES.has(clientSecret))
	) {
		return "QuickBooks isn't configured in this environment yet.";
	}
	return null;
}

type QuickBooksCustomer = {
	Id: string;
	SyncToken?: string;
	GivenName?: string;
	FamilyName?: string;
	DisplayName?: string;
	PrimaryEmailAddr?: {
		Address?: string;
	};
	PrimaryPhone?: {
		FreeFormNumber?: string;
	};
};
type QuickBooksInvoiceLine = {
	Id?: string;
	Description?: string;
	Amount?: number;
	DetailType?: string;
	SalesItemLineDetail?: {
		Qty?: number;
		UnitPrice?: number;
	};
};
type QuickBooksInvoice = {
	Id: string;
	SyncToken?: string;
	CustomerRef?: {
		value?: string;
	};
	DueDate?: string;
	TxnDate?: string;
	Balance?: number;
	TotalAmt?: number;
	Line?: QuickBooksInvoiceLine[];
};
type QuickBooksPaymentLine = {
	Amount?: number;
	LinkedTxn?: Array<{
		TxnId?: string;
		TxnType?: string;
	}>;
};
type QuickBooksPayment = {
	Id: string;
	SyncToken?: string;
	CustomerRef?: {
		value?: string;
	};
	TotalAmt?: number;
	TxnDate?: string;
	PaymentRefNum?: string;
	PrivateNote?: string;
	Line?: QuickBooksPaymentLine[];
	UnappliedAmt?: number;
};
type QuickBooksQueryResponse<T> = {
	QueryResponse?: {
		Customer?: T[];
		Invoice?: T[];
		Payment?: T[];
	};
};

const QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";

function deriveKey(secret: string) {
	return createHash("sha256").update(secret).digest();
}

function toIso(value: Date | string | null | undefined) {
	if (!value) return undefined;
	return value instanceof Date ? value.toISOString() : value;
}

function requiredIso(...values: Array<Date | string | null | undefined>) {
	for (const value of values) {
		const serialized = toIso(value);
		if (serialized) return serialized;
	}
	return new Date().toISOString();
}

function toValidDate(value: Date | string | null | undefined) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSyncDirection(input: QuickBooksConnectionUpsertInput["syncDirection"]) {
	return input === "push" || input === "pull" ? input : "pull";
}

function normalizeSyncAction(action?: "export" | "import" | "full") {
	return action ?? "full";
}

function encodeQuickBooksState(payload: QuickBooksOAuthState, secret: string) {
	const serialized = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
	const signature = createHmac("sha256", deriveKey(secret)).update(serialized).digest("base64url");
	return `${serialized}.${signature}`;
}

function decodeQuickBooksState(state: string, secret: string): QuickBooksOAuthState {
	const [serialized, signature] = state.split(".");
	if (!serialized || !signature) {
		throw new Error("Invalid QuickBooks OAuth state");
	}

	const expectedSignature = createHmac("sha256", deriveKey(secret))
		.update(serialized)
		.digest("base64url");
	const provided = Buffer.from(signature, "utf8");
	const expected = Buffer.from(expectedSignature, "utf8");

	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
		throw new Error("Invalid QuickBooks OAuth state");
	}

	const payload = JSON.parse(
		Buffer.from(serialized, "base64url").toString("utf8"),
	) as QuickBooksOAuthState;
	if (!payload.centerId || !payload.membershipId || !payload.userId) {
		throw new Error("Invalid QuickBooks OAuth state");
	}
	if (Date.now() - payload.issuedAt > 10 * 60 * 1000) {
		throw new Error("Expired QuickBooks OAuth state");
	}
	return payload;
}

export function decodeQuickBooksStateWithFallback(state: string, config: QuickBooksOAuthConfig) {
	try {
		return decodeQuickBooksState(state, config.secret);
	} catch (error) {
		if (!config.legacySecret || config.legacySecret === config.secret) {
			throw error;
		}

		return decodeQuickBooksState(state, config.legacySecret);
	}
}

function buildQuickBooksSettingsRedirect(
	appUrl: string,
	status: "connected" | "error",
	reason?: string,
) {
	const url = new URL("/settings", appUrl);
	url.searchParams.set("quickbooks", status);
	if (reason) {
		url.searchParams.set("reason", reason);
	}
	return url.toString();
}

async function exchangeQuickBooksTokens(
	code: string,
	config: Required<Pick<QuickBooksOAuthConfig, "clientId" | "clientSecret" | "redirectUri">>,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
	const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString(
		"base64",
	);
	const response = await fetch(QUICKBOOKS_TOKEN_URL, {
		method: "POST",
		headers: {
			Authorization: `Basic ${credentials}`,
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: config.redirectUri,
		}),
	});

	if (!response.ok) {
		throw new Error("Failed to exchange QuickBooks OAuth code");
	}

	const payload = (await response.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
	};

	if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
		throw new Error("QuickBooks OAuth token response was incomplete");
	}

	return {
		access_token: payload.access_token,
		refresh_token: payload.refresh_token,
		expires_in: payload.expires_in,
	};
}

async function refreshQuickBooksTokens(
	db: DbClient,
	connection: QuickBooksConnectionRecord,
	config: QuickBooksSyncConfig,
) {
	if (!config.clientId || !config.clientSecret) {
		throw new Error("QuickBooks client credentials are not configured");
	}

	const refreshToken = decryptQuickBooksToken(
		connection.refreshToken,
		config.secret,
		config.legacySecret,
	);
	const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString(
		"base64",
	);
	const response = await fetch(QUICKBOOKS_TOKEN_URL, {
		method: "POST",
		headers: {
			Authorization: `Basic ${credentials}`,
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		}),
	});

	if (!response.ok) {
		throw new Error("Failed to refresh QuickBooks access token");
	}

	const payload = (await response.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
	};
	if (!payload.access_token || !payload.expires_in) {
		throw new Error("QuickBooks refresh token response was incomplete");
	}

	const now = new Date();
	const tokenExpiresAt = new Date(Date.now() + payload.expires_in * 1000);
	const [updatedConnection] = (await db
		.update(quickbooksConnections)
		.set({
			accessToken: encryptQuickBooksToken(payload.access_token, config.secret),
			refreshToken: encryptQuickBooksToken(payload.refresh_token ?? refreshToken, config.secret),
			tokenExpiresAt,
			updatedAt: now,
		})
		.where(
			and(
				eq(quickbooksConnections.id, connection.id),
				eq(quickbooksConnections.centerId, connection.centerId),
			),
		)
		.returning()) as QuickBooksConnectionRecord[];

	return {
		connection: updatedConnection ?? connection,
		accessToken: payload.access_token,
	};
}

async function ensureQuickBooksAccessToken(
	db: DbClient,
	connection: QuickBooksConnectionRecord,
	config: QuickBooksSyncConfig,
) {
	const expiresAt =
		connection.tokenExpiresAt instanceof Date
			? connection.tokenExpiresAt.getTime()
			: new Date(connection.tokenExpiresAt).getTime();
	if (expiresAt - Date.now() > 60_000) {
		return {
			connection,
			accessToken: decryptQuickBooksToken(
				connection.accessToken,
				config.secret,
				config.legacySecret,
			),
		};
	}

	return refreshQuickBooksTokens(db, connection, config);
}

async function quickBooksApiRequest<T>(
	db: DbClient,
	connection: QuickBooksConnectionRecord,
	config: QuickBooksSyncConfig,
	path: string,
	init?: RequestInit,
) {
	const auth = await ensureQuickBooksAccessToken(db, connection, config);
	const response = await fetch(
		`https://quickbooks.api.intuit.com/v3/company/${auth.connection.realmId}${path}`,
		{
			...init,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${auth.accessToken}`,
				...(init?.body ? { "Content-Type": "application/json" } : {}),
				...(init?.headers ?? {}),
			},
		},
	);

	if (!response.ok) {
		throw new Error("QuickBooks API request failed");
	}

	return {
		connection: auth.connection,
		payload: (await response.json()) as T,
	};
}

function guardianDisplayName(guardian: Pick<QuickBooksGuardianRecord, "firstName" | "lastName">) {
	return `${guardian.firstName} ${guardian.lastName}`.trim();
}

function normalizeText(value?: string | null) {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

function buildQuickBooksCustomerPayload(guardian: QuickBooksGuardianRecord) {
	return {
		GivenName: guardian.firstName,
		FamilyName: guardian.lastName,
		DisplayName: guardianDisplayName(guardian),
		...(normalizeText(guardian.email)
			? {
					PrimaryEmailAddr: {
						Address: guardian.email?.trim(),
					},
				}
			: {}),
		...(normalizeText(guardian.phone)
			? {
					PrimaryPhone: {
						FreeFormNumber: guardian.phone?.trim(),
					},
				}
			: {}),
	};
}

function extractCustomer(payload: { Customer?: QuickBooksCustomer }) {
	if (!payload.Customer?.Id) {
		throw new Error("QuickBooks customer response was incomplete");
	}
	return payload.Customer;
}

function escapeQuickBooksQueryLiteral(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findQuickBooksCustomerByDisplayName(
	db: DbClient,
	connection: QuickBooksConnectionRecord,
	config: QuickBooksSyncConfig,
	displayName: string,
) {
	const response = await quickBooksApiRequest<{
		QueryResponse?: {
			Customer?: QuickBooksCustomer[];
		};
	}>(
		db,
		connection,
		config,
		`/query?query=${encodeURIComponent(
			`select * from Customer where DisplayName = '${escapeQuickBooksQueryLiteral(displayName)}'`,
		)}`,
	);

	return {
		connection: response.connection,
		customers: response.payload.QueryResponse?.Customer ?? [],
	};
}

function buildCustomerProposedChanges(
	guardian: QuickBooksGuardianRecord,
	customer: QuickBooksCustomer,
) {
	const proposedChanges: Partial<
		Pick<QuickBooksGuardianRecord, "firstName" | "lastName" | "email" | "phone">
	> = {};
	const remoteFirstName = normalizeText(customer.GivenName);
	const remoteLastName = normalizeText(customer.FamilyName);
	const remoteEmail = normalizeText(customer.PrimaryEmailAddr?.Address);
	const remotePhone = normalizeText(customer.PrimaryPhone?.FreeFormNumber);

	if (normalizeText(guardian.firstName) !== remoteFirstName && remoteFirstName !== null) {
		proposedChanges.firstName = remoteFirstName;
	}
	if (normalizeText(guardian.lastName) !== remoteLastName && remoteLastName !== null) {
		proposedChanges.lastName = remoteLastName;
	}
	if (normalizeText(guardian.email) !== remoteEmail) {
		proposedChanges.email = remoteEmail;
	}
	if (normalizeText(guardian.phone) !== remotePhone) {
		proposedChanges.phone = remotePhone;
	}

	return proposedChanges;
}

function shouldReuseExistingCustomer(
	guardian: QuickBooksGuardianRecord,
	customer: QuickBooksCustomer | null,
) {
	if (!customer?.Id) {
		return false;
	}

	const guardianEmail = normalizeText(guardian.email);
	const guardianPhone = normalizeText(guardian.phone);
	const customerEmail = normalizeText(customer.PrimaryEmailAddr?.Address);
	const customerPhone = normalizeText(customer.PrimaryPhone?.FreeFormNumber);

	if (guardianEmail && customerEmail) {
		return guardianEmail === customerEmail;
	}

	if (guardianPhone && customerPhone) {
		return guardianPhone === customerPhone;
	}

	return false;
}

function hasGuardianContact(guardian: QuickBooksGuardianRecord) {
	return Boolean(normalizeText(guardian.email) || normalizeText(guardian.phone));
}

async function upsertCustomerLink(
	db: DbClient,
	centerId: string,
	connectionId: string,
	guardianId: string,
	customerId: string,
	existingLink?: QuickBooksEntityLinkRecord,
) {
	const now = new Date();
	const [link] = existingLink
		? ((await db
				.update(quickbooksEntityLinks)
				.set({
					qbEntityType: "customer",
					qbEntityId: customerId,
					syncStatus: "success",
					lastSyncedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(quickbooksEntityLinks.id, existingLink.id),
						eq(quickbooksEntityLinks.centerId, centerId),
						eq(quickbooksEntityLinks.connectionId, connectionId),
						eq(quickbooksEntityLinks.entityId, guardianId),
					),
				)
				.returning()) as QuickBooksEntityLinkRecord[])
		: ((await db
				.insert(quickbooksEntityLinks)
				.values({
					centerId,
					connectionId,
					entityType: "customer",
					entityId: guardianId,
					qbEntityType: "customer",
					qbEntityId: customerId,
					syncStatus: "success",
					lastSyncedAt: now,
					createdAt: now,
					updatedAt: now,
				})
				.returning()) as QuickBooksEntityLinkRecord[]);
	return link;
}

function roundCurrency(value: number | string) {
	return Math.round(Number(value) * 100) / 100;
}

function quickBooksInvoiceStatus(invoice: QuickBooksInvoice) {
	const balance = typeof invoice.Balance === "number" ? roundCurrency(invoice.Balance) : null;
	if (balance === 0) return "paid" as const;
	return "sent" as const;
}

function quickBooksInvoiceLineItems(
	localLineItems: QuickBooksInvoiceLineItemRecord[],
	subsidyCredit: number | string,
) {
	const lines = localLineItems.map((lineItem) => ({
		Description: lineItem.description,
		Amount: roundCurrency(lineItem.amount),
		DetailType: "SalesItemLineDetail",
		SalesItemLineDetail: {
			Qty: lineItem.quantity,
			UnitPrice: roundCurrency(lineItem.unitPrice),
		},
	}));

	if (Number(subsidyCredit) > 0) {
		lines.push({
			Description: "PebbleDesk Subsidy Credit",
			Amount: roundCurrency(-Number(subsidyCredit)),
			DetailType: "SalesItemLineDetail",
			SalesItemLineDetail: {
				Qty: 1,
				UnitPrice: roundCurrency(-Number(subsidyCredit)),
			},
		});
	}

	return lines;
}

function buildQuickBooksInvoicePayload(
	invoice: QuickBooksInvoiceRecord,
	customerId: string,
	localLineItems: QuickBooksInvoiceLineItemRecord[],
) {
	return {
		CustomerRef: {
			value: customerId,
		},
		TxnDate: invoice.periodStart,
		DueDate: invoice.dueDate ?? invoice.periodEnd,
		Line: quickBooksInvoiceLineItems(localLineItems, invoice.subsidyCredit),
	};
}

function extractInvoice(payload: { Invoice?: QuickBooksInvoice }) {
	if (!payload.Invoice?.Id) {
		throw new Error("QuickBooks invoice response was incomplete");
	}
	return payload.Invoice;
}

function extractPayment(payload: { Payment?: QuickBooksPayment }) {
	if (!payload.Payment?.Id) {
		throw new Error("QuickBooks payment response was incomplete");
	}
	return payload.Payment;
}

function normalizeQuickBooksInvoiceLineItems(invoice: QuickBooksInvoice) {
	const normalized = (invoice.Line ?? [])
		.filter((line) => typeof line.Amount === "number")
		.map((line) => ({
			description: normalizeText(line.Description) ?? "",
			quantity:
				typeof line.SalesItemLineDetail?.Qty === "number" ? line.SalesItemLineDetail.Qty : 1,
			unitPrice:
				typeof line.SalesItemLineDetail?.UnitPrice === "number"
					? roundCurrency(line.SalesItemLineDetail.UnitPrice)
					: roundCurrency(line.Amount ?? 0),
			amount: roundCurrency(line.Amount ?? 0),
		}));

	const subsidyLine = normalized.find((line) => line.description === "PebbleDesk Subsidy Credit");
	const lineItems = normalized.filter((line) => line.description !== "PebbleDesk Subsidy Credit");
	const subtotal = roundCurrency(lineItems.reduce((sum, line) => sum + line.amount, 0));
	const subsidyCredit = subsidyLine ? roundCurrency(Math.abs(subsidyLine.amount)) : 0;
	const amountDue = roundCurrency(subtotal - subsidyCredit);

	return {
		lineItems,
		subtotal,
		subsidyCredit,
		amountDue,
	};
}

function buildInvoiceProposedChanges(
	invoice: QuickBooksInvoiceRecord,
	localLineItems: QuickBooksInvoiceLineItemRecord[],
	remoteInvoice: QuickBooksInvoice,
) {
	const proposedChanges: Record<string, unknown> = {};
	const normalizedRemote = normalizeQuickBooksInvoiceLineItems(remoteInvoice);
	const normalizedLocalLineItems = localLineItems.map((lineItem) => ({
		description: lineItem.description,
		quantity: lineItem.quantity,
		unitPrice: roundCurrency(lineItem.unitPrice),
		amount: roundCurrency(lineItem.amount),
	}));
	const localStatus = invoice.status === "overdue" ? "sent" : invoice.status;
	const remoteStatus = quickBooksInvoiceStatus(remoteInvoice);
	const localDueDate = normalizeText(invoice.dueDate);
	const remoteDueDate = normalizeText(remoteInvoice.DueDate);
	const remotePaidAt = remoteStatus === "paid" ? requiredIso(remoteInvoice.TxnDate) : null;
	const localPaidAt = toIso(invoice.paidAt);

	if (localStatus !== remoteStatus) {
		proposedChanges.status = remoteStatus;
	}
	if (localDueDate !== remoteDueDate) {
		proposedChanges.dueDate = remoteDueDate;
	}
	if (roundCurrency(invoice.subtotal) !== normalizedRemote.subtotal) {
		proposedChanges.subtotal = normalizedRemote.subtotal;
	}
	if (roundCurrency(invoice.subsidyCredit) !== normalizedRemote.subsidyCredit) {
		proposedChanges.subsidyCredit = normalizedRemote.subsidyCredit;
	}
	if (roundCurrency(invoice.amountDue) !== normalizedRemote.amountDue) {
		proposedChanges.amountDue = normalizedRemote.amountDue;
	}
	if (JSON.stringify(normalizedLocalLineItems) !== JSON.stringify(normalizedRemote.lineItems)) {
		proposedChanges.lineItems = normalizedRemote.lineItems;
	}
	if (localPaidAt !== remotePaidAt) {
		proposedChanges.paidAt = remotePaidAt;
	}

	return proposedChanges;
}

function isQuickBooksExportableInvoice(invoice: QuickBooksInvoiceRecord): boolean {
	return invoice.status !== "draft" && invoice.status !== "void";
}

function buildQuickBooksPaymentPayload(
	payment: QuickBooksPaymentRecord,
	qbCustomerId: string,
	qbInvoiceId: string,
) {
	return {
		CustomerRef: {
			value: qbCustomerId,
		},
		TotalAmt: roundCurrency(payment.amount),
		TxnDate: requiredIso(payment.paidAt).slice(0, 10),
		PaymentRefNum: normalizeText(payment.reference) ?? undefined,
		PrivateNote: payment.method,
		Line: [
			{
				Amount: roundCurrency(payment.amount),
				LinkedTxn: [
					{
						TxnId: qbInvoiceId,
						TxnType: "Invoice",
					},
				],
			},
		],
	};
}

function quickBooksPaymentStatus(payment: QuickBooksPayment) {
	return typeof payment.TotalAmt === "number" && payment.TotalAmt <= 0 ? "reversed" : "posted";
}

function buildPaymentProposedChanges(
	payment: QuickBooksPaymentRecord,
	remotePayment: QuickBooksPayment,
) {
	const proposedChanges: Record<string, unknown> = {};
	const remoteAmount = roundCurrency(remotePayment.TotalAmt ?? 0);
	const remoteStatus = quickBooksPaymentStatus(remotePayment);
	const remotePaidAt = normalizeText(remotePayment.TxnDate);
	const localPaidAt = toIso(payment.paidAt)?.slice(0, 10) ?? null;
	const remoteReference = normalizeText(remotePayment.PaymentRefNum ?? remotePayment.PrivateNote);
	const localReference = normalizeText(payment.reference);

	if (roundCurrency(payment.amount) !== remoteAmount) {
		proposedChanges.amount = remoteAmount;
	}
	if (payment.status !== remoteStatus) {
		proposedChanges.status = remoteStatus;
		proposedChanges.reversedAt = remoteStatus === "reversed" ? new Date().toISOString() : null;
	}
	if (localPaidAt !== remotePaidAt) {
		proposedChanges.paidAt = remotePaidAt ? new Date(remotePaidAt).toISOString() : null;
	}
	if (localReference !== remoteReference) {
		proposedChanges.reference = remoteReference;
	}

	return proposedChanges;
}

async function queryQuickBooksCustomers(
	db: DbClient,
	connection: QuickBooksConnectionRecord,
	config: QuickBooksSyncConfig,
) {
	const response = await quickBooksApiRequest<QuickBooksQueryResponse<QuickBooksCustomer>>(
		db,
		connection,
		config,
		`/query?query=${encodeURIComponent("select * from Customer")}`,
	);
	return {
		connection: response.connection,
		customers: response.payload.QueryResponse?.Customer ?? [],
	};
}

export async function syncInvoicePaymentState(tx: DbClient, centerId: string, invoiceId: string) {
	const [invoice] = (await tx
		.select()
		.from(invoices)
		.where(and(eq(invoices.id, invoiceId), eq(invoices.centerId, centerId)))
		.limit(1)) as QuickBooksInvoiceRecord[];
	if (!invoice) {
		return null;
	}

	const invoicePayments = (await tx
		.select({ amount: payments.amount, paidAt: payments.paidAt })
		.from(payments)
		.where(
			and(
				eq(payments.invoiceId, invoiceId),
				eq(payments.centerId, centerId),
				eq(payments.status, "posted"),
			),
		)) as Array<Pick<QuickBooksPaymentRecord, "amount" | "paidAt">>;
	const totalPaid = roundCurrency(
		invoicePayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
	);
	const latestPaidAt =
		invoicePayments.length > 0
			? invoicePayments
					.map((payment) => payment.paidAt)
					.map(toValidDate)
					.filter((value): value is Date => Boolean(value))
					.sort((left, right) => right.getTime() - left.getTime())[0]
			: null;
	const isPaid = totalPaid >= roundCurrency(invoice.amountDue);
	const preservePaidStatus = invoice.status === "paid";

	const [updatedInvoice] = (await tx
		.update(invoices)
		.set({
			status: invoice.status === "void" ? "void" : isPaid || preservePaidStatus ? "paid" : "sent",
			paidAt:
				invoice.status === "void"
					? invoice.paidAt
					: isPaid
						? latestPaidAt
						: preservePaidStatus
							? invoice.paidAt
							: null,
			updatedAt: new Date(),
		})
		.where(and(eq(invoices.id, invoiceId), eq(invoices.centerId, centerId)))
		.returning()) as QuickBooksInvoiceRecord[];

	return updatedInvoice ?? invoice;
}

async function assertQuickBooksPostedPaymentAllowed(
	tx: DbClient,
	centerId: string,
	invoiceId: string,
	currentPaymentId: string | null,
	amount: number,
) {
	const [invoice] = (await tx
		.select()
		.from(invoices)
		.where(and(eq(invoices.id, invoiceId), eq(invoices.centerId, centerId)))
		.limit(1)) as QuickBooksInvoiceRecord[];
	if (!invoice) {
		badRequest("Selected local target does not belong to this center");
	}
	if (invoice.status === "void") {
		badRequest("Cannot record payments for void invoices");
	}

	const existingPayments = (await tx
		.select({ id: payments.id, amount: payments.amount })
		.from(payments)
		.where(
			and(
				eq(payments.invoiceId, invoiceId),
				eq(payments.centerId, centerId),
				eq(payments.status, "posted"),
			),
		)) as Array<Pick<QuickBooksPaymentRecord, "id" | "amount">>;
	const cumulativePaid = roundCurrency(
		existingPayments.reduce(
			(total, payment) =>
				payment.id === currentPaymentId ? total : total + Number(payment.amount),
			0,
		) + amount,
	);
	if (cumulativePaid > roundCurrency(invoice.amountDue)) {
		badRequest("QuickBooks payment exceeds invoice balance");
	}
}

async function upsertQuickBooksReconciliationItem(
	db: DbClient,
	centerId: string,
	connectionId: string,
	item: Omit<
		typeof quickbooksReconciliationItems.$inferInsert,
		"id" | "centerId" | "connectionId" | "createdAt" | "updatedAt"
	> & {
		entityType: QuickBooksReconciliationItemRecord["entityType"];
		entityId: string;
	},
	existingItem?: QuickBooksReconciliationItemRecord,
) {
	const now = new Date();
	if (existingItem) {
		const preserveReviewState = existingItem.status !== "open";
		await db
			.update(quickbooksReconciliationItems)
			.set({
				origin: item.origin ?? existingItem.origin,
				qbEntityType: item.qbEntityType ?? null,
				qbEntityId: item.qbEntityId ?? null,
				title: item.title,
				description: item.description,
				proposedChanges: item.proposedChanges ?? null,
				status: preserveReviewState ? existingItem.status : "open",
				reviewedByMembershipId: preserveReviewState ? existingItem.reviewedByMembershipId : null,
				reviewedAt: preserveReviewState ? existingItem.reviewedAt : null,
				updatedAt: now,
			})
			.where(
				and(
					eq(quickbooksReconciliationItems.id, existingItem.id),
					eq(quickbooksReconciliationItems.centerId, centerId),
					eq(quickbooksReconciliationItems.connectionId, connectionId),
				),
			);
		return false;
	}

	await db.insert(quickbooksReconciliationItems).values({
		centerId,
		connectionId,
		origin: item.origin ?? "local",
		entityType: item.entityType,
		entityId: item.entityId,
		qbEntityType: item.qbEntityType ?? null,
		qbEntityId: item.qbEntityId ?? null,
		issueType: item.issueType,
		title: item.title,
		description: item.description,
		proposedChanges: item.proposedChanges ?? null,
		status: "open",
		createdAt: now,
		updatedAt: now,
	});
	return true;
}

async function applyInvoiceReconciliationChanges(
	db: DbClient,
	item: Pick<QuickBooksReconciliationItemRecord, "centerId" | "entityId" | "proposedChanges">,
) {
	const proposedChanges = item.proposedChanges ?? {};
	if (Object.keys(proposedChanges).length === 0) {
		return;
	}
	const [existingInvoice] = (await db
		.select()
		.from(invoices)
		.where(and(eq(invoices.id, item.entityId), eq(invoices.centerId, item.centerId)))
		.limit(1)) as QuickBooksInvoiceRecord[];
	if (!existingInvoice) {
		return;
	}

	const updatedAt = new Date();
	const invoiceUpdate: Partial<typeof invoices.$inferInsert> = {
		updatedAt,
	};
	// Only allow statuses that QB reconciliation may legitimately set.
	// "draft" is excluded (invoices are never re-drafted via reconciliation) and
	// "void" is excluded (voiding requires an explicit user action, not a QB sync).
	const QB_RECONCILIATION_ALLOWED_STATUSES = ["sent", "paid", "overdue"] as const;
	type QbAllowedStatus = (typeof QB_RECONCILIATION_ALLOWED_STATUSES)[number];
	if (
		typeof proposedChanges.status === "string" &&
		(QB_RECONCILIATION_ALLOWED_STATUSES as readonly string[]).includes(proposedChanges.status)
	) {
		invoiceUpdate.status = proposedChanges.status as QbAllowedStatus;
	}
	if ("dueDate" in proposedChanges) {
		invoiceUpdate.dueDate =
			typeof proposedChanges.dueDate === "string" ? proposedChanges.dueDate : null;
	}
	if ("paidAt" in proposedChanges) {
		invoiceUpdate.paidAt =
			typeof proposedChanges.paidAt === "string" ? new Date(proposedChanges.paidAt) : null;
	}
	if (typeof proposedChanges.subtotal === "number") {
		invoiceUpdate.subtotal = String(proposedChanges.subtotal);
	}
	if (typeof proposedChanges.subsidyCredit === "number") {
		invoiceUpdate.subsidyCredit = String(proposedChanges.subsidyCredit);
	}
	if (typeof proposedChanges.amountDue === "number") {
		invoiceUpdate.amountDue = String(proposedChanges.amountDue);
	}

	const lineItems = Array.isArray(proposedChanges.lineItems)
		? (proposedChanges.lineItems as Array<{
				childId?: string;
				description: string;
				quantity: number;
				unitPrice: number;
				amount: number;
			}>)
		: null;

	if (lineItems) {
		invoiceUpdate.publicLinkToken = createPublicLinkNonce();
		invoiceUpdate.publicLinkVersion = existingInvoice.publicLinkVersion + 1;
		invoiceUpdate.publicLinkRotatedAt = updatedAt;
	}

	await db
		.update(invoices)
		.set(invoiceUpdate)
		.where(and(eq(invoices.id, item.entityId), eq(invoices.centerId, item.centerId)));

	if (lineItems) {
		await db
			.delete(invoiceLineItems)
			.where(
				and(
					eq(invoiceLineItems.invoiceId, item.entityId),
					eq(invoiceLineItems.centerId, item.centerId),
				),
			);
		await db.insert(invoiceLineItems).values(
			lineItems.map((lineItem) => ({
				centerId: item.centerId,
				invoiceId: item.entityId,
				childId: lineItem.childId,
				description: lineItem.description,
				quantity: lineItem.quantity,
				unitPrice: String(lineItem.unitPrice),
				amount: String(lineItem.amount),
			})),
		);
	}

	await syncInvoicePaymentState(db, item.centerId, item.entityId);
}

function applyReconciliationChanges(
	db: DbClient,
	item: Pick<
		QuickBooksReconciliationItemRecord,
		"centerId" | "entityType" | "entityId" | "proposedChanges"
	>,
) {
	const proposedChanges = item.proposedChanges ?? {};
	if (Object.keys(proposedChanges).length === 0) {
		return Promise.resolve();
	}

	if (item.entityType === "customer") {
		return db
			.update(guardians)
			.set({
				...proposedChanges,
				updatedAt: new Date(),
			})
			.where(and(eq(guardians.id, item.entityId), eq(guardians.centerId, item.centerId)));
	}

	if (item.entityType === "invoice") {
		return applyInvoiceReconciliationChanges(db, item);
	}

	return (async () => {
		const [payment] = (await db
			.select()
			.from(payments)
			.where(and(eq(payments.id, item.entityId), eq(payments.centerId, item.centerId)))
			.limit(1)) as QuickBooksPaymentRecord[];
		if (!payment) {
			return null;
		}

		const nextPaymentStatus =
			typeof proposedChanges.status === "string"
				? (proposedChanges.status as typeof payments.$inferInsert.status)
				: payment.status;
		const nextPaymentAmount =
			typeof proposedChanges.amount === "number" ? proposedChanges.amount : Number(payment.amount);
		if (
			nextPaymentStatus === "posted" &&
			(typeof proposedChanges.amount === "number" ||
				(typeof proposedChanges.status === "string" && payment.status !== "posted"))
		) {
			await assertQuickBooksPostedPaymentAllowed(
				db,
				payment.centerId,
				payment.invoiceId,
				payment.id,
				nextPaymentAmount,
			);
		}

		const paymentUpdate: Partial<typeof payments.$inferInsert> = {
			updatedAt: new Date(),
		};
		if (typeof proposedChanges.status === "string") {
			paymentUpdate.status = proposedChanges.status as typeof payments.$inferInsert.status;
		}
		if ("reversedAt" in proposedChanges) {
			paymentUpdate.reversedAt =
				typeof proposedChanges.reversedAt === "string"
					? new Date(proposedChanges.reversedAt)
					: null;
		}
		if (typeof proposedChanges.amount === "number") {
			paymentUpdate.amount = String(proposedChanges.amount);
		}
		if ("paidAt" in proposedChanges) {
			paymentUpdate.paidAt =
				typeof proposedChanges.paidAt === "string"
					? new Date(proposedChanges.paidAt)
					: payment.paidAt;
		}
		if ("reference" in proposedChanges) {
			paymentUpdate.reference =
				typeof proposedChanges.reference === "string" ? proposedChanges.reference : null;
		}
		await db
			.update(payments)
			.set(paymentUpdate)
			.where(and(eq(payments.id, item.entityId), eq(payments.centerId, item.centerId)));
		await syncInvoicePaymentState(db, payment.centerId, payment.invoiceId);
		return null;
	})();
}

function serializeConnection(connection: QuickBooksConnectionRecord): QuickBooksConnectionSummary {
	return {
		id: connection.id,
		centerId: connection.centerId,
		realmId: connection.realmId,
		companyName: connection.companyName ?? undefined,
		scopes: connection.scopes ?? undefined,
		status: connection.status,
		syncDirection: connection.syncDirection,
		tokenExpiresAt: requiredIso(
			connection.tokenExpiresAt,
			connection.updatedAt,
			connection.connectedAt,
		),
		connectedAt: requiredIso(connection.connectedAt, connection.updatedAt),
		disconnectedAt: toIso(connection.disconnectedAt),
		lastSyncAt: toIso(connection.lastSyncAt),
		createdAt: requiredIso(connection.createdAt, connection.updatedAt, connection.connectedAt),
		updatedAt: requiredIso(connection.updatedAt, connection.connectedAt),
	};
}

function serializeSyncLog(log: QuickBooksSyncLogRecord): QuickBooksSyncLog {
	return {
		id: log.id,
		centerId: log.centerId,
		connectionId: log.connectionId,
		entityType: log.entityType,
		entityId: log.entityId,
		qbEntityId: log.qbEntityId ?? undefined,
		status: log.status,
		errorMessage: log.errorMessage ?? undefined,
		direction: log.direction,
		syncedAt: requiredIso(log.syncedAt, log.createdAt),
		createdAt: requiredIso(log.createdAt, log.syncedAt),
	};
}

function serializeEntityLink(link: QuickBooksEntityLinkRecord): QuickBooksEntityLink {
	return {
		id: link.id,
		centerId: link.centerId,
		connectionId: link.connectionId,
		entityType: link.entityType,
		entityId: link.entityId,
		qbEntityType: link.qbEntityType,
		qbEntityId: link.qbEntityId,
		syncStatus: link.syncStatus,
		lastSyncedAt: toIso(link.lastSyncedAt),
		createdAt: requiredIso(link.createdAt, link.updatedAt),
		updatedAt: requiredIso(link.updatedAt, link.createdAt),
	};
}

function serializeReconciliationItem(
	item: QuickBooksReconciliationItemRecord,
): QuickBooksReconciliationItem {
	return {
		id: item.id,
		centerId: item.centerId,
		connectionId: item.connectionId,
		origin: item.origin ?? "local",
		entityType: item.entityType,
		entityId: item.entityId,
		qbEntityType: item.qbEntityType ?? undefined,
		qbEntityId: item.qbEntityId ?? undefined,
		issueType: item.issueType,
		title: item.title,
		description: item.description,
		proposedChanges: item.proposedChanges ?? undefined,
		status: item.status,
		reviewedByMembershipId: item.reviewedByMembershipId ?? undefined,
		reviewedAt: toIso(item.reviewedAt),
		createdAt: requiredIso(item.createdAt, item.updatedAt),
		updatedAt: requiredIso(item.updatedAt, item.createdAt),
	};
}

async function createLocalQuickBooksPayment(
	tx: DbClient,
	centerId: string,
	item: QuickBooksReconciliationItemRecord,
	localInvoiceId: string,
	now: Date,
) {
	const proposedChanges = item.proposedChanges ?? {};
	const paymentStatus =
		typeof proposedChanges.status === "string"
			? (proposedChanges.status as typeof payments.$inferInsert.status)
			: "posted";
	const paymentAmount = typeof proposedChanges.amount === "number" ? proposedChanges.amount : 0;
	if (paymentStatus === "posted") {
		await assertQuickBooksPostedPaymentAllowed(tx, centerId, localInvoiceId, null, paymentAmount);
	}
	const [createdPayment] = (await tx
		.insert(payments)
		.values({
			centerId,
			invoiceId: localInvoiceId,
			amount: String(paymentAmount),
			method:
				typeof proposedChanges.method === "string"
					? (proposedChanges.method as typeof payments.$inferInsert.method)
					: "other",
			provider: "quickbooks",
			status: paymentStatus,
			providerTransactionId: item.qbEntityId ?? item.entityId,
			reference:
				typeof proposedChanges.reference === "string" ? proposedChanges.reference : undefined,
			paidAt: typeof proposedChanges.paidAt === "string" ? new Date(proposedChanges.paidAt) : now,
			reversedAt:
				"reversedAt" in proposedChanges && typeof proposedChanges.reversedAt === "string"
					? new Date(proposedChanges.reversedAt)
					: paymentStatus === "reversed"
						? now
						: undefined,
			createdAt: now,
			updatedAt: now,
		})
		.returning()) as Array<typeof payments.$inferSelect>;
	await syncInvoicePaymentState(tx, centerId, localInvoiceId);

	return createdPayment;
}

async function assertQuickBooksLocalTargetBelongsToCenter(
	tx: DbClient,
	centerId: string,
	entityType: QuickBooksReconciliationItemRecord["entityType"],
	localTargetId: string,
) {
	const table = entityType === "customer" ? guardians : invoices;
	const idColumn = entityType === "customer" ? guardians.id : invoices.id;
	const centerIdColumn = entityType === "customer" ? guardians.centerId : invoices.centerId;
	const [target] = await tx
		.select()
		.from(table)
		.where(and(eq(idColumn, localTargetId), eq(centerIdColumn, centerId)))
		.limit(1);

	if (!target) {
		badRequest("Selected local target does not belong to this center");
	}
}

async function upsertEntityLink(
	db: DbClient,
	centerId: string,
	connectionId: string,
	entityType: QuickBooksEntityLinkRecord["entityType"],
	entityId: string,
	qbEntityId: string,
	existingLink?: QuickBooksEntityLinkRecord,
) {
	const now = new Date();
	const [link] = existingLink
		? ((await db
				.update(quickbooksEntityLinks)
				.set({
					qbEntityType: entityType,
					qbEntityId,
					syncStatus: "success",
					lastSyncedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(quickbooksEntityLinks.id, existingLink.id),
						eq(quickbooksEntityLinks.centerId, centerId),
						eq(quickbooksEntityLinks.connectionId, connectionId),
						eq(quickbooksEntityLinks.entityId, entityId),
					),
				)
				.returning()) as QuickBooksEntityLinkRecord[])
		: ((await db
				.insert(quickbooksEntityLinks)
				.values({
					centerId,
					connectionId,
					entityType,
					entityId,
					qbEntityType: entityType,
					qbEntityId,
					syncStatus: "success",
					lastSyncedAt: now,
					createdAt: now,
					updatedAt: now,
				})
				.returning()) as QuickBooksEntityLinkRecord[]);

	return link;
}

async function listInvoiceLineItems(db: DbClient, centerId: string, invoiceId: string) {
	return (await db
		.select()
		.from(invoiceLineItems)
		.where(
			and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.centerId, centerId)),
		)) as QuickBooksInvoiceLineItemRecord[];
}

async function queryQuickBooksInvoicesByCustomer(
	db: DbClient,
	connection: QuickBooksConnectionRecord,
	config: QuickBooksSyncConfig,
	customerId: string,
) {
	const response = await quickBooksApiRequest<{
		QueryResponse?: {
			Invoice?: QuickBooksInvoice[];
		};
	}>(
		db,
		connection,
		config,
		`/query?query=${encodeURIComponent(
			`select * from Invoice where CustomerRef = '${escapeQuickBooksQueryLiteral(customerId)}'`,
		)}`,
	);

	return {
		connection: response.connection,
		invoices: response.payload.QueryResponse?.Invoice ?? [],
	};
}

async function queryQuickBooksPaymentsByCustomer(
	db: DbClient,
	connection: QuickBooksConnectionRecord,
	config: QuickBooksSyncConfig,
	customerId: string,
) {
	const response = await quickBooksApiRequest<{
		QueryResponse?: {
			Payment?: QuickBooksPayment[];
		};
	}>(
		db,
		connection,
		config,
		`/query?query=${encodeURIComponent(
			`select * from Payment where CustomerRef = '${escapeQuickBooksQueryLiteral(customerId)}'`,
		)}`,
	);

	return {
		connection: response.connection,
		payments: response.payload.QueryResponse?.Payment ?? [],
	};
}

async function getConnection(db: DbClient, centerId: string) {
	const [connection] = (await db
		.select()
		.from(quickbooksConnections)
		.where(eq(quickbooksConnections.centerId, centerId))
		.limit(1)) as QuickBooksConnectionRecord[];
	return connection;
}

async function withOptionalTransaction<T>(db: DbClient, callback: (tx: DbClient) => Promise<T>) {
	const transactionalDb = db as DbClient & {
		transaction?: (fn: (tx: DbClient) => Promise<T>) => Promise<T>;
	};
	return transactionalDb.transaction ? transactionalDb.transaction(callback) : callback(db);
}

export function encryptQuickBooksToken(value: string, secret: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
	const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptQuickBooksTokenOnce(value: string, secret: string) {
	const [ivPart, authTagPart, ciphertextPart] = value.split(".");
	if (!ivPart || !authTagPart || !ciphertextPart) {
		throw new Error("Invalid QuickBooks token");
	}

	const decipher = createDecipheriv(
		"aes-256-gcm",
		deriveKey(secret),
		Buffer.from(ivPart, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(ciphertextPart, "base64url")),
		decipher.final(),
	]);
	return decrypted.toString("utf8");
}

export function decryptQuickBooksToken(value: string, secret: string, legacySecret?: string) {
	try {
		return decryptQuickBooksTokenOnce(value, secret);
	} catch (error) {
		if (!legacySecret || legacySecret === secret) {
			throw error;
		}

		return decryptQuickBooksTokenOnce(value, legacySecret);
	}
}

export async function startQuickBooksConnect(
	centerId: string,
	membershipId: string,
	userId: string,
	config: QuickBooksOAuthConfig,
) {
	const configurationIssue = getQuickBooksConfigurationIssue(config, {
		requireClientSecret: false,
	});
	if (configurationIssue) {
		throw new Error(configurationIssue);
	}

	const state = encodeQuickBooksState(
		{
			centerId,
			membershipId,
			userId,
			issuedAt: Date.now(),
		},
		config.secret,
	);
	const url = new URL(QUICKBOOKS_AUTHORIZE_URL);
	url.searchParams.set("client_id", config.clientId);
	url.searchParams.set("redirect_uri", config.redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", QUICKBOOKS_SCOPE);
	url.searchParams.set("state", state);
	return { url: url.toString(), state };
}

export async function completeQuickBooksConnectCallback(
	db: DbClient,
	input: QuickBooksOAuthCallbackInput,
	config: QuickBooksOAuthConfig,
) {
	if (input.error) {
		return {
			redirectUrl: buildQuickBooksSettingsRedirect(
				config.appUrl,
				"error",
				input.errorDescription ?? input.error,
			),
		};
	}
	if (!input.code || !input.realmId || !input.state) {
		throw new Error("Missing QuickBooks OAuth callback parameters");
	}
	if (!config.clientSecret) {
		throw new Error("QuickBooks client secret is not configured");
	}

	const state = decodeQuickBooksStateWithFallback(input.state, config);
	const [membership] = await db
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.id, state.membershipId),
				eq(memberships.centerId, state.centerId),
				eq(memberships.userId, state.userId),
			),
		)
		.limit(1);
	if (!membership || membership.role !== "owner") {
		throw new Error("QuickBooks OAuth session is no longer valid");
	}
	const tokenPayload = await exchangeQuickBooksTokens(input.code, {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		redirectUri: config.redirectUri,
	});
	const tokenExpiresAt = new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString();
	const connection = await upsertQuickBooksConnection(
		db,
		state.centerId,
		{
			realmId: input.realmId,
			accessToken: tokenPayload.access_token,
			refreshToken: tokenPayload.refresh_token,
			tokenExpiresAt,
			scopes: [QUICKBOOKS_SCOPE],
			syncDirection: "pull",
		},
		config.secret,
	);

	return {
		redirectUrl: buildQuickBooksSettingsRedirect(config.appUrl, "connected"),
		connection,
	};
}

export async function upsertQuickBooksConnection(
	db: DbClient,
	centerId: string,
	input: QuickBooksConnectionUpsertInput,
	secret: string,
) {
	const now = new Date();
	const values = {
		centerId,
		realmId: input.realmId,
		companyName: input.companyName ?? null,
		scopes: input.scopes ?? null,
		accessToken: encryptQuickBooksToken(input.accessToken, secret),
		refreshToken: encryptQuickBooksToken(input.refreshToken, secret),
		tokenExpiresAt: new Date(input.tokenExpiresAt),
		syncDirection: normalizeSyncDirection(input.syncDirection),
		status: "connected" as const,
		connectedAt: now,
		disconnectedAt: null,
		updatedAt: now,
	};
	const [connection] = (await db
		.insert(quickbooksConnections)
		.values(values)
		.onConflictDoUpdate({
			target: quickbooksConnections.centerId,
			set: {
				realmId: values.realmId,
				companyName: values.companyName,
				scopes: values.scopes,
				accessToken: values.accessToken,
				refreshToken: values.refreshToken,
				tokenExpiresAt: values.tokenExpiresAt,
				syncDirection: values.syncDirection,
				status: values.status,
				connectedAt: values.connectedAt,
				disconnectedAt: values.disconnectedAt,
				updatedAt: values.updatedAt,
			},
		})
		.returning()) as QuickBooksConnectionRecord[];
	if (!connection) throw new Error("Failed to upsert QuickBooks connection");
	return serializeConnection(connection);
}

export async function getQuickBooksStatus(
	db: DbClient,
	centerId: string,
	config?: Pick<QuickBooksOAuthConfig, "clientId" | "clientSecret">,
): Promise<QuickBooksStatusSnapshot> {
	const configurationIssue = getQuickBooksConfigurationIssue(config);
	const connection = await getConnection(db, centerId);
	const openItems = (await db
		.select()
		.from(quickbooksReconciliationItems)
		.where(
			and(
				eq(quickbooksReconciliationItems.centerId, centerId),
				eq(quickbooksReconciliationItems.status, "open"),
			),
		)) as QuickBooksReconciliationItemRecord[];
	const [lastSync] = (await db
		.select()
		.from(quickbooksSyncLog)
		.where(eq(quickbooksSyncLog.centerId, centerId))
		.orderBy(desc(quickbooksSyncLog.syncedAt))
		.limit(1)) as QuickBooksSyncLogRecord[];

	return {
		status: connection?.status ?? "disconnected",
		connection: connection ? serializeConnection(connection) : null,
		openReconciliationCount: openItems.length,
		lastSync: lastSync ? serializeSyncLog(lastSync) : null,
		isConfigured: !configurationIssue,
		configurationIssue,
	};
}

export async function disconnectQuickBooks(db: DbClient, centerId: string) {
	const connection = await getConnection(db, centerId);
	if (!connection) {
		return { disconnected: true as const };
	}

	const now = new Date();
	const [updated] = (await db
		.update(quickbooksConnections)
		.set({
			status: "disconnected",
			disconnectedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(quickbooksConnections.id, connection.id),
				eq(quickbooksConnections.centerId, centerId),
			),
		)
		.returning()) as QuickBooksConnectionRecord[];

	return {
		disconnected: true as const,
		connection: updated ? serializeConnection(updated) : serializeConnection(connection),
	};
}

export async function listQuickBooksSyncHistory(db: DbClient, centerId: string, limit = 25) {
	const rows = (await db
		.select()
		.from(quickbooksSyncLog)
		.where(eq(quickbooksSyncLog.centerId, centerId))
		.orderBy(desc(quickbooksSyncLog.syncedAt))
		.limit(limit)) as QuickBooksSyncLogRecord[];
	return rows.map(serializeSyncLog);
}

export async function listQuickBooksReconciliationItems(
	db: DbClient,
	centerId: string,
	status?: QuickBooksReconciliationItemRecord["status"],
) {
	const whereCondition = status
		? and(
				eq(quickbooksReconciliationItems.centerId, centerId),
				eq(quickbooksReconciliationItems.status, status),
			)
		: eq(quickbooksReconciliationItems.centerId, centerId);

	const rows = (await db
		.select()
		.from(quickbooksReconciliationItems)
		.where(whereCondition)
		.orderBy(desc(quickbooksReconciliationItems.createdAt))
		.limit(100)) as QuickBooksReconciliationItemRecord[];
	return rows.map(serializeReconciliationItem);
}

export async function runQuickBooksSync(
	db: DbClient,
	centerId: string,
	action?: QuickBooksSyncAction,
	config?: QuickBooksSyncConfig,
) {
	const connection = await getConnection(db, centerId);
	if (!connection || connection.status !== "connected") {
		badRequest("QuickBooks is not connected");
	}
	if (!config?.secret) {
		throw new Error("QuickBooks sync secret is not configured");
	}
	const syncAction = normalizeSyncAction(action);

	const guardianRows = (await db
		.select()
		.from(guardians)
		.where(eq(guardians.centerId, centerId))) as QuickBooksGuardianRecord[];
	const invoiceRows = (await db
		.select()
		.from(invoices)
		.where(eq(invoices.centerId, centerId))) as QuickBooksInvoiceRecord[];
	const paymentRows = (await db
		.select()
		.from(payments)
		.where(eq(payments.centerId, centerId))) as QuickBooksPaymentRecord[];
	const linkRows = (await db
		.select()
		.from(quickbooksEntityLinks)
		.where(eq(quickbooksEntityLinks.centerId, centerId))) as QuickBooksEntityLinkRecord[];
	const reconciliationRows = (await db
		.select()
		.from(quickbooksReconciliationItems)
		.where(
			eq(quickbooksReconciliationItems.centerId, centerId),
		)) as QuickBooksReconciliationItemRecord[];

	const linkMap = new Map<string, QuickBooksEntityLinkRecord>();
	const linkedCustomerIds = new Map<string, QuickBooksEntityLinkRecord>();
	for (const link of linkRows) {
		linkMap.set(`${link.entityType}:${link.entityId}`, link);
		if (link.entityType === "customer") {
			linkedCustomerIds.set(link.qbEntityId, link);
		}
	}
	const reconciliationMap = new Map<string, QuickBooksReconciliationItemRecord>();
	for (const item of reconciliationRows) {
		reconciliationMap.set(
			`${item.origin ?? "local"}:${item.entityType}:${item.entityId}:${item.issueType}`,
			item,
		);
	}
	const guardianMap = new Map(guardianRows.map((guardian) => [guardian.id, guardian]));
	const invoiceMap = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]));
	const paymentMap = new Map(paymentRows.map((payment) => [payment.id, payment]));
	const exportableInvoiceRows = invoiceRows.filter(isQuickBooksExportableInvoice);

	const now = new Date();
	const syncLogRows: Array<typeof quickbooksSyncLog.$inferInsert> = [];
	let createdReconciliationItems = 0;
	let activeConnection = connection;
	const nonCustomerTargets = [
		...exportableInvoiceRows.map((row) => ({ entityType: "invoice" as const, entityId: row.id })),
		...paymentRows.map((row) => ({ entityType: "payment" as const, entityId: row.id })),
	];

	if (syncAction !== "import") {
		for (const guardian of guardianRows) {
			const link = linkMap.get(`customer:${guardian.id}`);
			try {
				let customerId = link?.qbEntityId;
				if (customerId) {
					const currentCustomer = await quickBooksApiRequest<{ Customer?: QuickBooksCustomer }>(
						db,
						activeConnection,
						config,
						`/customer/${customerId}`,
					);
					activeConnection = currentCustomer.connection;
					const remoteCustomer = extractCustomer(currentCustomer.payload);
					const updatedCustomer = await quickBooksApiRequest<{ Customer?: QuickBooksCustomer }>(
						db,
						activeConnection,
						config,
						"/customer?operation=update",
						{
							method: "POST",
							body: JSON.stringify({
								...buildQuickBooksCustomerPayload(guardian),
								Id: remoteCustomer.Id,
								SyncToken: remoteCustomer.SyncToken,
								sparse: true,
							}),
						},
					);
					activeConnection = updatedCustomer.connection;
					customerId = extractCustomer(updatedCustomer.payload).Id;
				} else {
					const existingCustomer = await findQuickBooksCustomerByDisplayName(
						db,
						activeConnection,
						config,
						guardianDisplayName(guardian),
					);
					activeConnection = existingCustomer.connection;
					const unlinkedCustomers = existingCustomer.customers.filter(
						(customer) => !linkedCustomerIds.has(customer.Id),
					);
					const matchedCustomer =
						unlinkedCustomers.find((customer) => shouldReuseExistingCustomer(guardian, customer)) ??
						(!hasGuardianContact(guardian) && unlinkedCustomers.length === 1
							? unlinkedCustomers[0]
							: undefined);
					if (matchedCustomer) {
						customerId = matchedCustomer.Id;
					} else {
						const createdCustomer = await quickBooksApiRequest<{ Customer?: QuickBooksCustomer }>(
							db,
							activeConnection,
							config,
							"/customer",
							{
								method: "POST",
								body: JSON.stringify(buildQuickBooksCustomerPayload(guardian)),
							},
						);
						activeConnection = createdCustomer.connection;
						customerId = extractCustomer(createdCustomer.payload).Id;
					}
				}

				const updatedCustomerLink = await upsertCustomerLink(
					db,
					centerId,
					activeConnection.id,
					guardian.id,
					customerId,
					link,
				);
				linkMap.set(`customer:${guardian.id}`, updatedCustomerLink);
				linkedCustomerIds.set(customerId, {
					...(updatedCustomerLink ?? {
						id: `linked-${guardian.id}`,
						centerId,
						connectionId: activeConnection.id,
						entityType: "customer",
						entityId: guardian.id,
						qbEntityType: "customer",
						qbEntityId: customerId,
						syncStatus: "success",
						lastSyncedAt: now,
						createdAt: now,
						updatedAt: now,
					}),
					connectionId: activeConnection.id,
					entityId: guardian.id,
					qbEntityId: customerId,
					lastSyncedAt: now,
					updatedAt: now,
				});

				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "customer",
					entityId: guardian.id,
					qbEntityId: customerId,
					direction: "push",
					status: "success",
					errorMessage: null,
					syncedAt: now,
				});
			} catch (error) {
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "customer",
					entityId: guardian.id,
					qbEntityId: link?.qbEntityId ?? null,
					direction: "push",
					status: "failed",
					errorMessage: error instanceof Error ? error.message : "QuickBooks sync failed",
					syncedAt: now,
				});
			}
		}
	}

	if (syncAction !== "import") {
		for (const target of nonCustomerTargets) {
			const link = linkMap.get(`${target.entityType}:${target.entityId}`);
			try {
				if (target.entityType === "invoice") {
					const invoice = invoiceMap.get(target.entityId);
					if (!invoice) {
						continue;
					}
					const customerLink = linkMap.get(`customer:${invoice.guardianId}`);
					if (!customerLink) {
						const issueType: QuickBooksIssueType = "missing_link";
						const created = await upsertQuickBooksReconciliationItem(
							db,
							centerId,
							activeConnection.id,
							{
								origin: "local",
								entityType: "invoice",
								entityId: invoice.id,
								qbEntityType: "invoice",
								qbEntityId: null,
								issueType,
								title: "Invoice needs a linked QuickBooks customer",
								description: `Invoice ${invoice.id} cannot sync until its guardian has a QuickBooks customer link.`,
								proposedChanges: null,
								status: "open",
							},
							reconciliationMap.get(`local:invoice:${invoice.id}:${issueType}`),
						);
						if (created) createdReconciliationItems += 1;
						syncLogRows.push({
							centerId,
							connectionId: activeConnection.id,
							entityType: "invoice",
							entityId: invoice.id,
							qbEntityId: null,
							direction: "push",
							status: "pending",
							errorMessage: "Awaiting linked QuickBooks customer",
							syncedAt: now,
						});
						continue;
					}

					const localLineItems = await listInvoiceLineItems(db, centerId, invoice.id);
					const payload = buildQuickBooksInvoicePayload(
						invoice,
						customerLink.qbEntityId,
						localLineItems,
					);
					let qbInvoiceId = link?.qbEntityId;
					if (qbInvoiceId) {
						const currentInvoice = await quickBooksApiRequest<{ Invoice?: QuickBooksInvoice }>(
							db,
							activeConnection,
							config,
							`/invoice/${qbInvoiceId}`,
						);
						activeConnection = currentInvoice.connection;
						const remoteInvoice = extractInvoice(currentInvoice.payload);
						const updatedInvoice = await quickBooksApiRequest<{ Invoice?: QuickBooksInvoice }>(
							db,
							activeConnection,
							config,
							"/invoice?operation=update",
							{
								method: "POST",
								body: JSON.stringify({
									...payload,
									Id: remoteInvoice.Id,
									SyncToken: remoteInvoice.SyncToken,
									sparse: false,
								}),
							},
						);
						activeConnection = updatedInvoice.connection;
						qbInvoiceId = extractInvoice(updatedInvoice.payload).Id;
					} else {
						const createdInvoice = await quickBooksApiRequest<{ Invoice?: QuickBooksInvoice }>(
							db,
							activeConnection,
							config,
							"/invoice",
							{
								method: "POST",
								body: JSON.stringify(payload),
							},
						);
						activeConnection = createdInvoice.connection;
						qbInvoiceId = extractInvoice(createdInvoice.payload).Id;
					}

					const updatedLink = await upsertEntityLink(
						db,
						centerId,
						activeConnection.id,
						"invoice",
						invoice.id,
						qbInvoiceId,
						link,
					);
					linkMap.set(`invoice:${invoice.id}`, updatedLink);
					syncLogRows.push({
						centerId,
						connectionId: activeConnection.id,
						entityType: "invoice",
						entityId: invoice.id,
						qbEntityId: qbInvoiceId,
						direction: "push",
						status: "success",
						errorMessage: null,
						syncedAt: now,
					});
					continue;
				}

				const payment = paymentMap.get(target.entityId);
				if (!payment || payment.status === "reversed") {
					continue;
				}
				const invoiceLink = linkMap.get(`invoice:${payment.invoiceId}`);
				const invoice = invoiceMap.get(payment.invoiceId);
				const customerLink = invoice ? linkMap.get(`customer:${invoice.guardianId}`) : undefined;
				if (!invoiceLink || !invoice || !customerLink) {
					const issueType: QuickBooksIssueType = "missing_link";
					const created = await upsertQuickBooksReconciliationItem(
						db,
						centerId,
						activeConnection.id,
						{
							origin: "local",
							entityType: "payment",
							entityId: payment.id,
							qbEntityType: "payment",
							qbEntityId: null,
							issueType,
							title: "Payment needs linked QuickBooks records",
							description: `Payment ${payment.id} cannot sync until its invoice and guardian are linked to QuickBooks.`,
							proposedChanges: null,
							status: "open",
						},
						reconciliationMap.get(`local:payment:${payment.id}:${issueType}`),
					);
					if (created) createdReconciliationItems += 1;
					syncLogRows.push({
						centerId,
						connectionId: activeConnection.id,
						entityType: "payment",
						entityId: payment.id,
						qbEntityId: null,
						direction: "push",
						status: "pending",
						errorMessage: "Awaiting linked QuickBooks invoice",
						syncedAt: now,
					});
					continue;
				}

				const payload = buildQuickBooksPaymentPayload(
					payment,
					customerLink.qbEntityId,
					invoiceLink.qbEntityId,
				);
				let qbPaymentId = link?.qbEntityId;
				if (qbPaymentId) {
					const currentPayment = await quickBooksApiRequest<{ Payment?: QuickBooksPayment }>(
						db,
						activeConnection,
						config,
						`/payment/${qbPaymentId}`,
					);
					activeConnection = currentPayment.connection;
					const remotePayment = extractPayment(currentPayment.payload);
					const updatedPayment = await quickBooksApiRequest<{ Payment?: QuickBooksPayment }>(
						db,
						activeConnection,
						config,
						"/payment?operation=update",
						{
							method: "POST",
							body: JSON.stringify({
								...payload,
								Id: remotePayment.Id,
								SyncToken: remotePayment.SyncToken,
								sparse: false,
							}),
						},
					);
					activeConnection = updatedPayment.connection;
					qbPaymentId = extractPayment(updatedPayment.payload).Id;
				} else {
					const createdPayment = await quickBooksApiRequest<{ Payment?: QuickBooksPayment }>(
						db,
						activeConnection,
						config,
						"/payment",
						{
							method: "POST",
							body: JSON.stringify(payload),
						},
					);
					activeConnection = createdPayment.connection;
					qbPaymentId = extractPayment(createdPayment.payload).Id;
				}

				const updatedLink = await upsertEntityLink(
					db,
					centerId,
					activeConnection.id,
					"payment",
					payment.id,
					qbPaymentId,
					link,
				);
				linkMap.set(`payment:${payment.id}`, updatedLink);
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "payment",
					entityId: payment.id,
					qbEntityId: qbPaymentId,
					direction: "push",
					status: "success",
					errorMessage: null,
					syncedAt: now,
				});
			} catch (error) {
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: target.entityType,
					entityId: target.entityId,
					qbEntityId: link?.qbEntityId ?? null,
					direction: "push",
					status: "failed",
					errorMessage: error instanceof Error ? error.message : "QuickBooks sync failed",
					syncedAt: now,
				});
			}
		}
	}

	if (syncAction !== "export") {
		const activeLinkRows = Array.from(linkMap.values());
		for (const link of activeLinkRows.filter((item) => item.entityType === "customer")) {
			const guardian = guardianMap.get(link.entityId);
			if (!guardian) {
				const issueType: QuickBooksIssueType = "orphaned_link";
				const created = await upsertQuickBooksReconciliationItem(
					db,
					centerId,
					activeConnection.id,
					{
						origin: "local",
						entityType: "customer",
						entityId: link.entityId,
						qbEntityType: "customer",
						qbEntityId: link.qbEntityId,
						issueType,
						title: "QuickBooks guardian link is orphaned",
						description:
							"The linked PebbleDesk guardian no longer exists. Dismiss or reconnect this QuickBooks customer manually.",
						proposedChanges: null,
						status: "open",
					},
					reconciliationMap.get(`local:customer:${link.entityId}:${issueType}`),
				);
				if (created) {
					createdReconciliationItems += 1;
				}
				continue;
			}
			try {
				const customerResponse = await quickBooksApiRequest<{ Customer?: QuickBooksCustomer }>(
					db,
					activeConnection,
					config,
					`/customer/${link.qbEntityId}`,
				);
				activeConnection = customerResponse.connection;
				const customer = extractCustomer(customerResponse.payload);
				const proposedChanges = buildCustomerProposedChanges(guardian, customer);

				if (Object.keys(proposedChanges).length > 0) {
					const created = await upsertQuickBooksReconciliationItem(
						db,
						centerId,
						activeConnection.id,
						{
							entityType: "customer",
							entityId: guardian.id,
							qbEntityType: "customer",
							qbEntityId: customer.Id,
							issueType: "status_mismatch",
							title: "Guardian contact details changed in QuickBooks",
							description: "Billing contact details differ from PebbleDesk.",
							proposedChanges,
							status: "open",
						},
						reconciliationMap.get(`local:customer:${guardian.id}:status_mismatch`),
					);
					if (created) {
						createdReconciliationItems += 1;
					}
				}

				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "customer",
					entityId: guardian.id,
					qbEntityId: customer.Id,
					direction: "pull",
					status: "success",
					errorMessage: null,
					syncedAt: now,
				});
			} catch (error) {
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "customer",
					entityId: guardian.id,
					qbEntityId: link.qbEntityId,
					direction: "pull",
					status: "failed",
					errorMessage: error instanceof Error ? error.message : "QuickBooks sync failed",
					syncedAt: now,
				});
			}
		}

		try {
			const remoteCustomersResponse = await queryQuickBooksCustomers(db, activeConnection, config);
			activeConnection = remoteCustomersResponse.connection;
			for (const remoteCustomer of remoteCustomersResponse.customers) {
				if (linkedCustomerIds.has(remoteCustomer.Id)) continue;
				const issueType: QuickBooksIssueType = "missing_link";
				const created = await upsertQuickBooksReconciliationItem(
					db,
					centerId,
					activeConnection.id,
					{
						origin: "quickbooks",
						entityType: "customer",
						entityId: remoteCustomer.Id,
						qbEntityType: "customer",
						qbEntityId: remoteCustomer.Id,
						issueType,
						title: "QuickBooks customer needs a PebbleDesk guardian",
						description:
							"Match this QuickBooks customer to a local PebbleDesk guardian before applying imported contact changes.",
						proposedChanges: {
							firstName: normalizeText(remoteCustomer.GivenName),
							lastName: normalizeText(remoteCustomer.FamilyName),
							email: normalizeText(remoteCustomer.PrimaryEmailAddr?.Address),
							phone: normalizeText(remoteCustomer.PrimaryPhone?.FreeFormNumber),
						},
						status: "open",
					},
					reconciliationMap.get(`quickbooks:customer:${remoteCustomer.Id}:${issueType}`),
				);
				if (created) {
					createdReconciliationItems += 1;
				}
			}
		} catch (error) {
			syncLogRows.push({
				centerId,
				connectionId: activeConnection.id,
				entityType: "customer",
				entityId: "__quickbooks_customers__",
				qbEntityId: null,
				direction: "pull",
				status: "failed",
				errorMessage: error instanceof Error ? error.message : "QuickBooks sync failed",
				syncedAt: now,
			});
		}

		for (const link of activeLinkRows.filter((item) => item.entityType === "invoice")) {
			const invoice = invoiceMap.get(link.entityId);
			if (!invoice) continue;
			try {
				const localLineItems = await listInvoiceLineItems(db, centerId, invoice.id);
				const invoiceResponse = await quickBooksApiRequest<{ Invoice?: QuickBooksInvoice }>(
					db,
					activeConnection,
					config,
					`/invoice/${link.qbEntityId}`,
				);
				activeConnection = invoiceResponse.connection;
				const remoteInvoice = extractInvoice(invoiceResponse.payload);
				const proposedChanges = buildInvoiceProposedChanges(invoice, localLineItems, remoteInvoice);
				if (Object.keys(proposedChanges).length > 0) {
					const issueType: QuickBooksIssueType =
						"lineItems" in proposedChanges || "amountDue" in proposedChanges
							? "amount_mismatch"
							: "status_mismatch";
					const created = await upsertQuickBooksReconciliationItem(
						db,
						centerId,
						activeConnection.id,
						{
							origin: "local",
							entityType: "invoice",
							entityId: invoice.id,
							qbEntityType: "invoice",
							qbEntityId: remoteInvoice.Id,
							issueType,
							title: "Invoice changed in QuickBooks",
							description: "Invoice fields differ from PebbleDesk.",
							proposedChanges,
							status: "open",
						},
						reconciliationMap.get(`local:invoice:${invoice.id}:${issueType}`),
					);
					if (created) createdReconciliationItems += 1;
				}
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "invoice",
					entityId: invoice.id,
					qbEntityId: remoteInvoice.Id,
					direction: "pull",
					status: "success",
					errorMessage: null,
					syncedAt: now,
				});
			} catch (error) {
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "invoice",
					entityId: link.entityId,
					qbEntityId: link.qbEntityId,
					direction: "pull",
					status: "failed",
					errorMessage: error instanceof Error ? error.message : "QuickBooks sync failed",
					syncedAt: now,
				});
			}
		}

		for (const link of activeLinkRows.filter((item) => item.entityType === "payment")) {
			const payment = paymentMap.get(link.entityId);
			if (!payment) continue;
			try {
				const paymentResponse = await quickBooksApiRequest<{ Payment?: QuickBooksPayment }>(
					db,
					activeConnection,
					config,
					`/payment/${link.qbEntityId}`,
				);
				activeConnection = paymentResponse.connection;
				const remotePayment = extractPayment(paymentResponse.payload);
				const proposedChanges = buildPaymentProposedChanges(payment, remotePayment);
				if (Object.keys(proposedChanges).length > 0) {
					const issueType: QuickBooksIssueType =
						"amount" in proposedChanges ? "amount_mismatch" : "status_mismatch";
					const created = await upsertQuickBooksReconciliationItem(
						db,
						centerId,
						activeConnection.id,
						{
							origin: "local",
							entityType: "payment",
							entityId: payment.id,
							qbEntityType: "payment",
							qbEntityId: remotePayment.Id,
							issueType,
							title: "Payment changed in QuickBooks",
							description: "Payment fields differ from PebbleDesk.",
							proposedChanges,
							status: "open",
						},
						reconciliationMap.get(`local:payment:${payment.id}:${issueType}`),
					);
					if (created) createdReconciliationItems += 1;
				}
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "payment",
					entityId: payment.id,
					qbEntityId: remotePayment.Id,
					direction: "pull",
					status: "success",
					errorMessage: null,
					syncedAt: now,
				});
			} catch (error) {
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "payment",
					entityId: link.entityId,
					qbEntityId: link.qbEntityId,
					direction: "pull",
					status: "failed",
					errorMessage: error instanceof Error ? error.message : "QuickBooks sync failed",
					syncedAt: now,
				});
			}
		}

		const linkedInvoiceIds = new Set(
			activeLinkRows.filter((item) => item.entityType === "invoice").map((item) => item.qbEntityId),
		);
		const linkedPaymentIds = new Set(
			activeLinkRows.filter((item) => item.entityType === "payment").map((item) => item.qbEntityId),
		);
		for (const customerLink of activeLinkRows.filter((item) => item.entityType === "customer")) {
			try {
				const remoteInvoices = await queryQuickBooksInvoicesByCustomer(
					db,
					activeConnection,
					config,
					customerLink.qbEntityId,
				);
				activeConnection = remoteInvoices.connection;
				for (const remoteInvoice of remoteInvoices.invoices) {
					if (linkedInvoiceIds.has(remoteInvoice.Id)) continue;
					const proposedChanges = {
						...normalizeQuickBooksInvoiceLineItems(remoteInvoice),
						status: quickBooksInvoiceStatus(remoteInvoice),
						dueDate: normalizeText(remoteInvoice.DueDate),
						paidAt:
							quickBooksInvoiceStatus(remoteInvoice) === "paid"
								? requiredIso(remoteInvoice.TxnDate)
								: null,
					};
					const issueType: QuickBooksIssueType = "missing_link";
					const created = await upsertQuickBooksReconciliationItem(
						db,
						centerId,
						activeConnection.id,
						{
							origin: "quickbooks",
							entityType: "invoice",
							entityId: remoteInvoice.Id,
							qbEntityType: "invoice",
							qbEntityId: remoteInvoice.Id,
							issueType,
							title: "QuickBooks invoice needs a PebbleDesk match",
							description:
								"Match this QuickBooks invoice to a local PebbleDesk invoice before applying it.",
							proposedChanges,
							status: "open",
						},
						reconciliationMap.get(`quickbooks:invoice:${remoteInvoice.Id}:${issueType}`),
					);
					if (created) createdReconciliationItems += 1;
				}

				const remotePayments = await queryQuickBooksPaymentsByCustomer(
					db,
					activeConnection,
					config,
					customerLink.qbEntityId,
				);
				activeConnection = remotePayments.connection;
				for (const remotePayment of remotePayments.payments) {
					if (linkedPaymentIds.has(remotePayment.Id)) continue;
					const linkedInvoiceTxn = (remotePayment.Line ?? [])
						.flatMap((line) => line.LinkedTxn ?? [])
						.find((linkedTxn) => linkedTxn.TxnType === "Invoice");
					const issueType: QuickBooksIssueType = "missing_link";
					const created = await upsertQuickBooksReconciliationItem(
						db,
						centerId,
						activeConnection.id,
						{
							origin: "quickbooks",
							entityType: "payment",
							entityId: remotePayment.Id,
							qbEntityType: "payment",
							qbEntityId: remotePayment.Id,
							issueType,
							title: "QuickBooks payment needs a PebbleDesk invoice",
							description: "Match this payment to a local invoice before applying it.",
							proposedChanges: {
								amount: roundCurrency(remotePayment.TotalAmt ?? 0),
								method: "other",
								paidAt: normalizeText(remotePayment.TxnDate)
									? new Date(remotePayment.TxnDate as string).toISOString()
									: now.toISOString(),
								reference: normalizeText(remotePayment.PaymentRefNum ?? remotePayment.PrivateNote),
								qbInvoiceId: linkedInvoiceTxn?.TxnId ?? null,
								status: quickBooksPaymentStatus(remotePayment),
							},
							status: "open",
						},
						reconciliationMap.get(`quickbooks:payment:${remotePayment.Id}:${issueType}`),
					);
					if (created) createdReconciliationItems += 1;
				}
			} catch (error) {
				syncLogRows.push({
					centerId,
					connectionId: activeConnection.id,
					entityType: "customer",
					entityId: customerLink.entityId,
					qbEntityId: customerLink.qbEntityId,
					direction: "pull",
					status: "failed",
					errorMessage: error instanceof Error ? error.message : "QuickBooks sync failed",
					syncedAt: now,
				});
			}
		}
	}

	if (syncLogRows.length > 0) {
		await db.insert(quickbooksSyncLog).values(syncLogRows);
	}

	const [updatedConnection] = (await db
		.update(quickbooksConnections)
		.set({
			lastSyncAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(quickbooksConnections.id, activeConnection.id),
				eq(quickbooksConnections.centerId, centerId),
			),
		)
		.returning()) as QuickBooksConnectionRecord[];

	return {
		action: syncAction,
		scannedEntities:
			syncAction === "import"
				? Array.from(linkMap.values()).length +
					Array.from(linkMap.values()).filter((item) => item.entityType === "customer").length * 2
				: syncAction === "full"
					? guardianRows.length +
						nonCustomerTargets.length +
						Array.from(linkMap.values()).length +
						Array.from(linkMap.values()).filter((item) => item.entityType === "customer").length * 2
					: guardianRows.length + nonCustomerTargets.length,
		createdSyncLogs: syncLogRows.length,
		createdReconciliationItems,
		connection: updatedConnection
			? serializeConnection(updatedConnection)
			: serializeConnection(activeConnection),
	} satisfies QuickBooksSyncResult & { action: QuickBooksSyncAction };
}

export async function approveQuickBooksReconciliation(
	db: DbClient,
	centerId: string,
	membershipId: string,
	itemId: string,
	input: QuickBooksReviewReconciliationInput,
) {
	return withOptionalTransaction(db, async (tx) => {
		const [item] = (await tx
			.select()
			.from(quickbooksReconciliationItems)
			.where(
				and(
					eq(quickbooksReconciliationItems.id, itemId),
					eq(quickbooksReconciliationItems.centerId, centerId),
				),
			)
			.limit(1)) as QuickBooksReconciliationItemRecord[];
		if (!item) {
			notFound("QuickBooks reconciliation item not found");
		}

		const now = new Date();
		const itemOrigin = item.origin ?? "local";
		const localTargetId = input.localTargetId;
		const qbEntityType = input.qbEntityType ?? item.qbEntityType ?? item.entityType;
		if (qbEntityType !== item.entityType) {
			badRequest("QuickBooks entity type does not match the reconciliation item");
		}
		let localEntityId = item.entityId;
		let resolvedExistingLink: QuickBooksEntityLinkRecord | undefined;
		let reconciliationTarget: Pick<
			QuickBooksReconciliationItemRecord,
			"centerId" | "entityType" | "entityId" | "proposedChanges"
		> = item;
		if (itemOrigin === "quickbooks" && item.entityType === "customer") {
			if (!localTargetId) {
				badRequest("A local target id is required for QuickBooks-origin customer approvals");
			}
			await assertQuickBooksLocalTargetBelongsToCenter(
				tx,
				centerId,
				item.entityType,
				localTargetId,
			);
			localEntityId = localTargetId;
			reconciliationTarget = {
				centerId,
				entityType: item.entityType,
				entityId: localTargetId,
				proposedChanges: item.proposedChanges,
			};
		}
		if (itemOrigin === "quickbooks" && item.entityType === "invoice") {
			if (!localTargetId) {
				badRequest("A local target id is required for QuickBooks-origin invoice approvals");
			}
			await assertQuickBooksLocalTargetBelongsToCenter(
				tx,
				centerId,
				item.entityType,
				localTargetId,
			);
			localEntityId = localTargetId;
			reconciliationTarget = {
				centerId,
				entityType: item.entityType,
				entityId: localTargetId,
				proposedChanges: item.proposedChanges,
			};
		}
		if (itemOrigin === "quickbooks" && item.entityType === "payment") {
			const remotePaymentId = item.qbEntityId ?? item.entityId;
			const [existingRemotePaymentLink] = (await tx
				.select()
				.from(quickbooksEntityLinks)
				.where(
					and(
						eq(quickbooksEntityLinks.centerId, centerId),
						eq(quickbooksEntityLinks.entityType, "payment"),
						eq(quickbooksEntityLinks.qbEntityId, remotePaymentId),
					),
				)
				.limit(1)) as QuickBooksEntityLinkRecord[];
			if (existingRemotePaymentLink) {
				resolvedExistingLink = existingRemotePaymentLink;
				localEntityId = existingRemotePaymentLink.entityId;
			} else {
				if (!localTargetId) {
					badRequest("A local target id is required for QuickBooks-origin payment approvals");
				}
				await assertQuickBooksLocalTargetBelongsToCenter(
					tx,
					centerId,
					item.entityType,
					localTargetId,
				);
				const proposedQuickBooksInvoiceId =
					typeof item.proposedChanges?.qbInvoiceId === "string"
						? item.proposedChanges.qbInvoiceId
						: null;
				if (proposedQuickBooksInvoiceId) {
					const [matchedInvoiceLink] = (await tx
						.select()
						.from(quickbooksEntityLinks)
						.where(
							and(
								eq(quickbooksEntityLinks.centerId, centerId),
								eq(quickbooksEntityLinks.entityType, "invoice"),
								eq(quickbooksEntityLinks.entityId, localTargetId),
							),
						)
						.limit(1)) as QuickBooksEntityLinkRecord[];
					if (
						!matchedInvoiceLink ||
						matchedInvoiceLink.qbEntityId !== proposedQuickBooksInvoiceId
					) {
						badRequest("Selected invoice does not match the QuickBooks payment target");
					}
				}
				const createdPayment = await createLocalQuickBooksPayment(
					tx,
					centerId,
					item,
					localTargetId,
					now,
				);
				localEntityId = createdPayment.id;
			}
		}
		const existingLink =
			resolvedExistingLink ??
			(
				(await tx
					.select()
					.from(quickbooksEntityLinks)
					.where(
						and(
							eq(quickbooksEntityLinks.centerId, centerId),
							eq(quickbooksEntityLinks.entityType, item.entityType),
							eq(quickbooksEntityLinks.entityId, localEntityId),
						),
					)
					.limit(1)) as QuickBooksEntityLinkRecord[]
			)[0];
		const qbEntityId = input.qbEntityId ?? item.qbEntityId ?? item.entityId;
		const [link] = existingLink
			? ((await tx
					.update(quickbooksEntityLinks)
					.set({
						qbEntityType,
						qbEntityId,
						syncStatus: "success",
						lastSyncedAt: now,
						updatedAt: now,
					})
					.where(
						and(
							eq(quickbooksEntityLinks.id, existingLink.id),
							eq(quickbooksEntityLinks.centerId, centerId),
							eq(quickbooksEntityLinks.connectionId, item.connectionId),
							eq(quickbooksEntityLinks.entityId, localEntityId),
						),
					)
					.returning()) as QuickBooksEntityLinkRecord[])
			: ((await tx
					.insert(quickbooksEntityLinks)
					.values({
						centerId,
						connectionId: item.connectionId,
						entityType: item.entityType,
						entityId: localEntityId,
						qbEntityType,
						qbEntityId,
						syncStatus: "success",
						lastSyncedAt: now,
						createdAt: now,
						updatedAt: now,
					})
					.returning()) as QuickBooksEntityLinkRecord[]);

		if (itemOrigin === "local" || (itemOrigin === "quickbooks" && item.entityType !== "payment")) {
			await applyReconciliationChanges(tx, reconciliationTarget);
		}

		const [updatedItem] = (await tx
			.update(quickbooksReconciliationItems)
			.set({
				origin: itemOrigin,
				qbEntityType,
				qbEntityId,
				status: "approved",
				reviewedByMembershipId: membershipId,
				reviewedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(quickbooksReconciliationItems.id, itemId),
					eq(quickbooksReconciliationItems.centerId, centerId),
				),
			)
			.returning()) as QuickBooksReconciliationItemRecord[];

		await tx.insert(quickbooksSyncLog).values({
			centerId,
			connectionId: item.connectionId,
			entityType: item.entityType,
			entityId: localEntityId,
			qbEntityId,
			direction: itemOrigin === "quickbooks" ? "pull" : "push",
			status: "success",
			syncedAt: now,
		});

		const [updatedConnection] = (await tx
			.update(quickbooksConnections)
			.set({
				lastSyncAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(quickbooksConnections.id, item.connectionId),
					eq(quickbooksConnections.centerId, centerId),
				),
			)
			.returning()) as QuickBooksConnectionRecord[];

		return {
			item: updatedItem
				? serializeReconciliationItem(updatedItem)
				: serializeReconciliationItem({
						...item,
						origin: itemOrigin,
						qbEntityType,
						qbEntityId,
						status: "approved",
						reviewedByMembershipId: membershipId,
						reviewedAt: now,
						updatedAt: now,
					}),
			link: serializeEntityLink(link),
			connection: updatedConnection ? serializeConnection(updatedConnection) : undefined,
		};
	});
}

export async function dismissQuickBooksReconciliation(
	db: DbClient,
	centerId: string,
	membershipId: string,
	itemId: string,
) {
	const [item] = (await db
		.select()
		.from(quickbooksReconciliationItems)
		.where(
			and(
				eq(quickbooksReconciliationItems.id, itemId),
				eq(quickbooksReconciliationItems.centerId, centerId),
			),
		)
		.limit(1)) as QuickBooksReconciliationItemRecord[];
	if (!item) {
		notFound("QuickBooks reconciliation item not found");
	}

	const now = new Date();
	const [updatedItem] = (await db
		.update(quickbooksReconciliationItems)
		.set({
			status: "dismissed",
			reviewedByMembershipId: membershipId,
			reviewedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(quickbooksReconciliationItems.id, itemId),
				eq(quickbooksReconciliationItems.centerId, centerId),
			),
		)
		.returning()) as QuickBooksReconciliationItemRecord[];

	return updatedItem
		? serializeReconciliationItem(updatedItem)
		: serializeReconciliationItem({
				...item,
				status: "dismissed",
				reviewedByMembershipId: membershipId,
				reviewedAt: now,
				updatedAt: now,
			});
}
