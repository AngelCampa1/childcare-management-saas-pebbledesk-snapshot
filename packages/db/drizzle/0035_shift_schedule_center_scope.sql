DO $$
BEGIN
	ALTER TABLE "schedules" ADD CONSTRAINT "schedules_id_center_unique" UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "shifts" sh
		JOIN "schedules" sc ON sc."id" = sh."schedule_id"
		WHERE sc."center_id" <> sh."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add shifts_schedule_center_fk: cross-center shift schedule rows exist';
	END IF;

	ALTER TABLE "shifts"
		ADD CONSTRAINT "shifts_schedule_center_fk"
		FOREIGN KEY ("schedule_id", "center_id")
		REFERENCES "schedules" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
