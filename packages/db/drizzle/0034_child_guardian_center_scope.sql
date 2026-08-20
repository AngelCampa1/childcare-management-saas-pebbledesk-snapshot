DO $$
BEGIN
	ALTER TABLE "children" ADD CONSTRAINT "children_id_center_unique" UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE "guardians" ADD CONSTRAINT "guardians_id_center_unique" UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "child_guardians" cg
		JOIN "children" c ON c."id" = cg."child_id"
		WHERE c."center_id" <> cg."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add child_guardians_child_center_fk: cross-center child guardian child rows exist';
	END IF;

	ALTER TABLE "child_guardians"
		ADD CONSTRAINT "child_guardians_child_center_fk"
		FOREIGN KEY ("child_id", "center_id")
		REFERENCES "children" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "child_guardians" cg
		JOIN "guardians" g ON g."id" = cg."guardian_id"
		WHERE g."center_id" <> cg."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add child_guardians_guardian_center_fk: cross-center child guardian guardian rows exist';
	END IF;

	ALTER TABLE "child_guardians"
		ADD CONSTRAINT "child_guardians_guardian_center_fk"
		FOREIGN KEY ("guardian_id", "center_id")
		REFERENCES "guardians" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
