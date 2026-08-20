ALTER TABLE "message_recipients"
	ADD COLUMN IF NOT EXISTS "center_id" uuid;

UPDATE "message_recipients" mr
SET "center_id" = m."center_id"
FROM "messages" m
WHERE m."id" = mr."message_id"
	AND mr."center_id" IS NULL;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "message_recipients"
		WHERE "center_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot set message_recipients.center_id NOT NULL: recipient rows without messages exist';
	END IF;

	ALTER TABLE "message_recipients"
		ALTER COLUMN "center_id" SET NOT NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE "message_recipients"
		ADD CONSTRAINT "message_recipients_center_id_centers_id_fk"
		FOREIGN KEY ("center_id")
		REFERENCES "centers" ("id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "message_recipients" mr
		JOIN "messages" m ON m."id" = mr."message_id"
		WHERE m."center_id" <> mr."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add message_recipients_message_center_fk: cross-center message recipient message rows exist';
	END IF;

	ALTER TABLE "message_recipients"
		ADD CONSTRAINT "message_recipients_message_center_fk"
		FOREIGN KEY ("message_id", "center_id")
		REFERENCES "messages" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "message_recipients" mr
		JOIN "guardians" g ON g."id" = mr."guardian_id"
		WHERE g."center_id" <> mr."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add message_recipients_guardian_center_fk: cross-center message recipient guardian rows exist';
	END IF;

	ALTER TABLE "message_recipients"
		ADD CONSTRAINT "message_recipients_guardian_center_fk"
		FOREIGN KEY ("guardian_id", "center_id")
		REFERENCES "guardians" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
