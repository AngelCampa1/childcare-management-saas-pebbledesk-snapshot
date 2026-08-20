DO $$
BEGIN
	ALTER TABLE "memberships" ADD CONSTRAINT "memberships_id_center_unique" UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_id_center_unique" UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "staff_assignments" sa
		JOIN "memberships" m ON m."id" = sa."membership_id"
		WHERE m."center_id" <> sa."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add staff_assignments_membership_center_fk: cross-center staff assignment membership rows exist';
	END IF;

	ALTER TABLE "staff_assignments"
		ADD CONSTRAINT "staff_assignments_membership_center_fk"
		FOREIGN KEY ("membership_id", "center_id")
		REFERENCES "memberships" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "staff_assignments" sa
		JOIN "classrooms" c ON c."id" = sa."classroom_id"
		WHERE c."center_id" <> sa."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add staff_assignments_classroom_center_fk: cross-center staff assignment classroom rows exist';
	END IF;

	ALTER TABLE "staff_assignments"
		ADD CONSTRAINT "staff_assignments_classroom_center_fk"
		FOREIGN KEY ("classroom_id", "center_id")
		REFERENCES "classrooms" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
