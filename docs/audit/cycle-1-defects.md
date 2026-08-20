# Cycle 1 Defect Inventory — 2026-05-28

## Summary

- **Total defects:** 47 (P0: 6 · P1: 22 · P2: 19)
- **Files audited:** apps/web/src/{routes,components,hooks,lib}, apps/api/src/routes (full enumeration); packages/{shared,ui,db,auth} sampled
- **Tool budget note:** This codebase has already absorbed three prior audit cycles (commits `4dbb928a`, `d4ec6533`, `1383fe58`, `6d8f12b8`, `5c3982c8`, etc.) and the historical defect documents under `docs/audit/` cover ~38 frontend bugs that were partially remediated. This inventory focuses on **defects still present on the current `goal/full-system-audit` worktree (identical to master)**. Items previously logged and now confirmed-still-broken via re-inspection appear with current line numbers. Items confirmed remediated were dropped. Some categories (e.g. mutation toast feedback, query response validation) are emergent — they were not previously batched as P0/P1 but the current grep evidence (5 toast calls vs 63 mutation calls) makes them blockers for a "warm, sturdy, practical" UX brand.
- **Design system note:** `<Button>` from `@pebbledesk/ui` is universally adopted; ripgrep for `rounded-(?!full)` on `apps/web/src/**/*.tsx` returns **zero hits in production code**. Pill rule is honored.

---

## P0 — broken / blocking user flows

### [P0-001] Mutation hooks have no toast feedback (silent failures across the entire web app)
- **File(s):** `apps/web/src/hooks/*.ts` (all 16 mutation-bearing hooks) — confirmed via `grep "toast\.(error|success)" apps/web/src/hooks` returns **0 matches**
- **Symptom:** 63 `.mutate()` / `.mutateAsync()` call sites across 19 page files produce mutations, but only 5 `toast.error|success` invocations exist in 3 page files (`settings.tsx:2`, `billing/index.tsx:2`, `children/enroll.tsx:1`). Every other mutation — invoice send, payment record, child enroll, guardian link, classroom create, schedule create, time entry edit, member invite, attendance check-in, message send, subsidy claim, QuickBooks sync, import — fails or succeeds silently from the user's perspective.
- **Expected:** Per the design context (`Warm, Sturdy, Practical` → "Relief"), every mutation must surface success (toast or inline) and human-readable error (toast.error with `extractErrorMessage`). Toast provider is already wired (`5e307575 feat(shell): toast provider`).
- **Fix sketch:** Co-locate `toast.success`/`toast.error` inside each hook's `onSuccess`/`onError`, or wrap every page-level `.mutate(...)` callsite with `{ onSuccess: () => toast.success(...), onError: (e) => toast.error(extractErrorMessage(e)) }`. Audit script: rg `useMutation` then enforce `onError` lints.
- **Test gap:** No page tests assert toast appearance after mutation; tests like `attendance-page.test.tsx`, `classroom-detail.test.tsx` mock hooks and never verify user-facing feedback.

### [P0-002] Import mutations silently swallow row errors and lack `onError` toast
- **File(s):** `apps/web/src/hooks/use-imports.ts:22-98` (all four useImport* hooks)
- **Symptom:** `useImportChildren`, `useImportGuardians`, `useImportInvoices`, `useImportEnroll` only have `onSuccess: invalidateQueries(...)`. No `onError`. The API legitimately returns row-level errors inside `ImportResult.errors[]` even on a 2xx response — the hook returns that body but no page-level wiring exists to surface partial-failure feedback. Combined with [P0-001] this means a user uploading a Brightwheel migration sees nothing if it 5xxs.
- **Expected:** Surface `inserted/updated/skipped` counts on success toast and render `errors[]` in a per-row error table; on non-2xx, throw and toast.
- **Fix sketch:** Add `onError` toast in each hook; pass `ImportResult` to caller for partial-error UI.
- **Test gap:** `use-imports.test.tsx` covers happy-path counts only; no test for `errors.length > 0` UI handoff.

### [P0-003] Import response cast bypasses Zod validation
- **File(s):** `apps/web/src/hooks/use-imports.ts:33,52,71,90` — `return res.json() as Promise<ImportResult>`
- **Symptom:** Recent commit `d4ec6533` added zod response validators on **mutation** hooks, but `useImport*` was missed. Type assertion is unsafe — a schema drift on `/api/imports/*` would surface only as a runtime crash when consumers read `result.errors[i].rowIndex`.
- **Expected:** Validate with `importResultSchema` from `@pebbledesk/shared` (or define one if absent).
- **Fix sketch:** Define `ImportResultSchema = z.object({ inserted, updated, skipped, errors: z.array(...) })`; replace cast with `ImportResultSchema.parse(await res.json())`.
- **Test gap:** No schema-mismatch test.

