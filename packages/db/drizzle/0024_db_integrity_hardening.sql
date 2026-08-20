SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM invoices
		WHERE subtotal < 0 OR subsidy_credit < 0 OR amount_due < 0
	) THEN
		RAISE EXCEPTION 'Cannot add invoices_amounts_nonnegative_check: negative invoice amounts exist';
	END IF;

	ALTER TABLE invoices
		ADD CONSTRAINT invoices_amounts_nonnegative_check
		CHECK (subtotal >= 0 AND subsidy_credit >= 0 AND amount_due >= 0);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM invoices WHERE period_start > period_end) THEN
		RAISE EXCEPTION 'Cannot add invoices_period_order_check: inverted invoice periods exist';
	END IF;

	ALTER TABLE invoices
		ADD CONSTRAINT invoices_period_order_check
		CHECK (period_start <= period_end);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE invoices
		ADD CONSTRAINT invoices_public_link_version_positive_check
		CHECK (public_link_version > 0);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM invoice_line_items WHERE quantity <= 0 OR unit_price < 0 OR amount < 0) THEN
		RAISE EXCEPTION 'Cannot add invoice_line_items_money_quantity_check: invalid invoice line item amounts exist';
	END IF;

	ALTER TABLE invoice_line_items
		ADD CONSTRAINT invoice_line_items_money_quantity_check
		CHECK (quantity > 0 AND unit_price >= 0 AND amount >= 0);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE invoice_templates
		ADD CONSTRAINT invoice_templates_due_days_nonnegative_check
		CHECK (due_days >= 0);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE invoice_template_line_items
		ADD CONSTRAINT invoice_template_line_items_money_quantity_check
		CHECK (quantity > 0 AND unit_price >= 0 AND amount >= 0);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM payments WHERE amount < 0) THEN
		RAISE EXCEPTION 'Cannot add payments_amount_nonnegative_check: negative payment amounts exist';
	END IF;

	ALTER TABLE payments
		ADD CONSTRAINT payments_amount_nonnegative_check
		CHECK (amount >= 0);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE invoices
		ADD CONSTRAINT invoices_id_center_unique
		UNIQUE (id, center_id);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM payments p
		WHERE NOT EXISTS (
			SELECT 1
			FROM invoices i
			WHERE i.id = p.invoice_id
		)
	) THEN
		RAISE EXCEPTION 'Cannot add payments_invoice_center_fk: orphan payment invoice rows exist';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM payments p
		JOIN invoices i ON i.id = p.invoice_id
		WHERE p.center_id <> i.center_id
	) THEN
		RAISE EXCEPTION 'Cannot add payments_invoice_center_fk: cross-center payment/invoice rows exist';
	END IF;

	ALTER TABLE payments
		ADD CONSTRAINT payments_invoice_center_fk
		FOREIGN KEY (invoice_id, center_id)
		REFERENCES invoices (id, center_id)
		ON DELETE CASCADE;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE subsidy_cases
		ADD CONSTRAINT subsidy_cases_nonnegative_authorization_check
		CHECK (
			(authorized_hours_weekly IS NULL OR authorized_hours_weekly >= 0)
			AND (rate_daily IS NULL OR rate_daily >= 0)
			AND (rate_weekly IS NULL OR rate_weekly >= 0)
		);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE subsidy_cases
		ADD CONSTRAINT subsidy_cases_effective_expiration_order_check
		CHECK (expiration_date IS NULL OR effective_date <= expiration_date);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM subsidy_claims
		WHERE days_attended < 0
			OR hours_attended < 0
			OR amount_claimed < 0
			OR amount_approved < 0
			OR amount_paid < 0
	) THEN
		RAISE EXCEPTION 'Cannot add subsidy_claims_nonnegative_amounts_check: negative subsidy claim values exist';
	END IF;

	ALTER TABLE subsidy_claims
		ADD CONSTRAINT subsidy_claims_nonnegative_amounts_check
		CHECK (
			days_attended >= 0
			AND hours_attended >= 0
			AND amount_claimed >= 0
			AND (amount_approved IS NULL OR amount_approved >= 0)
			AND (amount_paid IS NULL OR amount_paid >= 0)
		);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM subsidy_claims WHERE period_start > period_end) THEN
		RAISE EXCEPTION 'Cannot add subsidy_claims_period_order_check: inverted subsidy claim periods exist';
	END IF;

	ALTER TABLE subsidy_claims
		ADD CONSTRAINT subsidy_claims_period_order_check
		CHECK (period_start <= period_end);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM ratio_snapshots
		WHERE staff_count < 0
			OR children_count < 0
			OR staff_count + children_count <= 0
			OR ratio_required <= 0
			OR ratio_actual < 0
	) THEN
		RAISE EXCEPTION 'Cannot add ratio_snapshots_nonnegative_counts_check: invalid ratio snapshot counts exist';
	END IF;

	ALTER TABLE ratio_snapshots
		ADD CONSTRAINT ratio_snapshots_nonnegative_counts_check
		CHECK (
			staff_count >= 0
			AND children_count >= 0
			AND staff_count + children_count > 0
			AND ratio_required > 0
			AND ratio_actual >= 0
		);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	ALTER TABLE ratio_violations
		ADD CONSTRAINT ratio_violations_resolved_after_detected_check
		CHECK (resolved_at IS NULL OR resolved_at >= detected_at);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
