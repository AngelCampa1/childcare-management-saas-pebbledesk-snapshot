import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	auditReports,
	checkIns,
	childGuardians,
	children,
	classroomAssignments,
	classrooms,
	feedback,
	guardians,
	guidanceProgress,
	invoiceLineItems,
	invoices,
	invoiceTemplateLineItems,
	invoiceTemplates,
	memberships,
	messageRecipients,
	messageReplies,
	messages,
	payments,
	quickbooksConnections,
	quickbooksEntityLinks,
	quickbooksReconciliationItems,
	quickbooksSyncLog,
	ratioSnapshots,
	ratioViolations,
	schedules,
	shifts,
	staffAssignments,
	staffCheckIns,
	subsidyCases,
	subsidyClaims,
	timeEntries,
} from "../src/schema/index.js";

const migrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0011_integrity_indexes.sql"),
	"utf8",
);
const integrityHardeningMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0024_db_integrity_hardening.sql"),
	"utf8",
);
const subsidyClaimPeriodUniqueMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0030_subsidy_claim_period_unique.sql"),
	"utf8",
);
const ratioViolationBreachFieldsMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0031_ratio_violation_breach_fields.sql"),
	"utf8",
);
const emailBasedInvitationsMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0032_email_based_invitations.sql"),
	"utf8",
);
const invoiceGuardianPeriodUniqueMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0033_invoice_guardian_period_unique.sql"),
	"utf8",
);
const childGuardianCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0034_child_guardian_center_scope.sql"),
	"utf8",
);
const shiftScheduleCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0035_shift_schedule_center_scope.sql"),
	"utf8",
);
const staffAssignmentCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0036_staff_assignment_center_scope.sql"),
	"utf8",
);
const classroomAssignmentCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0037_classroom_assignment_center_scope.sql"),
	"utf8",
);
const staffCheckInCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0038_staff_check_in_center_scope.sql"),
	"utf8",
);
const checkInCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0039_check_in_center_scope.sql"),
	"utf8",
);
const subsidyCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0040_subsidy_center_scope.sql"),
	"utf8",
);
const ratioCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0041_ratio_center_scope.sql"),
	"utf8",
);
const invoiceGuardianCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0042_invoice_guardian_center_scope.sql"),
	"utf8",
);
const messagingCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0043_messaging_center_scope.sql"),
	"utf8",
);
const schedulingCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0044_scheduling_center_scope.sql"),
	"utf8",
);
const quickbooksCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0045_quickbooks_center_scope.sql"),
	"utf8",
);
const guidanceAuditCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0046_guidance_audit_center_scope.sql"),
	"utf8",
);
const messageRecipientsCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0047_message_recipients_center_scope.sql"),
	"utf8",
);
const invoiceLineItemsCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0048_invoice_line_items_center_scope.sql"),
	"utf8",
);
const invoiceTemplateLineItemsCenterScopeMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0049_invoice_template_line_items_center_scope.sql"),
	"utf8",
);
const feedbackRelationsMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0050_feedback_relations.sql"),
	"utf8",
);
const invoiceTemplateDefaultUniqueMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0051_invoice_template_default_unique.sql"),
	"utf8",
);
const timeEntryHoursCheckMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0052_time_entry_hours_check.sql"),
	"utf8",
);
const shiftTemporalCheckMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0053_shift_temporal_check.sql"),
	"utf8",
);
const subsidyClaimAmountOrderMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0054_subsidy_claim_amount_order_check.sql"),
	"utf8",
);
const scheduleDateOrderMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0055_schedule_date_order_check.sql"),
	"utf8",
);
const attendanceTemporalCheckMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0056_attendance_temporal_check.sql"),
	"utf8",
);
const assignmentDateOrderCheckMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0057_assignment_date_order_check.sql"),
	"utf8",
);
const classroomPositiveValuesCheckMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0058_classroom_positive_values_check.sql"),
	"utf8",
);
const childGuardianPrimaryUniqueMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0059_child_guardian_primary_unique.sql"),
	"utf8",
);
const invoiceGuardianRestrictMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0060_invoice_guardian_restrict_delete.sql"),
	"utf8",
);
const membershipDeactivationMigrationSql = readFileSync(
	resolve(import.meta.dirname, "../drizzle/0061_membership_deactivation.sql"),
	"utf8",
);

function getIndexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
	return getTableConfig(table).indexes.map((idx) => idx.config.name ?? "");
}

function collectStringValues(value: unknown, seen = new WeakSet<object>()): string[] {
	if (typeof value === "string") return [value];
	if (!value || typeof value !== "object" || seen.has(value)) return [];
	seen.add(value);

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectStringValues(item, seen));
	}

	return Object.values(value).flatMap((item) => collectStringValues(item, seen));
}

function getCheckNames(table: Parameters<typeof getTableConfig>[0]): string[] {
	return getTableConfig(table).checks.map((constraint) => constraint.name);
}

function getForeignKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
	return getTableConfig(table).foreignKeys.map((foreignKey) => foreignKey.getName());
}

function getUniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
	return getTableConfig(table).uniqueConstraints.map((constraint) => constraint.name);
}

