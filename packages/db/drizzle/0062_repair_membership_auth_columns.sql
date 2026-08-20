ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_email" varchar(320);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_token_hash" varchar(128);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_expires_at" timestamp with time zone;
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_invite_token_hash_unique"
ON "memberships" ("invite_token_hash")
WHERE "invite_token_hash" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_center_invite_email_unique"
ON "memberships" ("center_id", "invite_email")
WHERE "invite_email" IS NOT NULL;

DO $$
DECLARE
	index_predicate text;
BEGIN
	SELECT regexp_replace(coalesce(pg_get_expr(i.indpred, i.indrelid), ''), '[()" ]', '', 'g')
	INTO index_predicate
	FROM pg_class c
	INNER JOIN pg_index i ON i.indexrelid = c.oid
	INNER JOIN pg_namespace n ON n.oid = c.relnamespace
	WHERE n.nspname = 'public'
		AND c.relname = 'memberships_center_user_unique';

	IF index_predicate IS DISTINCT FROM 'user_idISNOTNULLANDdeactivated_atISNULL' THEN
		DROP INDEX IF EXISTS "memberships_center_user_unique";
		CREATE UNIQUE INDEX IF NOT EXISTS "memberships_center_user_unique"
		ON "memberships" ("center_id", "user_id")
		WHERE "user_id" IS NOT NULL AND "deactivated_at" IS NULL;
	END IF;
END $$;
