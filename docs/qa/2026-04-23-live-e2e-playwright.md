# Live E2E Funnel QA - Playwright CLI

Date: 2026-04-23  
Verdict: Pass with issues  
Runner artifacts: `.playwright-cli/live-e2e-20260423/`  
Screenshot artifacts: `docs/qa/screenshots/2026-04-23-live-e2e/`

## Summary

The live production funnel was rerun after the self-serve trial onboarding fix was deployed to:

- API Worker version `8010c6f7-4017-4cff-8846-961a9ee05e7f`
- Web Pages deployment `https://1397472a.pebbledesk-web.pages.dev`
- Custom production surfaces `https://api.pebbledesk.app` and `https://my.pebbledesk.app`

The core workflow now passes without Stripe checkout and without Neon mutation: marketing CTA,
signup, plan confirmation, onboarding, automatic 30-day trial activation, dashboard, first
classroom, first child, attendance, and the live ratio aha moment.

Neon was used only for read-only verification after the run. No subscription bypass SQL was run.

## Production URLs Tested

| Surface | URL |
| --- | --- |
| Marketing homepage | `https://pebbledesk.app/` |
| Signup | `https://my.pebbledesk.app/signup?plan=center_starter&source=%2F` |
| Plan confirmation | `https://my.pebbledesk.app/start-trial?plan=center_starter&source=%2F` |
| Onboarding | `https://my.pebbledesk.app/onboarding?plan=center_starter&source=%2F` |
| Dashboard | `https://my.pebbledesk.app/dashboard` |
| Classrooms | `https://my.pebbledesk.app/classrooms` |
| Children | `https://my.pebbledesk.app/children` |
| Attendance | `https://my.pebbledesk.app/attendance` |
| API | `https://api.pebbledesk.app` |

## Test Data

| Type | Identifier |
| --- | --- |
| Token | `fix1qa` |
| User | `E2E Live Tester 2026-04-23 fix1qa` |
| Email | `e2e+20260423-fix1qa@pebbledesk.test` |
| Center | `E2E Live Ratio Center 2026-04-23 fix1qa` |
| Center ID | `b977c17f-8846-41f3-9f2c-1e125f4866dc` |
| Classroom | `E2E Sun Room fix1qa` |
| Child | `E2EChildfix1qa LiveRatio` |
| Guardian | `E2EGuardianfix1qa LiveRatio` |
| Guardian email | `e2e.guardian+20260423-fix1qa@pebbledesk.test` |

Leave this disposable tagged data in production until a cleanup pass is explicitly requested.
Previous disposable QA data from token `1p6xkg` is also still present from the pre-fix run.

## Neon Verification

Neon project: `snowy-wind-09622188`

Read-only verification result for `e2e+20260423-fix1qa@pebbledesk.test`:

| Field | Value |
| --- | --- |
| `subscription_status` | `trialing` |
| `subscription_plan` | `center_starter` |
| `trial_ends_at` | `2026-05-23T16:32:34.127Z` |
| `current_period_end` | `2026-05-23T16:32:34.127Z` |
| Classrooms | `1` |
| Children | `1` |
| Active child check-ins | `1` |
| Active staff check-ins | `1` |

No Neon update/bypass SQL was executed for this run.

## Step Outcomes

