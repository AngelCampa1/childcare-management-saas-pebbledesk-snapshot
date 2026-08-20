SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "time_entries"
		WHERE "hours_worked" < 0
			OR "hours_scheduled" < 0
			OR "overtime_hours" < 0
	) THEN
		RAISE EXCEPTION 'Cannot add time_entries_nonnegative_hours_check: negative time entry hour values exist';
	END IF;
END $$;

ALTER TABLE "time_entries"
	DROP CONSTRAINT IF EXISTS "time_entries_nonnegative_hours_check";

ALTER TABLE "time_entries"
	ADD CONSTRAINT "time_entries_nonnegative_hours_check"
	CHECK ("hours_worked" >= 0 AND "hours_scheduled" >= 0 AND "overtime_hours" >= 0);
