# Whole-Site UX Improvement Design

**Date:** 2026-04-25
**Approach:** Journey-organized audit findings + fresh observations

---

## Context

PebbleDesk is now functionally complete. The remaining gap is product feel: the app works, but doesn't yet feel like the "trusted colleague who knows compliance" it's meant to be. The current experience reads as a competent internal admin tool — clear enough, but not warm, coached, or scan-optimized for time-starved directors managing children, staff, and regulators simultaneously.

This spec addresses that gap across three user journeys (First Week Setup, Daily Operations, Compliance) and six cross-cutting systemic improvements. The source material is the April 21 UI audit (36 findings) plus fresh observations on UX patterns the audit didn't capture at the journey level.

**Emotional target:** Every screen change is evaluated against a single question — does this make a childcare director feel relief or friction?

---

## Design Principles Applied

Every change in this spec derives from one of these:

1. **Always tell the user what to do next.** No dead ends, no blank states without a path forward.
2. **One dominant element per screen.** One number, one action, one next step — not three competing focal blocks.
3. **Honest, not optimistic.** Never claim something (available space, auto-derived suggestions) without proving it.
4. **Operator language, not system language.** "8 children · 2 staff · Within ratio" not "8:2 ratio (req. 4:1)".
5. **Stable affordances.** Primary CTAs don't change jobs. Layout doesn't shift on interaction.

---

## Journey 1 — First Week Setup

Goal: a brand-new director can go from first login to "ready to operate" without feeling abandoned or confused.

### 1.1 Dashboard — new center state

**File:** `apps/web/src/routes/_auth/dashboard.tsx`

**Problem:** Checklist is hidden until the first classroom exists. New centers see three competing focal blocks (hero, progress card, checklist) with no single clear "do this next" signal.

**Changes:**
- Always render the setup checklist from day 1. Mark future steps as locked/upcoming with a muted style rather than hiding them.
- Replace the hero + progress card combination with a single **setup progress strip**: a compact amber banner showing "Getting your center ready · Step N of 5 · [step name]" plus five pip indicators (filled = done, outlined = current, empty = upcoming).
- Below the strip, render one dominant **"do this next" action card** — large heading, one sentence of context, one primary CTA button. This replaces the multi-block layout.
- Below the action card, render the full checklist (always visible) with three states: `done` (green check, struck-through label), `next` (indigo numbered badge, bold label), `todo` (muted numbered badge, muted label).
- Once all five checklist items are complete, replace the strip and action card with a **setup complete** celebration state: a green banner, "You're ready — let's go", and a direct link to the attendance page.

**Setup steps (in order):**
1. Create your account *(auto-complete on first login)*
2. Add a classroom
3. Enroll children
4. Add guardians
5. Set up billing

### 1.2 Enrollment wizard — age group

**File:** `apps/web/src/routes/_auth/children/enroll.tsx`

**Problem:** Changing date of birth silently calls `suggestAgeGroup()` and overwrites any age group the director already selected. This is a trust-destroying hidden behavior.

**Change:** Only auto-fill `ageGroup` when the field is blank. If the director has already made a selection, preserve it and show a non-destructive hint below the field: "Suggested based on date of birth: [group]" in indigo muted text with a ✦ prefix. The director can accept the suggestion by clicking it or ignore it entirely.

### 1.3 Enrollment wizard — classroom step

**File:** `apps/web/src/routes/_auth/children/enroll.tsx`

**Problem:** Step copy says "rooms with available space" but the query only filters by age group — it shows full rooms. This is misleading at a high-stakes placement decision.

**Changes:**
- Filter the classroom list to rooms where current enrollment < capacity. Rooms at capacity are shown greyed-out at the bottom with a "Full" badge, not hidden.
- Show open slot count on each room card: a green pill "4 open" or an amber "1 open" when ≤ 2 slots remain.
- Rewrite step heading to "Choose a classroom" — only claim "available space" if the filter is actually applied.

