# Production E2E Bug Report - 2026-05-06

Target: `https://my.pebbledesk.app` and `https://api.pebbledesk.app`

Tooling: Playwright CLI manual sessions `prod-e2e-20260506` and
`prod-e2e-postfix-20260506`

Credentials: disposable production E2E credentials are stored in local `.env.local` and referenced
from `agents/claude.md`. No secrets are stored in this report.

## Summary

Two production bugs were confirmed during the post-deploy sweep:

1. Child enrollment failed with a 500 because production was missing
   `public.child_guardians.center_id`.
2. A rapid duplicate attendance checkout could send a second `PATCH` and return a 500.

Both issues now have regression coverage. The production schema issue was repaired directly in
production by applying the existing idempotent child guardian center-scope migration SQL. The
attendance issue is fixed in code by suppressing same-render duplicate roster actions, disabling
pending roster actions, and converting the server-side checkout race from a generic 500 into the
existing "already checked out" 404 response.

## Environment

- Date: 2026-05-06
- Browser: Playwright Chromium via `playwright-cli`
- Account type: existing disposable owner account
- Center: existing disposable E2E production center
- Production database verification: `pnpm db:verify:production-schema`

## Flow Results

| Area | Result | Notes |
| --- | --- | --- |
| Returning login | Pass | Email/password login reached `/dashboard`; `/api/auth/status` and `/api/auth/me` returned 200. |
| Protected navigation | Pass | Authenticated routes loaded from the production app shell. |
| Classroom create | Pass | Created `Sunshine Room 0506`; `POST /api/classrooms` returned 201. |
| Child enrollment | Failed, then pass after schema repair | Initial `POST /api/children/enroll` returned 500; retry returned 201 and opened the child detail page. |
| Guardian creation through enrollment | Pass after schema repair | Transaction rolled back on the initial 500; retry created enrollment data successfully. |
| Attendance check-in | Pass after deploy | Double-click check-in produced one child check-in request and no console errors. |
| Attendance check-out | Failed before code fix; pass after deploy | Initial rapid duplicate checkout produced one 200 and one 500. After deploy, double-click checkout produced one checkout PATCH 200 and no console errors. |
| Desktop route sweep | Pass | `/dashboard`, `/classrooms`, `/children`, `/guardians`, `/attendance`, `/billing`, `/subsidies`, `/scheduling/time`, `/import`, and `/settings` rendered without failed API calls, console errors, or horizontal overflow. |
| Mobile route sweep | Pass | 390px-wide checks for dashboard, attendance, children, billing, subsidies, scheduling/time, import, and settings had no horizontal overflow, failed API calls, or console errors. |

## Bugs

### P0 - Child Enrollment 500 From Production Schema Drift

Status: Fixed in production database and guarded in codebase.

Evidence:

- Flow: setup/onboarding child enrollment.
- Request: `POST https://api.pebbledesk.app/api/children/enroll`
- Initial result: 500
- Response: `{"error":"Internal server error","requestId":"c22dc40d-aaba-45d3-bd43-66bd96fefd80"}`
- Production DB inspection showed `public.child_guardians.center_id` was missing.
- Existing code and migration expect `center_id` on `child_guardians`.

Root cause:

Production migration journal and production schema were out of sync. Migration
`packages/db/drizzle/0020_child_guardians_center_scope.sql` existed but the production table did not
contain `child_guardians.center_id`, causing enrollment inserts into the join table to fail.

Fix:

- Applied the existing idempotent center-scope repair SQL to production.
- Added `child_guardians.center_id uuid` to the production schema verifier required column list.
- Added a regression expectation so the verifier cannot silently omit this tenancy-critical column.

Verification:

- `pnpm db:verify:production-schema` now checks the required column and passes.
- Retried child enrollment in production; `POST /api/children/enroll` returned 201.

### P1 - Duplicate Attendance Checkout Can Return 500

Status: Fixed, deployed, and post-deploy verified.

Evidence:

- Flow: attendance roster checkout.
- Request 1: `PATCH /api/check-ins/{id}/check-out` returned 200.
- Request 2: rapid duplicate `PATCH /api/check-ins/{same-id}/check-out` returned 500.
- Browser console showed a failed resource for the second request.

Root cause:

The checkout route selected an open check-in before updating, then updated with
`checked_out_at IS NULL`. Under a rapid duplicate request, the second request can observe the
pre-update row but lose the update race. The update returns no row and the route throws a generic
`Error`, producing a 500.

Fix:

- Roster check-in and check-out handlers suppress same-render duplicate clicks before React Query
  publishes pending state.
- Roster check-in and check-out buttons are disabled while their respective mutation is pending.
- The API now returns the existing "Check-in not found or already checked out" 404 when the update
  race returns no row.

Verification:

- Added web tests for same-render duplicate click suppression and disabled pending check-in and
  checkout buttons.
- Added API regression test for a concurrent checkout race returning 404 instead of 500.
- Deployed API/web/site via `pnpm cf:deploy:touched -- -BaseRef 5ce0a37`.
- Post-deploy Playwright CLI verification confirmed double-click check-in produced one
  `POST /api/check-ins => 201`, and double-click checkout produced one
  `PATCH /api/check-ins/{id}/check-out => 200` with no 500s.

## Follow-Up Coverage Targets

These areas still deserve deeper data-mutating workflow sweeps beyond the rendering/navigation
coverage completed here:

- Billing invoice create/send/pay flows.
- Subsidy case and claim create/update flows.
- Scheduling shift create and time approval flows.
- Import source/type switching and CSV upload/reset behavior.
- Keyboard smoke for auth, mobile navigation, dialogs, selects, and enrollment.
