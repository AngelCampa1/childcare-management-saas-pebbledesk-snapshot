# Backend Integration Audit Findings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for each bounded fix. Every fix starts with a failing test, then implementation, targeted verification, spec review, and code review.

**Goal:** Track evidence-backed backend bugs and missing backend features found during the system-wide audit.

**Architecture:** Each finding is handled as a separate TDD slice. Fixes must preserve center scoping, auditability, billing integrity, and child-data privacy.

**Tech Stack:** Hono API on Cloudflare Workers, Drizzle ORM, Neon/Postgres, Vitest, pnpm, TypeScript.

**Latest broad verification:** `pnpm test`; `pnpm lint`; `pnpm typecheck`; `pnpm --filter @pebbledesk/api test -- --coverage`; `pnpm --filter @pebbledesk/db test -- --coverage`; `pnpm --filter @pebbledesk/web test -- --coverage`; `pnpm --filter @pebbledesk/site test -- --coverage`; `pnpm --filter @pebbledesk/shared test -- --coverage`.

---

## Confirmed Findings

### P1: Generic Audit Logs Persist Child/Family PII Values

**Evidence:** `apps/api/src/middleware/audit.ts` stored request values unless the key matched a narrow secret/contact list.

**Impact:** Child names, dates of birth, allergy/immunization notes, custody notes, and guardian names could be persisted in `audit_log.changes`.

**Status:** Fixed in this worktree. Added tests in `apps/api/src/middleware/audit.test.ts`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/middleware/audit.test.ts`; `pnpm --filter @pebbledesk/api test`; `pnpm --filter @pebbledesk/api typecheck`.

### P1: Failed Mutations Are Audited As Successful Actions

**Evidence:** `apps/api/src/middleware/audit.ts` wrote a generic create/update/delete row after `await next()` without checking response status.

**Impact:** A rejected POST/PATCH/DELETE could appear in audit history as a successful mutation.

**Status:** Fixed in this worktree. Added test in `apps/api/src/middleware/audit.test.ts`.

**Verification:** Same audit middleware verification above.

### P1: Outbound Message And Invite Emails Interpolate Unescaped HTML

**Evidence:** `apps/api/src/routes/messages.ts` and `apps/api/src/routes/members.ts` build Resend HTML from user-controlled text without escaping.

**Impact:** HTML injection in family/staff email clients.

**Status:** Fixed in this worktree. Added HTML injection regression tests in `apps/api/src/routes/messages.test.ts` and `apps/api/src/routes/members.test.ts`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/middleware/audit.test.ts src/routes/messages.test.ts src/routes/members.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P1: State-Mandated Ratios Are Not Applied To Persisted Snapshots/Violations

**Evidence:** `apps/api/src/routes/ratios.ts` applies state rules for live reads, but `apps/api/src/services/ratio.ts` and `apps/api/src/routes/overview.ts` use classroom-configured ratios only.

**Impact:** A room can display as noncompliant in `/api/ratios` while stored snapshots and open violations say compliant.

**Status:** Fixed in this worktree. Added state-ratio regression tests in `apps/api/src/services/ratio.test.ts` and `apps/api/src/routes/overview.test.ts`, and centralized effective ratio selection in `packages/shared/src/constants/state-ratios.ts`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/ratios.test.ts src/services/ratio.test.ts src/routes/overview.test.ts src/routes/check-ins.test.ts src/routes/staff-check-ins.test.ts`; `pnpm --filter @pebbledesk/shared test -- src/constants/state-ratios.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P1: Ratio Service Reads Classroom Configuration Without Center Scoping

**Evidence:** `apps/api/src/services/ratio.ts` center-scoped live attendance counts, then loaded the classroom ratio configuration with `classrooms.id` only.

**Impact:** A mismatched service call could evaluate and persist ratio snapshots using another center's classroom configuration.

**Status:** Fixed in this worktree. The classroom configuration lookup now requires both classroom ID and center ID, and fails fast if the classroom is not in the center.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/ratio.test.ts`.

### P2: Multi-Center Overview Classroom Query Was Only Capped After Fetch

**Evidence:** `apps/api/src/routes/overview.ts` fetched all active classrooms for all enterprise centers and then applied the 200-per-center cap in JavaScript.

**Impact:** Enterprise users with many classrooms could trigger an unbounded classroom read before the response-level cap.

**Status:** Fixed in this worktree. Added a regression test in `apps/api/src/routes/overview.test.ts` proving the query calls `limit(200 * centerCount)` before the per-center JS cap.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/overview.test.ts`; `pnpm --filter @pebbledesk/api test -- src/routes/ratios.test.ts src/services/ratio.test.ts src/routes/overview.test.ts src/routes/check-ins.test.ts src/routes/staff-check-ins.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P1: Public Stripe Invoice Payments Can Overpay After Balance Changes

**Evidence:** `apps/api/src/routes/public-invoices.ts` creates a PaymentIntent for current balance, but `apps/api/src/routes/stripe.ts` records full `amount_received` later without rechecking current remaining balance.

**Impact:** A stale public PaymentIntent can overpay if another payment posts before Stripe succeeds.

**Status:** Fixed in this worktree. Added stale PaymentIntent overpayment regression coverage in `apps/api/src/routes/stripe.test.ts`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/stripe.test.ts src/routes/public-invoices.test.ts src/routes/payments.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P1: Subsidy Claims Are Not Database-Idempotent Under Concurrency

**Evidence:** Auto-draft and manual create perform check-then-insert for `(centerId, subsidyCaseId, periodStart, periodEnd)` without a unique database constraint.

**Impact:** Concurrent runs or requests can create duplicate subsidy claims for the same case period.

**Status:** Fixed in this worktree. Added `subsidy_claims_case_period_unique` on `(subsidy_case_id, period_start, period_end)` in schema and migration `0030_subsidy_claim_period_unique.sql`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P1: Subsidy Auto-Draft Ignores Authorization Effective Dates

**Evidence:** `apps/api/src/scheduled/subsidy-auto-draft.ts` filtered subsidy cases by active status but did not check whether the claim period overlapped the case `effectiveDate`/`expirationDate`.

**Impact:** Weekly auto-draft could create claims before authorization starts or after authorization expires if status was not updated first.

**Status:** Fixed in this worktree. The scheduled job now selects effective/expiration dates, skips cases whose authorization window does not overlap the target claim period, and checks existing claims by the same full case/start/end key enforced by the database unique index.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/scheduled/subsidy-auto-draft.test.ts`.

### P2: Subsidy Reconciliation Accepts Invalid Claim Period Queries

**Evidence:** `apps/api/src/routes/subsidy-claims.ts` checked only that reconciliation query params existed, then queried the database before validating date format, ID format, or period ordering.

**Impact:** Invalid or inverted reconciliation periods could return misleading drafts or database-backed not-found responses instead of a clean request validation failure.

**Status:** Fixed in this worktree. Reconciliation now validates the subsidy case ID and claim period before any DB reads.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-claims.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Subsidy Cases And Claims Lack Database-Level Center Scope

**Evidence:** `packages/db/src/schema/subsidies.ts` allowed `subsidy_cases.center_id` to differ from the referenced child center, and `subsidy_claims.center_id` to differ from the referenced subsidy case center because both relationships used single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center subsidy cases or claims that distort claim auto-drafting, reconciliation, billing support, and subsidy exports.

**Status:** Fixed in this worktree. `subsidy_cases` now exposes `(id, center_id)` as a unique constraint, and subsidy cases/claims now declare composite foreign keys that include `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Billing And Subsidy List Filters Accept Invalid UUID Values

**Evidence:** `apps/api/src/routes/invoices.ts` compared raw `guardianId` query values against invoice guardian IDs, and `apps/api/src/routes/subsidy-claims.ts` compared raw `subsidyCaseId` query values against claim case IDs.

**Impact:** Malformed UUID filters could reach database UUID predicates and produce backend errors instead of clean validation responses.

**Status:** Fixed in this worktree. Optional list filters now validate with the shared API UUID schema before any database reads.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts`; `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-claims.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P1: Manual Invoice Creation Is Not Database-Idempotent Under Concurrency

**Evidence:** Invoice import deduplicates by `(centerId, guardianId, periodStart, periodEnd)`, but the manual create service inserted invoices without a duplicate guard and the invoice table had no matching unique index.

**Impact:** Concurrent create requests can bill the same guardian twice for the same period.

**Status:** Fixed in this worktree. Added service preflight rejection, API 409 mapping, and `invoices_center_guardian_period_unique` on `(center_id, guardian_id, period_start, period_end)` in migration `0033_invoice_guardian_period_unique.sql`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/invoices.test.ts`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts`.

### P2: Ratio Violations Do Not Capture Breach Counts Or Required/Actual Ratios

**Evidence:** Design spec requires counts and ratios on `ratio_violations`, but current DB schema and inserts only store center/classroom/timestamps/resolution.

**Impact:** Audit reports cannot show the detected breach state if later attendance changes.

**Status:** Fixed in this worktree. Added nullable breach snapshot fields to `ratio_violations`, migration `0031_ratio_violation_breach_fields.sql`, shared type fields, and service insert coverage for new violations.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/ratio.test.ts`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/shared test -- src/types/attendance.test.ts`; API/DB/shared typechecks.

### P2: Classroom Time-Entry Filter Is Accepted But Ignored

**Evidence:** API/shared/frontend expose `classroomId` for `/api/time-entries`, but the route ignores it and `time_entries` has no direct classroom column.

**Impact:** Users receive unfiltered time entries when filtering by classroom.

**Status:** Fixed in this worktree. The list route now applies `classroomId` through an `exists` predicate over scheduled shifts for the time-entry membership/date.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/time-entries.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Child And Classroom List Filters Accept Invalid Enum/UUID Values

**Evidence:** `apps/api/src/routes/children.ts` cast raw `status`, `ageGroup`, and `classroomId` query strings into Drizzle enum/UUID comparisons, and `apps/api/src/routes/classrooms.ts` did the same for `ageGroup`.

**Impact:** Bad filter values could reach Postgres enum/UUID columns and produce backend errors instead of clean 400 responses.

**Status:** Fixed in this worktree. List filters now validate against shared enum constants and the existing UUID schema before querying.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts`; `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Classroom Assignment Effective Dates Accept Arbitrary Text

**Evidence:** `apps/api/src/routes/classrooms.ts` used `z.string().min(1)` for child and staff assignment `effectiveDate` payloads.

**Impact:** Invalid date text could be persisted into classroom assignment timelines, weakening attendance, ratio, and schedule-derived reporting.

