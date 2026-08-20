CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid,
	"user_id" uuid,
	"reporter_email" text NOT NULL,
	"message" text NOT NULL,
	"page_url" text,
	"user_agent" text,
	"viewport" text,
	"role" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
