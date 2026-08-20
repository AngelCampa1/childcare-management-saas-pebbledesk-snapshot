-- ADD VALUE is non-transactional in Postgres; these three statements commit immediately
-- and cannot be rolled back. They must run outside BEGIN/COMMIT. If this migration is
-- interrupted after these lines but before the COMMIT below, the new enum values will
-- persist in pg_enum but 'center' rows will remain. Re-running the migration is safe:
-- ADD VALUE is a no-op if the value already exists (Postgres 9.6+).
ALTER TYPE "subscription_plan" ADD VALUE IF NOT EXISTS 'center_starter';
ALTER TYPE "subscription_plan" ADD VALUE IF NOT EXISTS 'center_pro';
ALTER TYPE "subscription_plan" ADD VALUE IF NOT EXISTS 'group';

BEGIN;

UPDATE "centers" SET "subscription_plan" = 'center_starter' WHERE "subscription_plan" = 'center';

ALTER TYPE "subscription_plan" RENAME TO "subscription_plan_old";
CREATE TYPE "subscription_plan" AS ENUM ('home', 'center_starter', 'center_pro', 'group', 'enterprise');
ALTER TABLE "centers" ALTER COLUMN "subscription_plan" TYPE "subscription_plan" USING "subscription_plan"::text::"subscription_plan";
DROP TYPE "subscription_plan_old";

COMMIT;
