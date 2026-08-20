SET lock_timeout = '5s';
SET statement_timeout = '120s';

ALTER TABLE "child_guardians" ADD COLUMN IF NOT EXISTS "center_id" uuid;

UPDATE child_guardians
SET center_id = children.center_id
FROM children
WHERE child_guardians.child_id = children.id
	AND child_guardians.center_id IS NULL;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM child_guardians
		JOIN children ON children.id = child_guardians.child_id
		JOIN guardians ON guardians.id = child_guardians.guardian_id
		WHERE children.center_id <> guardians.center_id
			OR child_guardians.center_id <> children.center_id
			OR child_guardians.center_id <> guardians.center_id
	) THEN
		RAISE EXCEPTION 'cross-center child_guardians link detected';
	END IF;
END $$;

ALTER TABLE "child_guardians" ALTER COLUMN "center_id" SET NOT NULL;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'child_guardians_center_id_centers_id_fk'
	) THEN
		ALTER TABLE "child_guardians"
			ADD CONSTRAINT "child_guardians_center_id_centers_id_fk"
			FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "child_guardians_center_id_idx"
	ON "child_guardians" ("center_id");
