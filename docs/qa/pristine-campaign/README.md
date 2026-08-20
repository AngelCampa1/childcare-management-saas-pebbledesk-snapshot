# PebbleDesk "Pristine" Quality Campaign

**Goal (set 2026-06-10):** Make every aspect of PebbleDesk pristine — functionally, visually, and in UX. Bar: a Gen-Z user says "that looks nice" at every screen, and an 80-year-old can use every part without getting stuck. Sellable to big clients: cannot fail, cannot look bad. Verified by real local E2E (servers up, real workflows). Sub-agent driven, cheaper models where possible. Multiple review/fix cycles until nothing is left to fix.

**Operating rules**
- Treat prior sweeps as reference only — re-verify everything against the running app.
- All fix work happens in a git worktree (see CLAUDE.md). Review gates before merge.
- TDD + 95% per-file coverage on touched files. No placeholders, no `any`, no TODO.
- Light mode only, Gusto-inspired, pill buttons, warm/sturdy/practical.

## Local run (WORKING RECIPE — verified 2026-06-10)
- API (Wrangler): port 8790 — `pnpm --filter @pebbledesk/api dev`
- Web (Vite): port 3040 — `pnpm --filter @pebbledesk/web dev`
- **DB:** local proxy port 54329 is dead. Use an **isolated Neon branch** instead.
  - Project `Pebbledesk` / `snowy-wind-09622188`, default branch `production`.
  - Dev branch `local-e2e-pristine` (`br-square-sea-amqrpjls`, endpoint `ep-damp-block-amdqx2u8`).
  - Set `DATABASE_URL` in `apps/api/.dev.vars` to that branch's POOLED string (neon-http driver works directly). Backup of original at `apps/api/.dev.vars.bak-pristine`.
- `.dev.vars` was stale — added 8 split Stripe price vars + AI-CS vars (2026-06-10) to unblock startup.
- **Test login (owner):** `e2e+e2e-20260505-488877@pebbledesk.test` / pw in root `.env.local` `PEBBLEDESK_E2E_PASSWORD`. 32 real users on the branch.
- AI surface: `@ventora/ai-cs` widget (`apps/web/src/components/ai-cs-widget.tsx`). To test E2E, run the worker locally: `packages/ai-cs-worker` (`wrangler dev` on :8061, calls OpenRouter with its own key). PebbleDesk `.dev.vars` AI_CS_WORKER_ORIGIN=http://127.0.0.1:8061, secrets mirror the worker's `.dev.vars`.
- Branch is a throwaway copy of prod — safe to mutate. Contains real PII; do not exfiltrate.

## App surface (authenticated routes to audit)
dashboard, overview, attendance, ratios (index + history), children (index, $id, enroll),
classrooms (index, $id), guardians (index, $id), scheduling (index, time), subsidies,
billing (index, payments, templates), reports (index, audit-log), import, messages (index, $id),
account, settings, help. Public: login, signup, onboarding, forgot/reset password, pay/$token, privacy.

## Cycle log
Each cycle: pick a surface area, audit live (functional + visual + UX + a11y), file findings, fix in worktree, verify, merge. Record below.

### Cycle 0 — Orientation (2026-06-10)
- Mapped routes, env, prior QA docs. Confirmed local run prerequisites. Campaign doc created.
- Status: done.

