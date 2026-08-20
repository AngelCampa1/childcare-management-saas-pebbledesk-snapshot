SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "check_ins"
		WHERE "checked_out_at" IS NOT NULL
			AND "checked_out_at" < "checked_in_at"
	) THEN
		RAISE EXCEPTION 'Cannot add check_ins_checkout_after_checkin_check: child check-out precedes check-in';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "staff_check_ins"
		WHERE "clocked_out_at" IS NOT NULL
			AND "clocked_out_at" < "clocked_in_at"
	) THEN
		RAISE EXCEPTION 'Cannot add staff_check_ins_clockout_after_clockin_check: staff clock-out precedes clock-in';
	END IF;
END $$;

ALTER TABLE "check_ins"
	DROP CONSTRAINT IF EXISTS "check_ins_checkout_after_checkin_check";

ALTER TABLE "check_ins"
	ADD CONSTRAINT "check_ins_checkout_after_checkin_check"
	CHECK ("checked_out_at" IS NULL OR "checked_out_at" >= "checked_in_at");

ALTER TABLE "staff_check_ins"
	DROP CONSTRAINT IF EXISTS "staff_check_ins_clockout_after_clockin_check";

ALTER TABLE "staff_check_ins"
	ADD CONSTRAINT "staff_check_ins_clockout_after_clockin_check"
	CHECK ("clocked_out_at" IS NULL OR "clocked_out_at" >= "clocked_in_at");
