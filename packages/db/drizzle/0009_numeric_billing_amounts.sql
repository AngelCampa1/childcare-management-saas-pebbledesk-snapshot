-- Convert monetary columns from real (float) to numeric(12,2).
-- Uses the safe add-new-column + backfill + drop-old approach to avoid
-- ACCESS EXCLUSIVE table rewrites and silent precision loss.

BEGIN;

SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- invoices.subtotal
ALTER TABLE invoices RENAME COLUMN subtotal TO subtotal_old;
ALTER TABLE invoices ADD COLUMN subtotal numeric(12,2);
UPDATE invoices SET subtotal = ROUND(subtotal_old::numeric, 2) WHERE subtotal_old IS NOT NULL;
ALTER TABLE invoices ALTER COLUMN subtotal SET NOT NULL;
ALTER TABLE invoices DROP COLUMN subtotal_old;

-- invoices.subsidy_credit
ALTER TABLE invoices RENAME COLUMN subsidy_credit TO subsidy_credit_old;
ALTER TABLE invoices ADD COLUMN subsidy_credit numeric(12,2);
UPDATE invoices SET subsidy_credit = ROUND(subsidy_credit_old::numeric, 2) WHERE subsidy_credit_old IS NOT NULL;
ALTER TABLE invoices DROP COLUMN subsidy_credit_old;

-- invoices.amount_due
ALTER TABLE invoices RENAME COLUMN amount_due TO amount_due_old;
ALTER TABLE invoices ADD COLUMN amount_due numeric(12,2);
UPDATE invoices SET amount_due = ROUND(amount_due_old::numeric, 2) WHERE amount_due_old IS NOT NULL;
ALTER TABLE invoices ALTER COLUMN amount_due SET NOT NULL;
ALTER TABLE invoices DROP COLUMN amount_due_old;

-- invoice_line_items.unit_price
ALTER TABLE invoice_line_items RENAME COLUMN unit_price TO unit_price_old;
ALTER TABLE invoice_line_items ADD COLUMN unit_price numeric(12,2);
UPDATE invoice_line_items SET unit_price = ROUND(unit_price_old::numeric, 2) WHERE unit_price_old IS NOT NULL;
ALTER TABLE invoice_line_items ALTER COLUMN unit_price SET NOT NULL;
ALTER TABLE invoice_line_items DROP COLUMN unit_price_old;

-- invoice_line_items.amount
ALTER TABLE invoice_line_items RENAME COLUMN amount TO amount_old;
ALTER TABLE invoice_line_items ADD COLUMN amount numeric(12,2);
UPDATE invoice_line_items SET amount = ROUND(amount_old::numeric, 2) WHERE amount_old IS NOT NULL;
ALTER TABLE invoice_line_items ALTER COLUMN amount SET NOT NULL;
ALTER TABLE invoice_line_items DROP COLUMN amount_old;

-- invoice_template_line_items.unit_price
ALTER TABLE invoice_template_line_items RENAME COLUMN unit_price TO unit_price_old;
ALTER TABLE invoice_template_line_items ADD COLUMN unit_price numeric(12,2);
UPDATE invoice_template_line_items SET unit_price = ROUND(unit_price_old::numeric, 2) WHERE unit_price_old IS NOT NULL;
ALTER TABLE invoice_template_line_items ALTER COLUMN unit_price SET NOT NULL;
ALTER TABLE invoice_template_line_items DROP COLUMN unit_price_old;

-- invoice_template_line_items.amount
ALTER TABLE invoice_template_line_items RENAME COLUMN amount TO amount_old;
ALTER TABLE invoice_template_line_items ADD COLUMN amount numeric(12,2);
UPDATE invoice_template_line_items SET amount = ROUND(amount_old::numeric, 2) WHERE amount_old IS NOT NULL;
ALTER TABLE invoice_template_line_items ALTER COLUMN amount SET NOT NULL;
ALTER TABLE invoice_template_line_items DROP COLUMN amount_old;

-- payments.amount
ALTER TABLE payments RENAME COLUMN amount TO amount_old;
ALTER TABLE payments ADD COLUMN amount numeric(12,2);
UPDATE payments SET amount = ROUND(amount_old::numeric, 2) WHERE amount_old IS NOT NULL;
ALTER TABLE payments ALTER COLUMN amount SET NOT NULL;
ALTER TABLE payments DROP COLUMN amount_old;

COMMIT;
