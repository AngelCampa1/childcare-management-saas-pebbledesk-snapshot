DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_enum e
		JOIN pg_type t ON t.oid = e.enumtypid
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public'
			AND t.typname = 'subscription_plan'
			AND e.enumlabel = 'trial'
	) THEN
		ALTER TYPE "public"."subscription_plan" ADD VALUE 'trial' BEFORE 'home';
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trial_feature_usage" (
	"center_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_feature_usage_center_id_feature_pk" PRIMARY KEY("center_id","feature")
);
--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "trial_feature_usage"
		ADD CONSTRAINT "trial_feature_usage_center_id_centers_id_fk"
		FOREIGN KEY ("center_id")
		REFERENCES "public"."centers"("id")
		ON DELETE cascade
		ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