### 1.4 Enrollment wizard — guardian step

**File:** `apps/web/src/routes/_auth/children/enroll.tsx`

**Problem:** When no guardians have been added yet, the step shows a plain centered sentence. This is a required step and should feel like a guided state, not a blank one.

**Change:** Replace the sentence with a proper `EmptyState` component:
- Title: "A guardian is required to continue"
- Description: "Guardians handle pickup authorization, billing, and emergency contact. Add one to this child's record."
- Two CTAs: "Add new guardian" (primary) and "Link existing guardian" (secondary)

### 1.5 Creation dialogs — classroom and guardian

**Files:**
- `apps/web/src/routes/_auth/classrooms/index.tsx`
- `apps/web/src/routes/_auth/guardians/index.tsx`

**Problem:** Dialog descriptions use `sr-only` — helpful context is invisible to sighted users. Forms feel cold and transactional.

**Changes:**
- Remove `sr-only` from dialog description elements. Show a short visible description under the dialog title.
- Classroom dialog: "Classrooms control ratios and attendance tracking. Set a capacity and minimum staff ratio to get started."
- Guardian dialog: "Guardians are authorized for pickup, billing, and emergency contact. Only first and last name are required."
- Add helper text below ratio fields in classroom creation: e.g., "Most states require 1 staff per 4 toddlers. Check your state's licensing rules."
- Guardian form: add placeholder examples ("e.g. Maria") and a softer submit label: "Add guardian" → "Save guardian".

---

## Journey 2 — Daily Operations

Goal: every morning interaction is fast, scannable, and requires no interpretation.

### 2.1 Dashboard — operational state (post-setup)

**File:** `apps/web/src/routes/_auth/dashboard.tsx`

**Problem:** Once setup is complete, the dashboard doesn't give directors a morning pulse on the day ahead.

**Change:** When all checklist items are done, replace the setup strip and action card with a **"Today at a glance" strip**:
- Children present (big number)
- Expected but not yet in (count)
- Rooms within ratio (N/N)
- Overdue invoices (count, red if > 0)

This strip lives at the top of the dashboard main area and is refreshed on the same 15-second polling interval as the ratio header badge.

### 2.2 Attendance — empty room state

**Files:**
- `apps/web/src/routes/_auth/attendance.tsx`
- `apps/web/src/components/attendance-search.tsx`

**Problem:** When a classroom has no assigned children, search and clock-in controls are still prominently shown, creating a "what do I do here?" moment.

**Changes:**
- Detect when selected classroom has zero assigned children.
- Replace the search/clock-in emphasis with a targeted empty state:
  - Title: "No children assigned to [Room Name]"
  - Description: "Enroll a child and assign them to this room to start tracking attendance and ratios."
  - Primary CTA: "Enroll a child" → navigates to enrollment wizard with room pre-selected
  - Secondary CTA: "Assign existing child"
- Move the search field below the empty state with a subtle label "Or search to clock in a child from another room" — available but visually subordinate.

### 2.3 Attendance — search width stability

**File:** `apps/web/src/components/attendance-search.tsx`

**Problem:** The search input expands width on focus, causing a layout jump in the compact header.

**Change:** Lock the search input to a fixed width. Use a stronger focus ring (indigo outline) to signal interactivity rather than layout shift.

### 2.4 Attendance — ratio context bar language

**File:** `apps/web/src/components/attendance-roster.tsx`

**Problem:** The context bar uses technical output: "8:2 ratio (req. 4:1)".

**Change:** Rewrite to operator language:
- `"{n} children · {m} staff"` as the primary descriptor
- Required ratio as secondary muted text: `"4:1 required"`
- Status badge in plain language: "Within ratio" (green), "Near limit" (amber), "Violation" (red)

### 2.5 Classroom cards — scan hierarchy

**File:** `apps/web/src/routes/_auth/classrooms/index.tsx`

