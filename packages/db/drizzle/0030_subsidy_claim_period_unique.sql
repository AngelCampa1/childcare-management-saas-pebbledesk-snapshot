CREATE UNIQUE INDEX IF NOT EXISTS "subsidy_claims_case_period_unique"
	ON "subsidy_claims" USING btree ("subsidy_case_id", "period_start", "period_end");
