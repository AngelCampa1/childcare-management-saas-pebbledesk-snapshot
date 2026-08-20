DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "staff_check_ins" sci
		JOIN "memberships" m ON m."id" = sci."membership_id"
		WHERE m."center_id" <> sci."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add staff_check_ins_membership_center_fk: cross-center staff check-in membership rows exist';
	END IF;

	ALTER TABLE "staff_check_ins"
		ADD CONSTRAINT "staff_check_ins_membership_center_fk"
		FOREIGN KEY ("membership_id", "center_id")
		REFERENCES "memberships" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "staff_check_ins" sci
		JOIN "classrooms" c ON c."id" = sci."classroom_id"
		WHERE c."center_id" <> sci."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add staff_check_ins_classroom_center_fk: cross-center staff check-in classroom rows exist';
	END IF;

	ALTER TABLE "staff_check_ins"
		ADD CONSTRAINT "staff_check_ins_classroom_center_fk"
		FOREIGN KEY ("classroom_id", "center_id")
		REFERENCES "classrooms" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
