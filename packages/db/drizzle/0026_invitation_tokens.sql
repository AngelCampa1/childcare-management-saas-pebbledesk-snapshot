ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_token_hash" varchar(128);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_expires_at" timestamp with time zone;
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_invite_token_hash_unique"
	ON "memberships" ("invite_token_hash")
	WHERE "invite_token_hash" IS NOT NULL;
