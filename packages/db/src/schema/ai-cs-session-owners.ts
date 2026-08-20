import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Ownership records for AI-CS Worker sessions.
 *
 * The BFF records one row here when it proxies a successful session creation
 * so that subsequent chat and escalation requests can be verified against the
 * authenticated user before being forwarded upstream.
 *
 * This prevents IDOR: a client-supplied sessionId is only accepted when a
 * matching row for the authenticated userId exists in this table.
 */
export const aiCsSessionOwners = pgTable(
	"ai_cs_session_owners",
	{
		/** The upstream AI-CS Worker session ID. */
		sessionId: text("session_id").primaryKey(),
		/** Better Auth user ID of the session owner. */
		userId: text("user_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [index("ai_cs_session_owners_user_id_idx").on(t.userId)],
);
