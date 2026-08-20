DO $$
BEGIN
	ALTER TABLE "subsidy_cases" ADD CONSTRAINT "subsidy_cases_id_center_unique" UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "subsidy_cases" sc
		JOIN "children" c ON c."id" = sc."child_id"
		WHERE c."center_id" <> sc."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add subsidy_cases_child_center_fk: cross-center subsidy case child rows exist';
	END IF;

	ALTER TABLE "subsidy_cases"
		ADD CONSTRAINT "subsidy_cases_child_center_fk"
		FOREIGN KEY ("child_id", "center_id")
		REFERENCES "children" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "subsidy_claims" cl
		JOIN "subsidy_cases" sc ON sc."id" = cl."subsidy_case_id"
		WHERE sc."center_id" <> cl."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add subsidy_claims_case_center_fk: cross-center subsidy claim case rows exist';
	END IF;

	ALTER TABLE "subsidy_claims"
		ADD CONSTRAINT "subsidy_claims_case_center_fk"
		FOREIGN KEY ("subsidy_case_id", "center_id")
		REFERENCES "subsidy_cases" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
