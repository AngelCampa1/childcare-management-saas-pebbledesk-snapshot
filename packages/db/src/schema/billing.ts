import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { children } from "./children.js";
import { guardians } from "./guardians.js";

export const invoiceStatusEnum = pgEnum("invoice_status", [
	"draft",
	"sent",
	"paid",
	"overdue",
	"void",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
	"cash",
	"check",
	"credit_card",
	"ach",
	"other",
]);

export const paymentProviderEnum = pgEnum("payment_provider", ["manual", "stripe", "quickbooks"]);

export const paymentStatusEnum = pgEnum("payment_status", ["posted", "reversed"]);

export const invoices = pgTable(
	"invoices",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		guardianId: uuid("guardian_id")
			.notNull()
			.references(() => guardians.id),
		periodStart: text("period_start").notNull(),
		periodEnd: text("period_end").notNull(),
		subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
		subsidyCredit: numeric("subsidy_credit", { precision: 12, scale: 2 }).notNull().default("0"),
		amountDue: numeric("amount_due", { precision: 12, scale: 2 }).notNull().default("0"),
		status: invoiceStatusEnum("status").notNull().default("draft"),
		dueDate: text("due_date"),
		paidAt: timestamp("paid_at", { withTimezone: true }),
		publicLinkToken: text("public_link_token").unique(),
		publicLinkVersion: integer("public_link_version").notNull().default(1),
		publicLinkRotatedAt: timestamp("public_link_rotated_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		check(
			"invoices_amounts_nonnegative_check",
			sql`${t.subtotal} >= 0 AND ${t.subsidyCredit} >= 0 AND ${t.amountDue} >= 0`,
		),
		check("invoices_period_order_check", sql`${t.periodStart} <= ${t.periodEnd}`),
		check("invoices_public_link_version_positive_check", sql`${t.publicLinkVersion} > 0`),
		unique("invoices_id_center_unique").on(t.id, t.centerId),
		uniqueIndex("invoices_center_guardian_period_unique").on(
			t.centerId,
			t.guardianId,
			t.periodStart,
			t.periodEnd,
		),
		foreignKey({
			name: "invoices_guardian_center_fk",
			columns: [t.guardianId, t.centerId],
			foreignColumns: [guardians.id, guardians.centerId],
		}),
		index("invoices_center_id_idx").on(t.centerId),
		index("invoices_guardian_id_idx").on(t.guardianId),
		index("invoices_status_idx").on(t.status),
	],
);

export const invoiceLineItems = pgTable(
	"invoice_line_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		invoiceId: uuid("invoice_id")
			.notNull()
			.references(() => invoices.id, { onDelete: "cascade" }),
		description: text("description").notNull(),
		quantity: integer("quantity").notNull().default(1),
		unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		childId: uuid("child_id").references(() => children.id, { onDelete: "set null" }),
	},
	(t) => [
		check(
			"invoice_line_items_money_quantity_check",
			sql`${t.quantity} > 0 AND ${t.unitPrice} >= 0 AND ${t.amount} >= 0`,
		),
		foreignKey({
			name: "invoice_line_items_invoice_center_fk",
			columns: [t.invoiceId, t.centerId],
			foreignColumns: [invoices.id, invoices.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "invoice_line_items_child_center_fk",
			columns: [t.childId, t.centerId],
			foreignColumns: [children.id, children.centerId],
		}),
		index("invoice_line_items_invoice_id_idx").on(t.invoiceId),
	],
);

export const invoiceTemplates = pgTable(
	"invoice_templates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		dueDays: integer("due_days").notNull().default(0),
		isDefault: boolean("is_default").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		unique("invoice_templates_id_center_unique").on(t.id, t.centerId),
		check("invoice_templates_due_days_nonnegative_check", sql`${t.dueDays} >= 0`),
		uniqueIndex("invoice_templates_center_default_unique")
			.on(t.centerId)
			.where(sql`${t.isDefault} = true`),
		index("invoice_templates_center_id_idx").on(t.centerId),
	],
);

export const invoiceTemplateLineItems = pgTable(
	"invoice_template_line_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		invoiceTemplateId: uuid("invoice_template_id")
			.notNull()
			.references(() => invoiceTemplates.id, { onDelete: "cascade" }),
		description: text("description").notNull(),
		quantity: integer("quantity").notNull().default(1),
		unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
	},
	(t) => [
		check(
			"invoice_template_line_items_money_quantity_check",
			sql`${t.quantity} > 0 AND ${t.unitPrice} >= 0 AND ${t.amount} >= 0`,
		),
		foreignKey({
			name: "invoice_template_line_items_template_center_fk",
			columns: [t.invoiceTemplateId, t.centerId],
			foreignColumns: [invoiceTemplates.id, invoiceTemplates.centerId],
		}).onDelete("cascade"),
		index("invoice_template_line_items_template_id_idx").on(t.invoiceTemplateId),
	],
);

export const payments = pgTable(
	"payments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		invoiceId: uuid("invoice_id")
			.notNull()
			.references(() => invoices.id, { onDelete: "cascade" }),
		amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
		method: paymentMethodEnum("method").notNull(),
		provider: paymentProviderEnum("provider").notNull().default("manual"),
		status: paymentStatusEnum("status").notNull().default("posted"),
		providerReferenceId: text("provider_reference_id"),
		providerTransactionId: text("provider_transaction_id").unique(),
		reference: text("reference"),
		paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
		reversedAt: timestamp("reversed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		check("payments_amount_nonnegative_check", sql`${t.amount} >= 0`),
		foreignKey({
			name: "payments_invoice_center_fk",
			columns: [t.invoiceId, t.centerId],
			foreignColumns: [invoices.id, invoices.centerId],
		}).onDelete("cascade"),
		index("payments_center_id_idx").on(t.centerId),
		index("payments_invoice_id_idx").on(t.invoiceId),
		index("payments_provider_tx_id_idx").on(t.providerTransactionId),
	],
);
