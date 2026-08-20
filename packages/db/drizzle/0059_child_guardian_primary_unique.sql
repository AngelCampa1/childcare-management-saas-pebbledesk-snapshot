DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "child_guardians"
		WHERE "is_primary" = true
		GROUP BY "child_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot add child_guardians_one_primary_per_child_unique: duplicate primary guardians exist';
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "child_guardians_one_primary_per_child_unique"
	ON "child_guardians" ("child_id")
	WHERE "is_primary" = true;
