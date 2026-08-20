import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { centers, subscriptionPlanEnum } from "./centers.js";

export const subscriptionNotificationKindEnum = pgEnum("subscription_notification_kind", [
	"trial_started",
	"trial_ending_soon",
]);

export const subscriptionNotificationStatusEnum = pgEnum("subscription_notification_status", [
	"pending",
	"processing",
	"sent",
	"failed",
	"skipped",
]);

export const subscriptionNotifications = pgTable(
	"subscription_notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		stripeSubscriptionId: text("stripe_subscription_id").notNull(),
		kind: subscriptionNotificationKindEnum("kind").notNull(),
		recipientEmail: text("recipient_email").notNull(),
		recipientName: text("recipient_name"),
		subscriptionPlan: subscriptionPlanEnum("subscription_plan").notNull(),
		trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).notNull(),
		trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
		dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
		processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
		status: subscriptionNotificationStatusEnum("status").notNull().default("pending"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("subscription_notifications_status_due_at_idx").on(t.status, t.dueAt),
		uniqueIndex("subscription_notifications_subscription_kind_unique").on(
			t.stripeSubscriptionId,
			t.kind,
		),
	],
);
