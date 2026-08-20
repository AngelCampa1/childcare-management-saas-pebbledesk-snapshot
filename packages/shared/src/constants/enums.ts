export const AGE_GROUPS = [
	"infant",
	"young_toddler",
	"toddler",
	"preschool",
	"pre_k",
	"school_age",
] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const ENROLLMENT_STATUSES = ["active", "inactive", "waitlist", "withdrawn"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const SUBSIDY_PROGRAMS = [
	"ccdf",
	"head_start",
	"early_head_start",
	"state_pre_k",
	"other",
] as const;
export type SubsidyProgram = (typeof SUBSIDY_PROGRAMS)[number];

export const SUBSIDY_CASE_STATUSES = ["active", "pending", "expired", "terminated"] as const;
export type SubsidyCaseStatus = (typeof SUBSIDY_CASE_STATUSES)[number];

export const CLAIM_STATUSES = ["draft", "submitted", "approved", "rejected", "paid"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ["cash", "check", "credit_card", "ach", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROVIDERS = ["manual", "stripe", "quickbooks"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ["posted", "reversed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const STRIPE_ACCOUNT_STATUSES = [
	"not_connected",
	"pending",
	"connected",
	"restricted",
	"disabled",
] as const;
export type StripeAccountStatus = (typeof STRIPE_ACCOUNT_STATUSES)[number];

export const MESSAGE_TYPES = ["announcement", "direct", "alert"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const REPORT_TYPES = ["attendance", "ratio", "subsidy", "licensing"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const AUDIT_ACTIONS = [
	"create",
	"update",
	"delete",
	"login",
	"logout",
	"export",
	"import",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const TIME_ENTRY_STATUSES = ["auto", "manual", "approved"] as const;
export type TimeEntryStatus = (typeof TIME_ENTRY_STATUSES)[number];

export const QB_SYNC_DIRECTIONS = ["push", "pull"] as const;
export type QbSyncDirection = (typeof QB_SYNC_DIRECTIONS)[number];

export const QB_SYNC_STATUSES = ["pending", "success", "failed", "skipped"] as const;
export type QbSyncStatus = (typeof QB_SYNC_STATUSES)[number];

export const QB_ENTITY_TYPES = ["customer", "invoice", "payment"] as const;
export type QbEntityType = (typeof QB_ENTITY_TYPES)[number];

export const QB_CONNECTION_STATUSES = ["connected", "disconnected"] as const;
export type QbConnectionStatus = (typeof QB_CONNECTION_STATUSES)[number];

export const QB_RECONCILIATION_STATUSES = ["open", "approved", "dismissed"] as const;
export type QbReconciliationStatus = (typeof QB_RECONCILIATION_STATUSES)[number];

export const QB_RECONCILIATION_ORIGINS = ["local", "quickbooks"] as const;
export type QbReconciliationOrigin = (typeof QB_RECONCILIATION_ORIGINS)[number];

export const QB_RECONCILIATION_ITEM_TYPES = [
	"missing_link",
	"orphaned_link",
	"amount_mismatch",
	"status_mismatch",
	"duplicate",
] as const;
export type QbReconciliationItemType = (typeof QB_RECONCILIATION_ITEM_TYPES)[number];

export const QUICKBOOKS_LOCAL_ENTITY_TYPES = ["guardian", "invoice", "payment"] as const;
export type QuickBooksLocalEntityType = (typeof QUICKBOOKS_LOCAL_ENTITY_TYPES)[number];

export const QUICKBOOKS_SYNC_ACTIONS = ["export", "import", "full"] as const;
export type QuickBooksSyncAction = (typeof QUICKBOOKS_SYNC_ACTIONS)[number];
