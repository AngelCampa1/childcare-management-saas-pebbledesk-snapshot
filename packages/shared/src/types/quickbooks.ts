import type {
	QbConnectionStatus,
	QbEntityType,
	QbReconciliationItemType,
	QbReconciliationOrigin,
	QbReconciliationStatus,
	QbSyncDirection,
	QbSyncStatus,
} from "../constants/enums.js";

export interface QuickBooksReviewReconciliationInput {
	qbEntityId?: string;
	qbEntityType?: QbEntityType;
	localTargetId?: string;
}

export interface QuickBooksConnectionSummary {
	id: string;
	centerId: string;
	realmId: string;
	companyName?: string;
	scopes?: string[];
	status: QbConnectionStatus;
	syncDirection: QbSyncDirection;
	tokenExpiresAt: string;
	connectedAt: string;
	disconnectedAt?: string;
	lastSyncAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface QuickBooksConnection extends QuickBooksConnectionSummary {}

export interface QuickBooksSyncLog {
	id: string;
	centerId: string;
	connectionId: string;
	entityType: QbEntityType;
	entityId: string;
	qbEntityId?: string;
	status: QbSyncStatus;
	errorMessage?: string;
	direction: QbSyncDirection;
	syncedAt: string;
	createdAt: string;
}

export interface QuickBooksEntityLink {
	id: string;
	centerId: string;
	connectionId: string;
	entityType: QbEntityType;
	entityId: string;
	qbEntityType: QbEntityType;
	qbEntityId: string;
	syncStatus: QbSyncStatus;
	lastSyncedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface QuickBooksReconciliationItem {
	id: string;
	centerId: string;
	connectionId: string;
	origin: QbReconciliationOrigin;
	entityType: QbEntityType;
	entityId: string;
	qbEntityType?: QbEntityType;
	qbEntityId?: string;
	issueType: QbReconciliationItemType;
	title: string;
	description: string;
	proposedChanges?: Record<string, unknown>;
	status: QbReconciliationStatus;
	reviewedByMembershipId?: string;
	reviewedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface QuickBooksStatusSnapshot {
	status: QbConnectionStatus;
	connection: QuickBooksConnectionSummary | null;
	openReconciliationCount: number;
	lastSync: QuickBooksSyncLog | null;
	isConfigured: boolean;
	configurationIssue: string | null;
}

export interface QuickBooksSyncHistoryResponse {
	items: QuickBooksSyncLog[];
}

export interface QuickBooksReconciliationResponse {
	items: QuickBooksReconciliationItem[];
}

export type QuickBooksSyncResult = {
	scannedEntities: number;
	createdSyncLogs: number;
	createdReconciliationItems: number;
	connection: QuickBooksConnectionSummary;
};

export type QuickBooksConnectStartResponse = {
	url: string;
};

export type QuickBooksDisconnectResponse = {
	disconnected: true;
	connection?: QuickBooksConnectionSummary;
};

export type QuickBooksReviewReconciliationResponse = {
	item: QuickBooksReconciliationItem;
	link?: QuickBooksEntityLink | null;
	connection?: QuickBooksConnectionSummary;
};
