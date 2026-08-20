import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { children } from "./children.js";

export const guardians = pgTable(
	"guardians",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		firstName: text("first_name").notNull(),
		lastName: text("last_name").notNull(),
		email: text("email"),
		phone: text("phone"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		unique("guardians_id_center_unique").on(t.id, t.centerId),
		index("guardians_center_id_idx").on(t.centerId),
		uniqueIndex("guardians_center_email_unique")
			.on(t.centerId, sql`lower(${t.email})`)
			.where(sql`${t.email} IS NOT NULL`),
	],
);

export const childGuardians = pgTable(
	"child_guardians",
	{
		childId: uuid("child_id")
			.notNull()
			.references(() => children.id, { onDelete: "cascade" }),
		guardianId: uuid("guardian_id")
			.notNull()
			.references(() => guardians.id, { onDelete: "cascade" }),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		isPrimary: boolean("is_primary").notNull().default(false),
		authorizedPickup: boolean("authorized_pickup").notNull().default(true),
		relationship: text("relationship"),
	},
	(t) => [
		primaryKey({ columns: [t.childId, t.guardianId] }),
		foreignKey({
			name: "child_guardians_child_center_fk",
			columns: [t.childId, t.centerId],
			foreignColumns: [children.id, children.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "child_guardians_guardian_center_fk",
			columns: [t.guardianId, t.centerId],
			foreignColumns: [guardians.id, guardians.centerId],
		}).onDelete("cascade"),
		index("child_guardians_center_id_idx").on(t.centerId),
		uniqueIndex("child_guardians_one_primary_per_child_unique")
			.on(t.childId)
			.where(sql`${t.isPrimary} = true`),
	],
);