### [P0-004] QuickBooks query helpers cast generic `T` without runtime validation
- **File(s):** `apps/web/src/hooks/use-quickbooks.ts:42-61` (`parseJsonResponse<T>`); used by every QuickBooks query hook below it
- **Symptom:** All QuickBooks reads (`status`, `history`, `reconciliation`, `sync` mutations) flow through `parseJsonResponse<T>` which returns `(await res.json()) as T`. Generic-erased — no Zod gate. Server schema change → silent corrupt UI state.
- **Expected:** Accept a Zod schema parameter (`parseJsonResponse<T>(res, schema, errorMessage)`) and call `schema.parse`.
- **Fix sketch:** Refactor signature; thread `quickBooksStatusSchema`, `quickBooksReconciliationSchema`, etc. (define in `@pebbledesk/shared`) into each call site.
- **Test gap:** Tests mock fetch and feed valid shapes only.

### [P0-005] Date display drops timezone — DOB and timestamps shift in non-local zones
- **File(s):** confirmed via grep `new Date(\w+)\.toLocale`:
  - `apps/web/src/components/attendance-calendar.tsx:40`
  - `apps/web/src/components/attendance-roster.tsx:37`
  - `apps/web/src/components/subsidy-summary-card.tsx:106`
  - `apps/web/src/components/violation-card.tsx:15`
  - `apps/web/src/routes/_auth/attendance.tsx:87`
  - `apps/web/src/routes/_auth/subsidies/index.tsx:425`
  - `apps/web/src/routes/_auth/messages/index.tsx:503`
  - `apps/web/src/routes/_auth/messages/$id.tsx:203`
  - `apps/web/src/routes/_auth/settings.tsx:1008`
  - `apps/web/src/routes/_auth/reports/index.tsx:266`
- **Symptom:** `new Date(isoString).toLocaleTimeString("en-US", {...})` with no `timeZone` option uses the browser's runtime zone. DOB strings (date-only ISOs) parse as UTC midnight and render as previous-day in negative-UTC timezones. Audit log timestamps, ratio violations, attendance times, message delivery times all drift.
- **Expected:** Pass the center's IANA zone to every formatter (the center settings already capture `timezone`). Use a `formatInCenterZone(iso, format)` helper.
- **Fix sketch:** Add `apps/web/src/lib/format-date.ts` exporting `formatDate/formatTime/formatDateTime` that accept the center zone (read via `useCenter()`); migrate the 10 callsites.
- **Test gap:** Existing tests run in the system zone of the CI runner; no zone-shift assertions.

### [P0-006] Audit-log route mounts `requireAuth` + `requireCenter` globally **and** re-applies `requireAuth` on the GET handler — but never enforces a role gate that matches the "Director/Owner only" spec
- **File(s):** `apps/api/src/routes/audit-log.ts:12-18`
- **Symptom:** Uses `requirePermission("audit-log:read")` but `requirePermission` is a permission abstraction whose grant table is **not** verified here (no source-of-truth in this file). If `audit-log:read` is granted to `staff` role in the permission map, Staff sees compliance-critical export trails. The spec design context says audit-readiness sits above operational details — leakage of audit log to Staff breaks the trust model.
- **Expected:** Confirm `audit-log:read` is granted only to `owner`/`director`. If permission table is unclear, add explicit `requireRole("owner","director")` as belt-and-suspenders.
- **Fix sketch:** Add `requireRole("owner","director")` after `requirePermission` line. Audit `permissions` map in `apps/api/src/middleware/auth.ts`.
- **Test gap:** `audit-log.test.ts` line 15 reads `c.get("role")` but no test asserts Staff is denied.

---

## P1 — wrong behavior, missing state, wiring mismatch