**Status:** Fixed in this worktree. Assignment payloads now require valid `YYYY-MM-DD` calendar dates before any lookup queries run.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Staff Check-Out Accepts Malformed Path IDs Into DB Predicates

**Evidence:** `apps/api/src/routes/staff-check-ins.ts` used `c.req.param("id")` directly when clocking staff out.

**Impact:** Malformed check-in IDs could enter UUID predicates inside the clock-out transaction instead of returning a clean 400.

**Status:** Fixed in this worktree. Clock-out now validates the path ID before opening a transaction.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/staff-check-ins.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Invoice Template Read/Update Accept Malformed Path IDs Into DB Predicates

**Evidence:** `apps/api/src/routes/invoice-templates.ts` validated template IDs for delete but used raw path IDs for read and update.

**Impact:** Malformed template IDs could enter UUID predicates and produce backend errors instead of consistent request validation.

**Status:** Fixed in this worktree. Read, update, and delete now share the same route ID parser.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoice-templates.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Ratio Violation Notes Accept Malformed Path IDs Into DB Predicates

**Evidence:** `apps/api/src/routes/ratios.ts` used the raw violation path ID when saving resolution notes.

**Impact:** Malformed violation IDs could enter UUID predicates and produce backend errors instead of clean request validation.

**Status:** Fixed in this worktree. The route validates the violation path ID before updating.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/ratios.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Ratio Records Lack Database-Level Center Scope

**Evidence:** `packages/db/src/schema/ratios.ts` allowed `ratio_snapshots.center_id` and `ratio_violations.center_id` to differ from the referenced classroom center, and allowed a violation resolver from another center because relationships used single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center ratio snapshots or violations that distort dashboards, compliance history, and audit exports.

**Status:** Fixed in this worktree. Ratio snapshots and violations now declare composite classroom foreign keys that include `center_id`, and ratio violation resolver links are center-scoped.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Schedule And Shift Mutations Accept Malformed Path IDs Into DB Predicates

**Evidence:** `apps/api/src/routes/schedules.ts` and `apps/api/src/routes/shifts.ts` used raw path IDs for schedule/shift read, update, or delete predicates.

**Impact:** Malformed IDs could enter UUID predicates and produce backend errors instead of clean validation responses.

**Status:** Fixed in this worktree. Schedule and shift path IDs are now parsed before lookup, update, and delete operations.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/schedules.test.ts`; `pnpm --filter @pebbledesk/api test -- src/routes/shifts.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Scheduled-Hours Calculation Joins Schedules Without Center Scope

**Evidence:** `apps/api/src/services/time-entries.ts` selected shifts for a center but joined schedules by `schedule_id` only when deriving scheduled hours for time entries.

**Impact:** Legacy or externally inserted cross-center shift rows could use schedule windows from another center in payroll/time-entry calculations.

**Status:** Fixed in this worktree. The shift-to-schedule join now requires `schedules.center_id` to match the requested center.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/time-entries.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Shifts Lack Database-Level Center Scope To Schedules

**Evidence:** `packages/db/src/schema/scheduling.ts` allowed `shifts.center_id` to differ from the referenced schedule center because `shifts.schedule_id` only referenced `schedules.id`.

**Impact:** A stale import, script, or future route bug could persist cross-center shift-to-schedule relationships that distort schedule and time-entry calculations.

**Status:** Fixed in this worktree. `schedules` now exposes `(id, center_id)` as a unique constraint, and `shifts` declares a composite schedule foreign key that includes `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Partial Schedule/Shift Updates Can Persist Invalid Ranges

**Evidence:** Validators only compare start/end when both are present, while PATCH routes write partial fields without checking against stored values.

**Impact:** A single-boundary PATCH can make an existing schedule or shift invalid.

**Status:** Fixed in this worktree. PATCH handlers now read the stored row, validate the merged date/time range, and reject invalid partial updates before writing.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/schedules.test.ts`; `pnpm --filter @pebbledesk/api test -- src/routes/shifts.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: QuickBooks Paid-Invoice Reconciliation Can Be Undone Immediately

**Evidence:** Approval applies QuickBooks paid fields, then calls local payment-state sync, which recomputes from local posted payments and can reset status to `sent`.

**Impact:** Approving a QuickBooks paid-state reconciliation may not persist the paid state.

**Status:** Fixed in this worktree. Payment-state recompute now preserves an invoice already marked `paid` instead of downgrading it when local posted payments are not present yet.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/quickbooks.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: QuickBooks Reconciliation Applies Local Entity Changes Without Center-Scoped Predicates

**Evidence:** `apps/api/src/services/quickbooks.ts` selected and updated local reconciliation targets by `entityId` alone after loading a center-scoped reconciliation item.

**Impact:** A stale or malformed reconciliation item could apply proposed QuickBooks changes to a local customer, invoice, or payment outside the reviewed center boundary.

**Status:** Fixed in this worktree. Reconciliation application now center-scopes local customer, invoice, and payment lookups/updates, including invoice payment-state sync writes.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/quickbooks.test.ts`.

### P2: Child-Guardian Relationships Lack Database-Level Center Scope

**Evidence:** `packages/db/src/schema/guardians.ts` allowed `child_guardians.center_id` to differ from the referenced child or guardian center because the table only had single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center child-to-guardian relationships even when IDs are individually valid.

**Status:** Fixed in this worktree. `children` and `guardians` now expose `(id, center_id)` unique constraints, and `child_guardians` now declares composite child and guardian foreign keys that include `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`.

### P2: Guardian Detail Queries Join Children Without Center Scope

**Evidence:** `apps/api/src/routes/guardians.ts` center-scoped guardian records and child-guardian rows, but the detail and child-list routes joined `children` by `child_id` only.

**Impact:** If legacy data or a future script produced a stale cross-center child-guardian row, guardian detail responses could hydrate child fields from another center.

**Status:** Fixed in this worktree. Both guardian child joins now require `children.center_id` to match the authenticated center.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/guardians.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Guardian Detail Query Joins Child Classrooms Without Center Scope

**Evidence:** `apps/api/src/routes/guardians.ts` center-scoped child classroom assignment rows but joined `classrooms` by `classroom_id` only.

**Impact:** Legacy or externally inserted cross-center assignment rows could hydrate guardian child summaries with classroom fields from another center.

**Status:** Fixed in this worktree. The guardian detail classroom join now requires `classrooms.center_id` to match the authenticated center.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/guardians.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Classroom Roster Queries Join Assigned People Without Center Scope

**Evidence:** `apps/api/src/routes/classrooms.ts` center-scoped assignment rows but joined assigned children and staff memberships by ID only.

**Impact:** Legacy or externally inserted cross-center assignment rows could hydrate roster responses with child or staff fields from another center.

**Status:** Fixed in this worktree. Classroom child and staff roster joins now require the joined child or membership to belong to the authenticated center.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Staff Assignments Lack Database-Level Center Scope

**Evidence:** `packages/db/src/schema/classrooms.ts` allowed `staff_assignments.center_id` to differ from the referenced membership or classroom center because the table only had single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center staff-to-classroom assignments that distort roster, attendance, ratio, and messaging workflows.

**Status:** Fixed in this worktree. `memberships` and `classrooms` now expose `(id, center_id)` unique constraints, and `staff_assignments` now declares composite membership and classroom foreign keys that include `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Staff Check-Ins Lack Database-Level Center Scope

**Evidence:** `packages/db/src/schema/attendance.ts` allowed `staff_check_ins.center_id` to differ from the referenced membership or classroom center because the table only had single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center staff attendance rows that distort ratio, time-entry, and staffing reports.

**Status:** Fixed in this worktree. `staff_check_ins` now declares composite membership and classroom foreign keys that include `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Child Check-Ins Lack Database-Level Center Scope

**Evidence:** `packages/db/src/schema/attendance.ts` allowed `check_ins.center_id` to differ from the referenced child, classroom, checked-in staff, or checked-out staff center because the table only had single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center child attendance rows that distort attendance, ratio, subsidy, billing support, and audit reports.

**Status:** Fixed in this worktree. `check_ins` now declares composite child, classroom, checked-in staff, and checked-out staff foreign keys that include `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Invoices Lack Database-Level Guardian Center Scope

**Evidence:** `packages/db/src/schema/billing.ts` allowed `invoices.center_id` to differ from the referenced guardian center because `guardian_id` only referenced `guardians.id`.

**Impact:** A stale import, script, or future route bug could persist invoices under one center for guardians owned by another center, weakening billing isolation and public invoice link safety.

**Status:** Fixed in this worktree. `invoices` now declares a composite guardian foreign key that includes `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Invoice Line Items Lack Center Scope

**Evidence:** `packages/db/src/schema/billing.ts` stored `invoice_line_items` without `center_id`, so the database could not enforce that line items belonged to the same center as the invoice or optional child. Several write paths also inserted line items without a center-scoped predicate or value.

**Impact:** A stale import, script, or future route bug could persist cross-center billing rows, link another center's child to an invoice line, or delete/replace legacy rows by invoice ID alone.

**Status:** Fixed in this worktree. `invoice_line_items` now has a backfilled non-null `center_id`, composite invoice and child foreign keys, and invoice/import/QuickBooks write paths include center-scoped line item values and predicates.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/api test -- src/services/invoices.test.ts`; DB/API typechecks.

### P2: Invoice Template Line Items Lack Center Scope

**Evidence:** `packages/db/src/schema/billing.ts` stored `invoice_template_line_items` without `center_id`, so the database could not enforce that template line items belonged to the same center as the parent template. Route reads, deletes, and replacements also used template ID alone.

**Impact:** A stale import, script, or future route bug could persist or replace cross-center invoice template line items, weakening billing template isolation.

**Status:** Fixed in this worktree. `invoice_templates` now exposes `(id, center_id)` uniqueness, `invoice_template_line_items` now has a backfilled non-null `center_id`, and template line item route reads/writes/deletes include center-scoped predicates and values.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/api test -- src/routes/invoice-templates.test.ts`; DB/API typechecks.

### P2: Messages And Replies Lack Database-Level Center Scope

**Evidence:** `packages/db/src/schema/messaging.ts` allowed `messages.center_id` to differ from the referenced classroom center, and allowed `message_replies.center_id` to differ from the referenced message or guardian center because those relationships only used single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center messages or replies, weakening communication isolation and inbox/audit correctness.

