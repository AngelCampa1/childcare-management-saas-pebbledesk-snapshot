DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "invoices" i
		JOIN "guardians" g ON g."id" = i."guardian_id"
		WHERE g."center_id" <> i."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add invoices_guardian_center_fk: cross-center invoice guardian rows exist';
	END IF;

	ALTER TABLE "invoices"
		ADD CONSTRAINT "invoices_guardian_center_fk"
		FOREIGN KEY ("guardian_id", "center_id")
		REFERENCES "guardians" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
