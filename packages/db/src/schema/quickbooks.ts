import {
	foreignKey,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { memberships } from "./memberships.js";

export const qbEntityTypeEnum = pgEnum("qb_entity_type", ["customer", "invoice", "payment"]);

export const qbConnectionStatusEnum = pgEnum("qb_connection_status", ["connected", "disconnected"]);

export const qbSyncDirectionEnum = pgEnum("qb_sync_direction", ["push", "pull"]);

export const qbSyncStatusEnum = pgEnum("qb_sync_status", [
	"pending",
	"success",
	"failed",
	"skipped",
]);

export const qbReconciliationStatusEnum = pgEnum("qb_reconciliation_status", [
	"open",
	"approved",
	"dismissed",
]);

export const qbReconciliationOriginEnum = pgEnum("qb_reconciliation_origin", [
	"local",
	"quickbooks",
]);

export const qbReconciliationIssueTypeEnum = pgEnum("qb_reconciliation_issue_type", [
	"missing_link",
	"orphaned_link",
	"amount_mismatch",
	"status_mismatch",
	"duplicate",
]);

export const quickbooksConnections = pgTable(
	"quickbooks_connections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		realmId: text("realm_id").notNull(),
		companyName: text("company_name"),
		scopes: jsonb("scopes").$type<string[] | null>(),
		accessToken: text("access_token").notNull(),
		refreshToken: text("refresh_token").notNull(),
		tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
		syncDirection: qbSyncDirectionEnum("sync_direction").notNull().default("pull"),
		status: qbConnectionStatusEnum("status").notNull().default("connected"),
		connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
		disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
		lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique("quickbooks_connections_id_center_unique").on(table.id, table.centerId),
		uniqueIndex("quickbooks_connections_center_id_unique").on(table.centerId),
	],
);

export const quickbooksEntityLinks = pgTable(
	"quickbooks_entity_links",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		connectionId: uuid("connection_id")
			.notNull()
			.references(() => quickbooksConnections.id, { onDelete: "cascade" }),
		entityType: qbEntityTypeEnum("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		qbEntityType: qbEntityTypeEnum("qb_entity_type").notNull(),
		qbEntityId: text("qb_entity_id").notNull(),
		syncStatus: qbSyncStatusEnum("sync_status").notNull(),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("quickbooks_entity_links_entity_unique").on(
			table.centerId,
			table.entityType,
			table.entityId,
		),
		uniqueIndex("quickbooks_entity_links_qb_unique").on(
			table.centerId,
			table.qbEntityType,
			table.qbEntityId,
		),
		foreignKey({
			name: "quickbooks_entity_links_connection_center_fk",
			columns: [table.connectionId, table.centerId],
			foreignColumns: [quickbooksConnections.id, quickbooksConnections.centerId],
		}).onDelete("cascade"),
	],
);

export const quickbooksSyncLog = pgTable(
	"quickbooks_sync_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		connectionId: uuid("connection_id")
			.notNull()
			.references(() => quickbooksConnections.id, { onDelete: "cascade" }),
		entityType: qbEntityTypeEnum("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		qbEntityId: text("qb_entity_id"),
		direction: qbSyncDirectionEnum("direction").notNull(),
		status: qbSyncStatusEnum("status").notNull(),
		errorMessage: text("error_message"),
		syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			name: "quickbooks_sync_log_connection_center_fk",
			columns: [table.connectionId, table.centerId],
			foreignColumns: [quickbooksConnections.id, quickbooksConnections.centerId],
		}).onDelete("cascade"),
	],
);

export const quickbooksReconciliationItems = pgTable(
	"quickbooks_reconciliation_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		connectionId: uuid("connection_id")
			.notNull()
			.references(() => quickbooksConnections.id, { onDelete: "cascade" }),
		origin: qbReconciliationOriginEnum("origin").notNull().default("local"),
		entityType: qbEntityTypeEnum("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		qbEntityType: qbEntityTypeEnum("qb_entity_type"),
		qbEntityId: text("qb_entity_id"),
		issueType: qbReconciliationIssueTypeEnum("issue_type").notNull(),
		title: text("title").notNull(),
		description: text("description").notNull(),
		proposedChanges: jsonb("proposed_changes").$type<Record<string, unknown> | null>(),
		status: qbReconciliationStatusEnum("status").notNull().default("open"),
		reviewedByMembershipId: uuid("reviewed_by_membership_id").references(() => memberships.id, {
			onDelete: "set null",
		}),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("quickbooks_reconciliation_items_entity_issue_unique").on(
			table.centerId,
			table.origin,
			table.entityType,
			table.entityId,
			table.issueType,
		),
		foreignKey({
			name: "quickbooks_reconciliation_items_connection_center_fk",
			columns: [table.connectionId, table.centerId],
			foreignColumns: [quickbooksConnections.id, quickbooksConnections.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "quickbooks_reconciliation_items_reviewed_by_center_fk",
			columns: [table.reviewedByMembershipId, table.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}),
	],
);
