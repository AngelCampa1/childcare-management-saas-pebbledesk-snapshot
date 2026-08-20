# Production E2E Remaining Gap Sweep - 2026-05-06

Target: `https://my.pebbledesk.app` and `https://api.pebbledesk.app`

Tooling: Playwright Chromium scripts run from the isolated worktree.

Credentials: the owner disposable production E2E account is stored in local `.env.local`.
No passwords, cookies, tokens, storage-state files, or raw production secrets are stored here.

## Summary

The remaining-gap sweep confirmed the previously fixed production flows still render for the owner
account, then found one additional product issue:

1. Expected auth verification failures were logged to the browser console by the global React Query
   error handler.

The code fix suppresses console noise when the existing Sentry filter classifies the error as
expected auth control flow. Unexpected query errors continue to be captured and logged.

Role-specific browser sessions could not be completed in the initial run because production signups
hit the auth rate limit while creating disposable director/staff accounts. The attempted role
credentials were removed from `.env.local`; only the env var names are documented in
`agents/claude.md`.

## Flow Results

| Area | Result | Notes |
| --- | --- | --- |
| Owner login | Pass | Existing owner account reached `/dashboard`. |
| Reload/new route session | Pass with console issue | Reload stayed on `/dashboard`, but auth verification errors appeared in the console before the fix. |
| Owner route sweep | Pass | `/dashboard`, `/attendance`, `/children`, `/guardians`, `/billing`, `/subsidies`, `/scheduling`, `/scheduling/time`, `/import`, `/reports`, and `/settings` rendered without failed API responses or horizontal overflow. |
| Settings/team invite UI | Pass | The Team card and Invite dialog are present after settings data finishes loading. |
| Disposable director/staff signup | Blocked | `POST /api/auth/sign-up/email` returned 429 rate limit during setup. |
| Director/staff invite acceptance | Blocked | Not completed because role account creation was rate-limited. |
| Auth edge local coverage | Pass | Login already force-refreshes `authStatus` before routing; local tests cover stale unauthenticated/onboarding/center-selection cache outcomes and refresh failures. |

Evidence artifacts are local only:

- `output/playwright/production-e2e-remaining-20260506/events.json`
- `output/playwright/production-e2e-roles-20260506/events.json`

## Bugs

### P2 - Expected Auth Verification Errors Pollute Browser Console

Status: Fixed, deployed, and post-deploy verified.

Evidence:

- Production owner login/reload and authenticated `/login` redirect emitted console errors:
  - `[QueryCache] AuthVerificationError: Failed to verify auth session`
  - `[QueryCache] TypeError: Failed to fetch (api.pebbledesk.app)`
- No protected route failed for the owner account; this was user-visible console noise and QA smoke
  noise rather than a workflow blocker.

Root cause:

`apps/web/src/main.tsx` always called `console.error("[QueryCache]", ...)` before relying on
`captureException` to filter expected auth verification errors from Sentry.

Fix:

- `apps/web/src/main.tsx` now calls `captureException` first.
- The query-cache handler logs to the browser console only when the error is actually captured.
- Existing Sentry filtering continues to suppress expected `AuthVerificationError` control flow.

Verification:

- Added a failing regression test first in `apps/web/src/main.test.tsx`.
- Red: `pnpm --filter @pebbledesk/web test -- src/main.test.tsx` failed because
  `console.error` was called once.
- Green: after the fix, `pnpm --filter @pebbledesk/web test -- src/main.test.tsx` passed with
  4 tests.
- Targeted coverage: `pnpm --filter @pebbledesk/web test:coverage -- src/main.test.tsx
  --coverage.include=src/main.tsx` reported 100% statements, branches, functions, and lines for
  `src/main.tsx`.
- The repo changed-line coverage gate still includes unrelated older branch history and reported
  missing coverage for files not touched by this remaining-gap fix. The include-scoped coverage
  evidence above is the clean-base evidence for the touched production file.
- Deployed web with `pnpm cf:deploy:touched -- -BaseRef 7b38f49`.
- Post-deploy Playwright smoke covered login, reload, and `/settings` on
  `https://my.pebbledesk.app`; result: 0 browser console errors, 0 failed API responses, and 0 page
  errors. Local evidence:
  `output/playwright/production-e2e-remaining-postdeploy-20260506/events.json`.

