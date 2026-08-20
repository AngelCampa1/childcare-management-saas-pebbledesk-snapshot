CREATE TABLE IF NOT EXISTS marketing_public_signups (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	referral_code TEXT NOT NULL UNIQUE,
	survey_token TEXT NOT NULL UNIQUE,
	position INTEGER NOT NULL,
	source_page TEXT,
	utm_source TEXT,
	utm_medium TEXT,
	utm_campaign TEXT,
	referred_by TEXT,
	survey_submitted_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS marketing_public_signups_email_idx
	ON marketing_public_signups (email);

CREATE INDEX IF NOT EXISTS marketing_public_signups_survey_token_idx
	ON marketing_public_signups (survey_token);

CREATE TABLE IF NOT EXISTS marketing_public_survey_answers (
	id TEXT PRIMARY KEY,
	signup_id TEXT NOT NULL REFERENCES marketing_public_signups(id) ON DELETE CASCADE,
	question_id TEXT NOT NULL,
	answer TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (signup_id, question_id)
);

CREATE INDEX IF NOT EXISTS marketing_public_survey_answers_signup_id_idx
	ON marketing_public_survey_answers (signup_id);
