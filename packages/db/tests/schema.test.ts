import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	centers,
	childGuardians,
	invoices,
	invoiceTemplateLineItems,
	invoiceTemplates,
	leadMagnetDownloads,
	leads,
	messageRecipients,
	messages,
	messageTypeEnum,
	payments,
	qbConnectionStatusEnum,
	qbEntityTypeEnum,
	qbReconciliationIssueTypeEnum,
	qbReconciliationStatusEnum,
	qbSyncDirectionEnum,
	qbSyncStatusEnum,
	quickbooksConnections,
	quickbooksEntityLinks,
	quickbooksReconciliationItems,
	quickbooksSyncLog,
	schedules,
	shifts,
	subscriptionNotificationKindEnum,
	subscriptionNotificationStatusEnum,
	subscriptionNotifications,
	subscriptionPlanEnum,
	subscriptionStatusEnum,
	timeEntries,
	timeEntryStatusEnum,
	webhookEvents,
} from "../src/schema/index.js";
import {
	leadMagnetDownloads as directLeadMagnetDownloads,
	leads as directLeads,
} from "../src/schema/marketing.js";
import {
	messageRecipients as directMessageRecipients,
	messages as directMessages,
	messageTypeEnum as directMessageTypeEnum,
} from "../src/schema/messaging.js";
import {
	quickbooksConnections as directQuickbooksConnections,
	quickbooksEntityLinks as directQuickbooksEntityLinks,
	quickbooksReconciliationItems as directQuickbooksReconciliationItems,
	quickbooksSyncLog as directQuickbooksSyncLog,
} from "../src/schema/quickbooks.js";
import {
	schedules as directSchedules,
	shifts as directShifts,
	timeEntries as directTimeEntries,
	timeEntryStatusEnum as directTimeEntryStatusEnum,
} from "../src/schema/scheduling.js";
import {
	subscriptionNotificationKindEnum as directSubscriptionNotificationKindEnum,
	subscriptionNotificationStatusEnum as directSubscriptionNotificationStatusEnum,
	subscriptionNotifications as directSubscriptionNotifications,
} from "../src/schema/subscription-notifications.js";

function getForeignKeyShape(table: Parameters<typeof getTableConfig>[0]) {
	return getTableConfig(table).foreignKeys.map((foreignKey) => {
		const reference = foreignKey.reference();
		return {
			columns: reference.columns.map((column) => column.name),
			foreignColumns: reference.foreignColumns.map((column) => column.name),
			onDelete: foreignKey.onDelete,
		};
	});
}

describe("centers schema", () => {
	it("stores licensed capacity as a numeric integer", () => {
		expect(centers.licensedCapacity.name).toBe("licensed_capacity");
		expect(centers.licensedCapacity.dataType).toBe("number");
		expect(centers.licensedCapacity.columnType).toBe("PgInteger");
	});

	it("includes stripe account metadata", () => {
		expect(centers.stripeAccountId.name).toBe("stripe_account_id");
		expect(centers.stripeAccountStatus.name).toBe("stripe_account_status");
		expect(centers.stripeAccountLinkedAt.name).toBe("stripe_account_linked_at");
		expect(centers.stripeAccountDisabledReason.name).toBe("stripe_account_disabled_reason");
	});

	it("includes platform subscription billing fields", () => {
		expect(centers.stripeCustomerId.name).toBe("stripe_customer_id");
		expect(centers.stripeSubscriptionId.name).toBe("stripe_subscription_id");
		expect(centers.subscriptionStatus.name).toBe("subscription_status");
		expect(centers.subscriptionStatus.default).toBe("none");
		expect(centers.subscriptionPlan.name).toBe("subscription_plan");
		expect(centers.trialEndsAt.name).toBe("trial_ends_at");
		expect(centers.currentPeriodEnd.name).toBe("current_period_end");
	});

	it("uses the subscription enums", () => {
		expect(subscriptionStatusEnum.enumValues).toEqual([
			"none",
			"trialing",
			"active",
			"past_due",
			"canceled",
			"unpaid",
			"incomplete",
			"incomplete_expired",
		]);
		expect(subscriptionPlanEnum.enumValues).toEqual([
			"trial",
			"home",
			"center_starter",
			"center_pro",
			"group",
			"enterprise",
		]);
	});
});

