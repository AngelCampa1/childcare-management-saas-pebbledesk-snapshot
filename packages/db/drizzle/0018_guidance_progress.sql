CREATE TABLE "guidance_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"completed_step_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dismissed_guide_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_opened_guide_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "guidance_progress" ADD CONSTRAINT "guidance_progress_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_progress" ADD CONSTRAINT "guidance_progress_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guidance_progress_center_id_idx" ON "guidance_progress" USING btree ("center_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guidance_progress_membership_unique" ON "guidance_progress" USING btree ("membership_id");
