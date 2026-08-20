SET lock_timeout = '5s';--> statement-breakpoint
SET statement_timeout = '120s';--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."qb_reconciliation_status" AS ENUM('open', 'approved', 'dismissed');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
	CREATE TYPE "public"."qb_reconciliation_origin" AS ENUM('local', 'quickbooks');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
	CREATE TYPE "public"."qb_reconciliation_issue_type" AS ENUM(
		'missing_link',
		'orphaned_link',
		'amount_mismatch',
		'status_mismatch',
		'duplicate'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
	CREATE TYPE "public"."payment_status" AS ENUM('posted', 'reversed');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
	CREATE TYPE "public"."qb_connection_status" AS ENUM('connected', 'disconnected');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_enum e ON e.enumtypid = t.oid
		WHERE t.typname = 'qb_reconciliation_status' AND e.enumlabel = 'pending'
	) THEN
		ALTER TYPE "public"."qb_reconciliation_status" RENAME VALUE 'pending' TO 'open';
	END IF;
END $$;--> statement-breakpoint

ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "scopes" jsonb;--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "company_name" text;--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "sync_direction" "public"."qb_sync_direction" NOT NULL DEFAULT 'pull';--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "status" "public"."qb_connection_status" NOT NULL DEFAULT 'connected';--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "disconnected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ALTER COLUMN "sync_direction" SET DEFAULT 'pull';--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "quickbooks_connections"
SET
	"created_at" = COALESCE("created_at", "connected_at"),
	"updated_at" = COALESCE("updated_at", "last_sync_at", "connected_at");--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_connections" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_connections_center_id_unique" ON "quickbooks_connections" ("center_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quickbooks_entity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"entity_type" "public"."qb_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"qb_entity_type" "public"."qb_entity_type" NOT NULL,
	"qb_entity_id" text NOT NULL,
	"sync_status" "public"."qb_sync_status" NOT NULL DEFAULT 'pending',
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quickbooks_entity_links" ADD CONSTRAINT "quickbooks_entity_links_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quickbooks_entity_links" ADD CONSTRAINT "quickbooks_entity_links_connection_id_quickbooks_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."quickbooks_connections"("id") ON DELETE cascade;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "quickbooks_entity_links" ADD COLUMN IF NOT EXISTS "entity_type" "public"."qb_entity_type";--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ADD COLUMN IF NOT EXISTS "entity_id" text;--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ADD COLUMN IF NOT EXISTS "sync_status" "public"."qb_sync_status" NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'quickbooks_entity_links' AND column_name = 'local_entity_type'
	) THEN
		UPDATE "quickbooks_entity_links"
		SET
			"entity_type" = COALESCE("entity_type", "local_entity_type"),
			"entity_id" = COALESCE("entity_id", "local_entity_id"),
			"sync_status" = COALESCE("sync_status", CASE WHEN "qb_sync_token" IS NULL THEN 'pending' ELSE 'success' END);
	END IF;
END $$;--> statement-breakpoint
UPDATE "quickbooks_entity_links"
SET
	"created_at" = COALESCE("created_at", "last_synced_at", now()),
	"updated_at" = COALESCE("updated_at", "last_synced_at", "created_at", now());--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ALTER COLUMN "entity_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_entity_links" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_entity_links_entity_unique" ON "quickbooks_entity_links" ("center_id", "entity_type", "entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_entity_links_qb_unique" ON "quickbooks_entity_links" ("center_id", "qb_entity_type", "qb_entity_id");--> statement-breakpoint

ALTER TABLE "quickbooks_sync_log" ADD COLUMN IF NOT EXISTS "qb_entity_id" text;--> statement-breakpoint
ALTER TABLE "quickbooks_sync_log" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'quickbooks_sync_log' AND column_name = 'qb_id'
	) THEN
		UPDATE "quickbooks_sync_log"
		SET "qb_entity_id" = COALESCE("qb_entity_id", "qb_id");
	END IF;
END $$;--> statement-breakpoint
UPDATE "quickbooks_sync_log"
SET "created_at" = COALESCE("created_at", "synced_at", now());--> statement-breakpoint
ALTER TABLE "quickbooks_sync_log" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_sync_log" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quickbooks_reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"origin" "public"."qb_reconciliation_origin" NOT NULL DEFAULT 'local',
	"entity_type" "public"."qb_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"qb_entity_type" "public"."qb_entity_type",
	"qb_entity_id" text,
	"issue_type" "public"."qb_reconciliation_issue_type" NOT NULL DEFAULT 'missing_link',
	"title" text NOT NULL DEFAULT '',
	"description" text NOT NULL DEFAULT '',
	"proposed_changes" jsonb,
	"status" "public"."qb_reconciliation_status" NOT NULL DEFAULT 'open',
	"reviewed_by_membership_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quickbooks_reconciliation_items" ADD CONSTRAINT "quickbooks_reconciliation_items_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quickbooks_reconciliation_items" ADD CONSTRAINT "quickbooks_reconciliation_items_connection_id_quickbooks_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."quickbooks_connections"("id") ON DELETE cascade;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "origin" "public"."qb_reconciliation_origin" NOT NULL DEFAULT 'local';--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "entity_type" "public"."qb_entity_type";--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "entity_id" text;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "issue_type" "public"."qb_reconciliation_issue_type" NOT NULL DEFAULT 'missing_link';--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "title" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "reviewed_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quickbooks_reconciliation_items" ADD CONSTRAINT "quickbooks_reconciliation_items_reviewed_by_membership_id_memberships_id_fk" FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "qb_entity_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "qb_entity_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'quickbooks_reconciliation_items' AND column_name = 'local_entity_type'
	) THEN
		UPDATE "quickbooks_reconciliation_items"
		SET
			"origin" = COALESCE("origin", 'local'),
			"entity_type" = COALESCE("entity_type", "local_entity_type"),
			"entity_id" = COALESCE("entity_id", "local_entity_id"),
			"title" = COALESCE(NULLIF("title", ''), COALESCE("summary", '')),
			"description" = COALESCE(NULLIF("description", ''), ''),
			"reviewed_by_membership_id" = COALESCE("reviewed_by_membership_id", "resolved_by_membership_id"),
			"reviewed_at" = COALESCE("reviewed_at", "resolved_at"),
			"created_at" = COALESCE("created_at", "detected_at"),
			"updated_at" = COALESCE("updated_at", "resolved_at", "detected_at");
	END IF;
END $$;--> statement-breakpoint
UPDATE "quickbooks_reconciliation_items"
SET
	"created_at" = COALESCE("created_at", now()),
	"updated_at" = COALESCE("updated_at", "created_at", now());--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "entity_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "qb_entity_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quickbooks_reconciliation_items" ALTER COLUMN "qb_entity_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_reconciliation_items_entity_issue_unique" ON "quickbooks_reconciliation_items" ("center_id", "origin", "entity_type", "entity_id", "issue_type");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "status" "public"."payment_status" NOT NULL DEFAULT 'posted';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payments"
SET "updated_at" = COALESCE("updated_at", "paid_at", "created_at", now());--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
