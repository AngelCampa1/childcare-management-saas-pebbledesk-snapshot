-- AI-CS session ownership records
-- The BFF records one row per session so chat/escalation routes can verify
-- the authenticated user owns the session before forwarding upstream.
-- DO NOT apply to production — orchestrator applies migrations after deploy.

CREATE TABLE IF NOT EXISTS "ai_cs_session_owners" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_cs_session_owners_user_id_idx" ON "ai_cs_session_owners" ("user_id");