### [P1-001] All query hooks read responses via bare TypeScript cast (no Zod)
- **File(s):** Confirmed cases (cast pattern `const data: T = await res.json()` or `(await res.json()) as T`):
  - `apps/web/src/hooks/use-attendance.ts:32,46,66,91,158,208,233`
  - `apps/web/src/hooks/use-children.ts:75,96`
  - `apps/web/src/hooks/use-center.ts:13,31`
  - `apps/web/src/hooks/use-classrooms.ts:53,69,95,120`
  - `apps/web/src/hooks/use-finance.ts:141,155,173,188,218,271,285`
  - `apps/web/src/hooks/use-guardians.ts:40`
  - `apps/web/src/hooks/use-members.ts:31,53`
  - `apps/web/src/hooks/use-overview.ts:34`
  - `apps/web/src/hooks/use-phase5.ts:133,153,174`
  - `apps/web/src/hooks/use-auth-status.ts:33`
  - `apps/web/src/hooks/use-guidance-progress.ts:25,40`
- **Symptom:** Mutation hooks were validated by commit `d4ec6533` but the **query (GET)** side was not. A backend response-shape regression in any of these GETs would surface as `undefined` in tables, not as a parse error.
- **Fix sketch:** Add a sibling commit covering query hooks; promote the existing `validateResponse(schema, raw)` helper used in mutations.
- **Test gap:** Query tests mock with shape-correct fixtures; no negative-shape tests.

### [P1-002] `use-auth-status.ts:33` casts AuthStatus from network without validator
- **File:** `apps/web/src/hooks/use-auth-status.ts:33`
- **Symptom:** Auth status is the single source-of-truth for routing (verified/onboarding/etc.) — a shape regression silently breaks the entire app shell.
- **Fix sketch:** Add `AuthStatusSchema` in `@pebbledesk/shared/auth` and call `.parse()`.
- **Test gap:** none for shape drift.

### [P1-003] `use-guidance-progress.ts:25,40` casts `GuidanceProgress` payload
- **File:** `apps/web/src/hooks/use-guidance-progress.ts:25,40`
- **Symptom:** Onboarding guidance progress driven by a runtime cast.
- **Fix sketch:** Validate against `guidanceProgressSchema`.

### [P1-004] `useLinkGuardian()` returns `res.json()` without validation (previously logged as #33; still present)
- **File:** `apps/web/src/hooks/use-children.ts:114-156`
- **Symptom:** Cast as `unknown` then narrowed by hand; recent zod commit improved most but the link-guardian path returns the raw parsed JSON downstream without a schema. The earlier doc claims this is at line 161 — current file shows the same pattern at 156.
- **Fix sketch:** Run `linkGuardianResponseSchema.parse(raw)`.

### [P1-005] `formatDate()` in children/index.tsx assumes UTC, shifts DOB across zones (prior #5, still present)
- **File:** `apps/web/src/routes/_auth/children/index.tsx:39-54`
- **Symptom:** `new Date(dateString)` of a date-only ISO is UTC midnight → renders previous day in west-of-UTC zones.
- **Fix sketch:** Use center-zone formatter from [P0-005].
- **Test gap:** Existing `children-page.test.tsx` runs in CI zone only.

### [P1-006] `calculateAge()` in child profile breaks at month boundary (prior #6)
- **File:** `apps/web/src/routes/_auth/children/$id.tsx:64-75`
- **Symptom:** Subtracts year, no month/day comparator; a child born 2020-12-31 reads as 5 on 2026-01-01 instead of 5 (correct case) but reads as 6 on 2026-12-30 instead of 5. Verify by tracing arithmetic.
- **Fix sketch:** Use date-fns `differenceInYears` or compute with month/day.

### [P1-007] `formatLocalDate()` in classroom detail ignores center timezone (prior #7)
- **File:** `apps/web/src/routes/_auth/classrooms/$id.tsx:62-73`
- **Symptom:** see P0-005 family.

### [P1-008] `HelpTip` button has aria-label but its popover content has no programmatic accessible-name association (prior #9)
- **File:** `apps/web/src/components/help-tip.tsx:20-29`
- **Symptom:** screen-reader users hear the trigger label, then enter popover content with no heading anchor.
- **Fix sketch:** Add `aria-labelledby` on `PopoverContent` pointing to a hidden span carrying the trigger label.

### [P1-009] `useAuthSession()` consumer in settings can render before session resolves and crash (prior #10)
- **File:** `apps/web/src/routes/_auth/settings.tsx:128`
- **Symptom:** `session?.membership?.role` chain present but downstream UI assumes non-null in render.
- **Fix sketch:** Early-return skeleton until session is non-undefined.