describe("migration 0024 SQL", () => {
	it("adds idempotent check constraints for billing money and count values", () => {
		expect(integrityHardeningMigrationSql).toContain(
			"Cannot add invoices_amounts_nonnegative_check: negative invoice amounts exist",
		);
		expect(integrityHardeningMigrationSql).toContain(
			"ADD CONSTRAINT invoices_amounts_nonnegative_check",
		);
		expect(integrityHardeningMigrationSql).toContain(
			"subtotal >= 0 AND subsidy_credit >= 0 AND amount_due >= 0",
		);
		expect(integrityHardeningMigrationSql).toContain(
			"ADD CONSTRAINT invoice_line_items_money_quantity_check",
		);
		expect(integrityHardeningMigrationSql).toContain(
			"quantity > 0 AND unit_price >= 0 AND amount >= 0",
		);
		expect(integrityHardeningMigrationSql).toContain(
			"ADD CONSTRAINT payments_amount_nonnegative_check",
		);
		expect(integrityHardeningMigrationSql).toContain("amount >= 0");
	});

	it("adds idempotent check constraints for valid billing periods and due-day counts", () => {
		expect(integrityHardeningMigrationSql).toContain(
			"Cannot add invoices_period_order_check: inverted invoice periods exist",
		);
		expect(integrityHardeningMigrationSql).toContain("ADD CONSTRAINT invoices_period_order_check");
		expect(integrityHardeningMigrationSql).toContain("period_start <= period_end");
		expect(integrityHardeningMigrationSql).toContain(
			"ADD CONSTRAINT invoice_templates_due_days_nonnegative_check",
		);
		expect(integrityHardeningMigrationSql).toContain("due_days >= 0");
	});

	it("adds a center-scoped payment to invoice foreign key after preflight", () => {
		expect(integrityHardeningMigrationSql).toContain("ADD CONSTRAINT invoices_id_center_unique");
		expect(integrityHardeningMigrationSql).toContain("UNIQUE (id, center_id)");
		expect(integrityHardeningMigrationSql).toContain(
			"Cannot add payments_invoice_center_fk: cross-center payment/invoice rows exist",
		);
		expect(integrityHardeningMigrationSql).toContain("ADD CONSTRAINT payments_invoice_center_fk");
		expect(integrityHardeningMigrationSql).toContain("FOREIGN KEY (invoice_id, center_id)");
		expect(integrityHardeningMigrationSql).toContain("REFERENCES invoices (id, center_id)");
	});

	it("adds idempotent check constraints for subsidy money, count, and period values", () => {
		expect(integrityHardeningMigrationSql).toContain(
			"ADD CONSTRAINT subsidy_cases_nonnegative_authorization_check",
		);
		expect(integrityHardeningMigrationSql).toContain(
			"authorized_hours_weekly IS NULL OR authorized_hours_weekly >= 0",
		);
		expect(integrityHardeningMigrationSql).toContain(
			"ADD CONSTRAINT subsidy_claims_nonnegative_amounts_check",
		);
		expect(integrityHardeningMigrationSql).toContain("days_attended >= 0");
		expect(integrityHardeningMigrationSql).toContain("hours_attended >= 0");
		expect(integrityHardeningMigrationSql).toContain("amount_claimed >= 0");
		expect(integrityHardeningMigrationSql).toContain(
			"ADD CONSTRAINT subsidy_claims_period_order_check",
		);
		expect(integrityHardeningMigrationSql).toContain("period_start <= period_end");
	});

	it("adds idempotent check constraints for nonnegative ratio snapshot counts", () => {
		expect(integrityHardeningMigrationSql).toContain(
			"Cannot add ratio_snapshots_nonnegative_counts_check: invalid ratio snapshot counts exist",
		);
		expect(integrityHardeningMigrationSql).toContain(
			"ADD CONSTRAINT ratio_snapshots_nonnegative_counts_check",
		);
		expect(integrityHardeningMigrationSql).toContain("staff_count >= 0");
		expect(integrityHardeningMigrationSql).toContain("children_count >= 0");
		expect(integrityHardeningMigrationSql).toContain("staff_count + children_count > 0");
		expect(integrityHardeningMigrationSql).toContain("ratio_required > 0");
		expect(integrityHardeningMigrationSql).toContain("ratio_actual >= 0");
	});
});

describe("migration 0011 SQL", () => {
	it("sets lock_timeout and statement_timeout", () => {
		expect(migrationSql).toContain("SET lock_timeout = '5s'");
		expect(migrationSql).toContain("SET statement_timeout = '120s'");
	});

	it("creates memberships_center_user_unique index", () => {
		expect(migrationSql).toContain(
			"CREATE UNIQUE INDEX IF NOT EXISTS memberships_center_user_unique",
		);
		expect(migrationSql).toContain("ON memberships (center_id, user_id)");
	});

	it("creates check_ins_child_open_unique partial index on checked_out_at IS NULL", () => {
		expect(migrationSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS check_ins_child_open_unique");
		expect(migrationSql).toContain("ON check_ins (child_id)");
		expect(migrationSql).toMatch(/WHERE checked_out_at IS NULL/);
	});

	it("creates staff_check_ins_membership_open_unique partial index on clocked_out_at IS NULL", () => {
		expect(migrationSql).toContain(
			"CREATE UNIQUE INDEX IF NOT EXISTS staff_check_ins_membership_open_unique",
		);
		expect(migrationSql).toContain("ON staff_check_ins (membership_id)");
		expect(migrationSql).toMatch(/WHERE clocked_out_at IS NULL/);
	});

	it("creates ratio_violations_classroom_open_unique partial index on resolved_at IS NULL", () => {
		expect(migrationSql).toContain(
			"CREATE UNIQUE INDEX IF NOT EXISTS ratio_violations_classroom_open_unique",
		);
		expect(migrationSql).toContain("ON ratio_violations (classroom_id)");
		expect(migrationSql).toMatch(/WHERE resolved_at IS NULL/);
	});

	it("creates guardians_center_email_unique case-insensitive partial index", () => {
		expect(migrationSql).toContain(
			"CREATE UNIQUE INDEX IF NOT EXISTS guardians_center_email_unique",
		);
		expect(migrationSql).toContain("ON guardians (center_id, lower(email))");
		expect(migrationSql).toMatch(/WHERE email IS NOT NULL/);
	});

	it("uses IF NOT EXISTS on every index so re-runs are safe", () => {
		const matches = migrationSql.match(/CREATE UNIQUE INDEX IF NOT EXISTS/g);
		expect(matches).toHaveLength(5);
	});
});

describe("billing integrity checks", () => {
	it("declares nonnegative invoice amounts and ordered invoice periods", () => {
		expect(getCheckNames(invoices)).toEqual(
			expect.arrayContaining([
				"invoices_amounts_nonnegative_check",
				"invoices_period_order_check",
				"invoices_public_link_version_positive_check",
			]),
		);
	});

	it("declares positive line item quantities and nonnegative line item amounts", () => {
		expect(getCheckNames(invoiceLineItems)).toContain("invoice_line_items_money_quantity_check");
		expect(getCheckNames(invoiceTemplateLineItems)).toContain(
			"invoice_template_line_items_money_quantity_check",
		);
	});

	it("declares center-scoped invoice line item relationship foreign keys", () => {
		expect(invoiceLineItems.centerId.name).toBe("center_id");
		expect(getForeignKeyNames(invoiceLineItems)).toEqual(
			expect.arrayContaining([
				"invoice_line_items_invoice_center_fk",
				"invoice_line_items_child_center_fk",
			]),
		);
	});

	it("declares center-scoped invoice template line item relationship foreign keys", () => {
		expect(invoiceTemplateLineItems.centerId.name).toBe("center_id");
		expect(getForeignKeyNames(invoiceTemplateLineItems)).toContain(
			"invoice_template_line_items_template_center_fk",
		);
	});

	it("declares nonnegative template due days and nonnegative payment amounts", () => {
		expect(getCheckNames(invoiceTemplates)).toContain(
			"invoice_templates_due_days_nonnegative_check",
		);
		expect(getCheckNames(payments)).toContain("payments_amount_nonnegative_check");
	});

	it("declares a unique invoice period per guardian", () => {
		expect(getIndexNames(invoices)).toContain("invoices_center_guardian_period_unique");
	});

	it("declares one default invoice template per center", () => {
		expect(getIndexNames(invoiceTemplates)).toContain("invoice_templates_center_default_unique");
	});

	it("ships the default invoice template unique index migration", () => {
		expect(invoiceTemplateDefaultUniqueMigrationSql).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "invoice_templates_center_default_unique"',
		);
		expect(invoiceTemplateDefaultUniqueMigrationSql).toContain('WHERE "is_default" = true');
	});

	it("ships the guardian invoice period unique index migration", () => {
		expect(invoiceGuardianPeriodUniqueMigrationSql).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "invoices_center_guardian_period_unique"',
		);
		expect(invoiceGuardianPeriodUniqueMigrationSql).toContain(
			'"center_id", "guardian_id", "period_start", "period_end"',
		);
	});

	it("ships the invoice line items center-scope migration with backfill and preflight checks", () => {
		expect(invoiceLineItemsCenterScopeMigrationSql).toContain(
			'ADD COLUMN IF NOT EXISTS "center_id" uuid',
		);
		expect(invoiceLineItemsCenterScopeMigrationSql).toContain('UPDATE "invoice_line_items" ili');
		expect(invoiceLineItemsCenterScopeMigrationSql).toContain(
			"Cannot add invoice_line_items_invoice_center_fk: cross-center invoice line item invoice rows exist",
		);
		expect(invoiceLineItemsCenterScopeMigrationSql).toContain(
			"Cannot add invoice_line_items_child_center_fk: cross-center invoice line item child rows exist",
		);
		expect(invoiceLineItemsCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "invoice_line_items_invoice_center_fk"',
		);
		expect(invoiceLineItemsCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "invoice_line_items_child_center_fk"',
		);
	});

	it("ships the invoice template line items center-scope migration with backfill and preflight checks", () => {
		expect(invoiceTemplateLineItemsCenterScopeMigrationSql).toContain(
			'ADD COLUMN IF NOT EXISTS "center_id" uuid',
		);
		expect(invoiceTemplateLineItemsCenterScopeMigrationSql).toContain(
			'UPDATE "invoice_template_line_items" itli',
		);
		expect(invoiceTemplateLineItemsCenterScopeMigrationSql).toContain(
			"Cannot add invoice_template_line_items_template_center_fk: cross-center invoice template line item rows exist",
		);
		expect(invoiceTemplateLineItemsCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "invoice_template_line_items_template_center_fk"',
		);
	});
});

