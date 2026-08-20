ALTER TABLE "invoice_line_items"
	ADD COLUMN IF NOT EXISTS "center_id" uuid;

UPDATE "invoice_line_items" ili
SET "center_id" = i."center_id"
FROM "invoices" i
WHERE i."id" = ili."invoice_id"
	AND ili."center_id" IS NULL;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "invoice_line_items"
		WHERE "center_id" IS NULL
	) THEN
		RAISE EXCEPTION 'Cannot set invoice_line_items.center_id NOT NULL: line item rows without invoices exist';
	END IF;

	ALTER TABLE "invoice_line_items"
		ALTER COLUMN "center_id" SET NOT NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE "invoice_line_items"
		ADD CONSTRAINT "invoice_line_items_center_id_centers_id_fk"
		FOREIGN KEY ("center_id")
		REFERENCES "centers" ("id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "invoice_line_items" ili
		JOIN "invoices" i ON i."id" = ili."invoice_id"
		WHERE i."center_id" <> ili."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add invoice_line_items_invoice_center_fk: cross-center invoice line item invoice rows exist';
	END IF;

	ALTER TABLE "invoice_line_items"
		ADD CONSTRAINT "invoice_line_items_invoice_center_fk"
		FOREIGN KEY ("invoice_id", "center_id")
		REFERENCES "invoices" ("id", "center_id")
		ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "invoice_line_items" ili
		JOIN "children" c ON c."id" = ili."child_id"
		WHERE ili."child_id" IS NOT NULL
			AND c."center_id" <> ili."center_id"
	) THEN
		RAISE EXCEPTION 'Cannot add invoice_line_items_child_center_fk: cross-center invoice line item child rows exist';
	END IF;

	ALTER TABLE "invoice_line_items"
		ADD CONSTRAINT "invoice_line_items_child_center_fk"
		FOREIGN KEY ("child_id", "center_id")
		REFERENCES "children" ("id", "center_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
