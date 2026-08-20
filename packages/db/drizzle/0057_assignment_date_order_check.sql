SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "classroom_assignments"
		WHERE "end_date" IS NOT NULL
			AND "effective_date" > "end_date"
	) THEN
		RAISE EXCEPTION 'Cannot add classroom_assignments_date_order_check: inverted classroom assignment dates exist';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "staff_assignments"
		WHERE "end_date" IS NOT NULL
			AND "effective_date" > "end_date"
	) THEN
		RAISE EXCEPTION 'Cannot add staff_assignments_date_order_check: inverted staff assignment dates exist';
	END IF;
END $$;

ALTER TABLE "classroom_assignments"
	DROP CONSTRAINT IF EXISTS "classroom_assignments_date_order_check";

ALTER TABLE "classroom_assignments"
	ADD CONSTRAINT "classroom_assignments_date_order_check"
	CHECK ("end_date" IS NULL OR "effective_date" <= "end_date");

ALTER TABLE "staff_assignments"
	DROP CONSTRAINT IF EXISTS "staff_assignments_date_order_check";

ALTER TABLE "staff_assignments"
	ADD CONSTRAINT "staff_assignments_date_order_check"
	CHECK ("end_date" IS NULL OR "effective_date" <= "end_date");
