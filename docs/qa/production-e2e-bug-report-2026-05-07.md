# Production E2E Bug Report - 2026-05-07

Targets:

- Marketing: `https://pebbledesk.app`
- App: `https://my.pebbledesk.app`
- API: `https://api.pebbledesk.app`

Tooling: Playwright CLI manual sessions `prod-e2e-20260507` and
`prod-e2e-local-20260507`, plus production-safe `curl.exe` API probes.

Credentials: disposable production E2E credentials from local `.env.local`, using the env var names
documented in `agents/claude.md`. No secrets are stored in this report.

Status: Historical report. The production 404 deploy blocker recorded here was superseded by the
full production sweep and later site deployments; the missing-route fallback is now merged,
deployed, and covered by regression tests.

## Summary

Three reproducible production issues were confirmed:

1. The authenticated dashboard rendered without an accessible page `h1`.
2. The marketing header caused horizontal overflow at the tablet breakpoint.
3. Missing marketing routes returned the browser/edge default 404 instead of the branded
   PebbleDesk 404 page.

All three now have regression coverage, local verification, review signoff, and deployed fixes.
The later full production sweep supersedes the original deployment blocker notes in this report.

## Scope Covered

| Area | Result | Notes |
| --- | --- | --- |
| API health | Pass | `GET /api/health` returned 200 `{"status":"ok"}`. |
| Unauthenticated auth status | Pass | `GET /api/auth/status` returned 200 unauthenticated. |
| Protected API without session | Pass | `GET /api/auth/me` and `GET /api/reports` returned 401 JSON. |
| Owner login | Pass | Existing disposable owner credentials reached `/dashboard`. |
| Authenticated route sweep | Pass with one fixed issue | Dashboard, attendance, ratios, children, guardians, classrooms, scheduling, time entries, subsidies, billing, reports, import, messages, settings, and help rendered without horizontal overflow or app-console failures. |
| Marketing desktop/mobile | Pass with fixed tablet issue | Home, pricing, features, guide, best list, Texas state page, compare, Brightwheel alternative, lead magnet, privacy, and terms rendered at desktop and mobile widths. |
| Marketing tablet | Failed, then fixed and deployed | Header desktop actions overflowed 768px pages before the breakpoint fix. |
| Marketing 404 | Failed, fixed, deployed, and superseded | Unknown route showed the browser default 404 instead of `404.astro`; the first deploy exposed that `/404/` was the wrong fallback path. |

Cloudflare RUM `POST /cdn-cgi/rum` aborts were observed during browser sweeps and treated as
non-app telemetry noise.

## Bugs

### P2 - Dashboard Has No Accessible Page Heading

Status: Fixed, deployed, and production-verified.

Repro:

1. Log in to `https://my.pebbledesk.app` with the disposable owner account.
2. Navigate to `/dashboard`.
3. Inspect the page headings.

Expected: The dashboard has an accessible `h1` named `Dashboard`.

Actual: No `h1` is present; the first headings are lower-level setup/help headings.

Root cause: `apps/web/src/routes/_auth/dashboard.tsx` renders dashboard content directly without a
route-level heading.

Fix:

- Added a screen-reader-only `h1` for the dashboard route.
- Added a regression expectation in `apps/web/src/routes/dashboard-page.test.tsx`.

Verification:

- Red test confirmed missing heading.
- `pnpm --filter @pebbledesk/web test -- src/routes/dashboard-page.test.tsx`
- Post-deploy Playwright CLI check on `https://my.pebbledesk.app/dashboard` confirmed exactly one
  `h1` with text `Dashboard`.

### P2 - Marketing Header Overflows at Tablet Width

Status: Fixed, deployed, and production-verified.

Repro:

1. Open `https://pebbledesk.app/resources/guides/how-to-choose-childcare-management-software/`.
2. Resize viewport to 768px wide.
3. Compare `document.documentElement.scrollWidth` to `clientWidth`.

Expected: No horizontal overflow.

Actual: The desktop header action group extended past the viewport. On the guide page,
`scrollWidth` was 814 while `clientWidth` was 768.

Root cause: Desktop navigation and header CTA actions became visible at the `md` breakpoint. At
768px, the logo, navigation, sign-in link, and trial CTA do not fit.

Fix:

- Changed the shared marketing `SiteHeader` desktop nav/actions from `md` to `lg`.
- Kept the mobile nav visible through the tablet breakpoint.
- Added a source regression in `packages/marketing/src/components/site-header-source.test.ts`.

Verification:

