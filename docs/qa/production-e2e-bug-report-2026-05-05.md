# Production E2E Bug Report - 2026-05-05

## Verdict

Production sweep found one confirmed app bug: returning email/password login can remain on the
login screen after a successful `/api/auth/sign-in/email` response because the client may reuse a
fresh cached pre-login `authStatus: unauthenticated` value instead of rechecking the session.

The fix is implemented, covered by a red-green regression test, deployed to the web app, and
verified against production.

## Production URLs Tested

- Marketing: `https://pebbledesk.app/`
- Marketing pricing: `https://pebbledesk.app/pricing`
- Marketing features: `https://pebbledesk.app/features`
- App signup: `https://my.pebbledesk.app/signup?plan=center_starter&source=production-e2e`
- Trial handoff: `https://my.pebbledesk.app/start-trial`
- Onboarding: `https://my.pebbledesk.app/onboarding`
- Protected app routes: dashboard, attendance, ratios, ratio history, children, child enrollment,
  guardians, classrooms, scheduling, time, billing, payments, subsidies, reports, audit log,
  import, messages, settings, and help.
- API health: `https://api.pebbledesk.app/api/health`

## Viewports

- Desktop: `1440 x 1024`
- Tablet: `1024 x 768`
- Mobile: `390 x 844`

## Disposable Production Test Data

- Email: `e2e+e2e-20260505-488877@pebbledesk.test`
- Center: `E2E Production Center e2e-20260505-488877`
- Password: stored only in `.env.local` as `PEBBLEDESK_E2E_PASSWORD`

Leave tagged disposable data in production for later cleanup.

## Evidence Artifacts

- Sweep output: `output/playwright/production-e2e-20260505-204416/`
- Key screenshots:
  - `06-signup-page.png`
  - `07-signup-validation.png`
  - `11-dashboard-after-onboarding.png`
  - `37-signed-out-dashboard.png`
  - `39-login-dashboard.png`
- Captures:
  - `results.json`
  - `console.json`
  - `network.json`
  - `login-repro/desktop.json`
  - `login-repro/mobile.json`

## Step-by-Step Outcome

| Step | Environment | Outcome | Notes | Evidence |
|---|---|---|---|---|
| API health | Production | Pass | Health endpoint returned 200 | `00-api-health.png` |
| Marketing home desktop | Production | Pass | Hero, navigation, and CTAs rendered without overflow | `01-marketing-home-desktop.png` |
| Marketing pricing desktop/tablet | Production | Pass | Pricing page rendered without overflow | `02-marketing-pricing-desktop.png`, `05-marketing-pricing-tablet.png` |
| Marketing features desktop | Production | Pass | Feature page rendered without unexpected first-party errors | `03-marketing-features-desktop.png` |
| Marketing home mobile | Production | Pass | Mobile layout rendered without horizontal overflow | `04-marketing-home-mobile.png` |
| Signup validation | Production | Pass | Empty submit showed field validation | `07-signup-validation.png` |
| Signup submit | Production | Pass | Disposable user reached start-trial | `08-after-signup.png` |
| Trial handoff | Production | Pass | Continue setup reached onboarding | `09-start-trial-or-onboarding.png` |
| Onboarding | Production | Pass | Center setup reached dashboard | `11-dashboard-after-onboarding.png` |
| Protected route sweep | Production | Pass with console noise | All protected routes rendered; no unexpected first-party 4xx/5xx | `12-*` through `30-*` |
| Mobile protected sweep | Production | Pass | Dashboard, attendance, children, billing, settings, and help rendered without overflow | `31-*` through `36-*` |
| Signed-out protected route | Production | Pass | Protected page presented sign-in recovery after cookies cleared | `37-signed-out-dashboard.png` |
| Returning login | Production | Fail before fix | Login stayed on login page after sign-in response returned 200 | `39-login-dashboard.png` |

## Findings

### F-01 - Returning Login Uses Stale Unauthenticated Auth Status

- Severity: High
- Page: `https://my.pebbledesk.app/login?redirect=%2Fdashboard`
- Reproduction:
  1. Create and onboard a disposable production user.
  2. Clear cookies.
  3. Open `/login?redirect=%2Fdashboard`.
  4. Enter the disposable email/password and submit.
- Expected: After `/api/auth/sign-in/email` returns 200, the client should freshly confirm
  `/api/auth/status` and route to `/dashboard`.
- Actual before fix: The form remained on the login screen. Isolated repro waited 60 seconds on
  desktop and mobile and stayed on `/login?redirect=%2Fdashboard`; network showed
  `/api/auth/sign-in/email` returned 200, but no post-login `/api/auth/status` request was made.
- Root cause: `LoginPage.fetchFreshAuthStatus()` used `queryClient.fetchQuery(["authStatus"])`
  without invalidating or overriding stale time. The app QueryClient defaults queries to a
  60-second `staleTime`, so the fresh pre-login unauthenticated cache could be returned instead of
  making a post-login status request.
- Fix: Invalidate `["authStatus"]` and force `staleTime: 0` for the post-login status fetch.
- Test: Added regression coverage in `apps/web/src/routes/public-auth-pages.test.tsx`.
- Status: Fixed, deployed, and verified in production.

## Console And Network Notes

- No unexpected first-party 4xx/5xx responses were recorded in the broad sweep.
- Repeated `AuthVerificationError` console messages appeared during rapid route transitions, paired
  with first-party `net::ERR_ABORTED` requests. The corresponding pages still rendered successfully.
- Cloudflare RUM requests reported `net::ERR_ABORTED`; treated as telemetry noise.
- Intentional/expected auth responses included `401` on `/api/auth/me` after cookies were cleared.

## Local Verification

- `pnpm test` passed before changes.
- New regression test failed before implementation:
  `pnpm --filter @pebbledesk/web test -- src/routes/public-auth-pages.test.tsx`
- Targeted regression passed after implementation:
  `45 passed` in `public-auth-pages.test.tsx`.

## Post-Deploy Verification

- Web deploy: `pnpm cf:deploy:touched -- -BaseRef 414c988d06dafe51a22f5c08a5eb9e7ee2fec8d6`
  deployed only the `web` project to Cloudflare Pages.
- Production returning-login smoke:
  `output/playwright/production-e2e-20260505-post-deploy-login/returning-login.json`
- Result: Pass. Returning login reached `https://my.pebbledesk.app/dashboard`.
- Auth network sequence included `/api/auth/sign-in/email` 200 followed by fresh
  `/api/auth/status` 200 responses.
