SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "shifts"
		WHERE "day_of_week" < 0 OR "day_of_week" > 6
	) THEN
		RAISE EXCEPTION 'Cannot add shifts_day_of_week_check: invalid shift day_of_week values exist';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "shifts"
		WHERE "start_time" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
			OR "end_time" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
			OR "start_time" >= "end_time"
	) THEN
		RAISE EXCEPTION 'Cannot add shifts_time_order_check: invalid shift time ranges exist';
	END IF;
END $$;

ALTER TABLE "shifts"
	DROP CONSTRAINT IF EXISTS "shifts_day_of_week_check";

ALTER TABLE "shifts"
	ADD CONSTRAINT "shifts_day_of_week_check"
	CHECK ("day_of_week" BETWEEN 0 AND 6);

ALTER TABLE "shifts"
	DROP CONSTRAINT IF EXISTS "shifts_time_order_check";

ALTER TABLE "shifts"
	ADD CONSTRAINT "shifts_time_order_check"
	CHECK (
		"start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
		AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
		AND "start_time" < "end_time"
	);
