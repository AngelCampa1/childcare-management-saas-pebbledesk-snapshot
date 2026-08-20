CREATE TABLE IF NOT EXISTS "message_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"guardian_id" uuid,
	"from_email" text NOT NULL,
	"from_name" text,
	"body" text NOT NULL,
	"provider_email_id" text,
	"provider_message_id" text,
	"received_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "message_replies"
	ADD CONSTRAINT "message_replies_center_id_centers_id_fk"
	FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "message_replies"
	ADD CONSTRAINT "message_replies_message_id_messages_id_fk"
	FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "message_replies"
	ADD CONSTRAINT "message_replies_guardian_id_guardians_id_fk"
	FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "message_replies_center_received_idx"
	ON "message_replies" ("center_id", "received_at");

CREATE INDEX IF NOT EXISTS "message_replies_message_received_idx"
	ON "message_replies" ("message_id", "received_at");

CREATE INDEX IF NOT EXISTS "message_replies_guardian_idx"
	ON "message_replies" ("guardian_id");

CREATE UNIQUE INDEX IF NOT EXISTS "message_replies_provider_email_id_unique"
	ON "message_replies" ("provider_email_id")
	WHERE "provider_email_id" IS NOT NULL;
