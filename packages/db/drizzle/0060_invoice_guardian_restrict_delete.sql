ALTER TABLE "invoices"
	DROP CONSTRAINT IF EXISTS "invoices_guardian_id_guardians_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices"
	DROP CONSTRAINT IF EXISTS "invoices_guardian_center_fk";
--> statement-breakpoint
ALTER TABLE "invoices"
	ADD CONSTRAINT "invoices_guardian_id_guardians_id_fk"
	FOREIGN KEY ("guardian_id")
	REFERENCES "guardians" ("id");
--> statement-breakpoint
ALTER TABLE "invoices"
	ADD CONSTRAINT "invoices_guardian_center_fk"
	FOREIGN KEY ("guardian_id", "center_id")
	REFERENCES "guardians" ("id", "center_id");