**Status:** Fixed in this worktree. `messages` now exposes `(id, center_id)` uniqueness and declares a composite classroom foreign key, and `message_replies` now declares composite message and guardian foreign keys that include `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Message Recipients Lack Center Scope

**Evidence:** `packages/db/src/schema/messaging.ts` stored `message_recipients` without `center_id`, so the database could not enforce that recipient rows belonged to the same center as both the message and guardian. Some route filters also selected or updated recipients by message or recipient ID without a recipient-level center predicate.

**Impact:** A stale import, script, or future route bug could persist cross-center recipients or update a legacy cross-center recipient row, weakening family communication isolation.

**Status:** Fixed in this worktree. `message_recipients` now has a backfilled non-null `center_id`, composite message and guardian foreign keys, and message recipient inserts/filters include the authenticated center.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/api test -- src/routes/messages.test.ts`; DB/API typechecks.

### P2: Scheduling Records Lack Database-Level Center Scope

**Evidence:** `packages/db/src/schema/scheduling.ts` allowed `shifts.center_id` to differ from the referenced membership or classroom center, and allowed `time_entries.center_id` to differ from the referenced membership center because those relationships only used single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center schedules or time entries, distorting staffing, classroom coverage, payroll support, and ratio workflows.

**Status:** Fixed in this worktree. `shifts` now declares composite membership and classroom foreign keys that include `center_id`, and `time_entries` now declares a composite membership foreign key.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: QuickBooks Records Lack Database-Level Connection Center Scope

**Evidence:** `packages/db/src/schema/quickbooks.ts` allowed QuickBooks entity links, sync log rows, and reconciliation items to reference a connection from another center because `connection_id` only referenced `quickbooks_connections.id`. Reconciliation reviewer membership also used a single-column foreign key.

**Impact:** A stale import, script, or future route bug could persist cross-center QuickBooks links or reconciliation metadata, weakening accounting isolation and review auditability.

**Status:** Fixed in this worktree. `quickbooks_connections` now exposes `(id, center_id)` uniqueness, QuickBooks child tables now declare composite connection foreign keys, and reconciliation items now declare a composite reviewer membership foreign key.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Guidance Progress And Audit Reports Lack Database-Level Membership Center Scope

**Evidence:** `packages/db/src/schema/guidance.ts` and `packages/db/src/schema/audit.ts` allowed guidance progress and generated audit report rows to reference memberships from another center because the membership relationships only used single-column foreign keys.

**Impact:** A stale import, script, or future route bug could persist cross-center onboarding progress or audit report ownership, weakening operational isolation and audit provenance.

**Status:** Fixed in this worktree. `guidance_progress` and `audit_reports` now declare composite membership foreign keys that include `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P3: Feedback Records Lack Referential Integrity

**Evidence:** `packages/db/src/schema/feedback.ts` stored authenticated feedback `center_id` and `user_id` as loose nullable UUIDs without foreign keys.

**Impact:** A stale script, import, or future route bug could persist feedback provenance pointing to nonexistent centers or users, weakening support/audit traceability.

**Status:** Fixed in this worktree. Feedback now declares nullable foreign keys to centers and users with set-null delete behavior, and migration `0050_feedback_relations.sql` fails fast on existing orphan references.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Child Detail Query Joins Current Classroom Without Center Scope

**Evidence:** `apps/api/src/routes/children.ts` center-scoped the current classroom assignment row but joined `classrooms` by `classroom_id` only.

**Impact:** Legacy or externally inserted cross-center assignment rows could hydrate a child detail response with classroom fields from another center.

**Status:** Fixed in this worktree. The current classroom join now requires `classrooms.center_id` to match the authenticated center.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Classroom Assignments Lack Database-Level Classroom Center Scope

**Evidence:** `packages/db/src/schema/classrooms.ts` allowed `classroom_assignments.center_id` to differ from the referenced classroom center because `classroom_id` only referenced `classrooms.id`.

**Impact:** A stale import, script, or future route bug could persist cross-center classroom assignments that distort child detail, classroom roster, ratio, subsidy, and reporting workflows.

**Status:** Fixed in this worktree. `classroom_assignments` now declares a composite classroom foreign key that includes `center_id`.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; `pnpm --filter @pebbledesk/db typecheck`.

### P2: Message Recipient Resolution Joins Child Relationships Without Center Scope

**Evidence:** `apps/api/src/routes/messages.ts` resolved child and classroom recipients through joins on child IDs without constraining the joined child or child-guardian relationship to the authenticated center. Classroom-recipient resolution also treated future child classroom assignments as current.

**Impact:** Legacy or externally inserted cross-center child-guardian rows could add recipients from outside the intended center when sending child- or classroom-targeted messages, and scheduled future assignments could receive classroom messages early.

**Status:** Fixed in this worktree. Child-recipient joins now scope the joined child and selected `child_guardians` rows to the center, and classroom-recipient joins now scope `child_guardians` to the center and require effective child classroom assignments.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/messages.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P3: QuickBooks Export Pushes Draft/Void Invoices

**Evidence:** QuickBooks sync builds export targets from all local invoices without status filtering.

**Impact:** Draft or void invoices can be pushed as active receivables.

**Status:** Fixed in this worktree. QuickBooks export invoice targets now exclude `draft` and `void` invoices before push/reconciliation target construction.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/quickbooks.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P3: Team Invites Require The Invitee To Already Have An Account

**Evidence:** `apps/api/src/routes/members.ts` rejects invitation email addresses not found in `users`, and accept flow requires membership `userId` to match the current user.

**Impact:** The backend lacks a full invite-by-email flow for new staff.

**Status:** Fixed in this worktree. Memberships now support nullable `user_id` plus `invite_email`, invite creation can target normalized emails without user accounts, pending invites can surface after signup by email, and accepting the token claims the membership for the matching verified user.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/members.test.ts src/routes/auth.test.ts`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts`; API/DB typechecks.

### P3: QuickBooks Review Writes Re-Use Center-Scoped Rows Without Center Predicates

**Evidence:** QuickBooks reconciliation approval/dismissal and existing entity-link/connection updates first loaded records through center-scoped queries, then updated the rows by primary key only.

**Impact:** Primary keys are globally unique, so this was not directly exploitable through the current routes, but a stale object, future refactor, or test/mock gap could write accounting review state or connection metadata without preserving the tenant invariant in the write predicate.

**Status:** Fixed in this worktree. QuickBooks reconciliation item, entity link, and connection updates now include center predicates, with connection/entity identifiers where available.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/quickbooks.test.ts`.

### P3: Ratio Auto-Resolution Updates Open Violations By Id Only

**Evidence:** `apps/api/src/services/ratio.ts` selected open ratio violations by classroom and center, then resolved them with an update keyed only by violation id.

**Impact:** Primary keys are globally unique, but keeping the center/classroom predicate on the write path preserves the ratio audit invariant and reduces risk from stale selected rows or future changes.

**Status:** Fixed in this worktree. Automatic ratio violation resolution now requires the same center and classroom that selected the open violation.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/ratio.test.ts`.

### P2: Subsidy API Is Missing Contracted Submit And Delete Endpoints

**Evidence:** The product API spec lists CRUD for subsidy cases/claims plus `POST /api/subsidy-claims/:id/submit`, but `apps/api/src/routes/subsidy-cases.ts` and `apps/api/src/routes/subsidy-claims.ts` only implemented list/read/create/update.

**Impact:** Directors and owners could draft and update subsidy records but lacked backend routes for explicit claim submission and controlled cleanup of draft data. Without guarded delete behavior, adding raw CRUD later would also risk cascading historical financial/audit records.

**Status:** Fixed in this worktree. Subsidy claims now support submit and draft-only delete. Subsidy cases now support delete only when no claims exist, preserving historical claim records.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-cases.test.ts src/routes/subsidy-claims.test.ts`.

### P3: Shift API Is Missing Contracted Read-By-ID Endpoint

**Evidence:** The product API spec lists CRUD for shifts, but `apps/api/src/routes/shifts.ts` implemented list/create/update/delete without `GET /api/shifts/:id`.

**Impact:** Directors could list shifts but could not fetch a single shift record through the documented backend contract. Staff read access also needed the same self-only membership guard used by shift list/update/delete flows.

**Status:** Fixed in this worktree. Shifts now support center-scoped read-by-ID, and staff users can only read their own membership's shifts.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/shifts.test.ts -t "reads a shift by id|prevents staff from reading another member's shift"`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Invoice API Is Missing Contracted Delete Endpoint

**Evidence:** The product API spec lists CRUD for invoices, but `apps/api/src/routes/invoices.ts` implemented list/read/create/update/send without `DELETE /api/invoices/:id`.

**Impact:** Directors could create and update draft invoices but had no documented backend path to remove mistaken drafts. Adding unrestricted delete later would be risky because invoices may already have payment, public link, or audit history.

**Status:** Fixed in this worktree. Invoices now support center-scoped delete only for draft invoices that have no payment records, and deletion removes invoice line items inside the same transaction.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts -t "invoice deletion"`.

### P2: Stripe Webhook Metadata IDs Reach UUID Predicates Before Validation

**Evidence:** `apps/api/src/routes/stripe.ts` trusted `payment_intent.succeeded` metadata IDs enough to query UUID columns before validating the invoice ID or handling malformed center IDs.

**Impact:** A malformed Stripe metadata value could turn a webhook into a backend/database error instead of a safe acknowledged no-op, increasing retry noise and weakening webhook hardening.

**Status:** Fixed in this worktree. The webhook now acknowledges malformed invoice metadata before UUID-backed invoice queries and treats database invalid-UUID errors from center metadata as non-processable webhook metadata.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/stripe.test.ts`.

### P2: Subscription Webhook Center Metadata Can Reach UUID Predicates Unsafely

**Evidence:** `apps/api/src/routes/subscriptions-webhook.ts` used Stripe checkout and customer subscription `centerId` metadata in center UUID predicates without treating malformed values as unprocessable webhook metadata.

**Impact:** A malformed Stripe subscription webhook could produce a backend/database error instead of an acknowledged no-op, causing unnecessary retries and noisy billing event handling.

**Status:** Fixed in this worktree. Center metadata lookups for checkout and customer subscription webhook branches now convert Postgres invalid-UUID errors into a missing-center result for webhook processing.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subscriptions-webhook.test.ts`.

### P2: Classroom Count Joins Do Not Scope Assignment Tables By Center

**Evidence:** `apps/api/src/routes/classrooms.ts` counted active child and staff assignments for classroom list/detail responses by joining assignment rows on `classroom_id` without also requiring the assignment row's `center_id` to match the authenticated center. The same count and roster queries also treated future assignments as current by checking only `end_date`.

**Impact:** Legacy imports, stale scripts, or future bugs that create cross-center or future-dated assignment rows could inflate classroom child/staff counts and distort compliance-oriented classroom metadata.

**Status:** Fixed in this worktree. Classroom list/detail count joins and roster queries now require assignment rows to match the authenticated center and be effective as of the current date.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts`.

