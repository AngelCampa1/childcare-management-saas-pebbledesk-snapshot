DO $$
BEGIN
	ALTER TABLE "invoice_templates"
		ADD CONSTRAINT "invoice_templates_id_center_unique"
		UNIQUE ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "invoice_template_line_items"
	ADD COLUMN IF NOT EXISTS "center_id" uuid;

UPDATE "invoice_template_line_items" itli
SET "center_id" = it."center_id"
FROM "invoice_templates" it
WHERE it."id" = itli."invoice_template_id"
	AND itli."center_id" IS NULL;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "invoice_template_line_items"
		WHERE "center_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot set invoice_template_line_items.center_id NOT NULL: line item rows without templates exist';
	END IF;

	ALTER TABLE "invoice_template_line_items"
		ALTER COLUMN "center_id" SET NOT NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE "invoice_template_line_items"
		ADD CONSTRAINT "invoice_template_line_items_center_id_centers_id_fk"
		FOREIGN KEY ("center_id")
		REFERENCES "centers" ("id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "invoice_template_line_items" itli
		JOIN "invoice_templates" it ON it."id" = itli."invoice_template_id"
		WHERE it."center_id" <> itli."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add invoice_template_line_items_template_center_fk: cross-center invoice template line item rows exist';
	END IF;

	ALTER TABLE "invoice_template_line_items"
		ADD CONSTRAINT "invoice_template_line_items_template_center_fk"
		FOREIGN KEY ("invoice_template_id", "center_id")
		REFERENCES "invoice_templates" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
