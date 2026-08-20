import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { classrooms } from "./classrooms.js";
import { memberships } from "./memberships.js";

export const ratioSnapshots = pgTable(
	"ratio_snapshots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		classroomId: uuid("classroom_id")
			.notNull()
			.references(() => classrooms.id, { onDelete: "cascade" }),
		snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
		staffCount: real("staff_count").notNull(),
		childrenCount: real("children_count").notNull(),
		ratioRequired: real("ratio_required").notNull(),
		ratioActual: real("ratio_actual").notNull(),
		inCompliance: boolean("in_compliance").notNull(),
	},
	(t) => [
		check(
			"ratio_snapshots_nonnegative_counts_check",
			sql`${t.staffCount} >= 0 AND ${t.childrenCount} >= 0 AND (${t.staffCount} + ${t.childrenCount}) > 0 AND ${t.ratioRequired} > 0 AND ${t.ratioActual} >= 0`,
		),
		foreignKey({
			name: "ratio_snapshots_classroom_center_fk",
			columns: [t.classroomId, t.centerId],
			foreignColumns: [classrooms.id, classrooms.centerId],
		}).onDelete("cascade"),
		index("ratio_snapshots_center_id_idx").on(t.centerId),
	],
);

export const ratioViolations = pgTable(
	"ratio_violations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		classroomId: uuid("classroom_id")
			.notNull()
			.references(() => classrooms.id, { onDelete: "cascade" }),
		detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
		staffCount: real("staff_count"),
		childrenCount: real("children_count"),
		ratioRequired: real("ratio_required"),
		ratioActual: real("ratio_actual"),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		resolvedBy: uuid("resolved_by").references(() => memberships.id, { onDelete: "set null" }),
		resolutionNotes: text("resolution_notes"),
	},
	(t) => [
		check(
			"ratio_violations_resolved_after_detected_check",
			sql`${t.resolvedAt} IS NULL OR ${t.resolvedAt} >= ${t.detectedAt}`,
		),
		check(
			"ratio_violations_nonnegative_breach_values_check",
			sql`(${t.staffCount} IS NULL OR ${t.staffCount} >= 0) AND (${t.childrenCount} IS NULL OR ${t.childrenCount} >= 0) AND (${t.ratioRequired} IS NULL OR ${t.ratioRequired} > 0) AND (${t.ratioActual} IS NULL OR ${t.ratioActual} >= 0)`,
		),
		foreignKey({
			name: "ratio_violations_classroom_center_fk",
			columns: [t.classroomId, t.centerId],
			foreignColumns: [classrooms.id, classrooms.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "ratio_violations_resolved_by_center_fk",
			columns: [t.resolvedBy, t.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}),
		index("ratio_violations_center_id_idx").on(t.centerId),
		uniqueIndex("ratio_violations_classroom_open_unique")
			.on(t.classroomId)
			.where(sql`${t.resolvedAt} IS NULL`),
	],
);