### P2: Child Check-In Accepts Future Classroom Assignments As Active

**Evidence:** `apps/api/src/routes/check-ins.ts` validated a child's classroom assignment with matching child/classroom/center and `end_date is null`, but did not require `effective_date` to be on or before the check-in date.

**Impact:** A scheduled future classroom assignment could authorize attendance records before the child actually belongs in that room, weakening attendance and ratio compliance integrity.

**Status:** Fixed in this worktree. Check-in relation validation now requires the child classroom assignment to be effective as of the current date before permitting a check-in.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/check-ins.test.ts`.

### P2: Children APIs Treat Future Classroom Assignments As Current

**Evidence:** `apps/api/src/routes/children.ts` used `end_date is null` to determine current staff classroom access, child classroom filters, and a child's current classroom without requiring assignment `effective_date` to be current.

**Impact:** Future classroom/staff assignments could expose child records early, populate classroom-filtered child lists incorrectly, or show a child's scheduled room as the current classroom.

**Status:** Fixed in this worktree. Children list/detail access and classroom filters now require staff and child classroom assignments to be effective as of the current date.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts`.

### P2: Direct Child Status Patch Can Reactivate Without Clearing Withdrawal Metadata

**Evidence:** `PATCH /api/children/:id` allowed `enrollmentStatus: "active"` and checked plan capacity, but only `POST /api/children/:id/reactivate` cleared `withdrawnAt` and refreshed `enrolledAt`.

**Impact:** A child could be active while still carrying stale withdrawal metadata, creating conflicting enrollment state for reports, billing decisions, and compliance review.

**Status:** Fixed in this worktree. PATCH activation now uses the current enrollment status lookup to clear `withdrawnAt` and set a fresh `enrolledAt` only when transitioning from a non-active status.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts`.

### P1: Withdrawing A Checked-In Child Leaves Them In Live Ratio Counts

**Evidence:** Live ratio reads count open `check_ins` rows by classroom. Child withdrawal ended active classroom assignments but did not close existing open check-ins.

**Impact:** A withdrawn child who was still checked in could continue counting toward live ratios and attendance state until someone manually checked the child out, creating inaccurate compliance status.

**Status:** Fixed in this worktree. Both dedicated withdrawal and PATCH withdrawal now close open child check-ins with `checkedOutAt` and the acting `membershipId` before ending classroom assignments.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts`.

### P1: Moving A Child To Waitlist Or Inactive Can Leave Live Attendance State

**Evidence:** `PATCH /api/children/:id` accepted every enrollment status. The cleanup added for withdrawn status did not cover other non-active statuses such as `waitlist` and `inactive`.

**Impact:** A child moved away from active enrollment could keep open check-ins and active classroom assignments, leaving stale live ratio and roster state.

**Status:** Fixed in this worktree. PATCH transitions to any non-active enrollment status now close open child check-ins and end active classroom assignments; `withdrawnAt` remains specific to the `withdrawn` status.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts`.

### P1: Non-Active Children Can Be Checked In Through Stale Assignments

**Evidence:** `POST /api/check-ins` verified child center ownership and active classroom assignment, but did not verify that the child enrollment status was still `active`.

**Impact:** If stale assignment data existed, a waitlisted, inactive, or withdrawn child could be checked in and counted in live attendance and ratio calculations.

**Status:** Fixed in this worktree. Check-in relation validation now selects the child enrollment status and rejects non-active children before classroom, duplicate, or insert work continues.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/check-ins.test.ts -t "non-active child"`; `pnpm --filter @pebbledesk/api test -- src/routes/check-ins.test.ts`.

### P2: Child Check-In Allows Archived Classrooms

**Evidence:** `POST /api/check-ins` checked that the classroom belonged to the center, but did not check `classrooms.archived_at`.

**Impact:** Stale assignments could allow new child attendance and ratio counts in a classroom that had been retired.

**Status:** Fixed in this worktree. Child check-in relation validation now rejects archived classrooms before assignment, duplicate, or insert work continues.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/check-ins.test.ts -t "archived classroom"`; `pnpm --filter @pebbledesk/api test -- src/routes/check-ins.test.ts`.

### P2: Staff Clock-In Allows Archived Classrooms

**Evidence:** `POST /api/staff-check-ins` checked classroom center ownership but not `classrooms.archived_at`.

**Impact:** Staff could be clocked into retired classrooms, inflating or distorting live ratio counts for rooms that should no longer receive attendance activity.

**Status:** Fixed in this worktree. Staff clock-in now rejects archived classrooms before assignment checks or transaction work.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/staff-check-ins.test.ts -t "archived classroom"`; `pnpm --filter @pebbledesk/api test -- src/routes/staff-check-ins.test.ts`.

### P1: Classroom Child Assignment Allows Non-Active Children

**Evidence:** `POST /api/classrooms/:id/children` verified that the child belonged to the center, but did not verify `children.enrollment_status`.

**Impact:** Waitlisted, inactive, or withdrawn children could be assigned into active classroom rosters, making later check-in and ratio state inconsistent with enrollment status.

**Status:** Fixed in this worktree. Direct child assignment now rejects non-active children before ending existing assignments or inserting a new classroom assignment.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts -t "non-active child"`; `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts`.

### P2: Classroom Child Assignment Allows Archived Classrooms

**Evidence:** `POST /api/classrooms/:id/children` verified that the classroom belonged to the center, but did not check `classrooms.archived_at`.

**Impact:** Children could be assigned into retired classrooms, reintroducing stale rosters and later attendance/ration inconsistencies.

**Status:** Fixed in this worktree. Direct child assignment now rejects archived classrooms before child lookup or assignment writes.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts -t "assigning a child to an archived"`; `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts`.

### P2: Classroom Staff Assignment Allows Archived Classrooms

**Evidence:** `POST /api/classrooms/:id/staff` verified that the classroom belonged to the center, but did not check `classrooms.archived_at`.

**Impact:** Staff could be assigned into retired classrooms, creating stale staff rosters and later ratio/attendance inconsistencies.

**Status:** Fixed in this worktree. Direct staff assignment now rejects archived classrooms before membership lookup or assignment writes.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts -t "staff to an archived"`; `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts`.

### P2: Guardian Staff Access Treats Future Assignments As Current

**Evidence:** `apps/api/src/routes/guardians.ts` used `end_date is null` when checking staff classroom access and linked child classroom rows, without requiring staff or child assignments to be effective as of the current date.

**Impact:** A staff member with a future classroom assignment could gain guardian/child visibility early, and guardian detail responses could show scheduled classroom links as current.

**Status:** Fixed in this worktree. Guardian staff access and linked child classroom joins now require assignment `effective_date` to be on or before the current date.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/guardians.test.ts`.

### P2: Auth Session Includes Future Staff Classroom Assignments

**Evidence:** `apps/api/src/routes/auth.ts` returned `session.classroomIds` from staff assignment rows with `end_date is null` but without an `effective_date` boundary.

**Impact:** Staff users could receive future classroom IDs in their authenticated session early, enabling frontend affordances and downstream access checks to treat scheduled rooms as current.

**Status:** Fixed in this worktree. `/api/auth/me` now only includes staff classroom assignments that are effective as of the current date.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/auth.test.ts`.

### P2: Subsidy Classroom Reports Ignore Assignment Report-Period Overlap

**Evidence:** `apps/api/src/services/report-artifacts.ts` filtered subsidy classroom exports through current open classroom assignments only, checking `end_date is null` without ensuring the assignment overlapped the requested report period.

**Impact:** Historical subsidy reports could omit children who were assigned to the classroom during the report window but later moved or ended, and future assignments could be considered without a period boundary.

**Status:** Fixed in this worktree. Subsidy classroom report filtering now includes child classroom assignments whose effective/end dates overlap the requested report period.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/report-artifacts.test.ts`.

### P2: Documented Center Team Routes Are Missing

**Evidence:** `docs/superpowers/specs/2026-04-07-pebbledesk-scaffold-design.md` lists `GET /api/centers/:id/members`, `POST /api/centers/:id/invites`, and `DELETE /api/centers/:id/members/:memberId`, but the backend only exposed equivalent team operations under `/api/members`.

**Impact:** Clients built against the documented contract would receive 404s for team roster, invite, and removal operations despite the backend having equivalent business logic.

**Status:** Fixed in this worktree. The documented center-scoped team routes now reuse the same member list/invite/delete handlers and enforce that the path center matches the authenticated center.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/centers.test.ts src/routes/members.test.ts`.

### P2: Documented QuickBooks Connect Route Is Missing

**Evidence:** `docs/superpowers/specs/2026-04-07-pebbledesk-scaffold-design.md` lists `POST /api/quickbooks/connect`, while the backend only exposed `POST /api/quickbooks/connect/start`.

**Impact:** Clients built against the documented QuickBooks connect contract would receive a 404 even though the OAuth start flow existed under a newer route.

**Status:** Fixed in this worktree. `POST /api/quickbooks/connect` now reuses the same OAuth start handler as `/api/quickbooks/connect/start`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/quickbooks.test.ts`; `pnpm --filter @pebbledesk/api typecheck`.

### P2: Payment Invoice Filter Accepts Invalid UUID Input

**Evidence:** `apps/api/src/routes/payments.ts` passed `invoiceId` from `paymentsQuerySchema` directly into a UUID-column predicate, but `packages/shared/src/validators/billing.ts` accepted any string for that query parameter.

**Impact:** A malformed `GET /api/payments?invoiceId=...` request could reach the database as an invalid UUID predicate instead of failing as a client validation error.

**Status:** Fixed in this worktree. `paymentsQuerySchema.invoiceId` now uses the shared UUID-like validator before the route builds payment predicates.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/payments.test.ts`; `pnpm --filter @pebbledesk/shared test -- src/validators/billing.test.ts`.

### P2: QuickBooks Reconciliation Local Target Accepts Invalid UUID Input

**Evidence:** `packages/shared/src/validators/quickbooks.ts` allowed any non-empty string for `localTargetId`, while QuickBooks reconciliation approval uses that value as a local guardian, invoice, or payment identifier.

**Impact:** A malformed approval request could reach local entity lookup predicates as an invalid local ID instead of failing route validation.

**Status:** Fixed in this worktree. `quickbooksReviewReconciliationSchema.localTargetId` now uses the shared UUID-like validator.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/quickbooks.test.ts`; `pnpm --filter @pebbledesk/shared test -- src/validators/quickbooks.test.ts`.

