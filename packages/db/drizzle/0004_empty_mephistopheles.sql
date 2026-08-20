ALTER TYPE "public"."report_type" ADD VALUE 'licensing';--> statement-breakpoint
ALTER TABLE "audit_reports" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "audit_reports" ADD COLUMN "file_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "audit_reports" ADD COLUMN "content_type" text;