**Problem:** Cards use equal-weight badges — directors can't scan room health in under 2 seconds.

**Change:** Redesign each classroom card with one dominant number:
- **Dominant:** children present count (large, 22px+, bold)
- **Sub-label:** "children present" or "enrolled" depending on context
- **Compliance badge:** top-right corner, pill style — "Compliant" (green), "Near limit" (amber), "Violation" (red)
- **Stat rows below the number:** Staff (count · within/near/over ratio) and Capacity (enrolled / max)
- **Left border accent:** 3px, green/amber/red matching compliance status

### 2.6 Guardians list — scan cues

**File:** `apps/web/src/routes/_auth/guardians/index.tsx`

**Problem:** The populated list is a minimal two-column table with no record completeness signal.

**Changes:**
- Add a contact completeness indicator to each row: green dot if phone + email both present, amber dot if one is missing, grey if neither.
- Show phone and email inline on the row (truncated if needed).
- Replace the plain table with a richer list-row pattern matching the children list style.

### 2.7 List row affordances — children, guardians, classrooms

**Files:**
- `apps/web/src/routes/_auth/children/index.tsx`
- `apps/web/src/routes/_auth/guardians/index.tsx`
- `apps/web/src/routes/_auth/classrooms/index.tsx`

**Problem:** These pages rely on hidden full-row click targets with no visible affordance, which is especially problematic on tablets.

**Change:** Add an explicit visible link on each row/card. Options by page:
- Children and guardians list rows: make the name an explicit indigo link.
- Classroom cards: add a "View" button (ghost variant, small) in the card footer.
- Keep row hover as a reinforcement, not the only signal.

### 2.8 Children list — stable primary CTA

**File:** `apps/web/src/routes/_auth/children/index.tsx`

**Problem:** When search filters return no results, the page's primary CTA becomes "Clear filters", displacing "Enroll child".

**Change:**
- Keep "Enroll child" as the stable primary CTA at all times.
- Move "Clear filters" to inline filter feedback text ("No children match this search. Clear filters") or as a secondary action in the empty state body.

### 2.9 Messages compose — section grouping

**File:** `apps/web/src/routes/_auth/messages/index.tsx`

**Problem:** The compose modal can grow into a long unbroken form when recipient selection appears, fatiguing on tablets.

**Changes:**
- Add visible section dividers with subheads: "To", "Message".
- Recipient mode selection (classroom vs. individual) appears as a segmented control at the top of "To" — not as a growing stacked block.
- Guardian checklist and classroom selector animate in progressively based on mode selection.

### 2.10 Sidebar navigation taxonomy

**File:** `apps/web/src/components/sidebar.tsx`

**Problem:** Current groups (Compliance, Data, Messages) reflect internal feature buckets, not the director's mental model.

**Change:** Regroup navigation items around director jobs-to-be-done:

| Group | Items |
|---|---|
| *(ungrouped top)* | Dashboard |
| **Families** | Children, Guardians |
| **Operations** | Attendance, Classrooms, Scheduling |
| **Finance** | Billing, Subsidies |
| **Compliance** | Ratios, Import, Reports |
| *(ungrouped bottom)* | Messages, Settings |

---

## Journey 3 — Compliance

Goal: directors can tell at a glance if they'd pass an inspection, and billing interactions feel stable and trustworthy.

### 3.1 Compliance readiness score

**File:** `apps/web/src/routes/_auth/ratios/index.tsx`

**Problem:** No quick readiness summary — directors have to infer compliance health from multiple screens.

**Change:** Add a **Compliance Readiness** card at the top of the Ratios page:
- A circular score (e.g., 4/5) rendered as a conic-gradient ring in green/amber/red.
- A one-line summary: "Mostly ready — 1 item needs attention".
- A 5-item checklist beneath:
  1. All room ratios within state requirements
  2. No active violations in the last 30 days
  3. All enrolled children have a guardian on file
  4. No children missing emergency contact info
  5. Subsidy records up to date