describe("feedback integrity checks", () => {
	it("declares feedback center and user foreign keys", () => {
		expect(getForeignKeyNames(feedback)).toEqual(
			expect.arrayContaining(["feedback_center_fk", "feedback_user_fk"]),
		);
	});

	it("ships the feedback relation migration with preflight checks", () => {
		expect(feedbackRelationsMigrationSql).toContain(
			"Cannot add feedback_center_fk: feedback rows reference missing centers",
		);
		expect(feedbackRelationsMigrationSql).toContain(
			"Cannot add feedback_user_fk: feedback rows reference missing users",
		);
		expect(feedbackRelationsMigrationSql).toContain('ADD CONSTRAINT "feedback_center_fk"');
		expect(feedbackRelationsMigrationSql).toContain('ADD CONSTRAINT "feedback_user_fk"');
	});
});

describe("subsidy integrity checks", () => {
	it("declares nonnegative authorization and ordered effective dates", () => {
		expect(getCheckNames(subsidyCases)).toEqual(
			expect.arrayContaining([
				"subsidy_cases_nonnegative_authorization_check",
				"subsidy_cases_effective_expiration_order_check",
			]),
		);
	});

	it("declares nonnegative claim values and ordered claim periods", () => {
		expect(getCheckNames(subsidyClaims)).toEqual(
			expect.arrayContaining([
				"subsidy_claims_nonnegative_amounts_check",
				"subsidy_claims_amount_order_check",
				"subsidy_claims_period_order_check",
			]),
		);
	});

	it("declares a unique subsidy claim period per case", () => {
		expect(getIndexNames(subsidyClaims)).toContain("subsidy_claims_case_period_unique");
	});

	it("ships the subsidy claim period unique index migration", () => {
		expect(subsidyClaimPeriodUniqueMigrationSql).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "subsidy_claims_case_period_unique"',
		);
		expect(subsidyClaimPeriodUniqueMigrationSql).toContain(
			'"subsidy_case_id", "period_start", "period_end"',
		);
	});

	it("ships the subsidy claim amount order migration with preflight checks", () => {
		expect(subsidyClaimAmountOrderMigrationSql).toContain(
			"Cannot add subsidy_claims_amount_order_check: invalid subsidy claim amount ordering exists",
		);
		expect(subsidyClaimAmountOrderMigrationSql).toContain(
			'ADD CONSTRAINT "subsidy_claims_amount_order_check"',
		);
		expect(subsidyClaimAmountOrderMigrationSql).toContain(
			'"amount_approved" IS NULL OR "amount_approved" <= "amount_claimed"',
		);
		expect(subsidyClaimAmountOrderMigrationSql).toContain('"amount_paid" IS NULL');
		expect(subsidyClaimAmountOrderMigrationSql).toContain(
			'"amount_approved" IS NOT NULL AND "amount_paid" <= "amount_approved"',
		);
	});
});

describe("ratio integrity checks", () => {
	it("declares nonnegative ratio snapshot counts", () => {
		expect(getCheckNames(ratioSnapshots)).toContain("ratio_snapshots_nonnegative_counts_check");
	});

	it("declares resolved violations cannot resolve before detection", () => {
		expect(getCheckNames(ratioViolations)).toContain(
			"ratio_violations_resolved_after_detected_check",
		);
	});

	it("declares ratio violation breach snapshot fields and integrity check", () => {
		expect(ratioViolations.staffCount.name).toBe("staff_count");
		expect(ratioViolations.childrenCount.name).toBe("children_count");
		expect(ratioViolations.ratioRequired.name).toBe("ratio_required");
		expect(ratioViolations.ratioActual.name).toBe("ratio_actual");
		expect(getCheckNames(ratioViolations)).toContain(
			"ratio_violations_nonnegative_breach_values_check",
		);
	});

	it("ships the ratio violation breach field migration", () => {
		expect(ratioViolationBreachFieldsMigrationSql).toContain(
			'ADD COLUMN IF NOT EXISTS "staff_count" real',
		);
		expect(ratioViolationBreachFieldsMigrationSql).toContain(
			"ratio_violations_nonnegative_breach_values_check",
		);
	});
});

