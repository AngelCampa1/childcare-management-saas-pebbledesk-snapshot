CREATE TABLE "lead_magnet_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"magnet_slug" text NOT NULL,
	"r2_key" text NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
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
CREATE TABLE "scheduled_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"template_vars" jsonb NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "check_ins_child_open_unique";--> statement-breakpoint
DROP INDEX "staff_check_ins_membership_open_unique";--> statement-breakpoint
DROP INDEX "one_active_classroom_per_child";--> statement-breakpoint
DROP INDEX "guardians_center_email_unique";--> statement-breakpoint
DROP INDEX "ratio_violations_classroom_open_unique";--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "unit_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoice_template_line_items" ALTER COLUMN "unit_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoice_template_line_items" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "subtotal" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "subtotal" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "subsidy_credit" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "subsidy_credit" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "amount_due" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "amount_due" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "lead_magnet_downloads" ADD CONSTRAINT "lead_magnet_downloads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_sends" ADD CONSTRAINT "scheduled_sends_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leads_unsubscribed_at_idx" ON "leads" USING btree ("unsubscribed_at");--> statement-breakpoint
CREATE INDEX "scheduled_sends_status_due_at_idx" ON "scheduled_sends" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "check_ins_child_open_unique" ON "check_ins" USING btree ("child_id") WHERE "check_ins"."checked_out_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_check_ins_membership_open_unique" ON "staff_check_ins" USING btree ("membership_id") WHERE "staff_check_ins"."clocked_out_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_classroom_per_child" ON "classroom_assignments" USING btree ("child_id") WHERE end_date IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_center_email_unique" ON "guardians" USING btree ("center_id",lower("email")) WHERE "guardians"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ratio_violations_classroom_open_unique" ON "ratio_violations" USING btree ("classroom_id") WHERE "ratio_violations"."resolved_at" IS NULL;