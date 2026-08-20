WITH ranked_defaults AS (
	SELECT
		id,
		row_number() OVER (
			PARTITION BY center_id
			ORDER BY updated_at DESC, created_at DESC, id DESC
		) AS row_number
	FROM invoice_templates
	WHERE is_default = true
)
UPDATE invoice_templates
SET is_default = false, updated_at = now()
FROM ranked_defaults
WHERE invoice_templates.id = ranked_defaults.id
	AND ranked_defaults.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_templates_center_default_unique"
	ON "invoice_templates" ("center_id")
	WHERE "is_default" = true;
