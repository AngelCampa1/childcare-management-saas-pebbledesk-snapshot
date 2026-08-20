import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { children } from "./children.js";
import { classrooms } from "./classrooms.js";
import { memberships } from "./memberships.js";

export const checkIns = pgTable(
	"check_ins",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		childId: uuid("child_id")
			.notNull()
			.references(() => children.id, { onDelete: "cascade" }),
		classroomId: uuid("classroom_id")
			.notNull()
			.references(() => classrooms.id, { onDelete: "cascade" }),
		checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
		checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
		checkedInBy: uuid("checked_in_by")
			.notNull()
			.references(() => memberships.id, { onDelete: "cascade" }),
		checkedOutBy: uuid("checked_out_by").references(() => memberships.id, { onDelete: "set null" }),
		notes: text("notes"),
		isLate: boolean("is_late").notNull().default(false),
		checkInSignature: text("check_in_signature"),
		checkOutSignature: text("check_out_signature"),
	},
	(t) => [
		check(
			"check_ins_checkout_after_checkin_check",
			sql`${t.checkedOutAt} IS NULL OR ${t.checkedOutAt} >= ${t.checkedInAt}`,
		),
		foreignKey({
			name: "check_ins_child_center_fk",
			columns: [t.childId, t.centerId],
			foreignColumns: [children.id, children.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "check_ins_classroom_center_fk",
			columns: [t.classroomId, t.centerId],
			foreignColumns: [classrooms.id, classrooms.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "check_ins_checked_in_by_center_fk",
			columns: [t.checkedInBy, t.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "check_ins_checked_out_by_center_fk",
			columns: [t.checkedOutBy, t.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}),
		index("check_ins_center_id_idx").on(t.centerId),
		index("check_ins_child_id_idx").on(t.childId),
		index("check_ins_checked_in_at_idx").on(t.checkedInAt),
		uniqueIndex("check_ins_child_open_unique").on(t.childId).where(sql`${t.checkedOutAt} IS NULL`),
	],
);

export const staffCheckIns = pgTable(
	"staff_check_ins",
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
		clockedInAt: timestamp("clocked_in_at", { withTimezone: true }).notNull().defaultNow(),
		clockedOutAt: timestamp("clocked_out_at", { withTimezone: true }),
	},
	(t) => [
		check(
			"staff_check_ins_clockout_after_clockin_check",
			sql`${t.clockedOutAt} IS NULL OR ${t.clockedOutAt} >= ${t.clockedInAt}`,
		),
		foreignKey({
			name: "staff_check_ins_membership_center_fk",
			columns: [t.membershipId, t.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "staff_check_ins_classroom_center_fk",
			columns: [t.classroomId, t.centerId],
			foreignColumns: [classrooms.id, classrooms.centerId],
		}).onDelete("cascade"),
		index("staff_check_ins_center_id_idx").on(t.centerId),
		uniqueIndex("staff_check_ins_membership_open_unique")
			.on(t.membershipId)
			.where(sql`${t.clockedOutAt} IS NULL`),
	],
);
