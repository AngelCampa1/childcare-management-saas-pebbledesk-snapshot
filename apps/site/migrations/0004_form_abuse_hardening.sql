-- Public lead-capture abuse hardening.
--
-- 1. Make the lead-magnet download audit unique per (lead, magnet) so the welcome
--    email and Sequencer enrollment can be gated on a genuinely new (email, magnet)
--    request via INSERT ... ON CONFLICT DO NOTHING RETURNING. Existing duplicate
--    rows are collapsed to the earliest row first so the unique index can be built.
DELETE FROM marketing_lead_magnet_downloads
WHERE rowid NOT IN (
	SELECT MIN(rowid)
	FROM marketing_lead_magnet_downloads
	GROUP BY lead_id, magnet_slug
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_lead_magnet_downloads_lead_magnet_idx
	ON marketing_lead_magnet_downloads (lead_id, magnet_slug);

-- 2. Token-bucket rate limiting for the public lead endpoint, keyed on client IP
--    and on the normalized email so IP rotation cannot bypass a per-identity cap.
CREATE TABLE IF NOT EXISTS marketing_rate_limits (
	key TEXT PRIMARY KEY,
	tokens REAL NOT NULL,
	updated_at INTEGER NOT NULL
);