describe("center-scoped composite foreign keys", () => {
	it("declares a center-scoped payment to invoice foreign key", () => {
		expect(getUniqueConstraintNames(invoices)).toContain("invoices_id_center_unique");
		expect(getForeignKeyNames(payments)).toContain("payments_invoice_center_fk");
	});

	it("declares a center-scoped invoice to guardian foreign key", () => {
		expect(getUniqueConstraintNames(guardians)).toContain("guardians_id_center_unique");
		expect(getForeignKeyNames(invoices)).toContain("invoices_guardian_center_fk");
	});

	it("ships the invoice guardian delete restriction migration", () => {
		expect(invoiceGuardianRestrictMigrationSql).toContain(
			'DROP CONSTRAINT IF EXISTS "invoices_guardian_id_guardians_id_fk"',
		);
		expect(invoiceGuardianRestrictMigrationSql).toContain(
			'DROP CONSTRAINT IF EXISTS "invoices_guardian_center_fk"',
		);
		expect(invoiceGuardianRestrictMigrationSql).toContain(
			'ADD CONSTRAINT "invoices_guardian_id_guardians_id_fk"',
		);
		expect(invoiceGuardianRestrictMigrationSql).toContain(
			'ADD CONSTRAINT "invoices_guardian_center_fk"',
		);
		expect(invoiceGuardianRestrictMigrationSql).not.toContain("ON DELETE cascade");
		expect(invoiceGuardianRestrictMigrationSql).not.toContain("ON DELETE CASCADE");
	});

	it("ships the invoice guardian center-scope migration with preflight checks", () => {
		expect(invoiceGuardianCenterScopeMigrationSql).toContain(
			"Cannot add invoices_guardian_center_fk: cross-center invoice guardian rows exist",
		);
		expect(invoiceGuardianCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "invoices_guardian_center_fk"',
		);
		expect(invoiceGuardianCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("guardian_id", "center_id")',
		);
		expect(invoiceGuardianCenterScopeMigrationSql).toContain(
			'REFERENCES "guardians" ("id", "center_id")',
		);
	});

	it("declares center-scoped messaging relationship foreign keys", () => {
		expect(getUniqueConstraintNames(messages)).toContain("messages_id_center_unique");
		expect(getForeignKeyNames(messages)).toContain("messages_classroom_center_fk");
		expect(messageRecipients.centerId.name).toBe("center_id");
		expect(getForeignKeyNames(messageRecipients)).toEqual(
			expect.arrayContaining([
				"message_recipients_message_center_fk",
				"message_recipients_guardian_center_fk",
			]),
		);
		expect(getForeignKeyNames(messageReplies)).toEqual(
			expect.arrayContaining([
				"message_replies_message_center_fk",
				"message_replies_guardian_center_fk",
			]),
		);
	});

	it("ships the messaging center-scope migration with preflight checks", () => {
		expect(messagingCenterScopeMigrationSql).toContain(
			"Cannot add messages_classroom_center_fk: cross-center message classroom rows exist",
		);
		expect(messagingCenterScopeMigrationSql).toContain(
			"Cannot add message_replies_message_center_fk: cross-center message reply message rows exist",
		);
		expect(messagingCenterScopeMigrationSql).toContain(
			"Cannot add message_replies_guardian_center_fk: cross-center message reply guardian rows exist",
		);
		expect(messagingCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "messages_classroom_center_fk"',
		);
		expect(messagingCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "message_replies_message_center_fk"',
		);
		expect(messagingCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "message_replies_guardian_center_fk"',
		);
		expect(messagingCenterScopeMigrationSql).toContain('FOREIGN KEY ("message_id", "center_id")');
		expect(messagingCenterScopeMigrationSql).toContain('FOREIGN KEY ("guardian_id", "center_id")');
	});

	it("ships the message recipients center-scope migration with backfill and preflight checks", () => {
		expect(messageRecipientsCenterScopeMigrationSql).toContain(
			'ADD COLUMN IF NOT EXISTS "center_id" uuid',
		);
		expect(messageRecipientsCenterScopeMigrationSql).toContain('UPDATE "message_recipients" mr');
		expect(messageRecipientsCenterScopeMigrationSql).toContain(
			"Cannot add message_recipients_message_center_fk: cross-center message recipient message rows exist",
		);
		expect(messageRecipientsCenterScopeMigrationSql).toContain(
			"Cannot add message_recipients_guardian_center_fk: cross-center message recipient guardian rows exist",
		);
		expect(messageRecipientsCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "message_recipients_message_center_fk"',
		);
		expect(messageRecipientsCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "message_recipients_guardian_center_fk"',
		);
	});

	it("declares center-scoped child guardian relationship foreign keys", () => {
		expect(getUniqueConstraintNames(children)).toContain("children_id_center_unique");
		expect(getUniqueConstraintNames(guardians)).toContain("guardians_id_center_unique");
		expect(getForeignKeyNames(childGuardians)).toEqual(
			expect.arrayContaining([
				"child_guardians_child_center_fk",
				"child_guardians_guardian_center_fk",
			]),
		);
	});

	it("declares at most one primary guardian link per child", () => {
		expect(getIndexNames(childGuardians)).toContain("child_guardians_one_primary_per_child_unique");
	});

	it("ships the child guardian center-scope migration with preflight checks", () => {
		expect(childGuardianCenterScopeMigrationSql).toContain(
			"Cannot add child_guardians_child_center_fk: cross-center child guardian child rows exist",
		);
		expect(childGuardianCenterScopeMigrationSql).toContain(
			"Cannot add child_guardians_guardian_center_fk: cross-center child guardian guardian rows exist",
		);
		expect(childGuardianCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "child_guardians_child_center_fk"',
		);
		expect(childGuardianCenterScopeMigrationSql).toContain('FOREIGN KEY ("child_id", "center_id")');
		expect(childGuardianCenterScopeMigrationSql).toContain(
			'REFERENCES "children" ("id", "center_id")',
		);
		expect(childGuardianCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "child_guardians_guardian_center_fk"',
		);
		expect(childGuardianCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("guardian_id", "center_id")',
		);
		expect(childGuardianCenterScopeMigrationSql).toContain(
			'REFERENCES "guardians" ("id", "center_id")',
		);
	});

	it("ships the child guardian primary uniqueness migration with preflight checks", () => {
		expect(childGuardianPrimaryUniqueMigrationSql).toContain(
			"Cannot add child_guardians_one_primary_per_child_unique: duplicate primary guardians exist",
		);
		expect(childGuardianPrimaryUniqueMigrationSql).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "child_guardians_one_primary_per_child_unique"',
		);
		expect(childGuardianPrimaryUniqueMigrationSql).toContain('ON "child_guardians" ("child_id")');
		expect(childGuardianPrimaryUniqueMigrationSql).toContain('WHERE "is_primary" = true');
	});

	it("declares a center-scoped shift to schedule foreign key", () => {
		expect(getUniqueConstraintNames(schedules)).toContain("schedules_id_center_unique");
		expect(getForeignKeyNames(shifts)).toContain("shifts_schedule_center_fk");
	});

	it("declares positive classroom capacity and ratio values", () => {
		expect(getCheckNames(classrooms)).toContain("classrooms_positive_capacity_ratio_check");
	});

	it("declares ordered schedule effective dates", () => {
		expect(getCheckNames(schedules)).toContain("schedules_effective_date_order_check");
	});

	it("declares center-scoped shift staff and classroom foreign keys", () => {
		expect(getUniqueConstraintNames(memberships)).toContain("memberships_id_center_unique");
		expect(getUniqueConstraintNames(classrooms)).toContain("classrooms_id_center_unique");
		expect(getForeignKeyNames(shifts)).toEqual(
			expect.arrayContaining(["shifts_membership_center_fk", "shifts_classroom_center_fk"]),
		);
	});

	it("declares valid shift day and time ordering checks", () => {
		expect(getCheckNames(shifts)).toEqual(
			expect.arrayContaining(["shifts_day_of_week_check", "shifts_time_order_check"]),
		);
	});

	it("declares a center-scoped time entry to membership foreign key", () => {
		expect(getForeignKeyNames(timeEntries)).toContain("time_entries_membership_center_fk");
	});

	it("declares nonnegative time entry hour values", () => {
		expect(getCheckNames(timeEntries)).toContain("time_entries_nonnegative_hours_check");
	});

	it("ships the time entry nonnegative hours check migration with preflight checks", () => {
		expect(timeEntryHoursCheckMigrationSql).toContain(
			"Cannot add time_entries_nonnegative_hours_check: negative time entry hour values exist",
		);
		expect(timeEntryHoursCheckMigrationSql).toContain(
			'ADD CONSTRAINT "time_entries_nonnegative_hours_check"',
		);
		expect(timeEntryHoursCheckMigrationSql).toContain('"hours_worked" >= 0');
		expect(timeEntryHoursCheckMigrationSql).toContain('"hours_scheduled" >= 0');
		expect(timeEntryHoursCheckMigrationSql).toContain('"overtime_hours" >= 0');
	});

	it("ships the shift schedule center-scope migration with preflight checks", () => {
		expect(shiftScheduleCenterScopeMigrationSql).toContain(
			"Cannot add shifts_schedule_center_fk: cross-center shift schedule rows exist",
		);
		expect(shiftScheduleCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "shifts_schedule_center_fk"',
		);
		expect(shiftScheduleCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("schedule_id", "center_id")',
		);
		expect(shiftScheduleCenterScopeMigrationSql).toContain(
			'REFERENCES "schedules" ("id", "center_id")',
		);
	});

	it("ships the shift temporal check migration with preflight checks", () => {
		expect(shiftTemporalCheckMigrationSql).toContain(
			"Cannot add shifts_day_of_week_check: invalid shift day_of_week values exist",
		);
		expect(shiftTemporalCheckMigrationSql).toContain(
			"Cannot add shifts_time_order_check: invalid shift time ranges exist",
		);
		expect(shiftTemporalCheckMigrationSql).toContain('ADD CONSTRAINT "shifts_day_of_week_check"');
		expect(shiftTemporalCheckMigrationSql).toContain('"day_of_week" BETWEEN 0 AND 6');
		expect(shiftTemporalCheckMigrationSql).toContain('ADD CONSTRAINT "shifts_time_order_check"');
		expect(shiftTemporalCheckMigrationSql).toContain('"start_time" < "end_time"');
	});

	it("ships the schedule date order migration with preflight checks", () => {
		expect(scheduleDateOrderMigrationSql).toContain(
			"Cannot add schedules_effective_date_order_check: inverted schedule effective dates exist",
		);
		expect(scheduleDateOrderMigrationSql).toContain(
			'ADD CONSTRAINT "schedules_effective_date_order_check"',
		);
		expect(scheduleDateOrderMigrationSql).toContain(
			'"effective_until" IS NULL OR "effective_from" <= "effective_until"',
		);
	});

	it("ships the scheduling center-scope migration with preflight checks", () => {
		expect(schedulingCenterScopeMigrationSql).toContain(
			"Cannot add shifts_membership_center_fk: cross-center shift membership rows exist",
		);
		expect(schedulingCenterScopeMigrationSql).toContain(
			"Cannot add shifts_classroom_center_fk: cross-center shift classroom rows exist",
		);
		expect(schedulingCenterScopeMigrationSql).toContain(
			"Cannot add time_entries_membership_center_fk: cross-center time entry membership rows exist",
		);
		expect(schedulingCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "shifts_membership_center_fk"',
		);
		expect(schedulingCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "shifts_classroom_center_fk"',
		);
		expect(schedulingCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "time_entries_membership_center_fk"',
		);
		expect(schedulingCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("membership_id", "center_id")',
		);
		expect(schedulingCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("classroom_id", "center_id")',
		);
	});

	it("declares center-scoped QuickBooks relationship foreign keys", () => {
		expect(getUniqueConstraintNames(quickbooksConnections)).toContain(
			"quickbooks_connections_id_center_unique",
		);
		expect(getForeignKeyNames(quickbooksEntityLinks)).toContain(
			"quickbooks_entity_links_connection_center_fk",
		);
		expect(getForeignKeyNames(quickbooksSyncLog)).toContain(
			"quickbooks_sync_log_connection_center_fk",
		);
		expect(getForeignKeyNames(quickbooksReconciliationItems)).toEqual(
			expect.arrayContaining([
				"quickbooks_reconciliation_items_connection_center_fk",
				"quickbooks_reconciliation_items_reviewed_by_center_fk",
			]),
		);
	});

	it("ships the QuickBooks center-scope migration with preflight checks", () => {
		expect(quickbooksCenterScopeMigrationSql).toContain(
			"Cannot add quickbooks_entity_links_connection_center_fk: cross-center QuickBooks entity link connection rows exist",
		);
		expect(quickbooksCenterScopeMigrationSql).toContain(
			"Cannot add quickbooks_sync_log_connection_center_fk: cross-center QuickBooks sync log connection rows exist",
		);
		expect(quickbooksCenterScopeMigrationSql).toContain(
			"Cannot add quickbooks_reconciliation_items_connection_center_fk: cross-center QuickBooks reconciliation connection rows exist",
		);
		expect(quickbooksCenterScopeMigrationSql).toContain(
			"Cannot add quickbooks_reconciliation_items_reviewed_by_center_fk: cross-center QuickBooks reconciliation reviewer rows exist",
		);
		expect(quickbooksCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "quickbooks_connections_id_center_unique"',
		);
		expect(quickbooksCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "quickbooks_entity_links_connection_center_fk"',
		);
		expect(quickbooksCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "quickbooks_sync_log_connection_center_fk"',
		);
		expect(quickbooksCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "quickbooks_reconciliation_items_connection_center_fk"',
		);
		expect(quickbooksCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "quickbooks_reconciliation_items_reviewed_by_center_fk"',
		);
	});

	it("declares center-scoped guidance and audit report membership foreign keys", () => {
		expect(getForeignKeyNames(guidanceProgress)).toContain(
			"guidance_progress_membership_center_fk",
		);
		expect(getForeignKeyNames(auditReports)).toContain("audit_reports_generated_by_center_fk");
	});

	it("ships the guidance and audit center-scope migration with preflight checks", () => {
		expect(guidanceAuditCenterScopeMigrationSql).toContain(
			"Cannot add guidance_progress_membership_center_fk: cross-center guidance progress membership rows exist",
		);
		expect(guidanceAuditCenterScopeMigrationSql).toContain(
			"Cannot add audit_reports_generated_by_center_fk: cross-center audit report generator rows exist",
		);
		expect(guidanceAuditCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "guidance_progress_membership_center_fk"',
		);
		expect(guidanceAuditCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "audit_reports_generated_by_center_fk"',
		);
		expect(guidanceAuditCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("membership_id", "center_id")',
		);
		expect(guidanceAuditCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("generated_by", "center_id")',
		);
	});

	it("declares center-scoped staff assignment relationship foreign keys", () => {
		expect(getUniqueConstraintNames(memberships)).toContain("memberships_id_center_unique");
		expect(getUniqueConstraintNames(classrooms)).toContain("classrooms_id_center_unique");
		expect(getForeignKeyNames(staffAssignments)).toEqual(
			expect.arrayContaining([
				"staff_assignments_membership_center_fk",
				"staff_assignments_classroom_center_fk",
			]),
		);
	});

	it("declares staff assignment end dates cannot precede effective dates", () => {
		expect(getCheckNames(staffAssignments)).toContain("staff_assignments_date_order_check");
	});

	it("ships the staff assignment center-scope migration with preflight checks", () => {
		expect(staffAssignmentCenterScopeMigrationSql).toContain(
			"Cannot add staff_assignments_membership_center_fk: cross-center staff assignment membership rows exist",
		);
		expect(staffAssignmentCenterScopeMigrationSql).toContain(
			"Cannot add staff_assignments_classroom_center_fk: cross-center staff assignment classroom rows exist",
		);
		expect(staffAssignmentCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "staff_assignments_membership_center_fk"',
		);
		expect(staffAssignmentCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("membership_id", "center_id")',
		);
		expect(staffAssignmentCenterScopeMigrationSql).toContain(
			'REFERENCES "memberships" ("id", "center_id")',
		);
		expect(staffAssignmentCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "staff_assignments_classroom_center_fk"',
		);
		expect(staffAssignmentCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("classroom_id", "center_id")',
		);
		expect(staffAssignmentCenterScopeMigrationSql).toContain(
			'REFERENCES "classrooms" ("id", "center_id")',
		);
	});

	it("declares center-scoped classroom assignment relationship foreign keys", () => {
		expect(getUniqueConstraintNames(classrooms)).toContain("classrooms_id_center_unique");
		expect(getForeignKeyNames(classroomAssignments)).toEqual(
			expect.arrayContaining([
				"classroom_assignments_classroom_center_fk",
				"classroom_assignments_child_center_fk",
			]),
		);
	});

	it("declares classroom assignment end dates cannot precede effective dates", () => {
		expect(getCheckNames(classroomAssignments)).toContain("classroom_assignments_date_order_check");
	});

	it("ships the classroom assignment center-scope migration with preflight checks", () => {
		expect(classroomAssignmentCenterScopeMigrationSql).toContain(
			"Cannot add classroom_assignments_child_center_fk: cross-center classroom assignment child rows exist",
		);
		expect(classroomAssignmentCenterScopeMigrationSql).toContain(
			"Cannot add classroom_assignments_classroom_center_fk: cross-center classroom assignment classroom rows exist",
		);
		expect(classroomAssignmentCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "classroom_assignments_child_center_fk"',
		);
		expect(classroomAssignmentCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("child_id", "center_id")',
		);
		expect(classroomAssignmentCenterScopeMigrationSql).toContain(
			'REFERENCES "children" ("id", "center_id")',
		);
		expect(classroomAssignmentCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "classroom_assignments_classroom_center_fk"',
		);
		expect(classroomAssignmentCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("classroom_id", "center_id")',
		);
		expect(classroomAssignmentCenterScopeMigrationSql).toContain(
			'REFERENCES "classrooms" ("id", "center_id")',
		);
	});

	it("ships the assignment date order migration with preflight checks", () => {
		expect(assignmentDateOrderCheckMigrationSql).toContain(
			"Cannot add classroom_assignments_date_order_check: inverted classroom assignment dates exist",
		);
		expect(assignmentDateOrderCheckMigrationSql).toContain(
			"Cannot add staff_assignments_date_order_check: inverted staff assignment dates exist",
		);
		expect(assignmentDateOrderCheckMigrationSql).toContain(
			'ADD CONSTRAINT "classroom_assignments_date_order_check"',
		);
		expect(assignmentDateOrderCheckMigrationSql).toContain(
			'"end_date" IS NULL OR "effective_date" <= "end_date"',
		);
		expect(assignmentDateOrderCheckMigrationSql).toContain(
			'ADD CONSTRAINT "staff_assignments_date_order_check"',
		);
	});

	it("ships the classroom positive values migration with preflight checks", () => {
		expect(classroomPositiveValuesCheckMigrationSql).toContain(
			"Cannot add classrooms_positive_capacity_ratio_check: nonpositive classroom capacity or ratio values exist",
		);
		expect(classroomPositiveValuesCheckMigrationSql).toContain(
			'ADD CONSTRAINT "classrooms_positive_capacity_ratio_check"',
		);
		expect(classroomPositiveValuesCheckMigrationSql).toContain('"max_capacity" > 0');
		expect(classroomPositiveValuesCheckMigrationSql).toContain('"min_ratio_staff" > 0');
		expect(classroomPositiveValuesCheckMigrationSql).toContain('"min_ratio_children" > 0');
	});

	it("declares center-scoped staff check-in relationship foreign keys", () => {
		expect(getForeignKeyNames(staffCheckIns)).toEqual(
			expect.arrayContaining([
				"staff_check_ins_membership_center_fk",
				"staff_check_ins_classroom_center_fk",
			]),
		);
	});

	it("ships the staff check-in center-scope migration with preflight checks", () => {
		expect(staffCheckInCenterScopeMigrationSql).toContain(
			"Cannot add staff_check_ins_membership_center_fk: cross-center staff check-in membership rows exist",
		);
		expect(staffCheckInCenterScopeMigrationSql).toContain(
			"Cannot add staff_check_ins_classroom_center_fk: cross-center staff check-in classroom rows exist",
		);
		expect(staffCheckInCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "staff_check_ins_membership_center_fk"',
		);
		expect(staffCheckInCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("membership_id", "center_id")',
		);
		expect(staffCheckInCenterScopeMigrationSql).toContain(
			'REFERENCES "memberships" ("id", "center_id")',
		);
		expect(staffCheckInCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "staff_check_ins_classroom_center_fk"',
		);
		expect(staffCheckInCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("classroom_id", "center_id")',
		);
		expect(staffCheckInCenterScopeMigrationSql).toContain(
			'REFERENCES "classrooms" ("id", "center_id")',
		);
	});

	it("declares center-scoped child check-in relationship foreign keys", () => {
		expect(getForeignKeyNames(checkIns)).toEqual(
			expect.arrayContaining([
				"check_ins_child_center_fk",
				"check_ins_classroom_center_fk",
				"check_ins_checked_in_by_center_fk",
				"check_ins_checked_out_by_center_fk",
			]),
		);
	});

	it("declares child and staff attendance end times cannot precede start times", () => {
		expect(getCheckNames(checkIns)).toContain("check_ins_checkout_after_checkin_check");
		expect(getCheckNames(staffCheckIns)).toContain("staff_check_ins_clockout_after_clockin_check");
	});

	it("ships the child check-in center-scope migration with preflight checks", () => {
		expect(checkInCenterScopeMigrationSql).toContain(
			"Cannot add check_ins_child_center_fk: cross-center child check-in child rows exist",
		);
		expect(checkInCenterScopeMigrationSql).toContain(
			"Cannot add check_ins_classroom_center_fk: cross-center child check-in classroom rows exist",
		);
		expect(checkInCenterScopeMigrationSql).toContain(
			"Cannot add check_ins_checked_in_by_center_fk: cross-center child check-in staff rows exist",
		);
		expect(checkInCenterScopeMigrationSql).toContain(
			"Cannot add check_ins_checked_out_by_center_fk: cross-center child check-out staff rows exist",
		);
		expect(checkInCenterScopeMigrationSql).toContain('ADD CONSTRAINT "check_ins_child_center_fk"');
		expect(checkInCenterScopeMigrationSql).toContain('FOREIGN KEY ("child_id", "center_id")');
		expect(checkInCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "check_ins_classroom_center_fk"',
		);
		expect(checkInCenterScopeMigrationSql).toContain('FOREIGN KEY ("classroom_id", "center_id")');
		expect(checkInCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "check_ins_checked_in_by_center_fk"',
		);
		expect(checkInCenterScopeMigrationSql).toContain('FOREIGN KEY ("checked_in_by", "center_id")');
		expect(checkInCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "check_ins_checked_out_by_center_fk"',
		);
		expect(checkInCenterScopeMigrationSql).toContain('FOREIGN KEY ("checked_out_by", "center_id")');
	});

	it("ships the attendance temporal check migration with preflight checks", () => {
		expect(attendanceTemporalCheckMigrationSql).toContain(
			"Cannot add check_ins_checkout_after_checkin_check: child check-out precedes check-in",
		);
		expect(attendanceTemporalCheckMigrationSql).toContain(
			"Cannot add staff_check_ins_clockout_after_clockin_check: staff clock-out precedes clock-in",
		);
		expect(attendanceTemporalCheckMigrationSql).toContain(
			'ADD CONSTRAINT "check_ins_checkout_after_checkin_check"',
		);
		expect(attendanceTemporalCheckMigrationSql).toContain(
			'"checked_out_at" IS NULL OR "checked_out_at" >= "checked_in_at"',
		);
		expect(attendanceTemporalCheckMigrationSql).toContain(
			'ADD CONSTRAINT "staff_check_ins_clockout_after_clockin_check"',
		);
		expect(attendanceTemporalCheckMigrationSql).toContain(
			'"clocked_out_at" IS NULL OR "clocked_out_at" >= "clocked_in_at"',
		);
	});

	it("declares center-scoped subsidy case and claim relationship foreign keys", () => {
		expect(getUniqueConstraintNames(subsidyCases)).toContain("subsidy_cases_id_center_unique");
		expect(getForeignKeyNames(subsidyCases)).toContain("subsidy_cases_child_center_fk");
		expect(getForeignKeyNames(subsidyClaims)).toContain("subsidy_claims_case_center_fk");
	});

	it("ships the subsidy center-scope migration with preflight checks", () => {
		expect(subsidyCenterScopeMigrationSql).toContain(
			"Cannot add subsidy_cases_child_center_fk: cross-center subsidy case child rows exist",
		);
		expect(subsidyCenterScopeMigrationSql).toContain(
			"Cannot add subsidy_claims_case_center_fk: cross-center subsidy claim case rows exist",
		);
		expect(subsidyCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "subsidy_cases_child_center_fk"',
		);
		expect(subsidyCenterScopeMigrationSql).toContain('FOREIGN KEY ("child_id", "center_id")');
		expect(subsidyCenterScopeMigrationSql).toContain('REFERENCES "children" ("id", "center_id")');
		expect(subsidyCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "subsidy_claims_case_center_fk"',
		);
		expect(subsidyCenterScopeMigrationSql).toContain(
			'FOREIGN KEY ("subsidy_case_id", "center_id")',
		);
		expect(subsidyCenterScopeMigrationSql).toContain(
			'REFERENCES "subsidy_cases" ("id", "center_id")',
		);
	});

	it("declares center-scoped ratio snapshot and violation relationship foreign keys", () => {
		expect(getForeignKeyNames(ratioSnapshots)).toContain("ratio_snapshots_classroom_center_fk");
		expect(getForeignKeyNames(ratioViolations)).toEqual(
			expect.arrayContaining([
				"ratio_violations_classroom_center_fk",
				"ratio_violations_resolved_by_center_fk",
			]),
		);
	});

	it("ships the ratio center-scope migration with preflight checks", () => {
		expect(ratioCenterScopeMigrationSql).toContain(
			"Cannot add ratio_snapshots_classroom_center_fk: cross-center ratio snapshot classroom rows exist",
		);
		expect(ratioCenterScopeMigrationSql).toContain(
			"Cannot add ratio_violations_classroom_center_fk: cross-center ratio violation classroom rows exist",
		);
		expect(ratioCenterScopeMigrationSql).toContain(
			"Cannot add ratio_violations_resolved_by_center_fk: cross-center ratio violation resolver rows exist",
		);
		expect(ratioCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "ratio_snapshots_classroom_center_fk"',
		);
		expect(ratioCenterScopeMigrationSql).toContain('FOREIGN KEY ("classroom_id", "center_id")');
		expect(ratioCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "ratio_violations_classroom_center_fk"',
		);
		expect(ratioCenterScopeMigrationSql).toContain(
			'ADD CONSTRAINT "ratio_violations_resolved_by_center_fk"',
		);
		expect(ratioCenterScopeMigrationSql).toContain('FOREIGN KEY ("resolved_by", "center_id")');
	});
});

