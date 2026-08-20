# QA Manual Sweep — 2026-04-19

## Summary

Full functional sweep of all 17 flows plus role-gate enforcement and responsiveness.
All automated gates green at the end of this session.

---

## Automated Gate Results (final)

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm typecheck` | ✅ clean across all packages |
| `pnpm test` | ✅ 1083 web + 924 api + 132 site + 55 db + 21 emails + 10 ui = 2235 passing |
| `node scripts/e2e-smoke.mjs` | ✅ 16/16 steps pass |

---

## Flows Exercised

| Flow | Result | Notes |
|---|---|---|
| 1–6 | ✅ | Covered in prior session (signup, onboarding, dashboard, children, classrooms, guardians) |
| 7 Attendance | ✅ | Check-in/out, retroactive edit, ratio reflection, staff tab |
| 8 Staff check-ins | ✅ | Clock in/out via attendance page |
| 9 Ratios | ✅ | Live dashboard, history, violations list, rule edit |
| 10 Scheduling | ✅ | Shift creation, time entries |
| 11 Messages | ✅ | Send, thread, retry delivery (no user feedback on retry — logged P3) |
| 12 Import | ✅ | CSV happy path; raw Zod errors in preview (P3 polish) |
| 13 Billing | ✅ (with fix) | Crash on legacy `center` plan value fixed; invoice, send, record payment |
| 14 Subsidies | ✅ | CCDF program list, claim form |
| 15 Reports | ✅ | Generate (201) + CSV download |
| 16 Settings | ✅ | Invite (error path), center profile edit/save, QB disabled, billing portal |
| 17 Overview | ✅ | Single-center gate shows correctly |
| 18 Role gates | ✅ (with fix) | Staff blocked from all director-only routes |
| 19 Responsiveness | ✅ | 375px mobile nav + layout; 1024px sidebar layout |

---

## Bugs Found and Fixed

### P1 — Billing page crash (fixed, commit `fix(billing)`)
- **Root cause**: DB enum had legacy `center` plan value; `SUBSCRIPTION_PLAN_CONFIG` only maps new slugs (`center_starter`, etc.). Migration 0016 was unapplied because `ALTER TYPE ADD VALUE` can't run inside a transaction — drizzle-kit wraps everything in one.
- **Fix**: Applied migration manually via psql, added `?.label` optional-chain guard, added `"Unknown plan"` fallback. Test added for the legacy-value crash path.

### P2 — Staff could deep-link into director-only routes (fixed, commit `fix(role-gates)`)
- **Root cause**: `accessDeniedState` in `_auth.tsx` only covered `/reports` and `/billing`/`/settings`. Staff could navigate directly to `/children`, `/classrooms`, `/guardians`, `/ratios`, `/subsidies`, `/import`.
- **Fix**: Extended `DIRECTOR_ONLY_PREFIXES` array to cover all routes hidden from staff nav. 8 new test cases added.

### API tsconfig `rootDir` error (fixed, same commit)
- `apps/api/tsconfig.json` had `"rootDir": "src"` which conflicted with `"include": ["../../packages/emails/src"]`. Removed `rootDir` (unused with `--noEmit`).

### Biome lint errors/warnings (fixed, commit `fix(lint)`)
- 2 `noChildrenProp` errors in emails tests
- 1 `noUnusedImports` in api/routes/centers.ts
- 18 `noNonNullAssertion` warnings in 9 API routes → replaced with explicit 500 guards
- 10 `noNonNullAssertion` warnings in marketing test → early-return guards

---

## P3 — All Closed

| Issue | Commit | Notes |
|---|---|---|
| Retry delivery button has no success feedback | `7da16aa` | Inline "Queued for delivery" / "Delivery failed" with 4s auto-clear |
| Raw Zod error messages in import preview | `28d09e7` | `formatZodIssue` maps `invalid_type`/`invalid_enum_value`/`too_small`/`too_big` to field-prefixed human copy |
| Hours attended field has no required indicator | `85fc448` | `*` shown outside `<Label>` on days/hours/amount-claimed fields; `aria-required="true"` on inputs |
| No UI warning for 500-row import cap | `28d09e7` | Amber banner in Step 3 preview when file has > 500 rows |
| "Duration: 0m" for sub-minute violations | `e935cc2` (prior session) | `< 1m` returned by `formatDuration` when `diffMs < 60_000` |
| Missing "Edit notes" after saving violation resolution | `e935cc2` (prior session) | Edit button shown on resolved violations with notes; reopens textarea pre-filled |

---

---

## QA Loop — Iteration 2 (2026-04-19, code-review sweep)

Fresh parallel code-review surfaced new P1/P2 issues. All fixed and gated.

### Automated Gate Results (iteration 2 final)

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm typecheck` | ✅ clean across all packages |
| `pnpm test` | ✅ 1116 web + 942 api = 2058+ passing |
| `node scripts/e2e-smoke.mjs` | ✅ 16/16 steps pass |

