import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { ageGroupEnum } from "./classrooms.js";

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
	"active",
	"inactive",
	"waitlist",
	"withdrawn",
]);

export const children = pgTable(
	"children",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		firstName: text("first_name").notNull(),
		lastName: text("last_name").notNull(),
		dateOfBirth: text("date_of_birth").notNull(),
		ageGroup: ageGroupEnum("age_group").notNull(),
		enrollmentStatus: enrollmentStatusEnum("enrollment_status").notNull().default("active"),
		subsidyEligible: boolean("subsidy_eligible").notNull().default(false),
		enrolledAt: timestamp("enrolled_at", { withTimezone: true }),
		withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		allergies: text("allergies"),
		immunizations: text("immunizations"),
		notes: text("notes"),
	},
	(t) => [
		unique("children_id_center_unique").on(t.id, t.centerId),
		index("children_center_id_idx").on(t.centerId),
	],
);
