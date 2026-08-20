-- Add 'trial' to subscription_plan enum (drop/recreate since ALTER TYPE ADD VALUE cannot precede existing values)
ALTER TABLE "centers" ALTER COLUMN "subscription_plan" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subscription_notifications" ALTER COLUMN "subscription_plan" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."subscription_plan";--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('trial', 'home', 'center_starter', 'center_pro', 'group', 'enterprise');--> statement-breakpoint
ALTER TABLE "centers" ALTER COLUMN "subscription_plan" SET DATA TYPE "public"."subscription_plan" USING "subscription_plan"::"public"."subscription_plan";--> statement-breakpoint
ALTER TABLE "subscription_notifications" ALTER COLUMN "subscription_plan" SET DATA TYPE "public"."subscription_plan" USING "subscription_plan"::"public"."subscription_plan";--> statement-breakpoint
CREATE TABLE "trial_feature_usage" (
	"center_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_feature_usage_center_id_feature_pk" PRIMARY KEY("center_id","feature")
);--> statement-breakpoint
ALTER TABLE "trial_feature_usage" ADD CONSTRAINT "trial_feature_usage_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;