### P2 - Production E2E Role Account Setup Is Blocked By Shared Signup Rate Limit

Status: Fixed, deployed, and post-deploy verified.

Evidence:

- Production disposable role-account setup attempted browser signup for director/staff accounts.
- `POST https://api.pebbledesk.app/api/auth/sign-up/email` returned 429 before the invite and
  acceptance flow could be completed.
- Normal signup abuse protection is still required; the issue is that production QA needs to create
  a small batch of disposable role accounts from the same test runner/IP.

Root cause:

`/api/auth/sign-up/*` used the same 5/min/IP bucket for every signup email, including disposable E2E
accounts on the non-deliverable `pebbledesk.test` test domain.
During final review, the shared rate-limit key format was also found to couple route limiters that
used the same window, max, and IP settings.

Fix:

- Added a signup-rate-limit middleware that keeps the normal 5/min/IP bucket for public signups.
- Configured disposable E2E email domains use a separate 30/min/IP bucket only when the request also
  includes the `X-PebbleDesk-E2E-Signup` token header, so public clients cannot opt into the QA
  bucket by choosing a test-domain email.
- Production config sets the non-secret allowed disposable domain to `pebbledesk.test`; the token is
  a Cloudflare secret and is referenced locally only through
  `PEBBLEDESK_E2E_SIGNUP_RATE_LIMIT_TOKEN`.
- The shared rate-limit middleware now accepts explicit bucket names, and production route limiters
  use named buckets so unrelated routes cannot consume one another's allowance.

Verification:

- Added a failing regression test first in `apps/api/src/routes/auth-rate-limit.test.ts`.
- Red: `pnpm --filter @pebbledesk/api test -- src/routes/auth-rate-limit.test.ts` failed because
  `../middleware/signup-rate-limit.js` did not exist.
- Additional red coverage caught that public test-domain emails without the token, form-encoded
  signup bodies, and malformed multi-`@` emails needed explicit handling.
- Final-review red: `pnpm --filter @pebbledesk/api test -- src/middleware/rate-limit.test.ts`
  failed until named buckets isolated same-window/same-max limiters that share an IP.
- Green: after the fix, the same targeted test passed with 15 tests.
- Targeted coverage for `apps/api/src/middleware/rate-limit.ts` and
  `apps/api/src/middleware/signup-rate-limit.ts`: 100% statements, 97.77% branches, 100%
  functions, 100% lines.
- Required gates on merged `master`: `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- Deployed API with `pnpm cf:deploy:touched -- -BaseRef f30d726`; Cloudflare Worker version
  `3285d122-1c90-4f9d-9669-abd47fcdc831`.
- Post-deploy production probe sent six disposable `pebbledesk.test` signup requests with
  `Origin: https://my.pebbledesk.app` and `X-PebbleDesk-E2E-Signup`; all six returned 200 and none
  returned 429. Local evidence:
  `output/playwright/production-e2e-remaining-postdeploy-20260506/signup-rate-limit-fix-origin.json`.
- Follow-up role-flow verification created fresh disposable director and staff accounts, invited both
  from the production owner center, accepted both invitations through the browser, and verified
  `/api/auth/me` reported `director` and `staff` respectively. Local evidence:
  `output/playwright/production-role-flow-20260506/role-flow-passed.json`.

### P2 - Staff Pages Request Owner-Only Setup Lists

Status: Fixed, deployed, and post-deploy verified.

Evidence:

- Production staff smoke signed in with the disposable staff account and visited staff-visible
  authenticated pages.
- The API correctly returned 403 for staff requests to `/api/guardians` and `/api/classrooms`.
- Those forbidden requests surfaced as browser console resource errors, creating noisy staff UX and
  blocking a clean role-permission smoke.
- Local evidence:
  `output/playwright/production-role-flow-20260506/staff-access-debug.json`.

Root cause:

`apps/web/src/routes/_auth/dashboard.tsx` and `apps/web/src/routes/_auth/attendance.tsx` loaded
center setup lists before checking whether the active role was allowed to access those owner/director
resources.