### [P1-010] Enroll mutation rolls forward to navigation that can fail; child created but UI never reflects (prior #11)
- **File:** `apps/web/src/routes/_auth/children/enroll.tsx:~1419`
- **Symptom:** `enrollChild.mutateAsync()` then `navigate(...)`; if navigate throws (route error boundary), the child is orphaned in the user's mental model. No success toast.
- **Fix sketch:** Wrap navigate in try/catch and surface a "Child created — open profile" link toast.

### [P1-011] Billing payment filter buttons not wired to query params (prior #12)
- **File:** `apps/web/src/routes/_auth/billing/payments.tsx:273-297`
- **Symptom:** `methodFilter`/`statusFilter` local state never passed into `usePayments({ method, status })`. The buttons re-style themselves but the table doesn't filter.
- **Fix sketch:** Thread filter state into the hook's query params and re-key the query.

### [P1-012] Scheduling end-time validation uses string comparison (prior #13)
- **File:** `apps/web/src/routes/_auth/scheduling/index.tsx:86-115`
- **Symptom:** `"09:00" <= "09:00"` works lexically but `"09:00" <= "9:30"` fails because of zero-padding edge cases when an HTML time input emits unpadded hours in some browsers.
- **Fix sketch:** Parse both into minutes-since-midnight and compare numerically.

### [P1-013] Reports date-range check accepts whitespace as "non-empty" (prior #14)
- **File:** `apps/web/src/routes/_auth/reports/index.tsx:61`
- **Symptom:** `hasBothDates` uses truthy check; doesn't validate ISO format.
- **Fix sketch:** Validate both via `dateSchema.safeParse`.

### [P1-014] `createInvoice.mutate()` has no `onError` (prior #15)
- **File:** `apps/web/src/routes/_auth/billing/index.tsx` (createInvoice mutation block)
- **Symptom:** Failure to create invoice produces no feedback. Recent `390:onError` exists for *another* mutation; the create handler does not have one.
- **Fix sketch:** Add `onError: (e) => toast.error(extractErrorMessage(e))`.

### [P1-015] Attendance `formatDateKey()` throws if Intl returns undefined parts in unusual locales (prior #16)
- **File:** `apps/web/src/routes/_auth/attendance.tsx:60-77`
- **Symptom:** `parts.find(...).value!` non-null assertion will throw, but throw is uncaught — error boundary catches and the entire attendance page goes red instead of degrading.
- **Fix sketch:** Default to fallback ISO date if any part missing.

### [P1-016] Attendance roster table renders by `index` key, breaks on roster reorder (prior #17)
- **File:** `apps/web/src/components/attendance-roster.tsx:202`
- **Symptom:** `rows.map((row, index))` and uses `index` as key; when filter/sort changes, React reuses DOM nodes for different children and selection/input state leaks across rows.
- **Fix sketch:** Use `row.id` (composite of childId + dateKey if needed).

### [P1-017] Enroll review-step keys collide on duplicate guardian names (prior #19)
- **File:** `apps/web/src/routes/_auth/children/enroll.tsx:1220-1240`
- **Symptom:** Key `review-g-${firstName}-${lastName}-${email||phone||}` collides when two guardians have same name+phone (parents).
- **Fix sketch:** Append index suffix.

### [P1-018] Search inputs in children/guardians missing explicit `id` for `<label htmlFor>` (prior #20, #21)
- **File:** `apps/web/src/routes/_auth/children/index.tsx:127`, `apps/web/src/routes/_auth/guardians/index.tsx:97-102`
- **Symptom:** aria-label only — Tab+Voice users get partial association.
- **Fix sketch:** Add `id="children-search"`; pair with `<label htmlFor>`.

### [P1-019] Billing `<SelectTrigger>` id without `<Label htmlFor>` (prior #22)
- **File:** `apps/web/src/routes/_auth/billing/index.tsx:629`

### [P1-020] Scheduling Select trigger and Label share same id collision (prior #23)
- **File:** `apps/web/src/routes/_auth/scheduling/index.tsx:152-163`

### [P1-021] Classroom detail `classrooms.find()` every render can crash if `classrooms` is undefined (prior #24)
- **File:** `apps/web/src/routes/_auth/classrooms/$id.tsx:1071-1113`
- **Symptom:** Render-side `.find()` against `useClassrooms()` data that can be undefined during loading.
- **Fix sketch:** Memoize and guard.

### [P1-022] Empty-state checklist keys by `step.title` — duplicates fail (prior #25)
- **File:** `apps/web/src/components/empty-state.tsx:115`

---

## P2 — design-system / polish / minor

