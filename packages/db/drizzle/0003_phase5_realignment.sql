UPDATE "messages"
SET "message_type" = 'announcement'
WHERE "message_type"::text = 'newsletter';

ALTER TYPE "public"."message_type" RENAME TO "message_type_old";
CREATE TYPE "public"."message_type" AS ENUM('announcement', 'direct', 'alert');
ALTER TABLE "messages"
	ALTER COLUMN "message_type" TYPE "public"."message_type"
	USING ("message_type"::text::"public"."message_type");
DROP TYPE "public"."message_type_old";

ALTER TYPE "public"."time_entry_status" RENAME TO "time_entry_status_old";
CREATE TYPE "public"."time_entry_status" AS ENUM('auto', 'manual', 'approved');
ALTER TABLE "time_entries"
	RENAME COLUMN "overtime" TO "overtime_hours";
ALTER TABLE "time_entries"
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE "public"."time_entry_status"
	USING (
		CASE "status"::text
			WHEN 'draft' THEN 'auto'
			WHEN 'submitted' THEN 'manual'
			WHEN 'approved' THEN 'approved'
			WHEN 'rejected' THEN 'manual'
			ELSE 'auto'
		END::"public"."time_entry_status"
	),
	ALTER COLUMN "status" SET DEFAULT 'auto';
DROP TYPE "public"."time_entry_status_old";

DELETE FROM "time_entries" AS duplicate
USING "time_entries" AS keeper
WHERE duplicate."id" <> keeper."id"
	AND duplicate."center_id" = keeper."center_id"
	AND duplicate."membership_id" = keeper."membership_id"
	AND duplicate."date" = keeper."date"
	AND (
		duplicate."updated_at" < keeper."updated_at"
		OR (
			duplicate."updated_at" = keeper."updated_at"
			AND duplicate."created_at" < keeper."created_at"
		)
		OR (
			duplicate."updated_at" = keeper."updated_at"
			AND duplicate."created_at" = keeper."created_at"
			AND duplicate."id" < keeper."id"
		)
	);

ALTER TABLE "time_entries"
	ADD CONSTRAINT "time_entries_center_membership_date_unique"
	UNIQUE("center_id", "membership_id", "date");
