import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const leads = pgTable(
	"leads",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		email: text("email").notNull().unique(),
		firstName: text("first_name"),
		sourceMagnetSlug: text("source_magnet_slug"),
		sourcePage: text("source_page"),
		utmSource: text("utm_source"),
		utmMedium: text("utm_medium"),
		utmCampaign: text("utm_campaign"),
		unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("leads_email_idx").on(t.email),
		index("leads_unsubscribed_at_idx").on(t.unsubscribedAt),
	],
);

export const leadMagnetDownloads = pgTable("lead_magnet_downloads", {
	id: uuid("id").primaryKey().defaultRandom(),
	leadId: uuid("lead_id")
		.notNull()
		.references(() => leads.id, { onDelete: "cascade" }),
	magnetSlug: text("magnet_slug").notNull(),
	r2Key: text("r2_key").notNull(),
	downloadedAt: timestamp("downloaded_at", { withTimezone: true }).notNull().defaultNow(),
});
