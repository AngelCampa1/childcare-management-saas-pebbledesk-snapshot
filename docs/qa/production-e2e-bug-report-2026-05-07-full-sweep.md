# Production E2E Bug Report - 2026-05-07 Full Sweep

Targets:

- Marketing: `https://pebbledesk.app`
- App: `https://my.pebbledesk.app`
- API: `https://api.pebbledesk.app`

Artifacts:

- `output/playwright/prod-e2e-20260507/full-sweep-results.json`
- `output/playwright/prod-e2e-20260507/auth-sweep-results.json`
- Screenshots in `output/playwright/prod-e2e-20260507/`

Credentials: disposable production E2E credentials from local `.env.local`. No secrets are stored
in this report.

## Summary

This report supersedes the earlier same-day status for production verification because it was run
after the deploy attempt documented in `production-e2e-bug-report-2026-05-07.md`.

The production sweep found two issues live in production before the final deploy. Both were fixed,
deployed, and production-verified after this report was written:

1. The authenticated dashboard still renders without a DOM `h1` in production.
2. Missing marketing routes still return HTTP 404 with an empty body instead of the branded
   PebbleDesk 404 page.

No new app-flow, role, report-generation, report-download, audit-log, or marketing overflow bugs
were confirmed during this pass.

## Scope Covered

| Area | Result | Notes |
| --- | --- | --- |
| API health | Pass | `GET /api/health` returned 200 `{"status":"ok"}`. |
| Public auth reads | Pass | `GET /api/auth/status` returned unauthenticated; `GET /api/auth/me` returned the expected 401 negative-probe response. The initial JSON artifact labels this as `fail` because the first runner treated all non-2xx statuses as failures; it was reclassified here as expected behavior. |
| Marketing routes | Pass with one known 404 issue | Desktop, tablet, and mobile sweeps of home, pricing, features, resources, comparison, lead magnet, privacy, and terms had no horizontal overflow. |
| Marketing unknown route | Failed, then fixed | Initial status was 404 with an empty body. After deploying `pebbledesk-site`, the same class of unknown route returned branded 404 HTML. |
| Owner session | Pass with one fixed dashboard issue | The first full-sweep runner hit production sign-in rate limiting, so its login rows are superseded by `auth-sweep-results.json`. Owner login, route sweep, reports, report download, and audit-log checks passed in the auth sweep. Dashboard initially had no DOM `h1`; after deploying `pebbledesk-web` and waiting for dashboard data queries to settle, production returned one `h1` named `Dashboard`. |
| Director session | Pass | The auth sweep supersedes the initial rate-limited login rows. Director login and visible routes rendered; owner-only controls were not exposed in the checked surfaces. |
| Staff session | Pass | The auth sweep supersedes the initial rate-limited login rows. Staff login rendered assigned operational surfaces and showed access-required screens for restricted areas. Reports API returned 403. |
| Reports | Pass | Attendance, ratio, subsidy, and licensing reports generated; latest licensing ZIP downloaded with expected ZIP content. |
| Imports | Limited | Import route rendered, but the CSV input was not available in the production E2E account state during the mutation attempt, so CSV mutation cases were skipped. Follow-up code review classified this as an entitlement/account-state limitation; entitled accounts render `data-testid="csv-file-input"`. |
| Scheduled jobs | Config gap found, then fixed | No production-safe HTTP trigger exists for Cloudflare cron handlers, so jobs were not manually invoked. Follow-up review found the trial-expirer handler existed for `0 2 * * *` but Wrangler did not register that cron; the local and production trigger arrays were updated. |
| External integrations | Limited | No disposable QuickBooks or payment-provider credentials were provided. Safe disconnected/error surfaces exist and can be checked without completing third-party OAuth or payment-provider flows. |

Cloudflare RUM aborts and aborted route-transition fetches were treated as browser-navigation
noise unless paired with a user-visible failure.

## Bugs

### P2 - Dashboard Has No DOM Page Heading in Production

Status: Fixed, deployed to `pebbledesk-web`, and production-verified.

Repro:

1. Log in to `https://my.pebbledesk.app` with the disposable owner account.
2. Navigate to `/dashboard`.
3. Inspect `document.querySelectorAll("h1")`.

