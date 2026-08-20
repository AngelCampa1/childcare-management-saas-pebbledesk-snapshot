import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = resolve(import.meta.dirname, "../drizzle");
const snapshotBoundary = 15;
const journal = JSON.parse(readFileSync(resolve(drizzleDir, "meta/_journal.json"), "utf8")) as {
	entries: Array<{ idx: number; tag: string }>;
};
const journalMigrationFiles = journal.entries.map((entry) => `${entry.tag}.sql`);

describe("phase 7 quickbooks migration", () => {
	it("creates the quickbooks connection status enum before using it", () => {
		const migration = readFileSync(
			resolve(import.meta.dirname, "../drizzle/0005_phase7_quickbooks_manual_sync.sql"),
			"utf8",
		);

		expect(migration).toContain('CREATE TYPE "public"."qb_connection_status"');
	});
});

describe("drizzle migration journal", () => {
	it("includes every checked-in migration file in order", () => {
		const migrationFiles = readdirSync(drizzleDir)
			.filter((fileName) => fileName.endsWith(".sql"))
			.sort();

		expect(journalMigrationFiles).toEqual(migrationFiles);
	});

	it("keeps snapshot metadata complete through the last generated migration", () => {
		const snapshotFiles = readdirSync(resolve(drizzleDir, "meta"))
			.filter((fileName) => fileName.endsWith("_snapshot.json"))
			.sort();
		const generatedMigrationSnapshots = journal.entries
			.filter((entry) => entry.idx <= snapshotBoundary)
			.map((entry) => `${entry.idx.toString().padStart(4, "0")}_snapshot.json`);
		const manualSqlMigrations = journal.entries
			.filter((entry) => entry.idx > snapshotBoundary)
			.map((entry) => `${entry.tag}.sql`);

		expect(snapshotFiles).toEqual(generatedMigrationSnapshots);
		expect(manualSqlMigrations).toEqual([
			"0016_pricing_tiers.sql",
			"0017_trial_subscription_notifications.sql",
			"0018_guidance_progress.sql",
			"0019_repair_missing_production_relations.sql",
			"0020_child_guardians_center_scope.sql",
			"0021_task_d_schema_remediation.sql",
			`${["0022", "app", "signup", "email", "lifecycle"].join("_")}.sql`,
			"0023_trial_feature.sql",
			"0024_db_integrity_hardening.sql",
			"0025_repair_subscription_plan_trial.sql",
			"0026_invitation_tokens.sql",
			"0027_message_replies.sql",
			"0028_child_health_fields.sql",
			"0029_checkin_late_and_signatures.sql",
			"0030_subsidy_claim_period_unique.sql",
			"0031_ratio_violation_breach_fields.sql",
			"0032_email_based_invitations.sql",
			"0033_invoice_guardian_period_unique.sql",
			"0034_child_guardian_center_scope.sql",
			"0035_shift_schedule_center_scope.sql",
			"0036_staff_assignment_center_scope.sql",
			"0037_classroom_assignment_center_scope.sql",
			"0038_staff_check_in_center_scope.sql",
			"0039_check_in_center_scope.sql",
			"0040_subsidy_center_scope.sql",
			"0041_ratio_center_scope.sql",
			"0042_invoice_guardian_center_scope.sql",
			"0043_messaging_center_scope.sql",
			"0044_scheduling_center_scope.sql",
			"0045_quickbooks_center_scope.sql",
			"0046_guidance_audit_center_scope.sql",
			"0047_message_recipients_center_scope.sql",
			"0048_invoice_line_items_center_scope.sql",
			"0049_invoice_template_line_items_center_scope.sql",
			"0050_feedback_relations.sql",
			"0051_invoice_template_default_unique.sql",
			"0052_time_entry_hours_check.sql",
			"0053_shift_temporal_check.sql",
			"0054_subsidy_claim_amount_order_check.sql",
			"0055_schedule_date_order_check.sql",
			"0056_attendance_temporal_check.sql",
			"0057_assignment_date_order_check.sql",
			"0058_classroom_positive_values_check.sql",
			"0059_child_guardian_primary_unique.sql",
			"0060_invoice_guardian_restrict_delete.sql",
			"0061_membership_deactivation.sql",
			"0062_repair_membership_auth_columns.sql",
			"0063_ai_cs_escalations.sql",
			"0064_ai_cs_session_owners.sql",
			"0065_stripe_subscription_event_created_at.sql",
			"0066_shifts_no_overlap.sql",
			"0067_subsidy_claim_no_overlap.sql",
		]);
	});
});