Fix:

- `useChildren`, `useClassrooms`, and `useGuardians` now accept an `enabled` option for list
  queries.
- Staff dashboard disables child, classroom, and guardian setup-list queries.
- Staff attendance disables the classroom list query until the session is known to be owner/director.
- Staff attendance now shows the staff-specific assignment state before the owner/director classroom
  setup state when the classroom list is intentionally disabled.

Verification:

- Added failing regression tests first in the affected hooks and route tests.
- Red: `pnpm --filter @pebbledesk/web test -- src/hooks/use-classrooms.test.tsx
  src/hooks/use-guardians.test.tsx src/routes/dashboard-page.test.tsx
  src/routes/attendance-page.test.tsx` failed with 4 expected failures for ignored `enabled`
  options and unguarded staff route calls. Follow-up review added the same guard to
  `useChildren`.
- Green: the targeted suite with `src/hooks/use-children.test.tsx` added passed with 98 tests.
- `pnpm --filter @pebbledesk/web typecheck`
- `pnpm lint`
- `pnpm --filter @pebbledesk/web test` passed with 106 files and 1,582 tests.
- `pnpm typecheck`
- `pnpm test`
- Include-scoped targeted coverage for touched files:
  `pnpm --filter @pebbledesk/web exec vitest run --coverage
  --coverage.include=src/hooks/use-children.ts --coverage.include=src/hooks/use-classrooms.ts
  --coverage.include=src/hooks/use-guardians.ts
  --coverage.include=src/routes/_auth/dashboard.tsx
  --coverage.include=src/routes/_auth/attendance.tsx src/hooks/use-children.test.tsx
  src/hooks/use-classrooms.test.tsx src/hooks/use-guardians.test.tsx src/routes/dashboard-page.test.tsx
  src/routes/attendance-page.test.tsx`
  reported 100% lines/functions for all touched production files; route files were 100% statements
  and 95%+ branches. The two shared hook modules reported 100% lines/functions but lower statement
  and branch percentages because this focused report includes older mutation/detail branches outside
  this fix.
- The repo changed-line coverage gate still includes unrelated older branch history and reported
  missing coverage for files not touched by this staff query fix. The include-scoped coverage above
  is the clean evidence for this patch.
- Deployed web with `pnpm cf:deploy:touched -- -BaseRef 70d0702`; Cloudflare Pages deployment:
  `https://65def3cc.pebbledesk-web.pages.dev`.
- Post-deploy production staff smoke signed in with the disposable staff account, cleared login
  transition events, then visited `/dashboard` and `/attendance`; result: 0 forbidden
  `/api/children`, `/api/classrooms`, or `/api/guardians` responses, 0 API errors, and 0 browser
  console errors. Local evidence:
  `output/playwright/production-role-flow-20260506/staff-forbidden-fetches-postdeploy-pages-only.json`.

### P3 - Resend 429 Retry Budget Is Too Shallow

Status: Fixed, deployed, and post-deploy smoke verified.

Evidence:

- Deferred from the April manual sweep as future hardening after message fan-out was limited to 5
  concurrent sends and one retry honoring `retry-after`.
- Current `retryOn429` stopped after one retry, so a short run of consecutive Resend 429 responses
  left recipients undelivered even when the next bounded retry would have succeeded.

Root cause:

`apps/api/src/lib/concurrency.ts` returned the second response from `retryOn429` even when it was
also a 429.

Fix:

- `retryOn429` now supports a bounded retry budget, defaulting to 3 retries.
- Each retry still honors `retry-after`, falls back to 2 seconds, and caps a single wait at 10
  seconds.
- Existing message sending still catches per-recipient failures, so `allSettled`-style batch
  semantics are preserved.

Verification:

- Added a failing regression test first in `apps/api/src/lib/concurrency.test.ts`.
- Red: `pnpm --filter @pebbledesk/api test -- src/lib/concurrency.test.ts` failed because the
  helper called `send` only 2 times.
