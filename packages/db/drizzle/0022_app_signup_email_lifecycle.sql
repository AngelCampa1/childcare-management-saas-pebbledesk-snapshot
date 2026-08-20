CREATE TYPE "public"."app_signup_email_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'skipped');
--> statement-breakpoint
CREATE TABLE "app_signup_email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"center_id" uuid,
	"template_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"processing_started_at" timestamp with time zone,
	"status" "app_signup_email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_signup_email_queue_user_template_unique" UNIQUE("user_id","template_key")
);
--> statement-breakpoint
CREATE TABLE "app_signup_email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_signup_email_queue" ADD CONSTRAINT "app_signup_email_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_signup_email_queue" ADD CONSTRAINT "app_signup_email_queue_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_signup_email_suppressions" ADD CONSTRAINT "app_signup_email_suppressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "app_signup_email_queue_status_due_at_idx" ON "app_signup_email_queue" USING btree ("status","due_at");
--> statement-breakpoint
CREATE INDEX "app_signup_email_queue_center_id_idx" ON "app_signup_email_queue" USING btree ("center_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "app_signup_email_suppressions_user_unique" ON "app_signup_email_suppressions" USING btree ("user_id");
