import {
	foreignKey,
	index,
	integer,
	json,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { centers } from "./centers.js";
import { memberships } from "./memberships.js";

export const reportTypeEnum = pgEnum("report_type", [
	"attendance",
	"ratio",
	"billing",
	"subsidy",
	"payroll",
	"enrollment",
	"licensing",
]);

export const auditActionEnum = pgEnum("audit_action", [
	"create",
	"update",
	"delete",
	"login",
	"logout",
	"export",
	"import",
]);

export const auditReports = pgTable(
	"audit_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		reportType: reportTypeEnum("report_type").notNull(),
		periodStart: text("period_start").notNull(),
		periodEnd: text("period_end").notNull(),
		generatedBy: uuid("generated_by")
			.notNull()
			.references(() => memberships.id, { onDelete: "cascade" }),
		fileUrl: text("file_url"),
		fileName: text("file_name"),
		fileSizeBytes: integer("file_size_bytes"),
		contentType: text("content_type"),
		generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		foreignKey({
			name: "audit_reports_generated_by_center_fk",
			columns: [t.generatedBy, t.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}).onDelete("cascade"),
		index("audit_reports_center_id_idx").on(t.centerId),
	],
);

export const auditLog = pgTable(
	"audit_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id").references(() => centers.id, { onDelete: "set null" }),
		userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
		action: auditActionEnum("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		changes: json("changes"),
		ipAddress: text("ip_address"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("audit_log_center_id_idx").on(t.centerId),
		index("audit_log_entity_id_idx").on(t.entityId),
	],
);
