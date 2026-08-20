ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp with time zone;

DROP INDEX IF EXISTS "memberships_center_user_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_center_user_unique"
ON "memberships" ("center_id", "user_id")
WHERE "user_id" IS NOT NULL AND "deactivated_at" IS NULL;