| Step | Result | Evidence |
| --- | --- | --- |
| Marketing desktop homepage loads and CTA points to `center_starter` signup | Pass | `01-marketing-desktop.png` |
| Marketing mobile homepage loads and includes the `center_starter` signup CTA | Pass | `02-marketing-mobile.png` |
| Signup required, invalid email, and weak password validation states appear | Pass | `03-signup-validation.png` |
| Tagged user can sign up | Pass | `04-post-signup.png` |
| Plan confirmation appears for Center Starter | Pass | `05-start-trial.png` |
| Onboarding required field validation appears | Pass | `06-onboarding-validation.png` |
| Tagged center can be created and trial starts without Stripe | Pass | `07-onboarding-filled.png`, `07-dashboard-after-trial-start.png` |
| Dashboard subscription gate is absent after self-serve trial activation | Pass | `01-dashboard-before-setup.png` |
| First classroom exists with preschool capacity and ratio setup | Pass | `02-classroom-created.png` |
| First child and guardian exist and are assigned to the classroom | Pass | `03-child-enrolled.png`, `03-child-enrollment-review.png` |
| Attendance can clock in staff and check in child | Pass | `04-attendance-live-ratio.png` |
| Live ratio aha moment is visible as compliant `1:1.0 ratio` | Pass | `04-attendance-live-ratio.png` |
| Final dashboard reflects completed setup | Pass | `05-dashboard-final.png` |

## Findings

| ID | Severity | Page | Finding |
| --- | --- | --- | --- |
| F-01 | Resolved | Onboarding | Pre-fix issue where self-serve onboarding landed on dashboard with `subscription_status = none` is fixed. New run creates `trialing` center directly. |
| F-02 | P3 | Marketing and app shell | Cloudflare RUM requests under `/cdn-cgi/rum?` were repeatedly aborted during page transitions. |
| F-03 | P3 | Children / Attendance | Browser reported child enrollment and check-in POSTs as aborted during automated transitions, although Neon confirmed the records persisted and UI reached the compliant ratio. |

### F-02 - RUM telemetry aborts

Reproduction:

Navigate the marketing homepage and authenticated app routes during the Playwright run.

Expected:

Telemetry should not generate noisy failed requests in browser diagnostics.

Actual:

Several `POST /cdn-cgi/rum?` requests were reported as `net::ERR_ABORTED` during route changes.

Impact:

Low user impact. Treat as third-party/edge telemetry noise unless it begins affecting user-visible
behavior.

Evidence:

Recorded in `.playwright-cli/live-e2e-20260423/phase1-run.json` and `phase2-run.json`.

### F-03 - Write POSTs reported aborted after persistence

Reproduction:

Enroll the child and then check the child in from Attendance during the automated run.

Expected:

Write requests should complete cleanly before route transitions, or diagnostics should not report
successful writes as aborted.

Actual:

Playwright recorded these as `net::ERR_ABORTED`:

- `POST https://api.pebbledesk.app/api/children/enroll`
- `POST https://api.pebbledesk.app/api/check-ins`

Neon confirmed the child, child check-in, and staff check-in persisted, and the UI showed
`Compliant` with `1:1.0 ratio`.

Impact:

Low in this run because the product state and UI were correct. Worth watching because fast
navigation after important writes can create ambiguous QA diagnostics.

Evidence:

`03-child-enrolled.png`, `04-attendance-live-ratio.png`, and the Neon verification table above.

## Console / Network Appendix

No browser console errors were recorded.

Network observations:

| Request | Result | Classification |
| --- | --- | --- |
| `POST https://pebbledesk.app/cdn-cgi/rum?` | `net::ERR_ABORTED` | telemetry noise |
| `POST https://my.pebbledesk.app/cdn-cgi/rum?` | `net::ERR_ABORTED` | telemetry noise |
| `POST https://api.pebbledesk.app/api/children/enroll` | `net::ERR_ABORTED`, DB row persisted | low-risk write/navigation observation |
| `POST https://api.pebbledesk.app/api/check-ins` | `net::ERR_ABORTED`, DB row persisted | low-risk write/navigation observation |

## Acceptance Result

The desired aha moment was reached with the fixed no-Stripe trial flow:

- tagged owner account existed
- tagged center was created directly as `trialing`
- no Stripe checkout appeared
- no Neon bypass was needed
- tagged classroom existed with `1:5` ratio setup
- tagged child and guardian existed
- staff and child were checked in
- Attendance showed `1:1.0 ratio` and `Compliant`
- final dashboard showed setup complete and the center ready for today