Items are checked dynamically based on existing API data. Each warning item is a direct link to the relevant page.

### 3.2 Billing information architecture

**File:** `apps/web/src/routes/_auth/billing/index.tsx`

**Problem:** Five competing concerns in one view, a primary CTA that changes job based on invoice count, and KPI cards that disappear at zero.

**Changes:**
- Split the page into three visually separated zones with section headers:
  - **Family Billing** — invoice creation, recent invoices, payment methods
  - **PebbleDesk Subscription** — plan status, manage link
  - **Payment Activity** — transaction history
- Lock the primary page-level CTA to "Create invoice" at all times. Move settings access to a secondary link inside the Subscription zone.
- Always render the KPI metric band (open invoices, collected this month, overdue). Zero values show in green — "0 open invoices" communicates calm, not absence.

### 3.3 Invoice line item form

**File:** `apps/web/src/routes/_auth/billing/index.tsx`

**Problem:** Line-item inputs use placeholders as the only labeling mechanism — no column headers.

**Change:** Add a compact header row above the line items: "Description", "Qty", "Unit price", "Total". Keep existing placeholders as example content ("e.g. Weekly tuition", "e.g. Supply fee").

### 3.4 Billing checkout success state

**File:** `apps/web/src/routes/_auth/billing/index.tsx`

**Problem:** The post-checkout success banner is lightweight and doesn't guide the user forward.

**Change:** Expand the success state to:
- Confirm what was unlocked: "Family billing is now active. You can create invoices and share payment links."
- Provide a direct CTA to the first likely task: "Create your first invoice →"

### 3.5 Error states — data-safe reassurance

**Files:** `apps/web/src/routes/_auth/billing/index.tsx`, `apps/web/src/routes/_auth/messages/index.tsx`, `apps/web/src/routes/_auth/overview.tsx`

**Problem:** Error messages are generic and offer no reassurance about data safety — a significant concern for this risk-averse audience.

**Change:** For all error states in high-stakes screens, add:
- A data-safety line: "Your data is safe — this is a temporary display issue."
- A specific retry action (not just "Try again").
- Where applicable, a secondary "Contact support" link.

### 3.6 Encoding fixes

**Files:** `apps/web/src/routes/_auth/children/enroll.tsx`, `apps/web/src/routes/_auth/billing/index.tsx`