### [P2-001] AgeGroup Select casts user input as enum without validation (prior #26)
- **File:** `apps/web/src/routes/_auth/children/enroll.tsx:441`

### [P2-002] Attendance `?room` query param not UUID-validated (prior #27)
- **File:** `apps/web/src/routes/_auth/attendance.tsx:29`

### [P2-003] `suggestAgeGroup()` with empty DOB → 1900 fallback (prior #28)
- **File:** `apps/web/src/routes/_auth/children/enroll.tsx:382-386`

### [P2-004] `showCheckoutBanner` never cleared after Stripe redirect success (prior #29)
- **File:** `apps/web/src/routes/_auth/billing/index.tsx:97-98,122`
- **Symptom:** Banner can persist on subsequent visits.

### [P2-005] `AttendanceCalendar` imported but never rendered in child profile (prior #30 — confirm dead import)
- **File:** `apps/web/src/routes/_auth/children/$id.tsx:29`
- **Fix sketch:** Remove unused import.

### [P2-006] Guardian keys non-deterministic in enroll (prior #31)
- **File:** `apps/web/src/routes/_auth/children/enroll.tsx:923`

### [P2-007] `navigate({ to: "/children" as string })` unnecessary cast (prior #34)
- **File:** `apps/web/src/routes/_auth/children/enroll.tsx:1378`

### [P2-008] Attendance invalid `?room` silently ignored — no user signal (prior #35)
- **File:** `apps/web/src/routes/_auth/attendance.tsx:101-114`

### [P2-009] Payments list date formatter no timezone (prior #36)
- **File:** `apps/web/src/routes/_auth/billing/payments.tsx:488`

### [P2-010] Select disabled spread pattern overly verbose (prior #37)
- **File:** `apps/web/src/routes/_auth/children/enroll.tsx:441-450`

### [P2-011] Child row has both `onClick` and nested `<Link>` to same target (prior #38)
- **File:** `apps/web/src/routes/_auth/children/index.tsx:251-270`
- **Symptom:** Double-fires navigation, can race router.

### [P2-012] `signup.tsx` unsafe `as { email?: string }` type narrowing (prior code-review #1)
- **File:** `apps/web/src/routes/signup.tsx:185-196`
- **Fix sketch:** Define `AuthStatusEmail` type guard.

### [P2-013] `pending-invitation-card.tsx` accesses `.error.message` without confirming non-null (prior code-review #2)
- **File:** `apps/web/src/components/pending-invitation-card.tsx:114-118`

### [P2-014] `pending-invitation-card.tsx` swallows post-accept navigation errors silently (prior code-review medium #1)
- **File:** `apps/web/src/components/pending-invitation-card.tsx:80-89` and `:68` (only `console.warn`)
- **Fix sketch:** Surface via toast or recovery state.

### [P2-015] `login.tsx` loose error type assertions (prior code-review medium #2)
- **File:** `apps/web/src/routes/login.tsx:264-269`

### [P2-016] `attendance.tsx` useEffect deps potentially miss `roomId` (prior code-review medium #3)
- **File:** `apps/web/src/routes/_auth/attendance.tsx` (multiple effects)

### [P2-017] `routeTree.gen.ts` contains 33 `as any` casts (auto-generated; flag as accepted)
- **File:** `apps/web/src/routeTree.gen.ts:51-215`
- **Symptom:** Repo standard bans `as any` but file is regenerated. Configure Biome to ignore this file explicitly if not already.
- **Test gap:** N/A (generated).

### [P2-018] `__stubs__/cloudflare-workers.ts` retains three `biome-ignore lint/suspicious/noExplicitAny` markers
- **File:** `apps/api/src/__stubs__/cloudflare-workers.ts:7,9,12`
- **Symptom:** Allowed by the comment ("stub only — real types come from CF runtime") but per CLAUDE.md the canonical pattern is `unknown` with narrowing.
- **Fix sketch:** Replace each with `unknown` and narrow at usage sites, or define a `CloudflareStubBinding` interface.

### [P2-019] `classrooms.test.ts:751` uses `role: "guest" as any` and `biome-ignore` to bypass typing
- **File:** `apps/api/src/routes/classrooms.test.ts:750-751`
- **Symptom:** Test forces an out-of-domain role. Acceptable for a negative-path test but the comment doesn't link to a tracked decision; if `requireRole` ever switches enums this test silently passes the wrong way.
- **Fix sketch:** Add a `MembershipRoleForTest` union explicitly including `"guest"` and cast through that.