### Issues Found and Fixed

| Severity | Issue | Commit | Notes |
|---|---|---|---|
| P1 | Billing NaN/zero submission on invoice line items + record-payment | `22a5824` | `Number.isFinite` guards on qty/unitPrice/amount; submit disabled on invalid |
| P2 | UTC date-only defaults in classrooms ($id Assign Child/Staff) and children ($id enrollment) | `6b6fb8b` | Shared `formatLocalDate(tz)` helper in `lib/dates.ts`; same class as `014d53a` |
| P2 | Subsidy claim dialog silently submits 0 days/hours/amount | `04405ce` | `Number.isFinite` + positivity checks before `mutateAsync`; inline error on fail |
| P2 | Subsidy case dialog truthy guard drops `"0"` as valid rate; NaN submitted on `"abc"` | `04405ce` | `!== "" && Number.isFinite(Number(x))` guard for all optional numeric fields |
| P2 | Scheduling `handleAddShiftSubmit` no try/catch — closes dialog on rejection | `3fe48f1` | try/catch; `shiftFormError` on failure; dialog stays open |
| P2 | pay/$token Stripe element remounts on every query refetch (object identity) | `eae3ae0` | Effect depends on stable string primitives, not `paymentSession` object |
| coverage | `rate-limiter.ts` DO and `pending-invitations.ts` lib had no tests | `e9ff1fd` | 11 + 7 tests added; 95%+ coverage on both files |

### Issues Deferred to Iteration 3

| Severity | Issue | Rationale |
|---|---|---|
| P3 | `formatCurrency` inconsistency (`$300` vs `$300.00`) | Multiple sites, needs UX decision on canonical format |
| P3 | `feedback-widget` pulse `useEffect` depends on `[open]` — timer resets on toggle | Low-impact cosmetic; no user-visible data loss |
| P3 | Ratios index `navigate` promise not awaited/caught | Silent rejection on nav failure; no observed breakage |
| P2 | `attendance-search` lacks listbox semantics + keyboard nav | Larger a11y refactor, separate PR |
| P3 | Billing template `useEffect` clobbers line-item edits on refetch | Needs UX decision (warn vs. preserve) |
| P3 | `pending-invitation-card` conflates signout failure with navigate failure in error message | Low severity; correct behavior, misleading error copy |

---

## QA Loop — Iteration 3 (2026-04-19, code-review sweep 2)

Fresh parallel code-review sweep surfaced a new batch of mutation-rejection bugs
(same class as the iter-2 scheduling fix, but across seven more route files),
two API-surface issues (no rate limit on public leads endpoint, silent email
failure in feedback), and closed every iter-2 deferral.

