import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const webhookEvents = pgTable("webhook_events", {
	id: text("id").primaryKey(),
	processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
