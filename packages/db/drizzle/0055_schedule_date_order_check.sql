SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "schedules"
		WHERE "effective_until" IS NOT NULL
			AND "effective_from" > "effective_until"
	) THEN
		RAISE EXCEPTION 'Cannot add schedules_effective_date_order_check: inverted schedule effective dates exist';
	END IF;
END $$;

ALTER TABLE "schedules"
	DROP CONSTRAINT IF EXISTS "schedules_effective_date_order_check";

ALTER TABLE "schedules"
	ADD CONSTRAINT "schedules_effective_date_order_check"
	CHECK ("effective_until" IS NULL OR "effective_from" <= "effective_until");