**Problem:** Mojibake characters (Â·, â€", Openingâ€¦) appear in user-facing copy.

**Change:** Full sweep of all user-facing strings in the web app. Replace malformed characters with proper Unicode or plain ASCII equivalents. Fix at the source string level, not with CSS tricks.

---

## Cross-cutting Systemic Changes

These span multiple files and establish patterns for the whole app.

### S1 — Progressive next-action

After every primary action (form submit, enrollment complete, invoice sent, message sent), the success state must answer: "what do I do next?" No screen should end in a state where the user has to navigate away without a suggestion.

Implementation: audit every mutation's success callback/toast in the web app and add a contextual next-step link or action. Minimum: a "View [record]" link. Better: "Next, do [logical follow-up]."

### S2 — Empty state coaching system

The existing `EmptyState` component (`apps/web/src/components/empty-state.tsx`) already supports `shape="checklist"` and `shape="inline"`. Apply these shapes intentionally:
- First-run operational pages (no classrooms, no children, empty guardian list): use `shape="checklist"` with two-path CTAs.
- Filter-returns-nothing states: use `shape="inline"` — small, left-aligned, non-intrusive.
- Reserve the large centered card style for truly blank first-run moments only.

### S3 — Copy voice upgrade

Audit all CTA labels and page headings for generic SaaS verbs. Replace with childcare-native language:

| Before | After |
|---|---|
| Add classroom | Create classroom |
| Add guardian | Add family contact |
| Add | Draft invoice |
| Send | Write message |
| Setup | Get started |

Also audit for overly technical compliance language and replace with plain director-friendly phrasing.

### S4 — Persistent compliance signal

The ratio badge in the header (`apps/web/src/components/header.tsx`) already shows live ratio status — keep it. Add a supplementary signal for active violations:
- A small red dot on the "Compliance" sidebar group label when any active violation exists.
- Implemented by passing violation status through the existing auth layout context, not a new data fetch.

---

## Files Modified

| File | Changes |
|---|---|
| `apps/web/src/routes/_auth/dashboard.tsx` | Setup progress strip, always-visible checklist, "Today at a glance" strip |
| `apps/web/src/routes/_auth/children/enroll.tsx` | Age-group suggestion (non-destructive), capacity filter, guardian empty state, encoding fixes |
| `apps/web/src/routes/_auth/classrooms/index.tsx` | Dialog descriptions visible, classroom card redesign, "View" affordance |
| `apps/web/src/routes/_auth/guardians/index.tsx` | Dialog descriptions visible, richer list rows, "View" affordance |
| `apps/web/src/routes/_auth/children/index.tsx` | Stable "Enroll child" CTA, name as explicit link |
| `apps/web/src/routes/_auth/attendance.tsx` | Empty room state with targeted CTAs |
| `apps/web/src/routes/_auth/billing/index.tsx` | Three zones, stable CTA, always-visible metrics, invoice headers, success state, error state, encoding fixes |
| `apps/web/src/routes/_auth/messages/index.tsx` | Compose modal section grouping, error state |
| `apps/web/src/routes/_auth/ratios/index.tsx` | Compliance readiness card |
| `apps/web/src/routes/_auth/overview.tsx` | Error state reassurance |
| `apps/web/src/components/sidebar.tsx` | Navigation taxonomy redesign, violation dot |
| `apps/web/src/components/header.tsx` | No layout changes — violation dot signal passed from layout |
| `apps/web/src/components/attendance-search.tsx` | Fixed width on focus |
| `apps/web/src/components/attendance-roster.tsx` | Operator-language ratio bar |
| `apps/web/src/components/empty-state.tsx` | Audit shape usage across the app |

---

## Verification

End-to-end testing should follow each user journey:

**First Week Setup:**
1. Create a new account. Dashboard must show setup progress strip and full checklist from first login — not an empty shell.
2. Navigate to enrollment without creating a classroom first — checklist step 2 should be highlighted, not hidden.
3. Start enrolling a child. Select an age group manually, then change the date of birth — age group must not be overwritten, suggestion hint must appear.
4. Reach the classroom step — only rooms with remaining capacity are selectable; full rooms are greyed out with a "Full" badge.
5. Reach the guardian step with no guardians on file — must see a structured empty state with two CTAs, not a blank sentence.
6. Complete all 5 checklist items — dashboard must show the "setup complete" celebration state.

**Daily Operations:**
7. Open Attendance for a room with no assigned children — empty state must appear before any controls.
8. Open Attendance for a populated room — ratio bar must show "N children · M staff · Within ratio" language.
9. Search children with an active filter returning no results — "Enroll child" must remain the primary CTA; "Clear filters" appears as secondary only.
10. Open Classrooms — cards must have one dominant children-present number and a compliance status badge readable in under 2 seconds.
11. Open Guardians — rows must show contact completeness indicator.

**Compliance:**
12. Open the Ratios page — compliance readiness card must render with correct check states.
13. Open Billing — three zones must be visible, KPI metrics must render even at zero, primary CTA must be "Create invoice" regardless of invoice count.
14. Trigger a billing or messages error — error state must include data-safety language and a specific retry action.

**Cross-cutting:**
15. Complete any enrollment, invoice send, or message send — success state must include a next-step link.
16. Verify sidebar groups match the new taxonomy (Families, Operations, Finance, Compliance).
17. Create an active ratio violation — compliance dot must appear on the Compliance sidebar group.
18. Audit all user-facing strings for mojibake characters — zero must remain.