describe("subscription plan trial repair migration", () => {
	const migration = readFileSync(
		resolve(import.meta.dirname, "../drizzle/0025_repair_subscription_plan_trial.sql"),
		"utf8",
	);

	it("adds the trial subscription plan only when it is missing", () => {
		expect(migration).toContain('ALTER TYPE "public"."subscription_plan" ADD VALUE \'trial\'');
		expect(migration).toContain("pg_enum");
		expect(migration).toContain("enumlabel = 'trial'");
	});

	it("repairs the trial feature usage relation when it is missing", () => {
		expect(migration).toContain('CREATE TABLE IF NOT EXISTS "trial_feature_usage"');
		expect(migration).toContain('"trial_feature_usage_center_id_feature_pk"');
		expect(migration).toContain('"trial_feature_usage_center_id_centers_id_fk"');
		expect(migration).toContain('REFERENCES "public"."centers"("id")');
	});
});

describe("invitation token migration", () => {
	const migration = readFileSync(
		resolve(import.meta.dirname, "../drizzle/0026_invitation_tokens.sql"),
		"utf8",
	);

	it("creates the unique invite token hash index declared in schema", () => {
		expect(migration).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "memberships_invite_token_hash_unique"',
		);
		expect(migration).toContain('"memberships" ("invite_token_hash")');
		expect(migration).toContain('WHERE "invite_token_hash" IS NOT NULL');
	});
});

describe("membership auth column repair migration", () => {
	const migration = readFileSync(
		resolve(import.meta.dirname, "../drizzle/0062_repair_membership_auth_columns.sql"),
		"utf8",
	);

	it("repairs membership columns used by auth reads when prior migrations are already journaled", () => {
		expect(migration).toContain(
			'ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_email" varchar(320)',
		);
		expect(migration).toContain(
			'ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_token_hash" varchar(128)',
		);
		expect(migration).toContain(
			'ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "invite_expires_at" timestamp with time zone',
		);
		expect(migration).toContain(
			'ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp with time zone',
		);
	});

	it("repairs membership indexes that depend on the auth-read columns", () => {
		expect(migration).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "memberships_invite_token_hash_unique"',
		);
		expect(migration).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "memberships_center_invite_email_unique"',
		);
		expect(migration).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "memberships_center_user_unique"',
		);
		expect(migration).toContain('WHERE "user_id" IS NOT NULL AND "deactivated_at" IS NULL');
	});

	it("only rebuilds the active membership uniqueness index when its predicate is wrong", () => {
		expect(migration).toContain("pg_get_expr(i.indpred, i.indrelid)");
		expect(migration).toContain("index_predicate IS DISTINCT FROM");
		expect(migration).toContain('DROP INDEX IF EXISTS "memberships_center_user_unique"');
		expect(migration).not.toMatch(/^DROP INDEX IF EXISTS "memberships_center_user_unique";$/m);
	});
});

describe("child guardians center scope migration", () => {
	const migration = readFileSync(
		resolve(import.meta.dirname, "../drizzle/0020_child_guardians_center_scope.sql"),
		"utf8",
	);

	it("backfills center_id from children before enforcing not null", () => {
		expect(migration).toContain('ADD COLUMN IF NOT EXISTS "center_id" uuid');
		expect(migration).toContain("UPDATE child_guardians");
		expect(migration).toContain("FROM children");
		expect(migration).toContain('ALTER COLUMN "center_id" SET NOT NULL');
	});

	it("fails fast if existing links cross centers", () => {
		expect(migration).toContain("cross-center child_guardians link");
		expect(migration).toContain("RAISE EXCEPTION");
	});
});

describe("db integrity hardening migration", () => {
	const migration = readFileSync(
		resolve(import.meta.dirname, "../drizzle/0024_db_integrity_hardening.sql"),
		"utf8",
	);

	it("fails fast if existing payments reference missing invoices", () => {
		const orphanPaymentPreflightIndex = migration.indexOf("orphan payment invoice rows exist");
		const paymentInvoiceFkIndex = migration.indexOf("ADD CONSTRAINT payments_invoice_center_fk");

		expect(migration).toContain("orphan payment invoice rows exist");
		expect(migration).toContain("NOT EXISTS");
		expect(migration).toContain("p.invoice_id");
		expect(orphanPaymentPreflightIndex).toBeGreaterThanOrEqual(0);
		expect(paymentInvoiceFkIndex).toBeGreaterThanOrEqual(0);
		expect(orphanPaymentPreflightIndex).toBeLessThan(paymentInvoiceFkIndex);
	});
});
