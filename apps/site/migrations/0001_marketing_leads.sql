CREATE TABLE IF NOT EXISTS marketing_leads (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	first_name TEXT,
	source_magnet_slug TEXT,
	source_page TEXT,
	utm_source TEXT,
	utm_medium TEXT,
	utm_campaign TEXT,
	unsubscribed_at TEXT,
	confirmed_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS marketing_leads_email_idx ON marketing_leads (email);
CREATE INDEX IF NOT EXISTS marketing_leads_unsubscribed_at_idx ON marketing_leads (unsubscribed_at);

CREATE TABLE IF NOT EXISTS marketing_lead_magnet_downloads (
	id TEXT PRIMARY KEY,
	lead_id TEXT NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
	magnet_slug TEXT NOT NULL,
	r2_key TEXT NOT NULL,
	downloaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_scheduled_sends (
	id TEXT PRIMARY KEY,
	lead_id TEXT NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
	template_key TEXT NOT NULL,
	template_vars TEXT NOT NULL,
	due_at TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	sent_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (lead_id, template_key)
);

CREATE INDEX IF NOT EXISTS marketing_scheduled_sends_status_due_at_idx
	ON marketing_scheduled_sends (status, due_at);
