# Production App E2E Audit - 2026-04-28

## Summary

Target: `https://my.pebbledesk.app`

Scope: app only. Production writes were limited to throwaway tenant data. Stripe checkout,
real external messaging, destructive deletes, and non-test tenant data were not exercised.

Test tenant:
- User email: `prod-e2e+20260428214425@pebbledesk.test`
- Center: `PebbleDesk E2E Audit 2026-04-28 20260428214425`

Artifacts:
- Raw results: `output/playwright/prod-app-audit-2026-04-28/prod-app-audit-result-3.json`
- Populated-state pass: `output/playwright/prod-app-audit-2026-04-28/prod-app-populated-result.json`
- Screenshots: `output/playwright/prod-app-audit-2026-04-28/*.png`

Coverage:
- Created a self-serve trial account through `start-trial -> signup -> onboarding`.
- Seeded one classroom, one guardian, and one child in the test tenant.
- Visited all primary authenticated routes across desktop, tablet, and mobile viewports.
- Captured 175 screenshots and 683 click/open/select/scroll interactions.

## Findings

### P1 - Direct signup creates a gated, card-required workspace

Routes:
- `/signup`
- `/onboarding`
- `/dashboard`

Evidence:
- First run account: `prod-e2e+20260428213919@pebbledesk.test`.
- Direct `/signup` successfully created a user and center.
- `POST https://api.pebbledesk.app/api/centers` returned `201`.
- The dashboard then showed "Choose your PebbleDesk plan" and "Card required, cancel anytime."
- Screenshot: `07-dashboard-after-onboarding.png` from the first run.

Impact:
- A user who lands on `/signup` without plan attribution can complete setup and then be blocked
  from the workspace.
- This contradicts the no-card trial path exposed by `/start-trial?plan=center_starter`.

Likely source:
- `apps/web/src/routes/signup.tsx`
- `apps/web/src/routes/onboarding.tsx`
- `apps/web/src/components/subscription-required.tsx`

Remediation:
- Pick one signup contract and enforce it everywhere.
- Recommended: default bare `/signup` to the same self-serve path as `/start-trial` by applying
  `plan=center_starter` before onboarding.
- Update `SubscriptionRequired` copy so card-required Stripe checkout is never shown for a center
  that should have entered a no-card trial.
- Add a regression test for bare `/signup -> onboarding -> dashboard`.

### P1 - Billing portal button is shown for trialing centers without a Stripe customer

Route:
- `/billing`

Evidence:
- Clicking `Manage billing` during a no-card trial called
  `POST https://api.pebbledesk.app/api/subscriptions/portal`.
- API returned `400 No Stripe customer on file`.
- Raw result recorded three `400` responses for `/api/subscriptions/portal`.
- Screenshot: `desktop-_billing-top.png`.

Impact:
- Owners see an available billing action that cannot work.
- The failed call produces console noise and a poor first-run billing experience.

Likely source:
- `apps/web/src/routes/_auth/billing/index.tsx`
- `apps/api/src/routes/subscriptions.ts`

Remediation:
- Do not infer portal availability from `subscriptionStatus !== "none"`.
- Expose `stripeCustomerId`/`canOpenBillingPortal` from session or subscription status.
- Hide or replace `Manage billing` until a Stripe customer exists.
- Keep the API guard, but make the UI prevent the invalid call.

### P1 - Mobile navigation sheet has no dialog title

Routes:
- All authenticated routes on tablet/mobile when opening navigation.

Evidence:
- Console emitted this Radix accessibility error 40 times:
  `DialogContent requires a DialogTitle`.
- It appeared on every route after the mobile `Open navigation` button was clicked.
- The app shell renders `SheetContent` for navigation without a title.

Impact:
- Screen reader users get an unnamed dialog when opening navigation.
- This is a WCAG-level accessibility defect in a global control.

Likely source:
- `apps/web/src/routes/_auth.tsx`

Remediation:
- Add a visually hidden `SheetTitle`, for example `Navigation`, inside the mobile
  `SheetContent`.
- Add a route shell test that opens mobile navigation and asserts no Radix title warning.

