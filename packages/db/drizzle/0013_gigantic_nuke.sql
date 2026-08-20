CREATE TYPE "public"."scheduled_send_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
ALTER TABLE "scheduled_sends" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."scheduled_send_status";--> statement-breakpoint
ALTER TABLE "scheduled_sends" ALTER COLUMN "status" SET DATA TYPE "public"."scheduled_send_status" USING "status"::"public"."scheduled_send_status";