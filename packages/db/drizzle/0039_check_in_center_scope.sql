DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "check_ins" ci
		JOIN "children" c ON c."id" = ci."child_id"
		WHERE c."center_id" <> ci."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add check_ins_child_center_fk: cross-center child check-in child rows exist';
	END IF;

	ALTER TABLE "check_ins"
		ADD CONSTRAINT "check_ins_child_center_fk"
		FOREIGN KEY ("child_id", "center_id")
		REFERENCES "children" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "check_ins" ci
		JOIN "classrooms" c ON c."id" = ci."classroom_id"
		WHERE c."center_id" <> ci."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add check_ins_classroom_center_fk: cross-center child check-in classroom rows exist';
	END IF;

	ALTER TABLE "check_ins"
		ADD CONSTRAINT "check_ins_classroom_center_fk"
		FOREIGN KEY ("classroom_id", "center_id")
		REFERENCES "classrooms" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "check_ins" ci
		JOIN "memberships" m ON m."id" = ci."checked_in_by"
		WHERE m."center_id" <> ci."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add check_ins_checked_in_by_center_fk: cross-center child check-in staff rows exist';
	END IF;

	ALTER TABLE "check_ins"
		ADD CONSTRAINT "check_ins_checked_in_by_center_fk"
		FOREIGN KEY ("checked_in_by", "center_id")
		REFERENCES "memberships" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "check_ins" ci
		JOIN "memberships" m ON m."id" = ci."checked_out_by"
		WHERE ci."checked_out_by" IS NOT NULL
			AND m."center_id" <> ci."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add check_ins_checked_out_by_center_fk: cross-center child check-out staff rows exist';
	END IF;

	ALTER TABLE "check_ins"
		ADD CONSTRAINT "check_ins_checked_out_by_center_fk"
		FOREIGN KEY ("checked_out_by", "center_id")
		REFERENCES "memberships" ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
