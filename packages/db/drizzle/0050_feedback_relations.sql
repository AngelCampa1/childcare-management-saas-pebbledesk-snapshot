DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "feedback" f
		WHERE f."center_id" IS NOT NULL
			AND NOT EXISTS (
				SELECT 1
				FROM "centers" c
				WHERE c."id" = f."center_id"
			)
	) THEN
		RAISE EXCEPTION 'Cannot add feedback_center_fk: feedback rows reference missing centers';
	END IF;

	ALTER TABLE "feedback"
		ADD CONSTRAINT "feedback_center_fk"
		FOREIGN KEY ("center_id")
		REFERENCES "centers" ("id")
		ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "feedback" f
		WHERE f."user_id" IS NOT NULL
			AND NOT EXISTS (
				SELECT 1
				FROM "users" u
				WHERE u."id" = f."user_id"
			)
	) THEN
		RAISE EXCEPTION 'Cannot add feedback_user_fk: feedback rows reference missing users';
	END IF;

	ALTER TABLE "feedback"
		ADD CONSTRAINT "feedback_user_fk"
		FOREIGN KEY ("user_id")
		REFERENCES "users" ("id")
		ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