- Red test confirmed the old `md` breakpoint.
- `pnpm --filter @pebbledesk/marketing test -- src/components/site-header-source.test.ts`
- `pnpm --filter @pebbledesk/site build`
- Local Playwright CLI preview check at 768px confirmed no overflow on `/`, `/pricing/`, the guide,
  `/privacy/`, and `/terms/`.
- Post-deploy Playwright CLI check at 768px on the guide confirmed `clientWidth` 768,
  `scrollWidth` 768, and `overflowing: false`.

### P2 - Marketing 404 Uses Edge Default Instead of Branded Page

Status: Fixed, merged, deployed, and superseded by the full production sweep.

Repro:

1. Open `https://pebbledesk.app/definitely-missing-e2e-20260507/`.

Expected: The branded PebbleDesk 404 page from `apps/site/src/pages/404.astro` renders with status
404.

Actual: Chromium showed the default browser/edge error page: `This pebbledesk.app page can't be
found`.

Root cause: The marketing Worker passed missing static assets straight through from the Workers
static asset binding and did not fall back to the generated `/404` page.

Fix:

- Added a Worker fallback that fetches `/404` when a static GET returns 404, preserving the final
  response status as 404.
- Added a regression in `apps/site/src/worker.test.ts`.
- A post-deploy check found `/404/` redirected to `/404` and therefore returned an empty fallback
  body from the asset binding; the fallback path was corrected to `/404`.

Verification:

- Red test confirmed the raw missing-asset response.
- `pnpm --filter @pebbledesk/site test -- src/worker.test.ts`
- `pnpm --filter @pebbledesk/site build`
- Pre-correction post-deploy `curl.exe` check confirmed `/404` served the branded PebbleDesk 404
  page, while the missing route still returned HTTP 404 with an empty body.
- Later site deployments completed with valid Cloudflare authentication, and the missing-route
  fallback remains covered by `apps/site/src/worker.test.ts`.

## Verification Commands

- `pnpm --filter @pebbledesk/web test -- src/routes/dashboard-page.test.tsx`
- `pnpm --filter @pebbledesk/marketing test -- src/components/site-header-source.test.ts`
- `pnpm --filter @pebbledesk/site test -- src/worker.test.ts`
- `pnpm --filter @pebbledesk/site build`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm cf:deploy:touched -- -BaseRef 5c1729212c76f92407a650be1077f0df8c1eaa6c`
- `pnpm cf:deploy:site` attempted after the path correction; the auth failure was later resolved
  by subsequent successful site deployments.

Historical baseline note: `pnpm test -- --run` exited with Turbo argument parsing:
`unexpected argument '--run' found`.

Quality gate notes:

- `pnpm lint` was interrupted by unrelated pre-existing Biome issues in files outside this change set,
  including `apps/web/src/components/plan-picker.*`, `apps/web/src/components/subscription-required.*`,
  `apps/web/src/routes/_auth/billing/index.*`, `apps/api/src/middleware/plan.test.ts`,
  `apps/api/src/routes/centers.test.ts`, `apps/api/src/routes/subscriptions.test.ts`,
  `apps/api/src/scheduled/trial-expirer.ts`, and
  `packages/db/src/schema/trial-feature-usage.ts`.
- Root coverage exited with Turbo argument parsing:
  `pnpm test -- --coverage` exits with `unexpected argument '--coverage' found`.
- Targeted package coverage:
  - `pnpm --filter @pebbledesk/web test:coverage -- src/routes/dashboard-page.test.tsx` passed;
    touched `routes/_auth/dashboard.tsx` reported 100% statements, 95.45% branches, 100%
    functions, and 100% lines.
  - `pnpm --filter @pebbledesk/site test:coverage -- src/worker.test.ts` ran the targeted tests
    and `src/worker.ts` reported 98.34% statements, 95.94% branches, 96.87% functions, and
    98.84% lines, but the package command exits non-zero because global package coverage includes
    unrelated untested files.
  - `pnpm --filter @pebbledesk/marketing test:coverage -- src/components/site-header-source.test.ts`
    ran the targeted source regression, but the package command exits non-zero because V8 coverage
    does not instrument the `.astro` source file and package-wide global thresholds are enforced.

## Remaining Known Limitations

- Full role-specific production mutation sweeps for director/staff accounts were not repeated in
  this pass because the confirmed fixes were limited to page accessibility and marketing Worker/UI
  behavior.
- External integrations were checked only through safe visible status/error surfaces; no real
  third-party login, payment card, destructive sync, or background job trigger was used.
- The final post-deploy checks were limited to the confirmed fixes plus API health; they were not a
  second exhaustive mutation sweep.
- The historical site redeploy blocker in this report has been resolved by later successful site
  deployments.