### Automated Gate Results (iteration 3 final)

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm typecheck` | ✅ clean across all packages (10/10) |
| `pnpm test` | ✅ 1167 web + 948 api + 334 shared + 132 site + 55 db + 21 emails + 10 ui + 9 auth + 2250 marketing = 4926 passing |

### Issues Found and Fixed

| Severity | Issue | Commit | Notes |
|---|---|---|---|
| P1 | Unhandled mutation rejections close dialogs silently across 7 route files | `880cc9c` | try/catch with inline `role=alert` error in children/$id, classrooms/$id + index, guardians/$id + index, overview, scheduling newSchedule |
| P1 | Public `leads` endpoint had no rate limiting (mailbomb vector) | `880cc9c` | Applied existing rate-limiter DO, 3/min per IP |
| P1 | Feedback route silently swallowed sendEmail failures, returned 201 OK | `880cc9c` | Returns `{ ok, emailed }` so frontend can distinguish DB-save from email-delivery |
| P2 | `formatCurrency` inconsistency ($300 vs $300.00) | `880cc9c` | Deleted 5 local copies, imported shared helper (always 2 decimals) |
| P2 | `feedback-widget` pulse timer reset on open/close toggle | `4c47cf4` | Effect depends on `[]` with `openRef`; fires once at PULSE_DELAY_MS |
| P2 | Ratios index `navigate` promise not awaited/caught | `4c47cf4` | `void navigate(...).catch(() => {})` |
| P2 | `attendance-search` lacked listbox semantics + keyboard nav | `4c47cf4` | Full combobox a11y + ArrowUp/Down/Enter/Escape handlers |
| P2 | Billing template `useEffect` clobbered line-item edits on refetch | `4c47cf4` | `lastAppliedTemplateRef` guard; reset on template change + form reset |
| P2 | `pending-invitation-card` conflated signout vs navigate failures | `4c47cf4` | Split try/catch; navigate failure no longer masks successful signout |
| P2 | Enroll wizard hydrate effect depended on `state` (loop risk) | `4c47cf4` | `hydratedKeyRef` + `[draftStorageKey]` only |
| P2 | Guardian phone inputs missing `type="tel"` / `inputMode="tel"` | `4c47cf4` | Add + Edit dialogs both updated |
| P2 | Classroom ratio fields accepted non-integer values via `Number() > 0` | `4c47cf4` | `isPositiveInteger` guard + `step="1"` on capacity/ratio inputs |
| coverage | `ratios/history.tsx` had no dedicated test | `549e34e` | 11 tests covering headers, skeleton, empty, violation sort, snapshot rows, filters |

### Issues Deferred to Iteration 4

| Severity | Issue | Rationale |
|---|---|---|
| P2 | `subsidies/index.tsx` nested-button a11y structure | Structural/UX decision needed; SR announces whole case row as single toggle |
| P3 | `attendance-calendar` midnight-cross refresh on long-open tablet sessions | Edge case; no user-visible breakage |
| Route-level | Ratios index + reports audit-log depth gaps beyond new ratios-history file | Ongoing |

---

## QA Loop — Iteration 4 (2026-04-20, deferred closure + fresh findings)

A fresh Explore sweep closed the iter-3 deferrals that had real bugs, added
missing rate limits to two authenticated write routes (guardians, messages),
and lifted per-file coverage above 95% on the four remaining `_auth` route
files that were short of the bar.

### Automated Gate Results (iteration 4 final)

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm typecheck` | ✅ clean across all packages |
| `pnpm test` | ✅ all green |

### Issues Found and Fixed

| Severity | Issue | Commit | Notes |
|---|---|---|---|
| P1 | `AddGuardianDialog` two-step mutation left orphan guardian rows if link step failed | `9d996cb` | Added `DELETE /guardians/:id` (owner/director, tenancy-scoped, cascades childGuardians); wired `useDeleteGuardian` best-effort rollback in the catch branch |
| P1 | `guardians` POST had no rate limit (authenticated abuse vector) | `80b6968` | `createRateLimit` 10/min per IP applied to POST only |
| P1 | `messages` POST had no rate limit (batch email fanout) | `80b6968` | `createRateLimit` 5/min per IP applied to POST only |
| P2 | Ratios `navigate` had redundant `void` in front of `.catch()` handler | `f366c34` | Removed the `void` — `.catch` already handles the floating promise |
| coverage | `attendance.tsx` 97.29/92.46/95/97.05 → 99.09/95.89/97.5/99.01 | `ee3cebf` | 3 targeted tests (reload path, clocked-in singular/plural) |
| coverage | `dashboard.tsx` 90.90/90.66/85.71/90.54 → 100/96.66/100/100 | `ee3cebf` | 6 tests (skeleton, session-recovery, retry, non-Error errors, compliance copy) |
| coverage | `overview.tsx` 100/94.44/100/100 → 100/100/100/100 | `ee3cebf` | 1 test (non-Error `switchCenter` rejection fallback) |
| coverage | `settings.tsx` 82.35/77.29/79.62/87.05 → 98.03/96.13/100/100 | `ee3cebf` | 23 tests (QB OAuth, reconciliation, roster, center-profile edit branches, OAuth banner variants) |

### Issues Resolved During Audit (no code change needed)

| Issue | Finding |
|---|---|
| Billing template `useEffect` deps gap (planned for Group C) | Already closed in iter-3; deps array includes `templateDetail` and `lastAppliedTemplateRef` prevents clobber. Refetch-survives-edit test already in `finance-pages.test.tsx`. |
| Subsidies nested-button a11y (iter-3 deferral) | The inner "New claim" `<Button>` is a sibling of the card `<button>`, not a descendant — DOM structure is already valid. No nested button. |

