SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "subsidy_claims"
		WHERE ("amount_approved" IS NOT NULL AND "amount_approved" > "amount_claimed")
			OR (
				"amount_paid" IS NOT NULL
				AND ("amount_approved" IS NULL OR "amount_paid" > "amount_approved")
			)
	) THEN
		RAISE EXCEPTION 'Cannot add subsidy_claims_amount_order_check: invalid subsidy claim amount ordering exists';
	END IF;
END $$;

ALTER TABLE "subsidy_claims"
	DROP CONSTRAINT IF EXISTS "subsidy_claims_amount_order_check";

ALTER TABLE "subsidy_claims"
	ADD CONSTRAINT "subsidy_claims_amount_order_check"
	CHECK (
		("amount_approved" IS NULL OR "amount_approved" <= "amount_claimed")
		AND (
			"amount_paid" IS NULL
			OR ("amount_approved" IS NOT NULL AND "amount_paid" <= "amount_approved")
		)
	);