describe("memberships schema", () => {
	it("declares the center_user unique index", () => {
		const names = getIndexNames(memberships);
		expect(names).toContain("memberships_center_user_unique");
	});

	it("scopes the center_user unique index to active memberships", () => {
		const centerUserIndex = getTableConfig(memberships).indexes.find(
			(index) => index.config.name === "memberships_center_user_unique",
		);

		expect(collectStringValues(centerUserIndex?.config.where)).toContain("deactivated_at");
	});

	it("declares the center invite email unique index", () => {
		const names = getIndexNames(memberships);
		expect(names).toContain("memberships_center_invite_email_unique");
	});

	it("still has the center_id btree index", () => {
		const names = getIndexNames(memberships);
		expect(names).toContain("memberships_center_id_idx");
	});

	it("exposes center_id and user_id columns with correct DB names", () => {
		expect(memberships.centerId.name).toBe("center_id");
		expect(memberships.userId.name).toBe("user_id");
	});

	it("exposes invite_email for invitations created before signup", () => {
		expect(memberships.inviteEmail.name).toBe("invite_email");
	});

	it("exposes deactivated_at for soft-deactivated members", () => {
		expect(memberships.deactivatedAt.name).toBe("deactivated_at");
	});

	it("ships active-only uniqueness for soft-deactivated member reinvites", () => {
		expect(membershipDeactivationMigrationSql).toContain(
			'DROP INDEX IF EXISTS "memberships_center_user_unique"',
		);
		expect(membershipDeactivationMigrationSql).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "memberships_center_user_unique"',
		);
		expect(membershipDeactivationMigrationSql).toContain(
			'WHERE "user_id" IS NOT NULL AND "deactivated_at" IS NULL',
		);
	});

	it("ships the email-based invitations migration", () => {
		expect(emailBasedInvitationsMigrationSql).toContain(
			'ALTER TABLE "memberships" ALTER COLUMN "user_id" DROP NOT NULL',
		);
		expect(emailBasedInvitationsMigrationSql).toContain(
			'ADD COLUMN IF NOT EXISTS "invite_email" varchar(320)',
		);
		expect(emailBasedInvitationsMigrationSql).toContain(
			'CREATE UNIQUE INDEX IF NOT EXISTS "memberships_center_invite_email_unique"',
		);
	});
});