Expected: The dashboard includes one page-level `h1` named `Dashboard`.

Actual: Production returned an empty `h1` list for `/dashboard`.

Evidence:

- `auth-sweep-results.json`, owner `/dashboard`: `"h1": []`.

Likely root cause: The live web Worker was serving a build without the local dashboard
accessibility fix, despite the earlier same-day report recording a deployed state.

Affected files:

- `apps/web/src/routes/_auth/dashboard.tsx`
- `apps/web/src/routes/dashboard-page.test.tsx`

Verification:

- `pnpm --filter @pebbledesk/web test -- src/routes/dashboard-page.test.tsx`
- `pnpm cf:deploy:web`
- Post-deploy Playwright check on `https://my.pebbledesk.app/dashboard`, after waiting for
  dashboard data queries to settle, returned `h1: ["Dashboard"]`.

### P2 - Marketing 404 Uses Empty Worker Response Instead of Branded Page

Status: Fixed, deployed to `pebbledesk-site`, and production-verified.

Repro:

1. Open `https://pebbledesk.app/definitely-missing-e2e-20260507-full-sweep/`.
2. Inspect status and body.

Expected: HTTP 404 with the branded PebbleDesk 404 page from `apps/site/src/pages/404.astro`.

Actual: HTTP 404 with an empty body.

Evidence:

- `full-sweep-results.json`, marketing `404`: status `404`, body text `""`.
- Screenshot: `output/playwright/prod-e2e-20260507/marketing-404.png`.

Likely root cause: The live marketing Worker was serving a build before the local static-asset 404
fallback fix.

Affected files:

- `apps/site/src/worker.ts`
- `apps/site/src/worker.test.ts`

Verification:

- `pnpm --filter @pebbledesk/site test -- src/worker.test.ts`
- `pnpm --filter @pebbledesk/site build`
- `pnpm cf:deploy:site`
- Post-deploy request to `https://pebbledesk.app/definitely-missing-e2e-postdeploy-20260507/`
  returned HTTP 404, `content-type: text/html`, and branded 404 text.

### P2 - Trial Expirer Cron Handler Was Not Registered in Wrangler

Status: Fixed locally and ready for the next `pebbledesk-api` deploy.

Repro:

1. Inspect `apps/api/src/index.ts`; the scheduled handler dispatches `runTrialExpirer` for
   cron `0 2 * * *`.
2. Inspect `apps/api/wrangler.jsonc`.

Expected: Both local and production Wrangler trigger arrays include `0 2 * * *`.

Actual: Wrangler registered the other scheduled jobs but omitted the trial-expirer cron.

Evidence:

- Follow-up source review after the production sweep found `0 2 * * *` in the Worker scheduled
  handler but not in either Wrangler trigger array.

Likely root cause: The trial-expirer scheduled handler was added without updating Cloudflare cron
registration.

Affected files:

- `apps/api/wrangler.jsonc`
- `apps/api/src/index.test.ts`
- `apps/api/src/test/wrangler-config-source.test.ts`

Verification:

- `pnpm --filter @pebbledesk/api test -- src/index.test.ts src/test/wrangler-config-source.test.ts`

## Verification Commands Run During Sweep

- `npx --yes --package @playwright/cli playwright-cli -s=prod-e2e-20260507 open https://pebbledesk.app`
- `npx --yes --package @playwright/cli playwright-cli -s=prod-e2e-20260507 snapshot --json`
- `node output/playwright/prod-e2e-20260507/full-sweep.cjs`
- `node output/playwright/prod-e2e-20260507/auth-sweep.cjs`
- `pnpm cf:deploy:web`
- `pnpm cf:deploy:site`
- Follow-up cleanup verification:
  - `pnpm lint`
  - `pnpm --filter @pebbledesk/site test:coverage -- src/worker.test.ts`
  - `pnpm --filter @pebbledesk/api test -- src/index.test.ts src/test/wrangler-config-source.test.ts`

## Remaining Limitations

- CSV import mutation cases need a fresh pass with an E2E account entitled for imports; this was
  not classified as a product-code bug.
- Scheduled/background jobs were not invoked in production because no safe HTTP trigger exists.
- External integrations were checked only through visible app surfaces; no third-party connection
  flow was attempted without disposable sandbox credentials.
