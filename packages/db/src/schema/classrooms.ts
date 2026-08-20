import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
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
import { memberships } from "./memberships.js";

export const ageGroupEnum = pgEnum("age_group", [
	"infant",
	"young_toddler",
	"toddler",
	"preschool",
	"pre_k",
	"school_age",
]);

export const classrooms = pgTable(
	"classrooms",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		ageGroup: ageGroupEnum("age_group").notNull(),
		maxCapacity: integer("max_capacity").notNull(),
		minRatioStaff: integer("min_ratio_staff").notNull(),
		minRatioChildren: integer("min_ratio_children").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(t) => [
		unique("classrooms_id_center_unique").on(t.id, t.centerId),
		index("classrooms_center_id_idx").on(t.centerId),
		index("classrooms_center_active_idx").on(t.centerId, t.archivedAt),
		check(
			"classrooms_positive_capacity_ratio_check",
			sql`${t.maxCapacity} > 0 AND ${t.minRatioStaff} > 0 AND ${t.minRatioChildren} > 0`,
		),
	],
);

export const classroomAssignments = pgTable(
	"classroom_assignments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		childId: uuid("child_id").notNull(),
		classroomId: uuid("classroom_id")
			.notNull()
			.references(() => classrooms.id, { onDelete: "cascade" }),
		effectiveDate: text("effective_date").notNull(),
		endDate: text("end_date"),
	},
	(t) => [
		foreignKey({
			name: "classroom_assignments_child_center_fk",
			columns: [t.childId, t.centerId],
			foreignColumns: [children.id, children.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "classroom_assignments_classroom_center_fk",
			columns: [t.classroomId, t.centerId],
			foreignColumns: [classrooms.id, classrooms.centerId],
		}).onDelete("cascade"),
		index("classroom_assignments_center_id_idx").on(t.centerId),
		uniqueIndex("one_active_classroom_per_child").on(t.childId).where(sql`end_date IS NULL`),
		check(
			"classroom_assignments_date_order_check",
			sql`${t.endDate} IS NULL OR ${t.effectiveDate} <= ${t.endDate}`,
		),
	],
);

export const staffAssignments = pgTable(
	"staff_assignments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		membershipId: uuid("membership_id")
			.notNull()
			.references(() => memberships.id, { onDelete: "cascade" }),
		classroomId: uuid("classroom_id")
			.notNull()
			.references(() => classrooms.id, { onDelete: "cascade" }),
		effectiveDate: text("effective_date").notNull(),
		endDate: text("end_date"),
	},
	(t) => [
		foreignKey({
			name: "staff_assignments_membership_center_fk",
			columns: [t.membershipId, t.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "staff_assignments_classroom_center_fk",
			columns: [t.classroomId, t.centerId],
			foreignColumns: [classrooms.id, classrooms.centerId],
		}).onDelete("cascade"),
		index("staff_assignments_center_id_idx").on(t.centerId),
		check(
			"staff_assignments_date_order_check",
			sql`${t.endDate} IS NULL OR ${t.effectiveDate} <= ${t.endDate}`,
		),
	],
);
