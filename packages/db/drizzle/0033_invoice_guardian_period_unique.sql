CREATE UNIQUE INDEX IF NOT EXISTS "invoices_center_guardian_period_unique"
ON "invoices" ("center_id", "guardian_id", "period_start", "period_end");
