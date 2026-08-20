import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers.js";

export const trialFeatureUsage = pgTable(
	"trial_feature_usage",
	{
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		feature: text("feature").notNull(),
		firstUsedAt: timestamp("first_used_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.centerId, t.feature] })],
);
