import { DEFAULT_CENTER_TIMEZONE } from "@pebbledesk/shared/constants";
import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const stripeAccountStatusEnum = pgEnum("stripe_account_status", [
	"not_connected",
	"pending",
	"connected",
	"restricted",
	"disabled",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
	"none",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
	"incomplete",
	"incomplete_expired",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
	"trial",
	"home",
	"center_starter",
	"center_pro",
	"group",
	"enterprise",
]);

export const centers = pgTable("centers", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	address: text("address").notNull(),
	city: text("city").notNull(),
	state: text("state").notNull(),
	zip: text("zip").notNull(),
	phone: text("phone"),
	licenseNumber: text("license_number"),
	licensedCapacity: integer("licensed_capacity"),
	timezone: text("timezone").notNull().default(DEFAULT_CENTER_TIMEZONE),
	stripeAccountId: text("stripe_account_id").unique(),
	stripeAccountStatus: stripeAccountStatusEnum("stripe_account_status")
		.notNull()
		.default("not_connected"),
	stripeAccountLinkedAt: timestamp("stripe_account_linked_at", { withTimezone: true }),
	stripeAccountDisabledReason: text("stripe_account_disabled_reason"),
	stripeCustomerId: text("stripe_customer_id").unique(),
	stripeSubscriptionId: text("stripe_subscription_id").unique(),
	subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("none"),
	subscriptionPlan: subscriptionPlanEnum("subscription_plan"),
	trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
	stripeSubscriptionEventCreatedAt: timestamp("stripe_subscription_event_created_at", {
		withTimezone: true,
	}),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
