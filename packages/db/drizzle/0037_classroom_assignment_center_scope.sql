DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "classroom_assignments" ca
		JOIN "children" c ON c."id" = ca."child_id"
		WHERE c."center_id" <> ca."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add classroom_assignments_child_center_fk: cross-center classroom assignment child rows exist';
	END IF;

	ALTER TABLE "classroom_assignments"
		ADD CONSTRAINT "classroom_assignments_child_center_fk"
		FOREIGN KEY ("child_id", "center_id")
		REFERENCES "children" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "classroom_assignments" ca
		JOIN "classrooms" c ON c."id" = ca."classroom_id"
		WHERE c."center_id" <> ca."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add classroom_assignments_classroom_center_fk: cross-center classroom assignment classroom rows exist';
	END IF;

	ALTER TABLE "classroom_assignments"
		ADD CONSTRAINT "classroom_assignments_classroom_center_fk"
		FOREIGN KEY ("classroom_id", "center_id")
		REFERENCES "classrooms" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
