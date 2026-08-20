-- Add indexes on center_id columns and key FKs across all tenanted tables.
-- Using IF NOT EXISTS to make this idempotent.

-- billing
CREATE INDEX IF NOT EXISTS invoices_center_id_idx ON invoices (center_id);
CREATE INDEX IF NOT EXISTS invoices_guardian_id_idx ON invoices (guardian_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_id_idx ON invoice_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_templates_center_id_idx ON invoice_templates (center_id);
CREATE INDEX IF NOT EXISTS payments_center_id_idx ON payments (center_id);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS payments_provider_tx_id_idx ON payments (provider_transaction_id);

-- children
CREATE INDEX IF NOT EXISTS children_center_id_idx ON children (center_id);

-- classrooms
CREATE INDEX IF NOT EXISTS classrooms_center_id_idx ON classrooms (center_id);
CREATE INDEX IF NOT EXISTS classrooms_center_active_idx ON classrooms (center_id, archived_at);

-- classroom_assignments
CREATE INDEX IF NOT EXISTS classroom_assignments_center_id_idx ON classroom_assignments (center_id);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_classroom_per_child ON classroom_assignments (child_id) WHERE end_date IS NULL;

-- staff_assignments
CREATE INDEX IF NOT EXISTS staff_assignments_center_id_idx ON staff_assignments (center_id);

-- attendance
CREATE INDEX IF NOT EXISTS check_ins_center_id_idx ON check_ins (center_id);
CREATE INDEX IF NOT EXISTS check_ins_child_id_idx ON check_ins (child_id);
CREATE INDEX IF NOT EXISTS check_ins_checked_in_at_idx ON check_ins (checked_in_at);
CREATE INDEX IF NOT EXISTS staff_check_ins_center_id_idx ON staff_check_ins (center_id);

-- memberships
CREATE INDEX IF NOT EXISTS memberships_center_id_idx ON memberships (center_id);

-- audit
CREATE INDEX IF NOT EXISTS audit_reports_center_id_idx ON audit_reports (center_id);
CREATE INDEX IF NOT EXISTS audit_log_center_id_idx ON audit_log (center_id);
CREATE INDEX IF NOT EXISTS audit_log_entity_id_idx ON audit_log (entity_id);

-- messaging
CREATE INDEX IF NOT EXISTS messages_center_id_idx ON messages (center_id);

-- ratios
CREATE INDEX IF NOT EXISTS ratio_snapshots_center_id_idx ON ratio_snapshots (center_id);
CREATE INDEX IF NOT EXISTS ratio_violations_center_id_idx ON ratio_violations (center_id);

-- scheduling
CREATE INDEX IF NOT EXISTS schedules_center_id_idx ON schedules (center_id);
CREATE INDEX IF NOT EXISTS shifts_center_id_idx ON shifts (center_id);
CREATE INDEX IF NOT EXISTS time_entries_center_id_idx ON time_entries (center_id);

-- subsidies
CREATE INDEX IF NOT EXISTS subsidy_cases_center_id_idx ON subsidy_cases (center_id);
CREATE INDEX IF NOT EXISTS subsidy_claims_center_id_idx ON subsidy_claims (center_id);

-- feedback
CREATE INDEX IF NOT EXISTS feedback_center_id_idx ON feedback (center_id);

-- guardians
CREATE INDEX IF NOT EXISTS guardians_center_id_idx ON guardians (center_id);

-- billing (invoice_template_line_items)
CREATE INDEX IF NOT EXISTS invoice_template_line_items_template_id_idx ON invoice_template_line_items (invoice_template_id);
