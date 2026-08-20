ALTER TABLE "memberships" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_email" varchar(320);

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_center_invite_email_unique"
ON "memberships" ("center_id", "invite_email")
WHERE "invite_email" IS NOT NULL;