### P2: Documented Ratio History Route Is Missing

**Evidence:** `docs/superpowers/specs/2026-04-07-pebbledesk-scaffold-design.md` lists `GET /api/ratios/history`, while the backend exposed historical ratio snapshots only at `GET /api/ratios/snapshots`.

**Impact:** Clients built against the documented ratio audit contract would receive a 404 for historical ratio snapshots.

**Status:** Fixed in this worktree. `GET /api/ratios/history` now returns the same snapshot payload as `/api/ratios/snapshots`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/ratios.test.ts`.

### P2: Invoice Templates Allow Multiple Defaults Per Center

**Evidence:** `apps/api/src/routes/invoice-templates.ts` created and updated templates with `isDefault: true` without clearing any existing default template for the same center.

**Impact:** Billing screens could show multiple default invoice templates, leaving invoice creation behavior ambiguous and making the "Default" flag unreliable for directors.

**Status:** Fixed in this worktree. Creating or updating a default invoice template now atomically clears other default templates in the same center before saving the requested default, and the database now enforces the invariant with a partial unique index.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoice-templates.test.ts`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts -t "default invoice template"`.

### P2: Report Generation Rejects The Frontend Format Option

**Evidence:** `apps/web/src/routes/_auth/reports/index.tsx` sends `format: "pdf" | "csv"` with report generation requests, but `packages/shared/src/validators/reports.ts` used a strict backend schema that did not accept `format`.

**Impact:** Directors selecting a report format in the UI could receive a backend 400 before report generation, blocking audit export workflows.

**Status:** Fixed in this worktree. Report generation now validates the frontend format option and the report artifact service can produce PDF artifacts for formatted report requests while preserving existing CSV/ZIP behavior.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/reports.test.ts src/services/report-artifacts.test.ts`; `pnpm --filter @pebbledesk/shared test -- tests/validators.test.ts -t "generateReportSchema"`.

### P2: Invoice List Omits Line Items Needed For Billing Edits

**Evidence:** `apps/web/src/routes/_auth/billing/index.tsx` opens invoice edit dialogs from `useInvoices()` list results and only preloads invoice lines when the invoice object includes `lineItems`. `GET /api/invoices` returned serialized invoices without their line items, while `GET /api/invoices/:id` had the detail-only line item payload.

**Impact:** Editing a draft invoice from the billing list could open with a blank line item and overwrite the original invoice charges when saved.

**Status:** Fixed in this worktree. `GET /api/invoices` now loads line items for the returned invoice IDs and attaches `lineItems` to each invoice in the list response.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts`.

### P2: Future-Ended Assignments Disappear Before Their End Date

**Evidence:** Assignment readers were updated to require `effective_date <= today`, but many still required `end_date is null`. Scheduling a future classroom move sets the current assignment's `end_date` to that future effective date, so the current assignment could stop counting for attendance, staff access, rosters, messaging, and auth session classroom IDs before the move date.

**Impact:** Future-dated reassignment could prematurely remove attendance/check-in permissions and classroom visibility, weakening operational continuity and ratio/compliance workflows.

**Status:** Fixed in this worktree. Active classroom/staff assignment predicates now treat rows as current when `effective_date <= today` and `end_date` is either null or later than today. Assignment-ending mutations also target assignments active within that same window.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/check-ins.test.ts src/routes/staff-check-ins.test.ts src/routes/classrooms.test.ts src/routes/children.test.ts src/routes/guardians.test.ts src/routes/messages.test.ts src/routes/auth.test.ts`.

### P2: Invoice Validators Allow Fractional Quantities For Integer Columns

**Evidence:** `packages/db/src/schema/billing.ts` stores `invoice_line_items.quantity` as an integer, but `packages/shared/src/validators/billing.ts` allowed any positive number for invoice line item quantities. Invoice template line items already required integer quantities.

**Impact:** A create or update invoice request with a fractional quantity could pass API validation and then fail or coerce unpredictably at the database boundary.

**Status:** Fixed in this worktree. Invoice line item validation now requires integer positive quantities, matching invoice template validation and the database schema.

**Verification:** `pnpm --filter @pebbledesk/shared test -- src/validators/billing.test.ts -t "fractional line item"`; `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts`.

### P2: Partial Subsidy Case Updates Can Invert Authorization Dates

**Evidence:** `apps/api/src/routes/subsidy-cases.ts` validated PATCH bodies field-by-field, but did not compare a patched `effectiveDate` against the stored `expirationDate` or a patched `expirationDate` against the stored `effectiveDate`.

**Impact:** A director could persist an invalid subsidy authorization window through a single-field patch, weakening subsidy eligibility checks, claim auto-drafting, and report accuracy.

**Status:** Fixed in this worktree. Date-changing subsidy case PATCH requests now load the stored dates and validate the merged authorization window before writing.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-cases.test.ts`.

### P2: Partial Invoice Updates Can Invert Billing Periods

**Evidence:** `apps/api/src/routes/invoices.ts` loaded the existing invoice before PATCH writes, but only validated `periodStart <= periodEnd` on the submitted partial body. A request changing only one period bound could invert the stored billing period.

**Impact:** Directors could persist invalid invoice billing windows, weakening duplicate-billing protection, public invoice links, and billing exports.

**Status:** Fixed in this worktree. Period-changing invoice PATCH requests now validate the merged existing/submitted period before opening the update transaction.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts`.

### P2: Invoice PATCH Accepts Derived Totals That Are Not Applied

**Evidence:** `packages/shared/src/validators/billing.ts` accepts `subtotal` and `amountDue` on invoice updates, but `apps/api/src/routes/invoices.ts` derives totals from line items and subsidy credit. A PATCH containing only `amountDue` or `subtotal` could validate and then write only `updatedAt`.

**Impact:** Clients could receive a successful response for a financial-total change that the backend silently ignored, creating billing workflow confusion and weak API semantics around invoice amounts.

**Status:** Fixed in this worktree. Invoice PATCH now rejects direct derived-total changes unless line items are included so the server can recompute and validate the totals.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts`.

### P2: Invoice Import Upserts Bypass Invoice Edit Locks

**Evidence:** `apps/api/src/routes/imports.ts` allowed duplicate invoice imports with `dedupeStrategy: "upsert"` to rewrite status, paid date, line items, and totals on the existing invoice without checking the stored invoice status. The normal invoice PATCH route blocks those edits for non-draft invoices.

**Impact:** A CSV/import retry could rewrite sent, paid, overdue, or void invoice records and their public-link balances, weakening billing integrity and audit expectations.

**Status:** Fixed in this worktree. Invoice import upserts now select the existing invoice status and reject non-draft invoice upserts with `invoice_locked` before any update/delete/insert work.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/imports.test.ts`.

### P2: Manual Payment Creation Uses A Stale Invoice Snapshot

**Evidence:** `apps/api/src/routes/payments.ts` selected an invoice before opening the payment transaction, locked the invoice row, but did not read or validate the locked row before inserting the payment and updating invoice status.

**Impact:** A concurrent payment or invoice void could change the invoice after the pre-read. The manual payment route could then record a payment against an invoice that was already paid or void, or calculate balance from stale invoice data.

**Status:** Fixed in this worktree. Manual payment creation now reads the locked invoice row inside the transaction and revalidates existence, status, amount due, and paid date from that locked snapshot before inserting the payment.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/payments.test.ts`.

### P2: QuickBooks-Origin Payments Can Overpay Local Invoices

**Evidence:** `apps/api/src/services/quickbooks.ts` created local QuickBooks payment rows when approving QuickBooks-origin payment reconciliation items without checking the selected local invoice balance or void status. Manual payments and Stripe webhook payments already enforce those billing invariants.

**Impact:** Approving an imported QuickBooks payment could create a posted payment that exceeds the local invoice balance or applies to a void invoice, weakening invoice state, public balances, and auditability.

**Status:** Fixed in this worktree. QuickBooks-origin payment approval now validates the selected local invoice and existing posted payments before inserting a posted QuickBooks payment.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/quickbooks.test.ts`.

### P2: Local-Origin QuickBooks Payment Reconciliation Can Overpay Local Invoices

**Evidence:** `apps/api/src/services/quickbooks.ts` applied local-origin payment reconciliation changes by updating the existing payment amount/status before recomputing invoice payment state. That path did not recheck invoice balance or void status when QuickBooks proposed a posted payment amount.

**Impact:** Approving a QuickBooks reconciliation item for an existing local payment could overpay the invoice or post against a void invoice, bypassing the same billing invariants enforced by manual payments and QuickBooks-origin payment insertion.