describe("check_ins schema", () => {
	it("declares the child_open partial unique index", () => {
		const names = getIndexNames(checkIns);
		expect(names).toContain("check_ins_child_open_unique");
	});

	it("exposes child_id and checked_out_at with correct DB names", () => {
		expect(checkIns.childId.name).toBe("child_id");
		expect(checkIns.checkedOutAt.name).toBe("checked_out_at");
	});
});

describe("staff_check_ins schema", () => {
	it("declares the membership_open partial unique index", () => {
		const names = getIndexNames(staffCheckIns);
		expect(names).toContain("staff_check_ins_membership_open_unique");
	});

	it("exposes membership_id and clocked_out_at with correct DB names", () => {
		expect(staffCheckIns.membershipId.name).toBe("membership_id");
		expect(staffCheckIns.clockedOutAt.name).toBe("clocked_out_at");
	});
});

describe("ratio_violations schema", () => {
	it("declares the classroom_open partial unique index", () => {
		const names = getIndexNames(ratioViolations);
		expect(names).toContain("ratio_violations_classroom_open_unique");
	});

	it("exposes classroom_id and resolved_at with correct DB names", () => {
		expect(ratioViolations.classroomId.name).toBe("classroom_id");
		expect(ratioViolations.resolvedAt.name).toBe("resolved_at");
	});
});

