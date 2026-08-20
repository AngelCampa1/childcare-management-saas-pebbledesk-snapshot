DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "shifts" s
		JOIN "memberships" m ON m."id" = s."membership_id"
		WHERE m."center_id" <> s."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add shifts_membership_center_fk: cross-center shift membership rows exist';
	END IF;

	ALTER TABLE "shifts"
		ADD CONSTRAINT "shifts_membership_center_fk"
		FOREIGN KEY ("membership_id", "center_id")
		REFERENCES "memberships" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "shifts" s
		JOIN "classrooms" c ON c."id" = s."classroom_id"
		WHERE c."center_id" <> s."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add shifts_classroom_center_fk: cross-center shift classroom rows exist';
	END IF;

	ALTER TABLE "shifts"
		ADD CONSTRAINT "shifts_classroom_center_fk"
		FOREIGN KEY ("classroom_id", "center_id")
		REFERENCES "classrooms" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "time_entries" te
		JOIN "memberships" m ON m."id" = te."membership_id"
		WHERE m."center_id" <> te."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add time_entries_membership_center_fk: cross-center time entry membership rows exist';
	END IF;

	ALTER TABLE "time_entries"
		ADD CONSTRAINT "time_entries_membership_center_fk"
		FOREIGN KEY ("membership_id", "center_id")
		REFERENCES "memberships" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
