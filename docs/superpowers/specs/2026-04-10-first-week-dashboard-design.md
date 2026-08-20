# First-Week Dashboard Design

## Goal

Turn the post-onboarding dashboard into a polished first-week setup surface for new childcare center owners so the app immediately tells them what to do next.

## Problem

Today the dashboard is a bare welcome message with no guidance. A brand-new owner lands there after onboarding and has to infer the correct setup order from the sidebar. That makes the product feel unfinished and increases the chance they hit downstream dead ends like child enrollment before classrooms exist.

## Decision

Use a guided setup dashboard with one clear primary action: `Create your first classroom`.

The dashboard should also show a short prioritized checklist:

1. Create your first classroom
2. Enroll your first child
3. Invite your team
4. Take attendance

## Behavior

- The dashboard should read real center state from existing web hooks where possible.
- If the center has no classrooms, the hero primary CTA should point to `/classrooms` and explicitly tell the owner to set up the first room.
- If classrooms exist, the hero should shift from setup mode to an operational next step, with the checklist reflecting completed work.
- Checklist items should have:
  - a plain-language label
  - a short practical description
  - a concrete CTA
  - a completion state derived from real data when possible
- Avoid fake analytics or vanity widgets.

## Data Signals

- `useAuthSession()` for center and user context
- `useClassrooms()` to detect whether classroom setup is complete
- `useChildren({ status: "active" })` and `useChildren({ status: "waitlist" })` or existing child data patterns to detect whether enrollment has started

For this pass, “Invite your team” and “Take attendance” can remain guided but not fully data-driven if the available hooks are not already cleanly exposed. They still need direct actions and credible copy.

## UI Direction

- Keep the page light, warm, and operational.
- Use large cards and clear copy, not dashboard chrome.
- The setup hero should sit above a compact progress/checklist area.
- The first screen should answer:
  - What should I do first?
  - What’s already done?
  - Where do I click next?

## Testing

- Add route-level tests for:
  - zero-classroom state with classroom-first CTA
  - classrooms-present state with shifted next-step emphasis
  - checklist completion states derived from mocked data
- Re-run the live owner flow in Playwright and verify the new dashboard feels guided from a first-week owner perspective.
