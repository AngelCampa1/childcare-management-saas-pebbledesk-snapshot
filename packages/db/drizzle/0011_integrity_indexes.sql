BEGIN;
SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- Memberships: one membership per user per center
-- No status column exists; the table tracks invite state via invited_at/accepted_at timestamps.
-- A full unscoped unique index is correct — duplicate rows for any state are invalid.
CREATE UNIQUE INDEX IF NOT EXISTS memberships_center_user_unique
  ON memberships (center_id, user_id);

-- Check-ins: only one open check-in per child at a time
CREATE UNIQUE INDEX IF NOT EXISTS check_ins_child_open_unique
  ON check_ins (child_id)
  WHERE checked_out_at IS NULL;

-- Staff check-ins: only one active clock-in per membership at a time
-- The table uses membership_id (not user_id) as the per-staff identifier.
CREATE UNIQUE INDEX IF NOT EXISTS staff_check_ins_membership_open_unique
  ON staff_check_ins (membership_id)
  WHERE clocked_out_at IS NULL;

-- Ratio violations: only one open violation per classroom at a time
CREATE UNIQUE INDEX IF NOT EXISTS ratio_violations_classroom_open_unique
  ON ratio_violations (classroom_id)
  WHERE resolved_at IS NULL;

-- Guardians: one guardian email per center (case-insensitive)
-- email is nullable; NULLs are excluded from unique indexes by default in Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS guardians_center_email_unique
  ON guardians (center_id, lower(email))
  WHERE email IS NOT NULL;

COMMIT;
