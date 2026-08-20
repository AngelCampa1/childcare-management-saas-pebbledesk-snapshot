DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "guidance_progress" gp
		JOIN "memberships" m ON m."id" = gp."membership_id"
		WHERE m."center_id" <> gp."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add guidance_progress_membership_center_fk: cross-center guidance progress membership rows exist';
	END IF;

	ALTER TABLE "guidance_progress"
		ADD CONSTRAINT "guidance_progress_membership_center_fk"
		FOREIGN KEY ("membership_id", "center_id")
		REFERENCES "memberships" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "audit_reports" ar
		JOIN "memberships" m ON m."id" = ar."generated_by"
		WHERE m."center_id" <> ar."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add audit_reports_generated_by_center_fk: cross-center audit report generator rows exist';
	END IF;

	ALTER TABLE "audit_reports"
		ADD CONSTRAINT "audit_reports_generated_by_center_fk"
		FOREIGN KEY ("generated_by", "center_id")
		REFERENCES "memberships" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
