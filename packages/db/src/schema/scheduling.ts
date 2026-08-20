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
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { classrooms } from "./classrooms.js";
import { memberships } from "./memberships.js";

export const timeEntryStatusEnum = pgEnum("time_entry_status", ["auto", "manual", "approved"]);

export const schedules = pgTable(
	"schedules",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		effectiveFrom: text("effective_from").notNull(),
		effectiveUntil: text("effective_until"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		check(
			"schedules_effective_date_order_check",
			sql`${t.effectiveUntil} IS NULL OR ${t.effectiveFrom} <= ${t.effectiveUntil}`,
		),
		unique("schedules_id_center_unique").on(t.id, t.centerId),
		index("schedules_center_id_idx").on(t.centerId),
	],
);

export const shifts = pgTable(
	"shifts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		scheduleId: uuid("schedule_id")
			.notNull()
			.references(() => schedules.id, { onDelete: "cascade" }),
		membershipId: uuid("membership_id")
			.notNull()
			.references(() => memberships.id, { onDelete: "cascade" }),
		classroomId: uuid("classroom_id")
			.notNull()
			.references(() => classrooms.id, { onDelete: "cascade" }),
		dayOfWeek: integer("day_of_week").notNull(),
		startTime: text("start_time").notNull(),
		endTime: text("end_time").notNull(),
	},
	(t) => [
		check("shifts_day_of_week_check", sql`${t.dayOfWeek} BETWEEN 0 AND 6`),
		check(
			"shifts_time_order_check",
			sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.startTime} < ${t.endTime}`,
		),
		foreignKey({
			name: "shifts_schedule_center_fk",
			columns: [t.scheduleId, t.centerId],
			foreignColumns: [schedules.id, schedules.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "shifts_membership_center_fk",
			columns: [t.membershipId, t.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "shifts_classroom_center_fk",
			columns: [t.classroomId, t.centerId],
			foreignColumns: [classrooms.id, classrooms.centerId],
		}).onDelete("cascade"),
		index("shifts_center_id_idx").on(t.centerId),
	],
);

export const timeEntries = pgTable(
	"time_entries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		membershipId: uuid("membership_id")
			.notNull()
			.references(() => memberships.id, { onDelete: "cascade" }),
		date: text("date").notNull(),
		hoursWorked: real("hours_worked").notNull().default(0),
		hoursScheduled: real("hours_scheduled").notNull().default(0),
		overtimeHours: real("overtime_hours").notNull().default(0),
		status: timeEntryStatusEnum("status").notNull().default("auto"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check(
			"time_entries_nonnegative_hours_check",
			sql`${table.hoursWorked} >= 0 AND ${table.hoursScheduled} >= 0 AND ${table.overtimeHours} >= 0`,
		),
		index("time_entries_center_id_idx").on(table.centerId),
		unique("time_entries_center_membership_date_unique").on(
			table.centerId,
			table.membershipId,
			table.date,
		),
		foreignKey({
			name: "time_entries_membership_center_fk",
			columns: [table.membershipId, table.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}).onDelete("cascade"),
	],
);