- Green: the same targeted test passed with 14 tests after the fix.
- Include-scoped targeted coverage with `src/lib/concurrency.ts` and `src/index.ts` passed the
  configured thresholds: 99.42% statements, 88.67% branches, 96.66% functions, and 99.38% lines.
  `src/index.ts` itself remains below 95% branch coverage because the entrypoint includes older
  Sentry configuration branches outside this fix.
- Deployed API with `pnpm cf:deploy:touched -- -BaseRef 205a9f0`; Cloudflare Worker version
  `72902fcf-caf3-4bab-84bf-4ab2f0d84f96`.
- Post-deploy smoke verified `GET /api/health => 200`. Resend retry behavior is covered by local
  tests because production fault injection is not available.

### P3 - Reports Endpoints Need A Tighter Expensive-Route Rate Limit

Status: Fixed, deployed, and post-deploy verified.

Evidence:

- Deferred from the April manual sweep as DDoS hardening for expensive authenticated reports and
  analytics-style endpoints.
- Current reports routes were protected by auth and the broad 180/min global bucket, but report
  generation and artifact download can trigger heavier DB and storage work than routine app
  navigation.

Root cause:

`apps/api/src/index.ts` had named buckets for auth, invoices, guardians, messages, feedback, and
global traffic, but no named reports bucket.

Fix:

- Added a named `reports` bucket at 10 requests/min/IP before `initMiddleware`.
- The limiter applies to `/api/reports` and nested report routes without double-counting the root
  path.
- The response is `429` with `Too many report requests, please try again shortly.`.

Verification:

- Added a failing regression test first in `apps/api/src/index.test.ts`.
- Red: `pnpm --filter @pebbledesk/api test -- src/index.test.ts` failed because the 11th report
  request reached the report handler with 403 instead of the reports limiter.
- Green: the same targeted test passed with 21 tests after the fix.
- Follow-up coverage tests for nested report routes, auth read global-limit bypass, and unknown cron
  handling brought the focused `src/index.test.ts` suite to 24 tests.
- `pnpm --filter @pebbledesk/api test` passed with 79 files and 1,199 tests.
- `pnpm typecheck`, `pnpm test`, and `pnpm lint` passed in the worktree.
- Deployed API with `pnpm cf:deploy:touched -- -BaseRef 205a9f0`; Cloudflare Worker version
  `72902fcf-caf3-4bab-84bf-4ab2f0d84f96`.
- Post-deploy production smoke sent 11 unauthenticated `/api/reports` requests with
  `Origin: https://my.pebbledesk.app`; the first 10 returned 401 from auth and the 11th returned
  `429` with `retry-after` and `Too many report requests, please try again shortly.`.

## 2026-05-06 Final Stale-Finding Resweep

Fresh Playwright production resweep found no currently reproduced bugs from the stale untracked
May 5 report.

- Login/session recovery: pass; returning login reached `/dashboard` and reload stayed there.
- Marketing pricing handoff: pass; annual CTA links include `billing=annual`.
- QuickBooks trial gating: pass; `/settings` produced no QuickBooks 403 console/API noise.
- Mobile touch targets: pass; mobile navigation, account, help, and feedback controls meet 44px
  targets where applicable.
- Search/filter accessible names: pass on `/attendance`, `/children`, and `/guardians`.
- Signup empty-submit validation: pass; app-level alerts are visible for missing name, email, and
  password.
- Promo banner spacing: pass; production no longer contains `first yearEnds`.
- Role permission sweep: pass; director and staff route sweeps produced 0 browser console errors and
  0 failed API responses. Staff owner/director pages render access-required states.

Local evidence:

- `output/playwright/production-remaining-issues-20260506/stale-finding-resweep.json`
- `output/playwright/production-remaining-issues-20260506/form-validation-resweep.json`
- `output/playwright/production-remaining-issues-20260506/role-permission-resweep.json`
- `output/playwright/production-remaining-issues-20260506/api-postdeploy-smoke.json`

## Remaining Risks

- Billing invoice create/send/pay, subsidy case/claim create/update, scheduling time approval,
  import reset, and basic role route sweeps have production evidence across the May 6 sweeps.
- No open confirmed production P0/P1/P2/P3 issues remain in the tracked May 6 sweep.
