CREATE TYPE "public"."subscription_notification_kind" AS ENUM('trial_started', 'trial_ending_soon');--> statement-breakpoint
CREATE TYPE "public"."subscription_notification_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "subscription_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"kind" "subscription_notification_kind" NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"subscription_plan" "subscription_plan" NOT NULL,
	"trial_started_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"processing_started_at" timestamp with time zone,
	"status" "subscription_notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "subscription_notifications" ADD CONSTRAINT "subscription_notifications_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_notifications_status_due_at_idx" ON "subscription_notifications" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_notifications_subscription_kind_unique" ON "subscription_notifications" USING btree ("stripe_subscription_id","kind");