describe("guardians schema", () => {
	it("declares the center_email unique index", () => {
		const names = getIndexNames(guardians);
		expect(names).toContain("guardians_center_email_unique");
	});

	it("exposes center_id and email with correct DB names", () => {
		expect(guardians.centerId.name).toBe("center_id");
		expect(guardians.email.name).toBe("email");
	});

	it("email column is nullable (NULLs excluded from unique index)", () => {
		expect(guardians.email.notNull).toBeFalsy();
	});
});

describe("journal entry 0011", () => {
	it("is registered in _journal.json", () => {
		const journal = JSON.parse(
			readFileSync(resolve(import.meta.dirname, "../drizzle/meta/_journal.json"), "utf8"),
		);
		const entry = journal.entries.find((e: { tag: string }) => e.tag === "0011_integrity_indexes");
		expect(entry).toBeDefined();
		expect(entry.idx).toBe(11);
		expect(entry.version).toBe("7");
		expect(entry.breakpoints).toBe(true);
	});
});

describe("journal entry 0024", () => {
	it("registers the DB integrity hardening migration", () => {
		const journal = JSON.parse(
			readFileSync(resolve(import.meta.dirname, "../drizzle/meta/_journal.json"), "utf8"),
		);
		const entry = journal.entries.find(
			(e: { tag: string }) => e.tag === "0024_db_integrity_hardening",
		);
		expect(entry).toBeDefined();
		expect(entry.idx).toBe(24);
		expect(entry.version).toBe("7");
		expect(entry.breakpoints).toBe(true);
	});
});

describe("snapshot 0011", () => {
	const snap0011 = JSON.parse(
		readFileSync(resolve(import.meta.dirname, "../drizzle/meta/0011_snapshot.json"), "utf8"),
	);

	it("has a new id and points prevId at 0010 snapshot id", () => {
		const snap0010 = JSON.parse(
			readFileSync(resolve(import.meta.dirname, "../drizzle/meta/0010_snapshot.json"), "utf8"),
		);
		expect(snap0011.prevId).toBe(snap0010.id);
		expect(snap0011.id).not.toBe(snap0010.id);
	});

	it("snapshot contains all five new unique indexes", () => {
		const tables = snap0011.tables;
		expect(tables["public.memberships"].indexes).toHaveProperty("memberships_center_user_unique");
		expect(tables["public.check_ins"].indexes).toHaveProperty("check_ins_child_open_unique");
		expect(tables["public.staff_check_ins"].indexes).toHaveProperty(
			"staff_check_ins_membership_open_unique",
		);
		expect(tables["public.ratio_violations"].indexes).toHaveProperty(
			"ratio_violations_classroom_open_unique",
		);
		expect(tables["public.guardians"].indexes).toHaveProperty("guardians_center_email_unique");
	});
});