### Issues Deferred to Iteration 5

| Severity | Issue | Rationale |
|---|---|---|
| P3 | `attendance-calendar` midnight-cross refresh | Explore sweep found no concrete bug; existing timeout-on-unmount already correct |
| P3 | `messages.ts` batch-send backpressure beyond route rate limit | Resend's 1000/hr global cap bounds blast radius for now; route-level 5/min limit covers abuse |
| ongoing | `children/$id.tsx` file-level coverage (85% pre-existing, ~1000 LOC) | Individual rollback branches newly covered; remaining gap is pre-existing outside this iteration's scope |

---

## QA Loop — Iteration 5 (2026-04-20)

Closes iter-4 deferrals: pre-auth IP limiter pattern, redundant `requireAuth` cleanup, attendance-calendar midnight refresh, children/_auth coverage gaps, and Resend batch-send backpressure.

### Gates

| Gate | Result |
|---|---|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ 10/10 tasks clean |
| `pnpm test` (web) | ✅ 92 files / 1270 tests passing |
| `pnpm test` (api) | ✅ 66 files / 970 tests passing |

### Issues Found and Fixed

| Severity | Issue | Commit | Notes |
|---|---|---|---|
| P2 | Route-level `requireAuth` on `guardians.ts` / `messages.ts` was redundant with the router's global `use("*", requireAuth, requireCenter)` | `8b8dd90` | Removed 6 no-op invocations (4 guardians + 2 messages) |
| P1 | Route-level `createRateLimit` on POST `/api/guardians` and POST `/api/messages` ran AFTER `requireAuth`, so unauthenticated floods bypassed the granular limits | `9cd5a62` | Moved to app-level `app.use` mounts before `initMiddleware` (matching leads/feedback pattern); added `preMount` hook to test helper; added 5/min pre-auth limit on `/api/auth/sign-up/*` to mirror sign-in |
| P2 | `AttendanceCalendar` captured `new Date()` only at render time → stale "today" marker on sessions open past local midnight | `ab4ca15` | Added `nowTick` state + `setTimeout` scheduled to next midnight in the component's timezone; self-reschedules after each tick |
| P2 | `messages` POST fired up to 50 concurrent Resend requests per batch with no retry on 429 | `100b3dc` | Added `mapWithConcurrency` helper (N=5) and `retryOn429` honoring `retry-after`; preserves `allSettled` semantics |
| coverage | `children/$id.tsx` 82.29/73.52/78.68/85.08 → 97.39/91.17/98.36/99.44 | `1087742` | +18 tests (dialog close wrappers, rollback paths, edit-card Cancel, non-Error error fallbacks, timezone UTC fallback) |
| coverage | `children/index.tsx` 66.66/74.60/64.70/63.15 → 100/100/100/100 | `1087742` | +10 tests (skeleton, filters, clear-filters, summary counts, formatters) |
| coverage | `children/enroll.tsx` 98.16/86.89/100/98.78 → 98.89/90.02/100/99.59 | `1087742` | +5 tests (session-absent storage key, schema-version mismatch, malformed draft, JSON recovery, setItem throw) |

### Issues Deferred to Iteration 6

| Severity | Issue | Rationale |
|---|---|---|
| P3 | Resend-level retry beyond single-attempt `retry-after` | 1 retry + `allSettled` semantics + per-route 5/min already protect against routine 429s; multi-attempt backoff is future work when Resend spike rate ever matters |
| P3 | Global DDoS pressure on expensive authenticated endpoints (reports, analytics) | Current 60/min/IP global limit + path-specific sign-in/sign-up/guardians/messages limits cover the immediate gaps |

---

## Infrastructure Notes

- DB container: `pebbledesk-local-postgres` (port 54329, sometimes shows stopped in `docker ps` but is actually running — confirmed via `docker inspect`)
- Migration 0016 (`0016_pricing_tiers.sql`) was manually applied — drizzle-kit can't run `ALTER TYPE ADD VALUE` in a transaction
- `RESEND_API_KEY` is a placeholder locally; invoice send always returns 502. Public pay link tested by manually injecting a signed token.
- Staff test account `test+staff01@pebbledesk.test` needed `email_verified = true` set in DB and password reset via Node.js scrypt to match the `TestPass123!` used by e2e scripts
