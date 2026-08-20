ALTER TABLE "ratio_violations" ADD COLUMN IF NOT EXISTS "staff_count" real;--> statement-breakpoint
ALTER TABLE "ratio_violations" ADD COLUMN IF NOT EXISTS "children_count" real;--> statement-breakpoint
ALTER TABLE "ratio_violations" ADD COLUMN IF NOT EXISTS "ratio_required" real;--> statement-breakpoint
ALTER TABLE "ratio_violations" ADD COLUMN IF NOT EXISTS "ratio_actual" real;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'ratio_violations_nonnegative_breach_values_check'
	) THEN
		ALTER TABLE ratio_violations
			ADD CONSTRAINT ratio_violations_nonnegative_breach_values_check
			CHECK (
				(staff_count IS NULL OR staff_count >= 0)
				AND (children_count IS NULL OR children_count >= 0)
				AND (ratio_required IS NULL OR ratio_required > 0)
				AND (ratio_actual IS NULL OR ratio_actual >= 0)
			);
	END IF;
END $$;