**Status:** Fixed in this worktree. Local-origin payment reconciliation now validates posted payment updates against the center-scoped invoice and existing posted payments before writing the payment, and QuickBooks-origin insertion shares the same guard.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/quickbooks.test.ts -t "local-origin payment approvals that would overpay"`; `pnpm --filter @pebbledesk/api test -- src/services/quickbooks.test.ts`.

### P2: Marketing Signup And Survey Components Post To Missing Site Endpoints

**Evidence:** `packages/marketing/src/components/email-capture.tsx` and `packages/marketing/src/components/post-signup-survey.tsx` post to `/api/signup` and `/api/survey` on the resolved marketing API origin, while `apps/site/src/worker.ts` only handled `/api/leads`, `/api/unsubscribe`, and `/api/ai-sdr/product-context`.

**Impact:** Public conversion flows could submit a valid email, then receive static asset fallback responses instead of a JSON signup response with referral and survey metadata. Survey answers could not be persisted at all.

**Status:** Fixed in this worktree. The marketing Worker now exposes D1-backed `/api/signup` and `/api/survey` handlers, CORS preflight support, and migration `0005_public_signup_survey.sql` for public signup metadata and survey answers. Duplicate signup submissions now return a success-shaped response without disclosing bearer survey tokens or referral metadata. Public signup writes are token-bucket limited by IP and email, survey writes are token-bucket limited by IP and survey token, and signup position is not uniquely constrained because public position allocation is best-effort under concurrent submissions.

**Verification:** `pnpm --filter @pebbledesk/site test -- src/worker.test.ts -t "public signup flow"`; `pnpm --filter @pebbledesk/site test -- src/worker.test.ts`; `pnpm --filter @pebbledesk/site test -- --coverage`.

### P2: Onboarding Selected Plan Is Dropped During Center Creation

**Evidence:** `apps/web/src/routes/onboarding.tsx` sends `subscriptionPlan` with `POST /api/centers`, but `packages/shared/src/validators/center.ts` did not accept the field and `apps/api/src/routes/centers.ts` hardcoded new centers to `subscriptionPlan: "trial"`.

**Impact:** A user's selected self-serve plan intent from signup onboarding was lost at center creation, leaving downstream billing and checkout flows unable to distinguish Home, Center, or Group trial intent.

**Status:** Fixed in this worktree. Center creation validation now accepts the existing self-serve subscription plan schema, and the API persists the selected plan while retaining `trial` as the default when no plan is supplied.

**Verification:** `pnpm --filter @pebbledesk/shared test -- tests/validators.test.ts -t "subscription plan intent"`; `pnpm --filter @pebbledesk/api test -- src/routes/centers.test.ts -t "subscription plan intent"`; `pnpm --filter @pebbledesk/api test -- src/routes/centers.test.ts`; `pnpm --filter @pebbledesk/shared test -- tests/validators.test.ts`.

### P2: Selected Paid-Plan Trials Bypass Expiry And Entitlement Limits

**Evidence:** After center creation preserves selected self-serve plans, `apps/api/src/scheduled/trial-expirer.ts` still expired only `subscriptionPlan = "trial"` rows, while `apps/api/src/middleware/plan.ts` and `apps/web/src/lib/plan-gate.tsx` treated every `trialing` center as full-access regardless of selected paid plan.

**Impact:** A Home trial without a Stripe subscription could remain `trialing` after trial expiry, and selected Home trials could access backend/frontend features that the Home plan does not include, such as QuickBooks and subsidy billing.

**Status:** Fixed in this worktree. Trial expiry now cancels any expired `trialing` center with no Stripe subscription. Backend and frontend plan gates keep full exploratory access only for legacy `subscriptionPlan: "trial"` rows; selected paid-plan trials are constrained to their selected plan while still recording allowed trial feature usage.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/scheduled/trial-expirer.test.ts -t "selected-plan trials"`; `pnpm --filter @pebbledesk/api test -- src/middleware/plan.test.ts -t "selected paid-plan trials"`; `pnpm --filter @pebbledesk/web test -- src/lib/plan-gate.test.tsx -t "selected paid-plan trials"`; `pnpm --filter @pebbledesk/api test -- src/scheduled/trial-expirer.test.ts src/middleware/plan.test.ts src/routes/centers.test.ts`; `pnpm --filter @pebbledesk/web test -- src/lib/plan-gate.test.tsx src/routes/settings-page.test.tsx`; `pnpm --filter @pebbledesk/web test -- --coverage`.

### P2: Classroom Assignments Lack Database-Enforced Child Center Scope

**Evidence:** `packages/db/src/schema/classrooms.ts` declared `classroom_assignments.child_id` as a bare UUID while only enforcing the classroom relationship through `classroom_assignments_classroom_center_fk`. Migration `0037_classroom_assignment_center_scope.sql` likewise added only the classroom composite foreign key.

**Impact:** API routes validate child ownership before inserting assignments, but the database could still accept a future import, manual write, or route regression that assigns a child from one center to a classroom assignment row scoped to another center.

**Status:** Fixed in this worktree. `classroom_assignments` now has `classroom_assignments_child_center_fk` on `(child_id, center_id)` referencing `children(id, center_id)` with cascade delete. The migration includes a preflight check that rejects existing cross-center child assignment rows before adding the constraint.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts -t "classroom assignment"`; `pnpm --filter @pebbledesk/db test -- --coverage`.

### P2: Subscription Webhooks Process Events For Missing Metadata Centers

**Evidence:** `apps/api/src/routes/subscriptions-webhook.ts` verified `checkout.session.completed` metadata centers existed before mutating state, but `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` continued when the metadata `centerId` lookup returned no row.

**Impact:** Subscription events with stale, nonexistent, or malformed-but-select-tolerated center metadata could still open the idempotency transaction and attempt center updates/notification writes for a center that does not exist. In Postgres this can surface as retry-prone UUID predicate errors or misleading processed idempotency rows without a valid tenant.

**Status:** Fixed in this worktree. Subscription lifecycle webhook events now fail closed like checkout completion: if the metadata center cannot be resolved, the endpoint acknowledges Stripe with `{ received: true }` and skips idempotency, center mutation, and notification work.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subscriptions-webhook.test.ts -t "metadata centerId does not resolve"`; `pnpm --filter @pebbledesk/api test -- src/routes/subscriptions-webhook.test.ts`.

### P2: Invoice Delete Can Race With Payment Or Status Changes

**Evidence:** `apps/api/src/routes/invoices.ts` checked invoice draft status and absence of payments before opening the delete transaction, then deleted line items and the invoice by only `id` and `centerId`. A concurrent send/payment could occur after the precheck and before the delete.

**Impact:** A draft invoice could be deleted after it became sent or after a payment was recorded, and cascade deletion could remove the concurrent payment record. That weakens billing auditability and public payment integrity.

**Status:** Fixed in this worktree. Invoice deletion now locks the invoice row with `FOR UPDATE` inside the delete transaction, rechecks that it is still draft, rechecks for center-scoped payments inside the same transaction, and only then deletes line items and the invoice.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts -t "rechecks payments inside"`; `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts`.

### P2: Stripe Payment Webhooks Can Record Zero-Dollar Payments From Malformed Events

**Evidence:** `apps/api/src/routes/stripe.ts` treated an absent `payment_intent.succeeded` `amount_received` field as `0` before inserting a posted payment.

**Impact:** A malformed or partial provider event could create a posted zero-dollar Stripe payment and mark the invoice paid, weakening billing history, public invoice state, and audit expectations.

**Status:** Fixed in this worktree. Stripe payment webhooks now acknowledge but skip succeeded events unless `amount_received` is a positive integer, and the non-card/no-created fallback still records the actual received amount.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/stripe.test.ts -t "without amount_received|non-card payment method"`; `pnpm --filter @pebbledesk/api test -- src/routes/stripe.test.ts`.

### P2: Subsidy Case Delete Can Race With Claim Creation

**Evidence:** `apps/api/src/routes/subsidy-cases.ts` checked for existing claims before deleting a subsidy case, but the claim check and delete were not performed under the same row lock or transaction.

**Impact:** A concurrent subsidy claim could be created after the precheck and before the case delete. Because claims cascade from subsidy cases, the delete could remove a newly created claim and weaken subsidy audit history.

**Status:** Fixed in this worktree. Subsidy case deletion now locks the case row with `FOR UPDATE`, rechecks center-scoped claims inside the delete transaction, and only deletes when the locked case still has no claims.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-cases.test.ts -t "rechecks claims inside"`; `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-cases.test.ts`.

### P2: Public Invoice PaymentIntents Can Be Created For Draft Invoices

**Evidence:** `apps/api/src/routes/public-invoices.ts` created Stripe PaymentIntents for any valid public invoice link except already-paid invoices, while `apps/api/src/routes/stripe.ts` records successful public payments only for `sent` or `overdue` invoices.

**Impact:** If a public link exists while the invoice is still `draft`, a guardian could complete a Stripe payment that PebbleDesk later acknowledges but ignores as non-payable, leaving no posted payment and no paid invoice state.

**Status:** Fixed in this worktree. Public PaymentIntent creation and Stripe webhook recording now share the same payable invoice status rule: only `sent` and `overdue` invoices can accept public payments.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/public-invoices.test.ts -t "rejects draft invoices"`; `pnpm --filter @pebbledesk/api test -- src/routes/public-invoices.test.ts src/routes/stripe.test.ts`.

### P2: Subsidy Claim Delete Can Race With Claim Submission

**Evidence:** `apps/api/src/routes/subsidy-claims.ts` checked that a subsidy claim was still `draft` before deleting it, but the status check and delete were separate database operations with no row lock.

**Impact:** A concurrent submit could change a draft claim to `submitted` between the precheck and delete, allowing the delete path to remove a claim that was no longer editable.

**Status:** Fixed in this worktree. Subsidy claim deletion now locks the claim row with `FOR UPDATE`, rechecks draft status inside the transaction, and only deletes the locked draft row.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-claims.test.ts -t "rechecks draft status"`; `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-claims.test.ts`.

### P2: Subsidy Claim Submit Can Race With Claim Status Changes

**Evidence:** `apps/api/src/routes/subsidy-claims.ts` checked that a subsidy claim was `draft` before submitting it, then updated the claim in a separate database operation without locking or constraining the updated row.

**Impact:** A concurrent approval/payment/delete workflow could change the claim after the precheck. The submit route could then overwrite a non-draft claim into `submitted`, weakening subsidy claim state transitions and audit expectations.

**Status:** Fixed in this worktree. Subsidy claim submit now locks the claim row with `FOR UPDATE`, rechecks draft status inside the transaction, and only submits the locked draft row.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-claims.test.ts -t "submit|non-draft subsidy claim"`; `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-claims.test.ts`.

### P2: Time Entries Lack Database-Level Nonnegative Hour Checks

**Evidence:** `packages/shared/src/validators/scheduling.ts` and `apps/api/src/routes/time-entries.ts` reject negative `hoursWorked`, `hoursScheduled`, and `overtimeHours`, but `packages/db/src/schema/scheduling.ts` allowed negative persisted values for those columns.

**Impact:** A script, import, direct maintenance write, or future backend path could persist negative time-entry hours, corrupting payroll, staffing coverage, and time-entry reporting.

**Status:** Fixed in this worktree. `time_entries` now declares `time_entries_nonnegative_hours_check`, and migration `0052_time_entry_hours_check.sql` fails fast if existing negative hour values would violate the constraint.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts -t "time entry hour"`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts`.

### P2: Shifts Lack Database-Level Day And Time Range Checks

**Evidence:** `packages/shared/src/validators/scheduling.ts` and `apps/api/src/routes/shifts.ts` require `dayOfWeek` to be 0-6, time strings to be `HH:MM`, and `startTime < endTime`, but `packages/db/src/schema/scheduling.ts` previously persisted `shifts.day_of_week`, `start_time`, and `end_time` with no matching check constraints.

**Impact:** A script, import, direct maintenance write, or future backend path could persist impossible shift days or inverted shift windows, corrupting schedules, classroom staffing, and time-entry comparisons.

**Status:** Fixed in this worktree. `shifts` now declares `shifts_day_of_week_check` and `shifts_time_order_check`, and migration `0053_shift_temporal_check.sql` fails fast if existing rows violate those constraints.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts -t "shift.*time|temporal|valid shift"`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts`.

### P2: Subsidy Claims Lack Database-Level Amount Ordering Checks

