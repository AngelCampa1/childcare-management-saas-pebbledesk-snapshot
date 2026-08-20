SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'centers'
			AND column_name = 'licensed_capacity'
			AND data_type = 'boolean'
	) THEN
		ALTER TABLE "centers"
			ALTER COLUMN "licensed_capacity" TYPE integer
			USING CASE
				WHEN "licensed_capacity" IS TRUE THEN 1
				ELSE NULL
			END;
	END IF;
END $$;
