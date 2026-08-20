DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "ratio_snapshots" rs
		JOIN "classrooms" c ON c."id" = rs."classroom_id"
		WHERE c."center_id" <> rs."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add ratio_snapshots_classroom_center_fk: cross-center ratio snapshot classroom rows exist';
	END IF;

	ALTER TABLE "ratio_snapshots"
		ADD CONSTRAINT "ratio_snapshots_classroom_center_fk"
		FOREIGN KEY ("classroom_id", "center_id")
		REFERENCES "classrooms" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "ratio_violations" rv
		JOIN "classrooms" c ON c."id" = rv."classroom_id"
		WHERE c."center_id" <> rv."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add ratio_violations_classroom_center_fk: cross-center ratio violation classroom rows exist';
	END IF;

	ALTER TABLE "ratio_violations"
		ADD CONSTRAINT "ratio_violations_classroom_center_fk"
		FOREIGN KEY ("classroom_id", "center_id")
		REFERENCES "classrooms" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "ratio_violations" rv
		JOIN "memberships" m ON m."id" = rv."resolved_by"
		WHERE rv."resolved_by" IS NOT NULL
			AND m."center_id" <> rv."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add ratio_violations_resolved_by_center_fk: cross-center ratio violation resolver rows exist';
	END IF;

	ALTER TABLE "ratio_violations"
		ADD CONSTRAINT "ratio_violations_resolved_by_center_fk"
		FOREIGN KEY ("resolved_by", "center_id")
		REFERENCES "memberships" ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