**Evidence:** `packages/shared/src/validators/subsidy.ts` rejects `amountApproved > amountClaimed` and `amountPaid > amountApproved`, but `packages/db/src/schema/subsidies.ts` only enforced nonnegative subsidy claim amounts and ordered periods.

**Impact:** A script, import, direct maintenance write, or future backend regression could persist a claim paid for more than the approved amount or approved for more than was claimed, corrupting reimbursement reporting and subsidy audit history.

**Status:** Fixed in this worktree. `subsidy_claims` now declares `subsidy_claims_amount_order_check`, and migration `0054_subsidy_claim_amount_order_check.sql` fails fast if existing rows violate the amount ordering before adding the constraint.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts -t "subsidy claim amount order|nonnegative claim values|migration journal"`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts`.

### P2: Schedules Lack Database-Level Effective Date Ordering Checks

**Evidence:** `packages/shared/src/validators/scheduling.ts` and `apps/api/src/routes/schedules.ts` require `effectiveFrom <= effectiveUntil` when an end date is present, but `packages/db/src/schema/scheduling.ts` previously stored schedule effective dates with no matching check constraint.

**Impact:** A script, import, direct maintenance write, or future backend path could persist a schedule whose end date is before its start date, corrupting active-schedule filtering and shift planning.

**Status:** Fixed in this worktree. `schedules` now declares `schedules_effective_date_order_check`, and migration `0055_schedule_date_order_check.sql` fails fast if existing rows violate the date ordering before adding the constraint.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts -t "schedule date order|ordered schedule effective dates|migration journal"`.

### P2: Attendance Tables Lack Database-Level End-After-Start Checks

**Evidence:** `apps/api/src/routes/check-ins.ts` and `apps/api/src/routes/staff-check-ins.ts` set check-out and clock-out timestamps from server time, and downstream subsidy/time-entry logic assumes completed attendance ranges do not run backward. `packages/db/src/schema/attendance.ts` previously had no check preventing `checked_out_at < checked_in_at` or `clocked_out_at < clocked_in_at`.

**Impact:** A script, import, direct maintenance write, or future backend regression could persist inverted attendance records, corrupting subsidy attendance summaries, child attendance history, staff time entries, and ratio audit timelines.

**Status:** Fixed in this worktree. `check_ins` now declares `check_ins_checkout_after_checkin_check`, `staff_check_ins` now declares `staff_check_ins_clockout_after_clockin_check`, and migration `0056_attendance_temporal_check.sql` fails fast if existing rows violate either temporal invariant before adding the constraints.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts -t "attendance temporal|end times cannot precede|migration journal"`.

### P2: Classroom And Staff Assignments Lack Database-Level Date Ordering Checks

**Evidence:** `apps/api/src/routes/classrooms.ts`, attendance reads, ratio reads, reports, and staff workflows interpret active assignments as `effective_date <= today` with a null or future `end_date`. `packages/db/src/schema/classrooms.ts` previously allowed `classroom_assignments.end_date` and `staff_assignments.end_date` to precede `effective_date`.

**Impact:** A script, import, direct maintenance write, or future backend regression could persist inverted assignment windows, corrupting classroom rosters, attendance routing, ratio calculations, staff assignment timelines, and audit reports.

**Status:** Fixed in this worktree. `classroom_assignments` now declares `classroom_assignments_date_order_check`, `staff_assignments` now declares `staff_assignments_date_order_check`, and migration `0057_assignment_date_order_check.sql` fails fast if existing rows violate either date-order invariant before adding the constraints.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts -t "assignment date order|assignment end dates|migration journal"`.

### P2: Classrooms Lack Database-Level Positive Capacity And Ratio Checks

**Evidence:** `packages/shared/src/validators/classroom.ts` and `apps/api/src/routes/classrooms.ts` require `maxCapacity`, `minRatioStaff`, and `minRatioChildren` to be positive integers, but `packages/db/src/schema/classrooms.ts` previously allowed zero or negative classroom values.

**Impact:** A script, import, direct maintenance write, or future backend path could persist impossible classroom capacity or ratio configuration, corrupting ratio calculations, classroom list displays, staffing decisions, and audit history.

**Status:** Fixed in this worktree. `classrooms` now declares `classrooms_positive_capacity_ratio_check`, and migration `0058_classroom_positive_values_check.sql` fails fast if existing rows violate the invariant before adding the constraint.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts -t "classroom positive|positive classroom|migration journal"`.

### P2: Guardian Imports Miss Case-Variant Duplicate Emails

**Evidence:** The database enforces `guardians_center_email_unique` as a case-insensitive unique index on `lower(email)`, but `apps/api/src/routes/imports.ts` checked guardian import duplicates with raw email equality before insert.

**Impact:** Importing `Jane@Example.com` with `dedupeStrategy: "skip"` could miss an existing `jane@example.com`, fall through to insert, and surface a database unique-index error instead of a clean skipped row.

**Status:** Fixed in this worktree. Guardian import duplicate detection now compares `lower(trim(email))` to the normalized incoming email.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/imports.test.ts -t "case-insensitively"`.

### P2: Direct Guardian Creation Surfaces Duplicate Emails As Server Errors

**Evidence:** `guardians_center_email_unique` rejects duplicate guardian emails case-insensitively, but `apps/api/src/services/guardians.ts` inserted directly without a matching backend duplicate check and `apps/api/src/routes/guardians.ts` did not map duplicate failures to a conflict response.

**Impact:** Creating a guardian with a case-variant email already used in the center could produce a generic 500 instead of a deterministic 409, making duplicate handling inconsistent with billing conflicts and import dedupe behavior.

**Status:** Fixed in this worktree. `createGuardian` now checks duplicate guardian emails with `lower(trim(email))` before insert, and the route maps that service error to `409 guardian_duplicate`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/guardians.test.ts`; `pnpm --filter @pebbledesk/api test -- src/routes/guardians.test.ts -t "existing case-variant email"`.

### P2: Guardian Email Updates Surface Duplicate Emails As Server Errors

**Evidence:** `guardians_center_email_unique` rejects duplicate guardian emails case-insensitively, but `PATCH /api/guardians/:id` wrote email updates directly without checking for another guardian in the center using the same normalized email.

**Impact:** Updating a guardian to a case-variant duplicate email could produce a generic 500 from the database unique index instead of a deterministic conflict response.

**Status:** Fixed in this worktree. Guardian email updates now check for another center-scoped guardian with the same `lower(trim(email))`, excluding the current guardian, and return `409 guardian_duplicate` before update.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/guardians.test.ts -t "updating to an existing case-variant"`.

### P2: Enrollment New-Guardian Creation Bypasses Duplicate Email Handling

**Evidence:** Direct guardian creation and imports now check duplicate guardian emails against the database's case-insensitive `guardians_center_email_unique` index, but `apps/api/src/services/children.ts` still inserted `type: "new"` enrollment guardians directly.

**Impact:** Enrolling a child with a new guardian whose email matched an existing center guardian by case or surrounding whitespace could hit the database unique index inside the enrollment transaction and surface as a generic server error.

**Status:** Fixed in this worktree. Enrollment now reuses `createGuardian` for new guardian rows, and `POST /api/children/enroll` maps duplicate guardian emails to `409 guardian_duplicate`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts -t "existing case-variant"`; `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts`.

### P2: Child Guardian Links Allow Multiple Primary Guardians

**Evidence:** Product help, UI copy, and child summaries treat the primary guardian as a singular main contact, but `child_guardians` only had a composite primary key on `(child_id, guardian_id)`. Linking or updating a second guardian with `isPrimary: true` did not demote the previous primary, and the database had no partial unique index to prevent duplicate primary links.

**Impact:** A child could have multiple primary guardians, making `primaryGuardianName` depend on arbitrary row order and corrupting billing/contact expectations for routine updates and audit review.

**Status:** Fixed in this worktree. Shared child-guardian linking now treats primary assignment as a handoff, direct link/update routes demote other primary links before promotion, and migration `0059_child_guardian_primary_unique.sql` adds a fail-fast preflight plus a partial unique index for one primary guardian per child.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts src/services/children.test.ts src/services/guardians.test.ts`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts`.

### P2: Duplicate Child Guardian Links Surface As Server Errors

**Evidence:** `child_guardians` uses `(child_id, guardian_id)` as its primary key, but `linkGuardianToChild` inserted links without checking whether that child/guardian relationship already existed.

**Impact:** Re-linking the same guardian to a child through the direct route or duplicate enrollment payloads could surface a database primary-key violation as a generic 500 instead of a deterministic conflict response.

**Status:** Fixed in this worktree. The shared link helper now checks for an existing center-scoped child/guardian link before insert and the children routes map that service error to `409 guardian_link_duplicate`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/guardians.test.ts -t "existing child guardian link"`; `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts -t "link already exists"`; `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts src/services/children.test.ts src/services/guardians.test.ts`.

### P2: Enrollment Accepts Multiple Primary Guardians In One Payload

**Evidence:** Enrollment accepted multiple guardians with `isPrimary: true`, while the backend handoff logic can only persist one primary link per child. The response could echo more than one guardian as primary even though later write steps demoted earlier links.

**Impact:** The child enrollment API could return misleading primary-guardian state and create avoidable ambiguity for the UI and downstream audit/contact workflows.

**Status:** Fixed in this worktree. `enrollChildSchema` now rejects payloads with more than one primary guardian before any enrollment transaction starts.

**Verification:** `pnpm --filter @pebbledesk/shared test -- tests/validators.test.ts -t "more than one primary"`.

### P1: Guardian Deletion Can Cascade Into Invoice History

**Evidence:** `invoices.guardian_id` and the center-scoped `invoices_guardian_center_fk` both used cascade delete semantics, and `DELETE /api/guardians/:id` only removed child-guardian links before deleting the guardian.

**Impact:** Deleting a guardian with billing history could remove invoices and dependent payment/line-item history, weakening auditability and financial record retention.

**Status:** Fixed in this worktree. Guardian deletion now returns `409 guardian_has_invoices` when invoice history exists, and migration `0060_invoice_guardian_restrict_delete.sql` recreates invoice-to-guardian foreign keys without cascade deletes.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/guardians.test.ts -t "guardian with invoices"`; `pnpm --filter @pebbledesk/db test -- tests/schema.test.ts tests/integrity.test.ts tests/migrations.test.ts -t "guardian is deleted|delete restriction|migration journal"`.

### P2: Guardian Unlink/Delete Can Leave Children Without Guardians

**Evidence:** Enrollment requires at least one guardian, but `DELETE /api/children/:id/guardians/:guardianId` and `DELETE /api/guardians/:id` could remove the final guardian relationship for an existing child.

