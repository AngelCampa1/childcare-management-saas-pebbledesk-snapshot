SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- Guard: refuse to add the exclusion constraint if existing data already
-- contains overlapping shifts for the same center/schedule/staff/day. Overlap
-- uses half-open [start, end) semantics (touching endpoints do NOT overlap),
-- matching the application-level check in apps/api/src/routes/shifts.ts.
--
-- The time range is modelled as a numrange over minutes-since-midnight derived
-- from the "HH:MM" text columns. We deliberately avoid casting text to
-- timestamp/time, because those casts are STABLE (DateStyle-dependent) and
-- Postgres rejects non-IMMUTABLE functions inside an index/constraint
-- expression. substr + integer cast + numrange are all IMMUTABLE, so the GiST
-- exclusion constraint can be built. numrange defaults to '[)' which gives the
-- same half-open overlap semantics as the application check.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "shifts" a
		JOIN "shifts" b
			ON a."center_id" = b."center_id"
			AND a."schedule_id" = b."schedule_id"
			AND a."membership_id" = b."membership_id"
			AND a."day_of_week" = b."day_of_week"
			AND a."id" < b."id"
			AND numrange(
				(substr(a."start_time", 1, 2)::integer * 60 + substr(a."start_time", 4, 2)::integer),
				(substr(a."end_time", 1, 2)::integer * 60 + substr(a."end_time", 4, 2)::integer)
			) && numrange(
				(substr(b."start_time", 1, 2)::integer * 60 + substr(b."start_time", 4, 2)::integer),
				(substr(b."end_time", 1, 2)::integer * 60 + substr(b."end_time", 4, 2)::integer)
			)
	) THEN
		RAISE EXCEPTION 'Cannot add shifts_no_overlap: overlapping shifts already exist';
	END IF;
END $$;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist";
--> statement-breakpoint
ALTER TABLE "shifts"
	DROP CONSTRAINT IF EXISTS "shifts_no_overlap";
--> statement-breakpoint
ALTER TABLE "shifts"
	ADD CONSTRAINT "shifts_no_overlap"
	EXCLUDE USING gist (
		"center_id" WITH =,
		"schedule_id" WITH =,
		"membership_id" WITH =,
		"day_of_week" WITH =,
		(numrange(
			(substr("start_time", 1, 2)::integer * 60 + substr("start_time", 4, 2)::integer),
			(substr("end_time", 1, 2)::integer * 60 + substr("end_time", 4, 2)::integer)
		)) WITH &&
	);
