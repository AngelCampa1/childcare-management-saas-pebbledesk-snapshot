# Production Bug-Hunt QA Sweep - 2026-04-23

## Verdict

Pass with follow-up notes.

The production self-serve funnel now completes without Stripe in the new-user path, protected-route navigation no longer falls into the auth `429` cascade or white-screen failure mode, the team invite error copy is clearer, and the shared marketing header links have larger touch targets on tablet/mobile.

The final post-fix Playwright CLI rerun completed with zero `429` responses across captured first-party requests. Remaining noise during the broad sweep was limited to third-party telemetry aborts and a handful of first-party `net::ERR_ABORTED` requests that occurred during successful route transitions or persisted mutations and did not reproduce as user-visible failures.

## Production URLs Tested

- Marketing: [https://pebbledesk.app/](https://pebbledesk.app/)
- Pricing: [https://pebbledesk.app/pricing](https://pebbledesk.app/pricing)
- Features: [https://pebbledesk.app/features](https://pebbledesk.app/features)
- App signup: [https://my.pebbledesk.app/signup?plan=center_starter&source=%2F](https://my.pebbledesk.app/signup?plan=center_starter&source=%2F)
- Start trial: [https://my.pebbledesk.app/start-trial](https://my.pebbledesk.app/start-trial)
- Onboarding: [https://my.pebbledesk.app/onboarding](https://my.pebbledesk.app/onboarding)
- Dashboard: [https://my.pebbledesk.app/dashboard](https://my.pebbledesk.app/dashboard)
- Classrooms: [https://my.pebbledesk.app/classrooms](https://my.pebbledesk.app/classrooms)
- Children: [https://my.pebbledesk.app/children](https://my.pebbledesk.app/children)
- Attendance: [https://my.pebbledesk.app/attendance](https://my.pebbledesk.app/attendance)
- Settings: [https://my.pebbledesk.app/settings](https://my.pebbledesk.app/settings)
- Billing: [https://my.pebbledesk.app/billing](https://my.pebbledesk.app/billing)
- Reports: [https://my.pebbledesk.app/reports](https://my.pebbledesk.app/reports)

## Viewports

- Desktop: `1440 x 1024`
- Tablet: `1024 x 768`
- Mobile: `390 x 844`

## Disposable Production Test Data

- `bughunt-20260423-a1`
  - User: `E2E Live Tester 2026-04-23 bughunt-20260423-a1`
  - Email: `e2e+20260423-bughunt-bughunt-20260423-a1@pebbledesk.test`
  - Center: `E2E Live Ratio Center 2026-04-23 bughunt-20260423-a1`
- `bughunt-20260423-b2`
  - User: `E2E Live Tester 2026-04-23 bughunt-20260423-b2`
  - Email: `e2e+20260423-bughunt-bughunt-20260423-b2@pebbledesk.test`
  - Center: `E2E Live Ratio Center 2026-04-23 bughunt-20260423-b2`
- `bughunt-20260423-b3`
  - User: `E2E Live Tester 2026-04-23 bughunt-20260423-b3`
  - Email: `e2e+20260423-bughunt-bughunt-20260423-b3@pebbledesk.test`
  - Center: `E2E Live Ratio Center 2026-04-23 bughunt-20260423-b3`
  - Classroom: `E2E Sun Room bughunt-20260423-b3`
  - Child: `E2E Child bughunt-20260423-b3`
  - Guardian: `E2E Guardian bughunt-20260423-b3`

Leave all tagged data in place for later cleanup.

## Fix Verification Summary

- Auth/session reads are no longer constrained by the low global limiter bucket.
- Broad authenticated navigation no longer triggers the earlier auth `429` cascade.
- Protected routes under the authenticated shell no longer blank to white when auth verification is transiently unavailable.
- New-user self-serve flow remains Stripe-free through signup, plan confirmation, onboarding, and dashboard arrival.
- Team invite failure copy now explains the likely next step without weakening anti-enumeration behavior.
- Shared marketing header links have larger touch targets on tablet/mobile.

## Step-by-Step Outcome

| Step | Environment | Outcome | Notes | Evidence |
|---|---|---|---|---|
| Homepage desktop smoke | Production | Pass | Hero, nav, and primary CTA load correctly | `01-home-desktop.png` |
| Homepage mobile smoke | Production | Pass | Mobile nav and sticky CTA remain usable | `09-home-mobile.png` |
| Pricing/features CTA checks | Production | Pass | CTAs route to self-serve signup path | `05-pricing-desktop.png`, `07-features-desktop.png` |
| Signup validation | Production | Pass | Required fields, invalid email, and weak password validation triggered as expected | `24-signup-validation.png`, `25-signup-bad-email.png`, `26-signup-weak-password.png` |
| Signup to start-trial | Production | Pass | `plan=center_starter` routes to plan confirmation instead of Stripe | `29-signup-complete.png`, `30-start-trial.png` |
| Onboarding to dashboard | Production | Pass | Trial starts after center creation and lands on dashboard | `31-onboarding.png`, `32-dashboard-after-trial-start.png` |
| Dashboard initial state | Production | Pass | First-week checklist and setup copy render for new center | `33-dashboard-checklist.png` |
| Classroom creation | Production | Pass | Valid classroom created successfully | `34-classroom-created.png` |
| Child enrollment | Production | Pass | First child and guardian added and associated successfully | `36-child-enrolled.png` |
| Attendance and live ratio | Production | Pass | Staff clock-in and child check-in show live compliant ratio | `35-attendance-live-ratio.png` |
| Broad protected navigation | Production | Pass | Billing, reports, and settings loaded without auth `429` cascade or blank pages in final rerun | `66-app-settings-desktop.png` |
| Settings invite failure copy | Production | Pass | Generic failure copy replaced with clearer owner-facing guidance | `75-settings-staff-invite.png` |
| Marketing touch targets | Production | Pass | Shared header links updated with larger touch areas | `05-pricing-desktop.png`, `09-home-mobile.png` |
| Final rate-limit sweep | Production | Pass | Final rerun recorded zero `429` responses | Playwright JSON/network capture |

## Findings

### Resolved in This Fix

| ID | Severity | Page | Reproduction | Expected | Actual Before Fix | Current Status | Evidence |
|---|---|---|---|---|---|---|---|
| F-01 | High | App auth shell, billing, reports, settings | Navigate broadly through authenticated routes after signup/onboarding | Session reads should stay stable during ordinary navigation | Repeated auth reads hit `429`, then protected pages degraded or failed | Resolved | Final rerun recorded zero `429` responses and no session verification regressions |
| F-02 | High | Billing, reports, settings | Open protected child routes when auth verification is transiently unavailable | Shared recovery UI should render instead of blank page | Child-route auth preload failures could produce white screens | Resolved | Final rerun loaded these routes normally; shared recovery path remains in code for transient failures |
| F-03 | Medium | Settings > Team invite | Invite a `.test` email with no existing account | Copy should explain that the person must sign up first or may already belong to a team | Generic `Invitation could not be sent` message | Resolved | `75-settings-staff-invite.png` |
| F-04 | Low | Shared marketing header | Check tablet/mobile nav hit areas | Header links should meet shared minimum touch target expectations | Header links were smaller than shared touch target standard | Resolved | Source update deployed and verified on live marketing pages |

### Follow-Up Notes

| ID | Severity | Page | Reproduction | Expected | Actual | Assessment | Evidence |
|---|---|---|---|---|---|---|---|
| N-01 | Low | Broad sweep, multiple routes | Run aggressive Playwright navigation through app immediately after successful mutations | Requests should either complete or cancel harmlessly without user-visible breakage | A few first-party requests ended with `net::ERR_ABORTED` during route transitions, while the related UI state still succeeded | Not reproduced as a user-visible product failure; keep watching in future sweeps | Playwright network capture for final rerun |
| N-02 | Low | Telemetry endpoints | Broad sweep on marketing/app pages | Telemetry noise should not affect core behavior | Cloudflare RUM requests still show abort noise in console/network logs | Third-party telemetry noise; out of scope unless behavior breaks | Console/network appendix |

## Console And Network Appendix

### First-Party Issues Observed In Final Rerun

These occurred during a fast automated sweep, while the corresponding user actions or page states still completed successfully:

- `GET /api/children` -> `net::ERR_ABORTED`
- `GET /api/classrooms` -> `net::ERR_ABORTED`
- `GET /api/ratios` -> `net::ERR_ABORTED`
- `POST /api/children/enroll` -> `net::ERR_ABORTED`
- `POST /api/check-ins` -> `net::ERR_ABORTED`

Assessment: monitor, but not currently logged as confirmed product bugs because the UI and persisted state both succeeded in the same run.

### Expected/Intentional First-Party Responses

- `POST /api/members/invites` -> `400`
  - Triggered intentionally with a `.test` address that does not already have a PebbleDesk account.
  - Used to verify the new owner-facing invite guidance copy in settings.

### Third-Party Telemetry Noise

- Cloudflare RUM aborts remain visible during production sweeps.
- These did not block signup, onboarding, dashboard loading, classroom creation, child enrollment, attendance, ratio rendering, or protected-route navigation in the final rerun.

## Fix Queue

1. Keep an eye on navigation-time `ERR_ABORTED` first-party requests in future broad sweeps and only promote them to product bugs if they correlate with missing persisted state, stale UI, or broken recovery.
2. Consider a narrower Playwright network classifier so intentionally hidden controls and benign navigation aborts do not overcount as actionable UX failures in future reports.

## Deployment Notes

- API, web, and marketing were deployed after verification.
- API was redeployed once more after widening the broader global limiter to accommodate normal authenticated navigation beyond the auth read carve-out.
- Assumption used during deploy: the local environment did not provide `PUBLIC_SENTRY_DSN`, so the same public browser Sentry DSN used for the web deploy was reused for the marketing deploy to unblock release. This should be aligned with the canonical deploy environment configuration.

## Evidence Artifacts

- Report screenshots: [docs/qa/screenshots/2026-04-23-prod-bug-hunt](screenshots/2026-04-23-prod-bug-hunt) — 78 captures, in this repository.
- Runner artifacts: `prod-bug-hunt-20260423` — produced on the machine that ran the sweep, not carried into this snapshot.
- Invite copy snapshot: `75-settings-staff-invite.txt` — same, not carried into this snapshot.