describe("webhook events schema", () => {
	it("uses the Stripe event id as the primary key with a default processed_at timestamp", () => {
		expect(webhookEvents.id.name).toBe("id");
		expect(webhookEvents.id.primary).toBe(true);
		expect(webhookEvents.processedAt.name).toBe("processed_at");
		expect(webhookEvents.processedAt.notNull).toBe(true);
	});
});

describe("invoices schema", () => {
	it("includes public-link versioning fields", () => {
		expect(invoices.centerId.name).toBe("center_id");
		expect(invoices.guardianId.name).toBe("guardian_id");
		expect(invoices.periodStart.name).toBe("period_start");
		expect(invoices.periodEnd.name).toBe("period_end");
		expect(invoices.subtotal.name).toBe("subtotal");
		expect(invoices.subsidyCredit.name).toBe("subsidy_credit");
		expect(invoices.amountDue.name).toBe("amount_due");
		expect(invoices.status.name).toBe("status");
		expect(invoices.dueDate.name).toBe("due_date");
		expect(invoices.paidAt.name).toBe("paid_at");
		expect(invoices.publicLinkToken.name).toBe("public_link_token");
		expect(invoices.publicLinkVersion.name).toBe("public_link_version");
		expect(invoices.publicLinkRotatedAt.name).toBe("public_link_rotated_at");
		expect(invoices.createdAt.name).toBe("created_at");
		expect(invoices.updatedAt.name).toBe("updated_at");
	});

	it("does not cascade-delete invoices when a guardian is deleted", () => {
		const guardianForeignKeys = getForeignKeyShape(invoices).filter((foreignKey) =>
			foreignKey.columns.includes("guardian_id"),
		);

		expect(guardianForeignKeys.length).toBeGreaterThan(0);
		expect(guardianForeignKeys.every((foreignKey) => foreignKey.onDelete !== "cascade")).toBe(true);
	});
});

describe("child guardians schema", () => {
	it("carries center_id for tenant-scoped child/guardian links", () => {
		expect(childGuardians.centerId.name).toBe("center_id");
		expect(childGuardians.centerId.notNull).toBe(true);
	});
});

describe("invoice template schema", () => {
	it("includes template tables and line items", () => {
		expect(invoiceTemplates.id.name).toBe("id");
		expect(invoiceTemplates.centerId.name).toBe("center_id");
		expect(invoiceTemplates.name.name).toBe("name");
		expect(invoiceTemplates.description.name).toBe("description");
		expect(invoiceTemplates.dueDays.name).toBe("due_days");
		expect(invoiceTemplates.isDefault.name).toBe("is_default");
		expect(invoiceTemplates.createdAt.name).toBe("created_at");
		expect(invoiceTemplates.updatedAt.name).toBe("updated_at");
		expect(invoiceTemplateLineItems.id.name).toBe("id");
		expect(invoiceTemplateLineItems.invoiceTemplateId.name).toBe("invoice_template_id");
		expect(invoiceTemplateLineItems.description.name).toBe("description");
		expect(invoiceTemplateLineItems.quantity.name).toBe("quantity");
		expect(invoiceTemplateLineItems.unitPrice.name).toBe("unit_price");
		expect(invoiceTemplateLineItems.amount.name).toBe("amount");
		expect(invoiceTemplateLineItems.sortOrder.name).toBe("sort_order");
	});
});

describe("payments schema", () => {
	it("includes payment provider reference fields", () => {
		expect(payments.centerId.name).toBe("center_id");
		expect(payments.invoiceId.name).toBe("invoice_id");
		expect(payments.amount.name).toBe("amount");
		expect(payments.method.name).toBe("method");
		expect(payments.provider.name).toBe("provider");
		expect(payments.status.name).toBe("status");
		expect(payments.providerReferenceId.name).toBe("provider_reference_id");
		expect(payments.providerTransactionId.name).toBe("provider_transaction_id");
		expect(payments.reference.name).toBe("reference");
		expect(payments.paidAt.name).toBe("paid_at");
		expect(payments.reversedAt.name).toBe("reversed_at");
		expect(payments.createdAt.name).toBe("created_at");
		expect(payments.updatedAt.name).toBe("updated_at");
	});
});

