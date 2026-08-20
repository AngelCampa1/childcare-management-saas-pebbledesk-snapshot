-- AI-CS support escalation tickets
-- Persisted by the BFF before forwarding to the Ventora AI-CS Worker so a
-- human-actionable record survives even when the worker is unreachable.
-- DO NOT apply to production — orchestrator applies migrations after deploy.

CREATE TABLE IF NOT EXISTS "ai_cs_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL DEFAULT '',
	"session_id" text NOT NULL,
	"reason" text,
	"message" text,
	"contact" text,
	"status" text NOT NULL DEFAULT 'open',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_cs_escalations_user_id_idx" ON "ai_cs_escalations" ("user_id");
CREATE INDEX IF NOT EXISTS "ai_cs_escalations_session_id_idx" ON "ai_cs_escalations" ("session_id");
CREATE INDEX IF NOT EXISTS "ai_cs_escalations_created_at_idx" ON "ai_cs_escalations" ("created_at");
