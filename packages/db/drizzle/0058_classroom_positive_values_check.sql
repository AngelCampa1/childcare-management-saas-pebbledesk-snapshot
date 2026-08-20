SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "classrooms"
		WHERE "max_capacity" <= 0
			OR "min_ratio_staff" <= 0
			OR "min_ratio_children" <= 0
	) THEN
		RAISE EXCEPTION 'Cannot add classrooms_positive_capacity_ratio_check: nonpositive classroom capacity or ratio values exist';
	END IF;
END $$;

ALTER TABLE "classrooms"
	DROP CONSTRAINT IF EXISTS "classrooms_positive_capacity_ratio_check";

ALTER TABLE "classrooms"
	ADD CONSTRAINT "classrooms_positive_capacity_ratio_check"
	CHECK ("max_capacity" > 0 AND "min_ratio_staff" > 0 AND "min_ratio_children" > 0);
