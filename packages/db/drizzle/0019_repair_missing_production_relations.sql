DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public' AND t.typname = 'scheduled_send_status'
	) THEN
		CREATE TYPE "public"."scheduled_send_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'skipped');
	END IF;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."scheduled_send_status" ADD VALUE IF NOT EXISTS 'processing' BEFORE 'sent';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"source_magnet_slug" text,
	"source_page" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"unsubscribed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_magnet_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"magnet_slug" text NOT NULL,
	"r2_key" text NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"template_vars" jsonb NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "public"."scheduled_send_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'lead_magnet_downloads_lead_id_leads_id_fk'
	) THEN
		ALTER TABLE "lead_magnet_downloads"
			ADD CONSTRAINT "lead_magnet_downloads_lead_id_leads_id_fk"
			FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_sends_lead_id_leads_id_fk'
	) THEN
		ALTER TABLE "scheduled_sends"
			ADD CONSTRAINT "scheduled_sends_lead_id_leads_id_fk"
			FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_unsubscribed_at_idx" ON "leads" USING btree ("unsubscribed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_sends_status_due_at_idx" ON "scheduled_sends" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_sends_lead_template_unique" ON "scheduled_sends" USING btree ("lead_id","template_key");--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public' AND t.typname = 'subscription_notification_kind'
	) THEN
		CREATE TYPE "public"."subscription_notification_kind" AS ENUM('trial_started', 'trial_ending_soon');
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public' AND t.typname = 'subscription_notification_status'
	) THEN
		CREATE TYPE "public"."subscription_notification_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'skipped');
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"kind" "public"."subscription_notification_kind" NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"subscription_plan" "public"."subscription_plan" NOT NULL,
	"trial_started_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"processing_started_at" timestamp with time zone,
	"status" "public"."subscription_notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'subscription_notifications_center_id_centers_id_fk'
	) THEN
		ALTER TABLE "subscription_notifications"
			ADD CONSTRAINT "subscription_notifications_center_id_centers_id_fk"
			FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_notifications_status_due_at_idx" ON "subscription_notifications" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_notifications_subscription_kind_unique" ON "subscription_notifications" USING btree ("stripe_subscription_id","kind");
