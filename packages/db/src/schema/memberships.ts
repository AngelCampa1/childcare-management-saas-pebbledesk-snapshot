import { sql } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { centers } from "./centers.js";

export const membershipRoleEnum = pgEnum("membership_role", ["owner", "director", "staff"]);

export const memberships = pgTable(
	"memberships",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
		role: membershipRoleEnum("role").notNull(),
		invitedAt: timestamp("invited_at", { withTimezone: true }),
		inviteEmail: varchar("invite_email", { length: 320 }),
		inviteTokenHash: varchar("invite_token_hash", { length: 128 }),
		inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		unique("memberships_id_center_unique").on(t.id, t.centerId),
		index("memberships_center_id_idx").on(t.centerId),
		uniqueIndex("memberships_invite_token_hash_unique").on(t.inviteTokenHash),
		uniqueIndex("memberships_center_user_unique")
			.on(t.centerId, t.userId)
			.where(sql`${t.userId} IS NOT NULL AND ${t.deactivatedAt} IS NULL`),
		uniqueIndex("memberships_center_invite_email_unique")
			.on(t.centerId, t.inviteEmail)
			.where(sql`${t.inviteEmail} IS NOT NULL`),
	],
);