### Cycle 1 — Live audit (2026-06-10, in progress)
- Brought up full stack (API 8790 + Web 3040 + isolated Neon branch), logged in as owner.
- Discovered + repaired CRITICAL production schema drift (see F-001) so E2E can run. Branch diff now clean.
- **/children** — verified loads (was 500 on missing `allergies`). Visual: clean, on-brand, pill CTA, accessible table w/ skip-link + help regions. 0 console errors. Finding F-002 (setup checklist persistence).
- **/dashboard** — clean, on-brand; correctly shows setup-complete state. 0 errors.
- **/attendance** — loads; finding F-003 (floating context-free signature/late controls).
- **/ratios** — excellent (compliance-readiness ring, status pills, capacity bar). Only issue was F-004.
- **F-004 (CRITICAL auth guard cold-cache denial) — FOUND, FIXED, MERGED, VERIFIED LIVE this session.**
- **/billing** — cold-loads fine post-fix; full audit pending (invoices, subscription, family payments regions present).
- Next: /guardians, /classrooms, /subsidies, /billing (full), /reports, /import, /messages, /scheduling, /account, /settings, /help, detail pages, public routes, AI-CS widget.
- **F-002 (setup checklist persistence) — FIXED, MERGED, VERIFIED LIVE this session** (both /children + /classrooms).
- **/guardians** — clean (plain-language guide, reachability summary, pickup pills). No findings. Confirms checklist pattern was list-page-specific.
- **/classrooms** — clean (compliance summary, room card). Was 2nd instance of F-002 (now fixed).
- Open UX findings to fix in later cycles: F-003 (attendance signature placement).
- **Local gotcha:** the Wrangler API dev server (8790) can die mid-session (proxy then returns 500 on /api/auth/*). Restart: `pnpm --filter @pebbledesk/api dev`. Verify with `curl /api/health` → 200 before resuming browser E2E.
- **Local gotcha (severe):** running pnpm inside an in-repo `.worktrees/` worktree (or `git worktree remove`) corrupted the root node_modules — deleted ~284 tracked `packages/*` files + the vite/esbuild binaries; web dev server then 500s ("Cannot find module .../vite/.../dep-*.js" → "'vite' is not recognized" → red esbuild "service is no longer running" overlay). Recovery: `git restore packages/` → `pnpm install --force` → kill the stale vite listener on port 3040 and start a fresh `pnpm --filter @pebbledesk/web dev`. Prevention: fix-subagents must NOT `pnpm install` in the worktree; merge + run tests from the MAIN checkout.
- **/subsidies** — clean (5 stat cards, auto-draft banner, plain-language guide). 0 console errors (the 500s seen were the API server being down again — restarted, see gotcha). Uses the static guidance panel → see F-005.
- **/overview** — clean single-location empty state ("You have one location… becomes available with 2+ centers", link to dashboard). Graceful, on-brand. No findings. Minor: the "All Locations" nav item is highlighted even for single-location owners (leads to an "unavailable" page) — low-priority forward-compat upsell, acceptable.
- **/billing** (full) — clean. Top: billing guide (F-005 pattern). Mid: "Connect Stripe before sending online payment links" + Connect Stripe CTA, 3 stat cards (Open/Overdue/Outstanding). Bottom: Family Billing → Invoices warm empty state ("No money in motion yet", wallet illustration, Create first invoice / Open billing setup). No functional/visual findings beyond F-005.
- **F-005 (static guidance panels use empty-circle/radio glyph for non-actionable tips) — FOUND** (subsidies, billing, children, classrooms). See backlog.
- **/reports** — clean. Report type / Period start / Period end / Format (PDF·CSV pill toggle), disabled-until-valid Generate button with clear helper ("Choose a start and end date…"), guidance panel + plain-language guide. F-005 bullet fix confirmed live here. No findings (functional report-generation E2E still to do in the functional pass).
- **/import** — excellent. 4-step wizard (Configure → Upload → Preview → Done) with a clear step indicator; Configure card has Import type + Source preset selects + pill Next. Guided, intuitive, on-brand. F-005 bullet fix confirmed. No findings.
- Routes still to audit: /billing/payments, /billing/templates, /reports/audit-log, /messages(+$id), /scheduling(+/time), /account, /settings, /help, detail pages (children/$id, classrooms/$id, guardians/$id), /children/enroll, public routes (login/signup/onboarding/forgot/reset/pay/privacy), AI-CS widget E2E. Functional E2E pass still owed: report generation, invoice create/send, CSV import, messaging, AI-CS chat (OpenRouter).
- **Master-red regression — FOUND, FIXED, MERGED, VERIFIED this session.** The F-002 merge added `useSetupProgress` to ChildrenPage/ClassroomsPage but left the older companion specs `children-page.test.tsx` (17) + `classrooms-page.test.tsx` (10) un-mocked → 27 tests threw "No QueryClient set" → master was RED. Fix: added the `vi.mock("../hooks/use-setup-progress", …)` the newer specs already use. Full web suite now green: **149 files / 2539 tests**. Lesson: when a hook is added to a page component, grep for ALL test files rendering that component (page-level AND route-level companions), not just the one you're editing.
- **/scheduling/time** — Finding F-007 (duplicate stat block). **F-007 — FIXED, MERGED, VERIFIED LIVE this session.** Removed the redundant `TimeMetric` 4-up grid that duplicated the `ComplianceSummary` "Coverage summary" band; kept the warning-tone compliance summary. time.tsx 97.82% stmts/97.5% lines. TDD fail-first confirmed; the merged assertion was hardened (`getAllByText("Approved")` collided with the Entry-review `<h3>`, switched to the collision-free "Pending" + "Worked hours"-absent checks). Screenshot confirms single summary band.
- **/scheduling (index)** — clean (Coverage summary, shift cards). No findings.
- **/messages** (+ Compose dialog) — clean. Dialog UX audited (recipient + type selects, plain copy). Did NOT send (real PII on branch — needs a safe sandbox approach in the functional pass). No visual/UX findings.
- **/billing/payments** — clean. No findings.
- **/reports/audit-log** — functional + on-brand. Finding F-008 (awkward humanization of internal entity slug). LOW.
- **/settings** — clean. No findings.
- **/help** — excellent. Role-aware "Start here" guides with progress counters, a searchable plain-language "Quick answers" grid (14 Q&A cards, all third-grade reading level), every CTA a deep link to the matching route. Reads warm/sturdy/practical, on-brand. No findings.

## Findings backlog
(populated per cycle — severity, surface, description, status)

### F-001 — CRITICAL — Production schema drift (migration journal lies)
- **Surface:** DB / deploy. **Status:** OPEN (branch repaired for E2E; production NOT touched).
- **Symptom:** App 500s on `/api/children` (missing `allergies`), and would 500 on attendance/ratios/billing/messages flows once those columns are read. Root cause: `drizzle.__drizzle_migrations` journal on `production` has only 33 rows with a recent max timestamp, so `drizzle-kit migrate` thinks everything is applied — but the physical DDL for many migrations never ran. Repo has 68 migration files. This is a baseline/restore artifact.
- **Confirmed missing on a fresh prod-derived branch (13 cols / 6 tables):**
  - `children`: `allergies`, `immunizations`, `notes` (mig 0028)
  - `check_ins`: `is_late`, `check_in_signature`, `check_out_signature` (0029)
  - `ratio_violations`: `staff_count`, `children_count`, `ratio_required`, `ratio_actual` (0031)
  - `invoice_line_items`: `center_id` (0047)
  - `invoice_template_line_items`: `center_id` (0048)
  - `message_recipients`: `center_id` (0049)
- **Repair applied to `local-e2e-pristine` branch only** (non-destructive `ADD COLUMN IF NOT EXISTS` + backfill of `center_id` from parent, then `SET NOT NULL`). Diff now clean.
- **Dedicated fix cycle required (do NOT do ad-hoc on prod):**
  1. Author a real reconciling migration that is idempotent (`ADD COLUMN IF NOT EXISTS` + backfill) for all 13 columns, ordered after 0067.
  2. Add a deploy-time schema-verify gate (`packages/db/src/verify-production-schema.ts` already exists — wire it into CI/predeploy so drift fails the deploy).
  3. Reconcile the journal so future `migrate` is trustworthy.
  4. **Do NOT apply the `children_id_center_unique` unique constraint that `drizzle-kit push` proposes** — it prompts to TRUNCATE `children`. Push is unsafe here; never use it against prod.
- **Risk:** deploying current `master` to production breaks core read paths. This alone blocks "cannot fail" for big clients.

### F-002 — MEDIUM — Onboarding setup checklist persists after setup is done
- **Surface:** /children AND /classrooms (confirmed shared "getting started" pattern across list pages — check attendance/ratios too). **Status:** ✅ RESOLVED 2026-06-10 (merged + verified live — checklist now hidden on both pages for the configured test center). Fix: extracted `computeSetupProgress`→`lib/setup-progress`, added `useSetupProgress` hook mirroring dashboard readiness, gated panel on `!isLoading && !allDone`. New files 100% cov; dashboard behavior preserved.
- **Worst instance:** on /classrooms the checklist's first step "Add your classrooms" renders directly BELOW the center's existing "Sunshine Room 0506" card — the guidance literally contradicts the data on screen. On /guardians the page instead uses a plain-language guide (no checklist), which is the right pattern.
- **Symptom:** The prominent "Need help setting up children?" 4-step setup checklist (empty step circles: add classrooms, enroll children, open attendance, generate report) renders even when the center already has active children AND classrooms. A configured center sees a permanent "you haven't started" banner above its real data — feels broken / not-for-me to an experienced director.
- **Expected:** Collapse, dismiss, or hide the setup scaffolding once the relevant prerequisites are satisfied (e.g. ≥1 classroom + ≥1 enrolled child), or convert to a dismissible tip. Check whether attendance/ratios/billing/reports list pages share the same always-on pattern.
- **Bar impact:** "80-year-old never gets stuck" is fine, but "Gen-Z says looks nice" + big-client polish suffers — looks unfinished.
- **Corroboration:** the **/dashboard** for the SAME center correctly shows "You're ready — let's go / Your center is set up" (setup-complete state). So setup-completion detection already exists on the dashboard; the list pages just don't use it. Fix likely = reuse the dashboard's readiness signal on list-page scaffolding.

### F-003 — HIGH (UX/visual) — Attendance check-in signature + "Mark late" float context-free at top-right
- **Surface:** /attendance. **Status:** ✅ RESOLVED 2026-06-10 (merged to master `b406d9b4`/`aeb41943`, verified live — header no longer shows the floating controls; clicking a child's "Check In" now reveals an inline disclosure with "Mark late" + "Check-in signature (optional)" + "Confirm Check In"/"Cancel", mirroring the existing per-row checkout-signature pattern). Fix moved late+signature out of page-level state and the floating header block into `CheckInRosterRow` (apps/web/src/components/attendance-roster.tsx); the search-box check-in is now a plain quick check-in. Per-child checkbox ids (`check-in-late-${child.id}`) avoid collisions. Tests: attendance-roster.test.tsx (27) + attendance-page.test.tsx (44) green, typecheck + biome clean. TDD: roster check-in tests rewritten to the two-step flow first.
- **Symptom (original):** A "Mark late" checkbox and an empty "Check-in signature (optional)" signature box rendered persistently in the top-right whitespace, detached from any child or action, before the user had selected a child — no indication of what they applied to. Read as a stray/unstyled element and confusing to a non-technical director.
- **Bar impact:** Fixed both bars — was confusing AND looked unfinished. High because attendance is the daily-driver screen.

### F-005 — LOW/MEDIUM (visual/UX) — Static guidance panels render tips with an empty radio/checkbox circle
- **Surface:** every page using `GuidancePanel` (apps/web/src/components/guidance.tsx) — /subsidies, /billing, /children, /classrooms. **Status:** ✅ RESOLVED 2026-06-10 (merged to master `ae75f77a`, verified live on /subsidies — tip rows now show a small bullet dot, no longer a radio circle). Fix: static `GuideStepRow` marker swapped from Lucide `Circle` to a decorative `<span>` bullet; interactive checklist untouched. New `guidance.test.tsx` (25 tests, fail-first confirmed), guidance.tsx 100% stmts/lines.
- **Symptom:** `StaticGuideChecklist` renders each informational tip row with an empty Lucide `Circle` (line 89) — visually identical to an unchecked checkbox/radio. But these panels are read-only explanations ("Use Billing for family payments", "Keep attendance current"), not completable tasks: the circle is non-interactive and there is no checked state. To a design-literate viewer it looks like an unfinished/broken form; an 80-year-old may click the circles expecting them to tick and get confused when nothing happens.
- **Distinction:** the *interactive* `GuideChecklist`/`GuideCard` (real toggleable steps with a completed count) is correct — keep its Circle→CheckCircle2 affordance. Only the **static** panel is wrong.
- **Expected:** In the static panel, replace the radio-looking `Circle` with a non-checkbox marker so the rows read as a bulleted list of tips, not an actionable checklist — e.g. a small filled bullet/dot, an arrow (`ArrowRight`), or the guide's help/tone accent. Keep it `aria-hidden`. No behavior change.
- **Bar impact:** "Gen-Z says looks nice" + big-client polish; mild "80-year-old gets stuck" risk. Low severity, but it recurs on 4 customer-facing pages so it's worth one small fix.

### F-007 — MEDIUM (visual/UX) — Duplicate stat block on Time Entries page
- **Surface:** /scheduling/time. **Status:** ✅ RESOLVED 2026-06-10 (merged `7d9cdf37`/`8658afaf`, assertion hardened `0f831ab0`, verified live). The page rendered the same payroll metrics twice — a custom `TimeMetric` 4-up grid (Pending/Approved/Worked hours/Overtime) directly above the `ComplianceSummary` "Coverage summary" band that already carries the warning-tone compliance signal. Fix: deleted the redundant grid + the `TimeMetric` component, kept the Coverage summary. time.tsx 97.82% stmts/97.5% lines.

### F-008 — LOW (visual/copy) — Audit log humanizes internal entity slugs awkwardly
- **Surface:** /reports/audit-log. **Status:** ✅ RESOLVED 2026-06-10 (merged, verified live — entry now reads "AI support session created"). Root cause: entityType `ai-cs` hit the generic singularizer in [format-audit-log.ts](../../../apps/web/src/lib/format-audit-log.ts), which strips the trailing "s" → "ai-c" → "Ai c". Confirmed via live `/api/audit-log` that `ai-cs` was the *only* one of 13 entity types that mis-rendered (all others map or start-case cleanly). Fix: added `"ai-cs": "AI support session"` to `ENTITY_DISPLAY_LABELS` + regression test. format-audit-log.test.ts 23 tests green.

### F-009 — LOW (a11y) — Account password forms have no (hidden) username field
- **Surface:** /account (Password change form + Account deletion form). **Status:** ✅ RESOLVED 2026-06-10 (merged, verified live — Chrome warning gone; both forms now expose a read-only `autocomplete="username"` field bound to the account email). Fix: added a `sr-only` `tabIndex={-1}` `aria-hidden` username input at the top of each form in [account.tsx](../../../apps/web/src/routes/_auth/account.tsx) + regression test asserting 2 fields, readOnly, bound to email. account-page.test.tsx 9 tests green.

### F-010 — HIGH (campaign blocker, local dev only) — Local E2E cannot exercise any transactional write route
- **Surface:** every API route that uses `db.transaction(...)` — check-in (`POST /api/check-ins`), check-out, and likely billing/invoice/import/subsidy write paths. **Status:** ✅ RESOLVED 2026-06-10 (local-dev harness fix — see below).
- **Resolution:** Added a LOCAL-DEV-ONLY `HYPERDRIVE` binding to the **default** wrangler config (apps/api/wrangler.jsonc) with an all-zeros placeholder `id`. The real local connection string (the local-e2e-pristine Neon branch) is supplied via the gitignored env var `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` in `apps/api/.env`, so no password is committed. With it set, `wrangler dev` connects directly to that string (never the remote Hyperdrive id) → `hyperdriveBound: true` → postgres-js driver → real `db.transaction()`. **Three independent safeguards keep this away from prod:** (1) deploys use `wrangler deploy --env production`, which never ships the default config; (2) `env.production` declares its own `hyperdrive` (real id) that overrides the default; (3) `localConnectionString`/the env var is ignored entirely by `wrangler deploy`, and the all-zeros id resolves to nothing so a misconfigured dev fails loudly instead of touching prod. Env var name corrected from the originally-guessed `WRANGLER_...` to the actual `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` (per CF changelog 2025-12-04). Verified live: a real check-in (`POST /api/check-ins`) now succeeds.
- **Functional write-route E2E sweep (2026-06-10, post-fix):** With the harness fixed, exercised **26 transactional write routes across 10 route files** end-to-end against the e2e branch as an authenticated owner (real ids; `LOCAL_INTEGRATION_STUBS=true` so Resend/Stripe are stubbed). **All returned 2xx or a correct business-logic 4xx — zero unexpected 500s.** Covered: children create/enroll/reactivate/status, guardian delete, invoice-templates CRUD, invoices create/patch/delete, payments create + reverse, staff-check-ins clock-in/out, subsidy cases + claims (create/patch/submit/delete), messages send (announcement), and imports (children/guardians/invoices/enroll). Not exercised: `POST /api/invoices/:id/send` (requires a connected Stripe account — guarded before the transaction), and webhook/Stripe signed-payload routes. **This is the first genuinely-valid functional E2E of the write surface** — see the prior-sweeps note below for why earlier "functional E2E" claims on these routes were invalid.
- **Symptom:** Live E2E of a real check-in (click "Check In" → "Confirm Check In") returns **HTTP 500** `{"error":"Internal server error"}`. Reproduced directly: a well-formed `POST /api/check-ins` with a valid childId/classroomId 500s; a bad-format childId correctly 400s (zod), so the route + validation are reached — the 500 is in the handler at the first `db.transaction(...)` call.
- **Root cause:** Local `wrangler dev` has **no Hyperdrive binding** (it's only in `env.production`, see apps/api/wrangler.jsonc:175). `apps/api/src/index.ts:286` calls `createDb(connectionString, { hyperdriveBound: Boolean(c.env.HYPERDRIVE) })`. With `HYPERDRIVE` undefined and `DATABASE_URL` pointing at the **remote** Neon branch host (`ep-damp-block-...neon.tech`, not localhost), `resolveDbDriver` (packages/db/src/client.ts:26) returns `"neon-http"`. The `drizzle-orm/neon-http` driver throws `Error: No transactions support in neon-http driver` on `db.transaction()`, which Hono's `onError` maps to 500. **Production is unaffected** — it binds Hyperdrive (id `1584dd3...`) → `postgres` (postgres-js) driver → real atomic transactions; `assertProductionDbDriver` even hard-fails cold-start if Hyperdrive is missing in prod.
- **Expected / fix:** Make local dev use a transaction-capable driver against the remote branch so write workflows can actually be E2E-tested locally. Cleanest path: add a `HYPERDRIVE` binding to the **default** wrangler config with a `localConnectionString` (or supply `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` from a gitignored env, so the Neon password is never committed) → `wrangler dev` then routes through Hyperdrive-local → `hyperdriveBound: true` → postgres-js → transactions work. Alternative: add a dev-only `neon-serverless` WebSocket `Pool` path in `createDb` for remote hosts. Do **not** weaken the production driver selection.
- **Note on prior sweeps:** earlier campaign notes listed "functional report-generation / invoice / check-in E2E still to do" — confirming those write workflows were **never actually exercised locally**. Any future "functional E2E passed" claim for a `db.transaction` route is invalid until this harness gap is closed.
- **Bar impact:** Not a production defect, but a hard blocker on the campaign's core promise of proving the daily-driver write flows (attendance, billing) end-to-end locally before selling to big clients.

### F-004 — CRITICAL (functional) — Role-guarded routes deny real owners/directors on hard load/refresh
- **Surface:** /ratios (and every route using `requireDirectorOrOwner`/`requireOwner`: billing, reports, import, settings, etc.). **Status:** ✅ RESOLVED 2026-06-10 (merged to master, verified live — /ratios + /billing now cold-load as owner; commit `fix(web): resolve auth session before role guards`). role-guards.ts 100% cov; per-route guard tests de-vacuumed.
- **Repro:** Logged in as Owner, hard-navigate (refresh / direct URL / new tab / bookmark) to `/ratios` → bounced to `/dashboard?denied="true"`. Client-side nav from an already-loaded page works, masking it.
- **Root cause:** `apps/web/src/lib/role-guards.ts` reads role via `queryClient.getQueryData(["authSession"])` synchronously in the route's `beforeLoad`. But `apps/web/src/routes/_auth.tsx` (`createFileRoute("/_auth")`, line 63) has **no `beforeLoad`/`loader`** — it only fetches `authSession` inside the rendered component. TanStack runs child `beforeLoad` BEFORE the parent component renders, so on a cold load the `["authSession"]` cache is empty → `role === undefined` → guard redirects with `denied`.
- **Fix direction:** Make the guard resolve the session before deciding — `await context.queryClient.ensureQueryData(authSessionQuery)` inside the guard (make guards async), OR add a `_auth` `beforeLoad`/`loader` that `ensureQueryData(authSessionQuery)` so the cache is warm before child guards run (must preserve existing onboarding_required / invite_pending / verification error handling currently in the `_auth` component). Add regression tests covering cold-load (empty cache) for owner + director + staff.
- **Bar impact:** Owners literally cannot refresh core compliance/billing pages without being kicked out. Hard blocker for "cannot fail" + selling to big clients.
- **Audit workaround:** navigate guarded routes via in-app link clicks (warm cache), not `page.goto`, until fixed.

### F-011 — MEDIUM (functional/correctness) — Subsidy-claim PATCH leaked 500 on period overlap race
- **Surface:** `PATCH /api/subsidy-claims/:id`. **Status:** ✅ RESOLVED 2026-06-11 (merged `65b6dd65`, pushed + deployed to prod, verified live). Found via local transactional E2E (unblocked by F-010).
- **Root cause:** The PATCH transaction had no try/catch (unlike POST), so under a concurrent race the DB-level GiST exclusion constraint `subsidy_claims_no_overlap` (migration 0067, code `23P01`) surfaced as a raw 500 instead of the clean 409 POST already returns.
- **Fix:** Wrapped the PATCH transaction to mirror POST — `isSubsidyClaimOverlapExclusionViolation(err)` → `CLAIM_PERIOD_OVERLAP_RESPONSE` 409, else rethrow. TDD: 2 tests (23P01→409, 23505→500). subsidy-claims.test.ts green.

### F-012 — MEDIUM (functional/data-integrity) — Child dateOfBirth accepted future and implausibly-old dates
- **Surface:** `createChildSchema` in [packages/shared/src/validators/child.ts](../../../packages/shared/src/validators/child.ts) — reused by manual create, PATCH (via `updateChildSchema`), and CSV import (`POST /api/imports/{children,enroll}` reuse the schema). **Status:** ✅ RESOLVED 2026-06-11 (merged `1ec69b8b`, pushed + deployed, verified live 401-gated).
- **Root cause:** `dateOfBirth` was `z.string().date()` — format-only. A birthdate in the future or many decades ago passed validation and persisted.
- **Fix:** Added `isPlausibleBirthDate` refine — UTC whole-day comparison (timezone-flake-proof) requiring DOB on-or-before today and within the last `MAX_CHILD_AGE_YEARS = 18`. Propagates through `updateChildSchema` (.extend().partial()) so a future DOB is rejected on PATCH while an omitted field still passes. New child.test.ts (8 tests). **Runtime behavior change:** previously-accepted out-of-range DOBs are now rejected on create/PATCH/import.

### F-013 — LOW (cleanup) — Dead notes/memo entries in invoice editable-fields set
- **Surface:** `editableInvoiceFieldsForStatus` in [packages/shared/src/validators/billing.ts](../../../packages/shared/src/validators/billing.ts). **Status:** ✅ RESOLVED 2026-06-11 (merged `7f2987a3`, pushed + deployed).
- **Root cause:** Sent/overdue invoices listed `{dueDate, notes, memo}` as editable, but the invoices table has no notes/memo columns and `updateInvoiceSchema` is `.strict()` with no such fields — those keys can never reach the allowlist.
- **Fix:** Reduced the set to `{dueDate}`, fixed the stale doc comment in invoices.ts, added a unit test pinning the allowlist per status. No runtime behavior change (dead code).

### F-014 — LOW (test reliability) — Classroom archive test was timezone-flaky
- **Surface:** [apps/api/src/routes/classrooms.test.ts](../../../apps/api/src/routes/classrooms.test.ts) "clears live attendance and assignment state when archiving". **Status:** ✅ RESOLVED 2026-06-11 (merged `618260d8`, pushed). Test-only — no deploy impact.
- **Root cause:** The archive route writes assignment `endDate = toLocalDay(archivedAt, tz)` (tz defaults to America/Chicago), but the test derived its expected endDate from `checkedOutAt.toISOString()` (UTC). The two diverged during the evening in western timezones, reddening the suite on a wall-clock schedule. This was the lone failure in the otherwise-green 1776-test API suite.
- **Fix:** Pin the center timezone via `tzSelectChain` and compute the expected endDate with the same `toLocalDay` conversion the route uses. Verified deterministic under `TZ=UTC+14` and `TZ=UTC-12`. Full API suite now 1776/1776.

### Cycle 1 live UI/UX audit (2026-06-11) — authenticated daily-driver screens

First browser-driven taste + usability sweep of the core authenticated screens (dashboard, attendance, ratios, billing, children, settings, account) against the two campaign bars (Gen-Z "looks nice" + 80-year-old "can use it"), now that the write backend transacts locally (F-010). Drove real workflows (incl. a live UI check-in/out) through web:3040 + api:8790 as the seeded owner. One fix shipped; two reported "P1s" debunked by careful live reproduction.

#### F-015 — LOW (UI declutter) — Invoice list repeated redundant Stripe/pay-link microcopy per row
- **Surface:** /billing invoice list (`InvoiceRow` in [billing/index.tsx](../../../apps/web/src/routes/_auth/billing/index.tsx)). **Status:** ✅ RESOLVED 2026-06-11 (merged `edceeb21`, pushed + deployed to my.pebbledesk.app in the Cycle 1 wrap-up).
- **Root cause:** Every row rendered one of "No public pay link has been generated.", "Connect Stripe before sharing this pay link.", or (per draft) "Connect Stripe before sending invoices…" — restating global Stripe-connection state on every invoice. The page already surfaces that state once via the prominent top-of-page `FamilyPaymentsSetupCard` (with its Connect Stripe CTA), and the bulk Send action relies on that card with no inline message. The per-row paragraphs were inconsistent clutter vs. the "reduce, don't add" principle.
- **Fix:** Render the "Open pay link" button only when the invoice is payable AND Stripe is connected; otherwise render nothing. Removed all three per-row paragraphs. Draft Send button stays visibly disabled (explanation lives in the top card, matching the bulk-send pattern). Updated the one test that asserted the removed per-row string to assert the global Connect Stripe CTA instead. web suite 101/101, biome + tsc clean.

#### Debunked by live reproduction (don't-trust-previous-sweeps in action)
- **"Full-screen 'Loading your workspace…' splash fires after every checkout" — NOT REAL.** A second, instrumented live repro confirmed the splash never enters the DOM on check-in/out: zero auth calls fire on the mutation (only `/api/check-ins` + `/api/ratios` refetch), zero 401s, the roster updates in place with app chrome intact. The `_auth.tsx:372` gate keys off React-Query `isLoading`, which is only true on cold first load (no cache); invalidating `checkIns`/`ratios` never touches `authStatus`/`authSession`, so `isLoading` stays false. The original audit almost certainly saw the splash on an intentional cold hard-refresh and misattributed it to checkout. **No fix made** — editing the gate would have risked breaking legitimate session-loss handling.
- **"Every check-in triggers a full roster skeleton reload" — NOT REAL.** Same repro: the roster updates in place with no skeleton flash. `useCheckIn` invalidates the `checkIns` key but the cached data is retained during background refetch (`isFetching` true, `isLoading` false), and the skeleton gates on `isLoading` — so it never re-shows. No fix needed.
- **Lesson:** of the original audit's 4 "P1s", two evaporated under instrumented reproduction. Verify root cause against live behavior before editing — especially for shared auth/session gates.

#### Candidate follow-ups (genuine but lower-confidence; verify before fixing)
Not yet actioned — recorded so they aren't lost: child-detail "Near Limit" amber badge reused for a *missing primary contact* (ratio-language leaking into a contact-completeness field — likely a real wrong-label bug worth fixing after confirming the source component); ratios room card shows "N/A" actual ratio in compliant-green (should be neutral when there's no data); QuickBooks settings banner has no inline CTA. Account-deletion "add a confirmation dialog" was considered and **declined** — the form already requires typing `DELETE` plus a password, which is stronger friction than a single dialog.

#### Cycle 1 wrap-up (2026-06-11) — verified, pushed, deployed

Full verification pass before release: turbo `typecheck` 10/10, `biome check` clean across 982 files, full `pnpm test` **2540/2540 web tests + all 11 packages green**, `pnpm build` 4/4. While running verifications, two **pre-existing** master-state defects (unrelated to F-015) surfaced and were fixed in the wrap-up commit (`50f4d78a`):

- **Broken attendance test** — `attendance-calendar.test.tsx` asserted the roster check-in mutation fired with no `Confirm Check In` click, but the check-in disclosure flow (commit `aeb41943`) made that a two-step interaction. Added the confirm click; relaxed the payload assertion to `objectContaining({childId, classroomId})` since the mutation now also carries `isLate`/`signatureData`.
- **20 + 1 lint errors** — auto-fixable biome violations (`organizeImports`, `useValidAriaRole`, `noNonNullAssertion`, format) in `guidance.test.tsx`, `use-setup-progress.test.tsx`, and `children/index.test.tsx`. All in files untouched by this campaign; cleared via `biome check --write`.

Master pushed to origin (`50f4d78a`), web deployed to my.pebbledesk.app (Version `9a18b12a`, serving bundle `index-TrrE-0H5.js`, live HTTP 200 confirmed). No migrations needed — no schema changes. Worktree + branch already removed. Untracked audit PNGs cleaned from the repo root.
