-- Nonce store for AI-CS context endpoint replay protection.
-- Each nonce is consumed once; rows expire after the 5-minute HMAC skew window.
-- DO NOT apply to production — orchestrator applies D1 migrations after deploy.

CREATE TABLE IF NOT EXISTS ai_cs_nonces (
	nonce TEXT PRIMARY KEY NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_cs_nonces_expires_at_idx ON ai_cs_nonces (expires_at);
