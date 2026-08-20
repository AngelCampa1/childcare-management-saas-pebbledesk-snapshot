CREATE TABLE IF NOT EXISTS marketing_app_signup_subscribers (
	user_id TEXT PRIMARY KEY,
	email TEXT NOT NULL,
	first_name TEXT,
	suppressed_at TEXT,
	suppression_reason TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS marketing_app_signup_subscribers_email_idx
	ON marketing_app_signup_subscribers (email);

CREATE INDEX IF NOT EXISTS marketing_app_signup_subscribers_suppressed_at_idx
	ON marketing_app_signup_subscribers (suppressed_at);

CREATE TABLE IF NOT EXISTS marketing_app_signup_scheduled_sends (
	id TEXT PRIMARY KEY,
	subscriber_user_id TEXT NOT NULL REFERENCES marketing_app_signup_subscribers(user_id) ON DELETE CASCADE,
	template_key TEXT NOT NULL,
	due_at TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	sent_at TEXT,
	processing_started_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (subscriber_user_id, template_key)
);

CREATE INDEX IF NOT EXISTS marketing_app_signup_scheduled_sends_status_due_at_idx
	ON marketing_app_signup_scheduled_sends (status, due_at);