**Impact:** Child records could become incomplete after enrollment, leaving no family contact or pickup/billing relationship for compliance review.

**Status:** Fixed in this worktree. Direct child-guardian unlink now verifies another guardian remains before delete, and guardian deletion checks all linked children before removing the guardian.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts -t "last guardian"`; `pnpm --filter @pebbledesk/api test -- src/routes/guardians.test.ts -t "without guardians"`.

### P2: Direct Child Status Patch Can Leave Withdrawn Children Assigned To Classrooms

**Evidence:** `PATCH /api/children/:id` allowed `enrollmentStatus: "withdrawn"` through the shared update validator, but only `POST /api/children/:id/withdraw` stamped `withdrawnAt` and ended active classroom assignments.

**Impact:** Updating status through the generic child edit route could hide a withdrawn child from normal child lists while leaving the child in active classroom roster and ratio-query windows.

**Status:** Fixed in this worktree. PATCH withdrawal now stamps `withdrawnAt` and reuses the same active-assignment closing helper as the dedicated withdraw route.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/children.test.ts`.

### P1: Classroom Archive Leaves Live Attendance And Assignments Active

**Evidence:** `POST /api/classrooms/:id/archive` only set `classrooms.archivedAt`, while attendance, ratio, and roster reads depend on open `check_ins`, open `staff_check_ins`, active `classroom_assignments`, and active `staff_assignments`.

**Impact:** Archiving a classroom could leave children and staff actively checked into or assigned to a retired room, corrupting ratio status, classroom rosters, and audit-ready attendance state.

**Status:** Fixed in this worktree. Classroom archive now closes open child check-ins, closes open staff check-ins, and ends active child and staff assignments for the archived classroom after the classroom update succeeds.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts`.

### P2: Staff Clock-In Allows Pending Invite Memberships

**Evidence:** `POST /api/staff-check-ins` verified an explicit `membershipId` belonged to the center, but did not require `memberships.acceptedAt`. Classroom staff assignment already rejects invited memberships that have not accepted the center invitation.

**Impact:** A director or owner could clock in a pending invite as working staff, corrupting attendance, ratio calculations, and time-entry state for a person who has not accepted access to the center.

**Status:** Fixed in this worktree. Explicit target membership clock-in now selects `acceptedAt` and returns a deterministic 400 if the staff member has not accepted the invitation.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/staff-check-ins.test.ts`.

### P1: Staff Member Removal Hard-Deletes Historical Membership Rows

**Evidence:** `DELETE /api/members/:memberId` hard-deleted non-owner memberships, while attendance, staff check-ins, classroom assignments, shifts, time entries, guidance progress, and generated audit reports reference `memberships.id`. Several of those relations cascade from memberships.

**Impact:** Removing an accepted staff/director could erase or orphan operational and audit history tied to that person, weakening payroll, attendance, ratio, and audit-readiness records.

**Status:** Fixed in this worktree. Accepted non-owner memberships now receive `deactivatedAt` instead of being hard-deleted; pending invitations can still be deleted. Active membership resolution and user-visible membership lists filter out deactivated rows, and migration `0061_membership_deactivation.sql` adds the backing column.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/members.test.ts src/lib/membership-context.test.ts src/routes/memberships.test.ts src/routes/overview.test.ts`; `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts tests/migrations.test.ts -t "deactivated_at|migration journal"`.

### P1: Deactivated Staff Can Still Be Scheduled Or Re-Activated Operationally

**Evidence:** After adding soft-deactivated memberships, downstream write routes still treated center-scoped membership rows as valid. `POST /api/classrooms/:id/staff`, `POST /api/staff-check-ins`, and shift create/update relation validation checked center ownership but did not reject `memberships.deactivatedAt`.

**Impact:** A removed staff/director could be reassigned to classrooms, clocked in by a director, or placed on future schedules, reintroducing inactive people into ratio, payroll, and classroom operations.

**Status:** Fixed in this worktree. Staff assignment, staff clock-in, and shift relation validation now reject deactivated memberships. Shift scheduling also requires the membership invitation to be accepted before scheduling.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/classrooms.test.ts src/routes/staff-check-ins.test.ts src/routes/shifts.test.ts`.

### P1: Sent Invoice Patch Can Bypass Payment Workflow

**Evidence:** `assertInvoiceEditable` documented that sent and overdue invoices only allow limited fields (`dueDate`, `notes`, `memo`), but the implementation only blocked a hardcoded set of amount/period/guardian fields. A PATCH body containing `status: "paid"` and `paidAt` was accepted for a sent invoice.

**Impact:** Operators could mark a sent invoice paid without creating a payment record or audit trail, corrupting receivables, public payment link state, and payment history.

**Status:** Fixed in this worktree. Sent and overdue invoice edits now reject every key outside the allowed set, preserving payment state transitions through the payment routes.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts src/routes/payments.test.ts src/routes/public-invoices.test.ts src/routes/stripe.test.ts`.

### P2: Child-Targeted Messages Include Inactive Children

**Evidence:** `POST /api/messages` with `recipientMode: "child_ids"` joined selected child rows for center scope, but did not require `children.enrollmentStatus = "active"`.

**Impact:** Directors could send new operational messages to guardians for inactive, waitlisted, or withdrawn child records when stale child IDs were submitted, creating unnecessary family contact and confusing enrollment/audit workflows.

**Status:** Fixed in this worktree. Explicit child-recipient resolution now requires active child enrollment before resolving guardians.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/messages.test.ts`.

### P1: Submitted Subsidy Claims Can Mutate Source Claim Facts

**Evidence:** `PATCH /api/subsidy-claims/:id` merged arbitrary partial updates into the existing claim regardless of current claim status. A submitted claim could still change `periodStart`, `periodEnd`, attendance totals, claimed amount, subsidy case, or `submittedAt`.

**Impact:** Operators could alter the facts behind a submitted subsidy claim after submission, weakening reimbursement auditability and making submitted claim records diverge from the attendance period that was actually sent.

**Status:** Fixed in this worktree. Non-draft subsidy claims now reject source-field edits while still allowing approval/payment processing fields.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/routes/subsidy-claims.test.ts`.

### P2: QuickBooks Payment Sync Drops String Payment Timestamps

**Evidence:** `syncInvoicePaymentState` summed posted payments, but selected the latest `paidAt` by filtering only values that were `Date` instances. Timestamp values returned as strings were ignored.

**Impact:** When QuickBooks payment sync recalculated a fully paid invoice from string timestamp rows, the invoice could become `paid` with a missing `paidAt`, weakening billing audit history and public invoice state.

**Status:** Fixed in this worktree. QuickBooks payment-state sync now normalizes `Date` and string timestamps before sorting for the latest posted payment date.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/quickbooks.test.ts`.

### P2: Licensing Reports Include Archived Classrooms

**Evidence:** Generic and state-specific licensing artifact generation selected every classroom in the current center, without filtering out rows where `classrooms.archivedAt` is set.

**Impact:** Newly generated licensing bundles could include retired rooms that no longer participate in active classroom operations, producing confusing capacity, ratio, and enrollment evidence for directors preparing current audit materials.

**Status:** Fixed in this worktree. Licensing report classroom exports now require active classrooms with `archivedAt IS NULL`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/report-artifacts.test.ts`.

### P2: State Licensing Reports Can Use Inactive Director Contacts

**Evidence:** State-specific licensing artifact generation selected director memberships by center and role only, without requiring the membership invitation to be accepted or the membership to still be active.

**Impact:** TX licensing report exports could show a pending or deactivated director as the facility contact, weakening the reliability of generated regulator-facing materials.

**Status:** Fixed in this worktree. Director contact selection now requires `acceptedAt IS NOT NULL` and `deactivatedAt IS NULL`.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/report-artifacts.test.ts`.

### P3: Missing Stored Report Artifacts Return Bad Request

**Evidence:** `readReportArtifact` raised a 400 bad request when the saved R2 object was missing, even though the report artifact itself could not be found.

**Impact:** Download clients and operators saw the wrong failure class for stale or missing generated report files, making report recovery and support triage less clear.

**Status:** Fixed in this worktree. Missing report artifact objects now return 404 while missing storage configuration remains a bad request.

**Verification:** `pnpm --filter @pebbledesk/api test -- src/services/report-storage.test.ts`.

### P2: Subscription Webhook Owner Lookups Include Deactivated Owners

**Evidence:** Subscription webhook owner lookups required accepted owner memberships, but did not filter out `memberships.deactivatedAt`. The same lookup powers trial notification enqueueing and active-subscription app signup suppression.

**Impact:** A removed owner could receive new trial lifecycle emails or be used as the mirrored owner identity when suppressing signup onboarding after the center activates a subscription.

**Status:** Fixed in this worktree. Subscription webhook owner lookups now require `deactivatedAt IS NULL` in addition to accepted owner membership.

**Verification:** `pnpm --filter @pebbledesk/api test -- subscriptions-webhook.test.ts`.

### P2: Deactivated Invitations Can Still Surface Or Be Accepted

**Evidence:** Pending invitation discovery required `acceptedAt IS NULL` but did not exclude rows with `deactivatedAt` set. Invitation acceptance also selected and updated matching token rows without filtering deactivated memberships.

**Impact:** A stale deactivated invitation row could still appear in onboarding and could be accepted if its token remained otherwise valid, reactivating access that was intended to be removed.

**Status:** Fixed in this worktree. Pending invitation discovery, token lookup, legacy membership-id lookup, and final acceptance update now all require `deactivatedAt IS NULL`; an update race that returns no accepted membership is reported as not found.

**Verification:** `pnpm --filter @pebbledesk/api test -- pending-invitations.test.ts auth.test.ts`.

### P1: Soft-Deactivated Members Block Future Reinvites

**Evidence:** Accepted members are now soft-deactivated to preserve historical rows, but the `memberships_center_user_unique` index still applied to every `(center_id, user_id)` pair. The invite route ignored deactivated memberships in its precheck, so reinviting a removed existing user could pass application validation and then fail at insert time on the unconditional unique index.

**Impact:** Owners could remove a staff/director and later be unable to invite the same user back to the center without manual database repair.

**Status:** Fixed in this worktree. The membership uniqueness index now applies only to active user memberships where `user_id IS NOT NULL` and `deactivated_at IS NULL`, preserving historical deactivated rows while allowing a fresh invite.

**Verification:** `pnpm --filter @pebbledesk/db test -- tests/integrity.test.ts -t "center_user unique index|soft-deactivated member reinvites"`.
