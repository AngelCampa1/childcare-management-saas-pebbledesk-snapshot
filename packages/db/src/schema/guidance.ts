import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { centers } from "./centers.js";
import { memberships } from "./memberships.js";

export const guidanceProgress = pgTable(
	"guidance_progress",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		membershipId: uuid("membership_id")
			.notNull()
			.references(() => memberships.id, { onDelete: "cascade" }),
		completedStepIds: jsonb("completed_step_ids")
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		dismissedGuideIds: jsonb("dismissed_guide_ids")
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		lastOpenedGuideId: text("last_opened_guide_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("guidance_progress_center_id_idx").on(t.centerId),
		foreignKey({
			name: "guidance_progress_membership_center_fk",
			columns: [t.membershipId, t.centerId],
			foreignColumns: [memberships.id, memberships.centerId],
		}).onDelete("cascade"),
		uniqueIndex("guidance_progress_membership_unique").on(t.membershipId),
	],
);
