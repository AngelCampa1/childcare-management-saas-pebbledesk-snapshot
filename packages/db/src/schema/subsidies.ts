import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { children } from "./children.js";

export const subsidyProgramEnum = pgEnum("subsidy_program", [
	"ccdf",
	"head_start",
	"early_head_start",
	"state_pre_k",
	"other",
]);

export const subsidyStatusEnum = pgEnum("subsidy_status", [
	"active",
	"pending",
	"expired",
	"terminated",
]);

export const subsidyClaimStatusEnum = pgEnum("subsidy_claim_status", [
	"draft",
	"submitted",
	"approved",
	"rejected",
	"paid",
]);

export const subsidyCases = pgTable(
	"subsidy_cases",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		childId: uuid("child_id")
			.notNull()
			.references(() => children.id, { onDelete: "cascade" }),
		program: subsidyProgramEnum("program").notNull(),
		caseNumber: text("case_number").notNull(),
		agencyName: text("agency_name").notNull(),
		authorizedHoursWeekly: real("authorized_hours_weekly"),
		rateDaily: real("rate_daily"),
		rateWeekly: real("rate_weekly"),
		effectiveDate: text("effective_date").notNull(),
		expirationDate: text("expiration_date"),
		status: subsidyStatusEnum("status").notNull().default("active"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		check(
			"subsidy_cases_nonnegative_authorization_check",
			sql`(${t.authorizedHoursWeekly} IS NULL OR ${t.authorizedHoursWeekly} >= 0) AND (${t.rateDaily} IS NULL OR ${t.rateDaily} >= 0) AND (${t.rateWeekly} IS NULL OR ${t.rateWeekly} >= 0)`,
		),
		check(
			"subsidy_cases_effective_expiration_order_check",
			sql`${t.expirationDate} IS NULL OR ${t.effectiveDate} <= ${t.expirationDate}`,
		),
		unique("subsidy_cases_id_center_unique").on(t.id, t.centerId),
		foreignKey({
			name: "subsidy_cases_child_center_fk",
			columns: [t.childId, t.centerId],
			foreignColumns: [children.id, children.centerId],
		}).onDelete("cascade"),
		index("subsidy_cases_center_id_idx").on(t.centerId),
	],
);

export const subsidyClaims = pgTable(
	"subsidy_claims",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		subsidyCaseId: uuid("subsidy_case_id")
			.notNull()
			.references(() => subsidyCases.id, { onDelete: "cascade" }),
		periodStart: text("period_start").notNull(),
		periodEnd: text("period_end").notNull(),
		daysAttended: integer("days_attended").notNull().default(0),
		hoursAttended: real("hours_attended").notNull().default(0),
		amountClaimed: real("amount_claimed").notNull().default(0),
		amountApproved: real("amount_approved"),
		amountPaid: real("amount_paid"),
		status: subsidyClaimStatusEnum("status").notNull().default("draft"),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		paidAt: timestamp("paid_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		check(
			"subsidy_claims_nonnegative_amounts_check",
			sql`${t.daysAttended} >= 0 AND ${t.hoursAttended} >= 0 AND ${t.amountClaimed} >= 0 AND (${t.amountApproved} IS NULL OR ${t.amountApproved} >= 0) AND (${t.amountPaid} IS NULL OR ${t.amountPaid} >= 0)`,
		),
		check(
			"subsidy_claims_amount_order_check",
			sql`(${t.amountApproved} IS NULL OR ${t.amountApproved} <= ${t.amountClaimed}) AND (${t.amountPaid} IS NULL OR (${t.amountApproved} IS NOT NULL AND ${t.amountPaid} <= ${t.amountApproved}))`,
		),
		check("subsidy_claims_period_order_check", sql`${t.periodStart} <= ${t.periodEnd}`),
		foreignKey({
			name: "subsidy_claims_case_center_fk",
			columns: [t.subsidyCaseId, t.centerId],
			foreignColumns: [subsidyCases.id, subsidyCases.centerId],
		}).onDelete("cascade"),
		index("subsidy_claims_center_id_idx").on(t.centerId),
		uniqueIndex("subsidy_claims_case_period_unique").on(
			t.subsidyCaseId,
			t.periodStart,
			t.periodEnd,
		),
	],
);
