CREATE TYPE "public"."subscription_plan" AS ENUM('home', 'center', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired');--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "subscription_status" "subscription_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "subscription_plan" "subscription_plan";--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "centers" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "centers" ADD CONSTRAINT "centers_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "centers" ADD CONSTRAINT "centers_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");--> statement-breakpoint
-- Grandfather all pre-existing centers (created before this migration ran) into a fully active
-- "center" plan so they retain access without being forced through the new subscription gate.
UPDATE centers SET subscription_status = 'active', subscription_plan = 'center' WHERE created_at < CURRENT_TIMESTAMP;
