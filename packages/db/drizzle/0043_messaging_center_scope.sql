DO $$
BEGIN
	ALTER TABLE "messages"
		ADD CONSTRAINT "messages_id_center_unique"
		UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "messages" m
		JOIN "classrooms" c ON c."id" = m."classroom_id"
		WHERE m."classroom_id" IS NOT NULL
			AND c."center_id" <> m."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add messages_classroom_center_fk: cross-center message classroom rows exist';
	END IF;

	ALTER TABLE "messages"
		ADD CONSTRAINT "messages_classroom_center_fk"
		FOREIGN KEY ("classroom_id", "center_id")
		REFERENCES "classrooms" ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "message_replies" mr
		JOIN "messages" m ON m."id" = mr."message_id"
		WHERE m."center_id" <> mr."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add message_replies_message_center_fk: cross-center message reply message rows exist';
	END IF;

	ALTER TABLE "message_replies"
		ADD CONSTRAINT "message_replies_message_center_fk"
		FOREIGN KEY ("message_id", "center_id")
		REFERENCES "messages" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "message_replies" mr
		JOIN "guardians" g ON g."id" = mr."guardian_id"
		WHERE mr."guardian_id" IS NOT NULL
			AND g."center_id" <> mr."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add message_replies_guardian_center_fk: cross-center message reply guardian rows exist';
	END IF;

	ALTER TABLE "message_replies"
		ADD CONSTRAINT "message_replies_guardian_center_fk"
		FOREIGN KEY ("guardian_id", "center_id")
		REFERENCES "guardians" ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