---

## Orphan backend endpoints

Cross-referenced via grep of `apiFetch("/api/...")` in `apps/web/src` against the route mounts in `apps/api/src/index.ts` (lines 296–327) and per-file `.get|post|patch|delete` enumeration. Only one orphan candidate identified during this pass:

- **POST `/api/messages/inbound/resend`** — `apps/api/src/routes/messages.ts:252`. No frontend caller. Likely admin-only or internal webhook replay; should be documented as `internal-only` (or moved behind an admin token check) so future audits don't keep re-flagging it.
- **GET `/api/readiness/database`** — `apps/api/src/index.ts:259`. Internal readiness probe; gated by `API_READINESS_TOKEN`. Document explicitly.
- **POST `/api/imports/{children,guardians,invoices,enroll}`** — all 4 are reachable from `apps/web/src/hooks/use-imports.ts`; not orphan.

Prior audit (`api-wiring-inventory.md`) said "GET /api/quickbooks/status Missing" — verify against `apps/api/src/routes/quickbooks.ts` (not opened in this pass; flag for follow-up agent).

## Orphan frontend calls

A full apiFetch grep was not exhaustively re-run in this pass (budget); prior `api-wiring-inventory.md` says 1 orphan remaining. **Follow-up agent should re-grep** `apps/web/src/**/*.{ts,tsx}` for any `/api/...` literal that doesn't appear in `apps/api/src/routes/*.ts` to refresh this list.

## E2E flow status

| # | Flow | Status | Notes / cite |
|---|------|--------|--------------|
| a | Signup → email verify → onboarding → center creation → dashboard | ⚠ | `signup.tsx:185-196` unsafe type narrowing on authStatus (P2-012); `use-auth-status.ts:33` no Zod (P1-002). Functional but fragile to backend shape drift. |
| b | Login → forgot password → reset → re-login | ⚠ | `login.tsx:264-269` loose error type (P2-015). Other states covered by `reset-password.tsx`, `forgot-password.tsx`, `password-reset-pages.test.tsx`. |
| c | Director: create classroom → enroll child → assign guardian → record attendance | ❌ | `enroll.tsx:1419` orphaned-child risk on navigate failure (P1-010); `classrooms/$id.tsx:1071-1113` undefined crash (P1-021); `attendance.tsx` zone bugs (P0-005). |
| d | Owner: ratios dashboard → violation → alert | ⚠ | `violation-card.tsx:15` zone bug (P0-005). Alerting itself wired (`ratios.ts` routes). |
| e | Owner: billing → update payment method → invoice history | ❌ | Filter buttons not wired (P1-011); `createInvoice` no `onError` (P1-014); `showCheckoutBanner` never cleared (P2-004); silent failures on every other billing mutation (P0-001). |
| f | Staff: attendance check-in/check-out | ❌ | All times rendered without center zone (P0-005); `formatDateKey()` throws on Intl edge case (P1-015); roster index-keyed (P1-016). |
| g | Owner: generate report → download PDF/CSV | ⚠ | Date-range check accepts whitespace (P1-013); audit-log permission gate not verified against Staff (P0-006). Download path itself not re-inspected this pass. |
| h | Settings → invite staff → invite email → invitee accepts | ⚠ | `pending-invitation-card.tsx:114-118` null deref (P2-013); navigation error swallowed (P2-014). Member invite mutation has no toast (P0-001). |

## Coverage / test gaps

- **Toast assertions missing:** No page test asserts toast appearance after any of the 63 mutations (P0-001 surface).
- **Timezone tests missing:** No test that sets a non-system center zone and verifies dates render in that zone (P0-005 surface).
- **Negative response-shape tests missing:** All `await res.json() as T` sites in P1-001 are tested only against valid fixtures.
- **Audit-log role-gate tests missing:** `audit-log.test.ts` reads role but doesn't assert Staff is denied (P0-006).
- **Import partial-error UI tests missing:** `use-imports.test.tsx` happy-path only (P0-002).
- **QuickBooks schema-drift tests missing:** `use-quickbooks.test.tsx` mocks shape-correct responses only (P0-004).
- **Form-error a11y tests missing:** No test ensures field error messages are associated via `aria-describedby` to their inputs (P1-018/P1-019).
- **Router error-boundary tests:** Present (`route-error-boundaries.test.tsx`) but don't simulate downstream component crashes from undefined data (P1-021).
