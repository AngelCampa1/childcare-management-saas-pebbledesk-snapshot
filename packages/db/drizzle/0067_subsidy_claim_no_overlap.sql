SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- Guard: refuse to add the exclusion constraint if existing data already
-- contains overlapping claim periods for the same center/subsidy-case. Periods
-- are INCLUSIVE on both ends ([period_start, period_end]), matching the schema
-- check (period_start <= period_end) and the application-level overlap check in
-- apps/api/src/routes/subsidy-claims.ts.
--
-- The period is modelled as a daterange with inclusive bounds ('[]'). The dates
-- are built with make_date() from the "YYYY-MM-DD" text columns rather than a
-- text::date cast, because that cast is STABLE (DateStyle-dependent) and
-- Postgres rejects non-IMMUTABLE functions inside an index/constraint
-- expression. substr + integer cast + make_date + daterange are all IMMUTABLE.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "subsidy_claims" a
		JOIN "subsidy_claims" b
			ON a."center_id" = b."center_id"
			AND a."subsidy_case_id" = b."subsidy_case_id"
			AND a."id" < b."id"
			AND daterange(
				make_date(substr(a."period_start", 1, 4)::integer, substr(a."period_start", 6, 2)::integer, substr(a."period_start", 9, 2)::integer),
				make_date(substr(a."period_end", 1, 4)::integer, substr(a."period_end", 6, 2)::integer, substr(a."period_end", 9, 2)::integer),
				'[]'
			) && daterange(
				make_date(substr(b."period_start", 1, 4)::integer, substr(b."period_start", 6, 2)::integer, substr(b."period_start", 9, 2)::integer),
				make_date(substr(b."period_end", 1, 4)::integer, substr(b."period_end", 6, 2)::integer, substr(b."period_end", 9, 2)::integer),
				'[]'
			)
	) THEN
		RAISE EXCEPTION 'Cannot add subsidy_claims_no_overlap: overlapping claim periods already exist';
	END IF;
END $$;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";
--> statement-breakpoint
ALTER TABLE "subsidy_claims"
	DROP CONSTRAINT IF EXISTS "subsidy_claims_no_overlap";
--> statement-breakpoint
ALTER TABLE "subsidy_claims"
	ADD CONSTRAINT "subsidy_claims_no_overlap"
	EXCLUDE USING gist (
		"center_id" WITH =,
		"subsidy_case_id" WITH =,
		(daterange(
			make_date(substr("period_start", 1, 4)::integer, substr("period_start", 6, 2)::integer, substr("period_start", 9, 2)::integer),
			make_date(substr("period_end", 1, 4)::integer, substr("period_end", 6, 2)::integer, substr("period_end", 9, 2)::integer),
			'[]'
		)) WITH &&
	);
