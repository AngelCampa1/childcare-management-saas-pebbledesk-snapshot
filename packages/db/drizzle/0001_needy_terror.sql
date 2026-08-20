CREATE TYPE "public"."payment_provider" AS ENUM('manual', 'stripe', 'quickbooks');--> statement-breakpoint
CREATE TYPE "public"."stripe_account_status" AS ENUM('not_connected', 'pending', 'connected', 'restricted', 'disabled');--> statement-breakpoint
CREATE TABLE "invoice_template_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_template_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" real NOT NULL,
	"amount" real NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_days" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_link_token" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_link_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_link_rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider" "payment_provider" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_reference_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_transaction_id" text;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "stripe_account_status" "stripe_account_status" DEFAULT 'not_connected' NOT NULL;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "stripe_account_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "stripe_account_disabled_reason" text;--> statement-breakpoint
ALTER TABLE "invoice_template_line_items" ADD CONSTRAINT "invoice_template_line_items_invoice_template_id_invoice_templates_id_fk" FOREIGN KEY ("invoice_template_id") REFERENCES "public"."invoice_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_public_link_token_unique" UNIQUE("public_link_token");--> statement-breakpoint
ALTER TABLE "centers" ADD CONSTRAINT "centers_stripe_account_id_unique" UNIQUE("stripe_account_id");