### P2 - Several tab/checkbox controls are missing accessible names

Routes:
- `/attendance`
- `/ratios/history`
- `/classrooms`

Evidence:
- The audit found visible focusable controls without names:
  - Attendance tablist: `E2E Sunshine Room / Staff`.
  - Ratio history tablist: `Violations / Snapshots`.
  - Classroom checkbox control.

Impact:
- Keyboard and screen reader users lose context on what a control group is for.
- This is most visible on operational pages that directors use repeatedly.

Likely source:
- `apps/web/src/routes/_auth/attendance.tsx`
- `apps/web/src/routes/_auth/ratios/history.tsx`
- `apps/web/src/routes/_auth/classrooms/index.tsx`

Remediation:
- Add explicit `aria-label` or visible labels for each tablist.
- Ensure checkbox controls are associated with their text label via `Label htmlFor`,
  `aria-labelledby`, or a wrapped label pattern.

### P2 - Navigation and repeated controls miss the 44px touch target target

Routes:
- Global sidebar and many repeated route controls.

Evidence:
- The audit repeatedly measured primary sidebar links at about `216 x 36`.
- Small controls appeared across desktop/tablet/mobile route passes.

Impact:
- Tablet users in bright childcare-center environments have less forgiving tap targets.
- This conflicts with the product context: time-starved directors and staff using tablets.

Likely source:
- `apps/web/src/components/sidebar.tsx`
- Shared button/select/table action sizing where `size="sm"` is used.

Remediation:
- Raise sidebar link vertical hit area to at least 44px, especially in mobile sheet navigation.
- Audit `size="sm"` route actions and preserve compact visuals with padding/hit-area wrappers
  where needed.

### P2 - First-run populated pages can remain visually skeleton-heavy during route transitions

Routes:
- `/guardians`
- `/attendance`
- `/messages`

Evidence:
- Populated-state screenshots captured skeletons after route navigation:
  - `populated-route-_guardians.png`
  - `populated-route-_attendance.png`
  - `populated-route-_messages.png`
- A later snapshot of `/messages` resolved correctly, so this is not a permanent blank state.

Impact:
- Route transitions can look like stalled loading, especially when several related queries load
  at once.

Remediation:
- Keep skeletons, but add faster stable page headings and per-section loading boundaries.
- Avoid replacing the entire route body with skeletons when only one list query is pending.

## Remediation Plan

1. Fix signup and trial-state routing.
   - Add tests for direct `/signup` and `/start-trial?plan=center_starter`.
   - Ensure both routes land in a trialing workspace after onboarding without Stripe checkout.
   - Update blocking paywall copy so no-card trial and card-required checkout cannot conflict.

2. Fix billing portal availability.
   - Extend the subscription/session shape with an explicit portal-availability flag.
   - Hide `Manage billing` or replace it with trial setup guidance when no Stripe customer exists.
   - Add tests for trialing-without-customer and active-with-customer states.

3. Fix global mobile navigation accessibility.
   - Add a hidden title to the mobile sheet.
   - Add a regression test that opens the mobile navigation and asserts no console error.

4. Fix named control groups and touch targets.
   - Add labels to attendance and ratio-history tablists.
   - Label classroom checkbox controls.
   - Increase mobile/sidebar link hit areas to at least 44px.

5. Improve first-run loading behavior.
   - Keep stable route headings visible while child queries load.
   - Prefer section-level skeletons over full-page skeleton blocks on populated routes.

## Verification Plan

- Run targeted unit tests for touched route/component files.
- Run `pnpm --filter @pebbledesk/web test -- --coverage` and maintain 95% coverage on touched files.
- Run `pnpm lint` and `pnpm typecheck`.
- Re-run the production Playwright CLI audit against a fresh throwaway tenant.
- Confirm:
  - Bare `/signup` no longer creates a blocked workspace.
  - `/billing` no longer calls `/api/subscriptions/portal` without a Stripe customer.
  - Opening mobile navigation emits no Radix dialog-title error.
  - A11y scan no longer reports unnamed tablists/checkboxes.
  - Sidebar/mobile navigation controls meet 44px hit target expectations.
