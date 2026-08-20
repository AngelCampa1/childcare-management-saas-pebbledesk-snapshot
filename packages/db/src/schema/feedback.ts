import { foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { centers } from "./centers.js";

export const feedback = pgTable(
	"feedback",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		centerId: uuid("center_id"),
		userId: uuid("user_id"),
		reporterEmail: text("reporter_email").notNull(),
		message: text("message").notNull(),
		pageUrl: text("page_url"),
		userAgent: text("user_agent"),
		viewport: text("viewport"),
		role: text("role"),
		status: text("status").notNull().default("new"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		foreignKey({
			name: "feedback_center_fk",
			columns: [t.centerId],
			foreignColumns: [centers.id],
		}).onDelete("set null"),
		foreignKey({
			name: "feedback_user_fk",
			columns: [t.userId],
			foreignColumns: [users.id],
		}).onDelete("set null"),
		index("feedback_center_id_idx").on(t.centerId),
	],
);