describe("scheduling schema", () => {
	it("matches the schedule, shift, and time entry columns", () => {
		expect(schedules.id.name).toBe("id");
		expect(schedules.centerId.name).toBe("center_id");
		expect(schedules.name.name).toBe("name");
		expect(schedules.effectiveFrom.name).toBe("effective_from");
		expect(schedules.effectiveUntil.name).toBe("effective_until");
		expect(schedules.createdAt.name).toBe("created_at");
		expect(schedules.updatedAt.name).toBe("updated_at");
		expect(shifts.id.name).toBe("id");
		expect(shifts.centerId.name).toBe("center_id");
		expect(shifts.scheduleId.name).toBe("schedule_id");
		expect(shifts.membershipId.name).toBe("membership_id");
		expect(shifts.classroomId.name).toBe("classroom_id");
		expect(shifts.dayOfWeek.name).toBe("day_of_week");
		expect(shifts.startTime.name).toBe("start_time");
		expect(shifts.endTime.name).toBe("end_time");
		expect(timeEntries.id.name).toBe("id");
		expect(timeEntries.centerId.name).toBe("center_id");
		expect(timeEntries.membershipId.name).toBe("membership_id");
		expect(timeEntries.date.name).toBe("date");
		expect(timeEntries.hoursWorked.name).toBe("hours_worked");
		expect(timeEntries.hoursScheduled.name).toBe("hours_scheduled");
		expect(timeEntries.overtimeHours.name).toBe("overtime_hours");
		expect(timeEntries.status.name).toBe("status");
		expect(timeEntries.createdAt.name).toBe("created_at");
		expect(timeEntries.updatedAt.name).toBe("updated_at");
	});

	it("uses the phase-5 time entry statuses", () => {
		expect(timeEntryStatusEnum.enumValues).toEqual(["auto", "manual", "approved"]);
		expect(timeEntries.status.default).toBe("auto");
		expect(directTimeEntryStatusEnum.enumValues).toEqual(["auto", "manual", "approved"]);
		expect(directSchedules.name.name).toBe("name");
		expect(directShifts.startTime.name).toBe("start_time");
		expect(directTimeEntries.overtimeHours.name).toBe("overtime_hours");
	});

	it("materializes scheduling foreign keys and unique constraints", () => {
		const scheduleForeignKeys = getForeignKeyShape(directSchedules);
		const shiftForeignKeys = getForeignKeyShape(directShifts);
		const timeEntryConfig = getTableConfig(directTimeEntries);

		expect(scheduleForeignKeys).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
		]);
		expect(shiftForeignKeys).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["schedule_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["membership_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["classroom_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{
				columns: ["schedule_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
			{
				columns: ["membership_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
			{
				columns: ["classroom_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
		]);
		expect(getForeignKeyShape(directTimeEntries)).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["membership_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{
				columns: ["membership_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
		]);
		expect(
			timeEntryConfig.uniqueConstraints.map((constraint) => ({
				name: constraint.getName(),
				columns: constraint.columns.map((column) => column.name),
			})),
		).toEqual([
			{
				name: "time_entries_center_membership_date_unique",
				columns: ["center_id", "membership_id", "date"],
			},
		]);
	});
});

describe("messaging schema", () => {
	it("matches the outbound message columns", () => {
		expect(messages.id.name).toBe("id");
		expect(messages.centerId.name).toBe("center_id");
		expect(messages.senderId.name).toBe("sender_id");
		expect(messages.subject.name).toBe("subject");
		expect(messages.body.name).toBe("body");
		expect(messages.messageType.name).toBe("message_type");
		expect(messages.classroomId.name).toBe("classroom_id");
		expect(messages.createdAt.name).toBe("created_at");
		expect(messageRecipients.id.name).toBe("id");
		expect(messageRecipients.centerId.name).toBe("center_id");
		expect(messageRecipients.messageId.name).toBe("message_id");
		expect(messageRecipients.guardianId.name).toBe("guardian_id");
		expect(messageRecipients.deliveredAt.name).toBe("delivered_at");
		expect(messageRecipients.readAt.name).toBe("read_at");
	});

	it("uses the phase-5 message types", () => {
		expect(messageTypeEnum.enumValues).toEqual(["announcement", "direct", "alert"]);
		expect(directMessageTypeEnum.enumValues).toEqual(["announcement", "direct", "alert"]);
		expect(directMessages.senderId.name).toBe("sender_id");
		expect(directMessageRecipients.deliveredAt.name).toBe("delivered_at");
	});

	it("materializes messaging foreign keys", () => {
		expect(getForeignKeyShape(directMessages)).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["sender_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["classroom_id"], foreignColumns: ["id"], onDelete: "set null" },
			{
				columns: ["classroom_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "no action",
			},
		]);
		expect(getForeignKeyShape(directMessageRecipients)).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["message_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["guardian_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{
				columns: ["message_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
			{
				columns: ["guardian_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
		]);
	});
});

describe("quickbooks schema", () => {
	it("includes the connection, entity link, sync-log, and reconciliation columns", () => {
		expect(quickbooksConnections.companyName.name).toBe("company_name");
		expect(quickbooksConnections.scopes.name).toBe("scopes");
		expect(quickbooksConnections.syncDirection.name).toBe("sync_direction");
		expect(quickbooksConnections.status.name).toBe("status");
		expect(quickbooksConnections.disconnectedAt.name).toBe("disconnected_at");
		expect(quickbooksEntityLinks.entityType.name).toBe("entity_type");
		expect(quickbooksEntityLinks.qbEntityId.name).toBe("qb_entity_id");
		expect(quickbooksSyncLog.qbEntityId.name).toBe("qb_entity_id");
		expect(quickbooksSyncLog.createdAt.name).toBe("created_at");
		expect(quickbooksReconciliationItems.origin.name).toBe("origin");
		expect(quickbooksReconciliationItems.entityType.name).toBe("entity_type");
		expect(quickbooksReconciliationItems.issueType.name).toBe("issue_type");
		expect(quickbooksReconciliationItems.title.name).toBe("title");
		expect(quickbooksReconciliationItems.description.name).toBe("description");
		expect(quickbooksReconciliationItems.proposedChanges.name).toBe("proposed_changes");
	});

	it("uses the phase-7 quickbooks enums and foreign keys", () => {
		expect(qbEntityTypeEnum.enumValues).toEqual(["customer", "invoice", "payment"]);
		expect(qbConnectionStatusEnum.enumValues).toEqual(["connected", "disconnected"]);
		expect(qbSyncDirectionEnum.enumValues).toEqual(["push", "pull"]);
		expect(qbSyncStatusEnum.enumValues).toEqual(["pending", "success", "failed", "skipped"]);
		expect(qbReconciliationStatusEnum.enumValues).toEqual(["open", "approved", "dismissed"]);
		expect(qbReconciliationIssueTypeEnum.enumValues).toEqual([
			"missing_link",
			"orphaned_link",
			"amount_mismatch",
			"status_mismatch",
			"duplicate",
		]);
		expect(getForeignKeyShape(directQuickbooksConnections)).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
		]);
		expect(getForeignKeyShape(directQuickbooksEntityLinks)).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["connection_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{
				columns: ["connection_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
		]);
		expect(getForeignKeyShape(directQuickbooksSyncLog)).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["connection_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{
				columns: ["connection_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
		]);
		expect(getForeignKeyShape(directQuickbooksReconciliationItems)).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["connection_id"], foreignColumns: ["id"], onDelete: "cascade" },
			{ columns: ["reviewed_by_membership_id"], foreignColumns: ["id"], onDelete: "set null" },
			{
				columns: ["connection_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "cascade",
			},
			{
				columns: ["reviewed_by_membership_id", "center_id"],
				foreignColumns: ["id", "center_id"],
				onDelete: "no action",
			},
		]);
	});
});

describe("marketing leads schema", () => {
	it("matches the leads columns", () => {
		expect(leads.id.name).toBe("id");
		expect(leads.id.primary).toBe(true);
		expect(leads.email.name).toBe("email");
		expect(leads.email.notNull).toBe(true);
		expect(leads.email.isUnique).toBe(true);
		expect(leads.firstName.name).toBe("first_name");
		expect(leads.sourceMagnetSlug.name).toBe("source_magnet_slug");
		expect(leads.sourcePage.name).toBe("source_page");
		expect(leads.utmSource.name).toBe("utm_source");
		expect(leads.utmMedium.name).toBe("utm_medium");
		expect(leads.utmCampaign.name).toBe("utm_campaign");
		expect(leads.unsubscribedAt.name).toBe("unsubscribed_at");
		expect(leads.confirmedAt.name).toBe("confirmed_at");
		expect(leads.createdAt.name).toBe("created_at");
		expect(leads.createdAt.notNull).toBe(true);
		expect(leads.updatedAt.name).toBe("updated_at");
		expect(leads.updatedAt.notNull).toBe(true);
	});

	it("has indexes on email and unsubscribed_at", () => {
		const config = getTableConfig(directLeads);
		const emailIndex = config.indexes.find(
			(idx) =>
				idx.config.columns.length === 1 &&
				typeof idx.config.columns[0] !== "function" &&
				"name" in idx.config.columns[0] &&
				idx.config.columns[0].name === "email",
		);
		const unsubIdx = config.indexes.find(
			(idx) =>
				idx.config.columns.length === 1 &&
				typeof idx.config.columns[0] !== "function" &&
				"name" in idx.config.columns[0] &&
				idx.config.columns[0].name === "unsubscribed_at",
		);
		expect(emailIndex).toBeDefined();
		expect(unsubIdx).toBeDefined();
	});

	it("has no foreign keys (pre-tenant table)", () => {
		expect(getForeignKeyShape(directLeads)).toHaveLength(0);
	});
});

describe("marketing lead_magnet_downloads schema", () => {
	it("matches the lead_magnet_downloads columns", () => {
		expect(leadMagnetDownloads.id.name).toBe("id");
		expect(leadMagnetDownloads.id.primary).toBe(true);
		expect(leadMagnetDownloads.leadId.name).toBe("lead_id");
		expect(leadMagnetDownloads.leadId.notNull).toBe(true);
		expect(leadMagnetDownloads.magnetSlug.name).toBe("magnet_slug");
		expect(leadMagnetDownloads.magnetSlug.notNull).toBe(true);
		expect(leadMagnetDownloads.r2Key.name).toBe("r2_key");
		expect(leadMagnetDownloads.r2Key.notNull).toBe(true);
		expect(leadMagnetDownloads.downloadedAt.name).toBe("downloaded_at");
		expect(leadMagnetDownloads.downloadedAt.notNull).toBe(true);
	});

	it("has a foreign key to leads with cascade delete", () => {
		expect(getForeignKeyShape(directLeadMagnetDownloads)).toEqual([
			{ columns: ["lead_id"], foreignColumns: ["id"], onDelete: "cascade" },
		]);
	});
});

describe("subscription notification schema", () => {
	it("matches the subscription notification columns", () => {
		expect(subscriptionNotifications.id.name).toBe("id");
		expect(subscriptionNotifications.centerId.name).toBe("center_id");
		expect(subscriptionNotifications.stripeSubscriptionId.name).toBe("stripe_subscription_id");
		expect(subscriptionNotifications.kind.name).toBe("kind");
		expect(subscriptionNotifications.recipientEmail.name).toBe("recipient_email");
		expect(subscriptionNotifications.recipientName.name).toBe("recipient_name");
		expect(subscriptionNotifications.subscriptionPlan.name).toBe("subscription_plan");
		expect(subscriptionNotifications.trialStartedAt.name).toBe("trial_started_at");
		expect(subscriptionNotifications.trialEndsAt.name).toBe("trial_ends_at");
		expect(subscriptionNotifications.dueAt.name).toBe("due_at");
		expect(subscriptionNotifications.processingStartedAt.name).toBe("processing_started_at");
		expect(subscriptionNotifications.status.name).toBe("status");
		expect(subscriptionNotifications.attempts.name).toBe("attempts");
		expect(subscriptionNotifications.lastError.name).toBe("last_error");
		expect(subscriptionNotifications.sentAt.name).toBe("sent_at");
		expect(subscriptionNotifications.createdAt.name).toBe("created_at");
	});

	it("uses the notification enums", () => {
		expect(subscriptionNotificationKindEnum.enumValues).toEqual([
			"trial_started",
			"trial_ending_soon",
		]);
		expect(subscriptionNotificationStatusEnum.enumValues).toEqual([
			"pending",
			"processing",
			"sent",
			"failed",
			"skipped",
		]);
		expect(directSubscriptionNotificationKindEnum.enumValues).toEqual([
			"trial_started",
			"trial_ending_soon",
		]);
		expect(directSubscriptionNotificationStatusEnum.enumValues).toEqual([
			"pending",
			"processing",
			"sent",
			"failed",
			"skipped",
		]);
	});

	it("has a foreign key to centers with cascade delete", () => {
		expect(getForeignKeyShape(directSubscriptionNotifications)).toEqual([
			{ columns: ["center_id"], foreignColumns: ["id"], onDelete: "cascade" },
		]);
	});
});
