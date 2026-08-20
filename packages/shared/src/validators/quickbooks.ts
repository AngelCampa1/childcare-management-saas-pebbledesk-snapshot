import { z } from "zod";
import {
	QB_CONNECTION_STATUSES,
	QB_ENTITY_TYPES,
	QB_RECONCILIATION_ITEM_TYPES,
	QB_RECONCILIATION_ORIGINS,
	QB_RECONCILIATION_STATUSES,
	QB_SYNC_DIRECTIONS,
	QB_SYNC_STATUSES,
	QUICKBOOKS_SYNC_ACTIONS,
} from "../constants/enums.js";
import { uuidLikeSchema } from "./id.js";

export const quickbooksReviewReconciliationSchema = z
	.object({
		qbEntityId: z.string().min(1).max(255).optional(),
		qbEntityType: z.enum(QB_ENTITY_TYPES).optional(),
		localTargetId: uuidLikeSchema.optional(),
	})
	.strict()
	.refine((value) => Boolean(value.qbEntityId || value.localTargetId), {
		message: "Either a QuickBooks entity id or a local target id is required",
	});

export const quickbooksSyncActionSchema = z.enum(QUICKBOOKS_SYNC_ACTIONS);

export const quickBooksSyncActionSchema = quickbooksSyncActionSchema;

/**
 * Response shapes for QuickBooks query/mutation endpoints. All schemas use
 * `passthrough()` so unknown fields from the API are preserved — only fields
 * the web app reads are validated.
 */
const quickBooksConnectionSummarySchema = z
	.object({
		id: z.string(),
		centerId: z.string(),
		realmId: z.string(),
		status: z.enum(QB_CONNECTION_STATUSES),
		syncDirection: z.enum(QB_SYNC_DIRECTIONS),
		tokenExpiresAt: z.string(),
		connectedAt: z.string(),
		createdAt: z.string(),
		updatedAt: z.string(),
	})
	.passthrough();

const quickBooksSyncLogSchema = z
	.object({
		id: z.string(),
		centerId: z.string(),
		connectionId: z.string(),
		entityType: z.enum(QB_ENTITY_TYPES),
		entityId: z.string(),
		status: z.enum(QB_SYNC_STATUSES),
		direction: z.enum(QB_SYNC_DIRECTIONS),
		syncedAt: z.string(),
		createdAt: z.string(),
	})
	.passthrough();

const quickBooksReconciliationItemListSchema = z
	.object({
		id: z.string(),
		centerId: z.string(),
		connectionId: z.string(),
		origin: z.enum(QB_RECONCILIATION_ORIGINS),
		entityType: z.enum(QB_ENTITY_TYPES),
		entityId: z.string(),
		issueType: z.enum(QB_RECONCILIATION_ITEM_TYPES),
		title: z.string(),
		description: z.string(),
		status: z.enum(QB_RECONCILIATION_STATUSES),
		createdAt: z.string(),
		updatedAt: z.string(),
	})
	.passthrough();

export const quickBooksStatusSchema = z
	.object({
		status: z.enum(QB_CONNECTION_STATUSES),
		connection: quickBooksConnectionSummarySchema.nullable(),
		openReconciliationCount: z.number().int().nonnegative(),
		lastSync: quickBooksSyncLogSchema.nullable(),
		isConfigured: z.boolean(),
		configurationIssue: z.string().nullable(),
	})
	.passthrough();

export const quickBooksHistoryResponseSchema = z
	.object({
		history: z.array(quickBooksSyncLogSchema),
	})
	.passthrough();

export const quickBooksReconciliationResponseSchema = z
	.object({
		items: z.array(quickBooksReconciliationItemListSchema),
	})
	.passthrough();

export const quickBooksSyncResultSchema = z
	.object({
		scannedEntities: z.number().int().nonnegative(),
		createdSyncLogs: z.number().int().nonnegative(),
		createdReconciliationItems: z.number().int().nonnegative(),
		connection: quickBooksConnectionSummarySchema,
	})
	.passthrough();

export const quickBooksSyncResponseSchema = z
	.object({
		sync: quickBooksSyncResultSchema,
	})
	.passthrough();

export const quickBooksConnectStartResponseSchema = z
	.object({
		url: z.string(),
	})
	.passthrough();

export const quickBooksDisconnectResponseSchema = z
	.object({
		disconnected: z.literal(true),
		connection: quickBooksConnectionSummarySchema.optional(),
	})
	.passthrough();

export const quickBooksReviewReconciliationResponseSchema = z
	.object({
		item: quickBooksReconciliationItemListSchema,
		link: z.unknown().optional(),
		connection: quickBooksConnectionSummarySchema.optional(),
	})
	.passthrough();
