# PebbleDesk UI Improvements Audit

Date: 2026-04-21

Scope:
- Live signed-in smoke pass on production
- Source review of authenticated app routes and shared UI components
- Focus areas: dashboard, sidebar, classrooms, guardians, children enrollment, attendance, billing, messages, shared empty states

Goal:
- Capture as many concrete UI and UX improvements as possible
- Prioritize improvements that make PebbleDesk feel calmer, clearer, and more trustworthy for time-starved childcare directors

## Summary

The app is now functionally solid enough to critique as a product, not just as a launch checklist. The main UI pattern across the authenticated app is:

- Strong structure
- Clear enough labels
- Good empty-state coverage
- But not enough hierarchy, guidance, or operational warmth

The current experience often feels like a competent internal admin tool. It needs a second pass for:

- stronger primary action focus
- calmer first-run onboarding
- more scan-friendly operational surfaces
- fewer abrupt modal/form experiences
- less visual sameness between states, cards, and lists

## Highest-Value Themes

1. First-run guidance needs to feel more coached and less mechanical.
2. Dense operational pages need stronger scan hierarchy.
3. Empty states are present, but many can be more actionable and less generic.
4. Repeated card/table patterns are functional but visually flat.
5. A few flows still make choices for the user instead of assisting the user.

## Findings

### P1

#### 1. Enrollment wizard silently overwrites manual age-group intent

Where:
- `apps/web/src/routes/_auth/children/enroll.tsx`

What:
- In step 1, changing date of birth automatically rewrites `ageGroup` via `suggestAgeGroup()`.

Why it matters:
- This is the kind of subtle behavior that makes intake flows feel untrustworthy.
- A director may intentionally choose a different room placement than the age-derived suggestion.
- Silent override is especially bad in childcare software where staff expect precise control.

Suggested improvement:
- Change from forced overwrite to suggestion.
- Only auto-fill age group when it is blank.
- If the user has already selected one manually, preserve it and offer a subtle helper note like "Suggested: Preschool".

#### 2. Dashboard hero, progress card, and checklist all compete for attention

Where:
- `apps/web/src/routes/_auth/dashboard.tsx`

What:
- The dashboard has three near-equal focal blocks:
  - hero card
  - progress card
  - checklist grid

Why it matters:
- The user should know the next move instantly.
- Right now the eye has to work too hard to decide what matters first.
- This weakens the "trusted colleague who knows compliance" tone.

Suggested improvement:
- Make the hero more singular and decisive.
- Reduce secondary visual weight on the progress card.
- Pull the first actionable checklist item closer to the hero CTA.
- Consider converting the progress card into a simpler inline status strip on first-run states.

#### 3. Creation dialogs hide helpful guidance from sighted users

Where:
- `apps/web/src/routes/_auth/classrooms/index.tsx`
- `apps/web/src/routes/_auth/guardians/index.tsx`

What:
- The dialogs use descriptions, but some are visually hidden with `sr-only`.

Why it matters:
- Creation flows feel abrupt and transactional.
- First-run modals should orient the user before asking for details.
- Hiding supporting context makes forms feel colder than they need to.

Suggested improvement:
- Show a short visible description under dialog titles.
- Add one sentence of context about why the record matters.
- For classrooms: explain that this controls ratios and attendance.
- For guardians: explain pickup, billing, and emergency contact use.

#### 4. Attendance page shows action controls before confirming there is anything to act on

Where:
- `apps/web/src/routes/_auth/attendance.tsx`
- `apps/web/src/components/attendance-search.tsx`

What:
- Search and clock-in controls remain prominent even when a classroom has no assigned children.

Why it matters:
- This produces an immediate "what am I supposed to do here?" moment.
- Operational pages should guide action based on current reality, not generic capability.

Suggested improvement:
- When the selected classroom has no assigned children, replace the search/clock-in emphasis with a targeted classroom empty state.
- Keep controls available, but visually subordinate them below the state explanation.
- Add a direct CTA to enroll or assign children.

#### 5. Guardians page becomes visually underpowered once data exists

Where:
- `apps/web/src/routes/_auth/guardians/index.tsx`

What:
- The empty state is decent, but the populated state collapses into a minimal two-column table.

Why it matters:
- Directors need quick confidence about whether guardian records are complete.
- The current list makes every row feel equally low-information.

Suggested improvement:
- Add lightweight scan cues:
  - contact completeness
  - phone/email availability
  - relationship count if available later
- Consider replacing the plain table with richer list rows or a compact card-list pattern.

#### 6. Enrollment classroom step promises "available space" without actually proving it

Where:
- `apps/web/src/routes/_auth/children/enroll.tsx`

What:
- The step copy says it is showing rooms with available space, but the route only filters by age group and then renders every non-archived room.

Why it matters:
- This is misleading at a sensitive decision point.
- A director will assume the list has already been vetted for placement readiness.
- When the UI over-promises, even slightly, trust drops fast.

Suggested improvement:
- Either truly filter to rooms with remaining capacity or rewrite the copy to match reality.
- Surface open slots directly on each room card so the user does not have to infer room health from the capacity bar.

#### 7. Key list views rely too much on hidden click targets

Where:
- `apps/web/src/routes/_auth/children/index.tsx`
- `apps/web/src/routes/_auth/guardians/index.tsx`
- `apps/web/src/routes/_auth/classrooms/index.tsx`

What:
- Several pages make whole rows or cards clickable without a clear primary affordance.

Why it matters:
- Discoverability suffers, especially on tablets and for less technical operators.
- It also weakens keyboard clarity and makes the app feel more like an internal tool than a polished SaaS.

Suggested improvement:
- Make record names explicit links or add a visible `View details` affordance.
- Keep row hover or card hover as reinforcement, not as the only hint that the item is actionable.

#### 8. New-center dashboard removes the setup checklist exactly when it is most useful

Where:
- `apps/web/src/routes/_auth/dashboard.tsx`

What:
- The checklist section is hidden until the center has at least one classroom.

Why it matters:
- Brand-new centers need a visible "what happens next" structure more than anyone else.
- Removing the checklist makes the dashboard feel emptier and less supportive at the first-login moment.

Suggested improvement:
- Always show the checklist.
- Mark future steps as blocked or not ready yet instead of removing the structure entirely.

### P2

#### 9. Dashboard task cards are too visually similar to each other

Where:
- `apps/web/src/routes/_auth/dashboard.tsx`

What:
- Task cards use similar framing, similar icon treatment, and limited contrast between `done`, `next`, and `ready`.

Why it matters:
- The checklist is meant to reduce decision fatigue.
- Similar-looking cards force more reading than scanning.

Suggested improvement:
- Sharpen differences between states.
- Make `next` substantially more prominent.
- Downshift `done` cards visually.
- Add stronger ordering cues beyond pill labels.

#### 10. Dashboard progress language is useful but emotionally flat

Where:
- `apps/web/src/routes/_auth/dashboard.tsx`

What:
- Copy is clear, but it still reads like software status text more than trusted operational guidance.

Why it matters:
- The brand target is relief.
- The dashboard should feel like the app is helping the director start the day, not just reporting setup state.

Suggested improvement:
- Tighten wording to sound more practical and grounded.
- Replace generic milestone language with more situational phrases.
- Example direction:
  - less "setup milestones"
  - more "rooms ready", "children enrolled", "attendance ready today"

#### 11. Sidebar navigation is structurally good but lacks emphasis and personality

Where:
- `apps/web/src/components/sidebar.tsx`

What:
- The grouping is useful, but the nav feels plain and monochromatic.

Why it matters:
- This is the frame users see all day.
- If the shell feels generic, the whole product feels generic.

Suggested improvement:
- Strengthen active-state contrast slightly.
- Improve group rhythm and spacing.
- Add a more deliberate treatment for the current center identity block.
- Consider a subtle center-status module in the sidebar rather than relying only on the top banner.

#### 12. Top banner repeats information without creating enough value

Where:
- Observed live across multiple signed-in routes

What:
- The banner consistently shows center name, state, ratio status, and user badge.

Why it matters:
- It takes valuable vertical space on every page.
- Some of the information is useful, but it does not always earn its footprint.

Suggested improvement:
- Either compress it further or make it more operational.
- Good options:
  - reduce height and increase information density
  - add one meaningful quick action
  - make ratio/attention state more obviously actionable

#### 13. Classroom cards do not yet deliver a strong "room health at a glance"

Where:
- `apps/web/src/routes/_auth/classrooms/index.tsx`

What:
- The card contains ratio, capacity, and status, but the information hierarchy is still soft.

Why it matters:
- A director should be able to scan a list of rooms in seconds.
- Right now the card is readable, but not sharp enough for true operational scanning.

Suggested improvement:
- Make one number dominant.
- Group occupancy and staffing more tightly.
- Consider a stronger mini-layout:
  - room identity
  - compliance status
  - occupancy line
  - staffing line
  - ratio context

#### 14. Classroom creation form lacks reassurance and examples

Where:
- `apps/web/src/routes/_auth/classrooms/index.tsx`

What:
- The form is clean but sparse.

Why it matters:
- Setting up a room is a foundational operation.
- A blank modal with several numeric inputs can feel higher-friction than necessary.

Suggested improvement:
- Add short helper text under the ratio fields.
- Add clearer examples for age group and room naming.
- Consider inline validation text for ratio inputs before submit.

#### 15. Guardian creation dialog needs better form ergonomics

Where:
- `apps/web/src/routes/_auth/guardians/index.tsx`

What:
- Fields are straightforward, but the form feels like a raw record entry screen.

Why it matters:
- Guardian entry is a frequent first-run task.
- The experience should feel guided, not clerical.

Suggested improvement:
- Add placeholders and helper copy.
- Clarify that only first and last name are required.
- Consider a softer, more descriptive submit state than just "Add Guardian".

#### 16. Billing page has too many parallel concerns in one view

Where:
- `apps/web/src/routes/_auth/billing/index.tsx`

What:
- Subscription state, invoice metrics, invoice creation, setup links, and payment workflows all live together.

Why it matters:
- Billing is high-stakes.
- Too many competing sections increase cognitive load and can create anxiety.

Suggested improvement:
- Split the page into clearer zones:
  - PebbleDesk subscription
  - family billing
  - payment activity
- Visually isolate subscription management from family invoicing.

#### 17. Billing page success banner is easy to dismiss and easy to forget

Where:
- `apps/web/src/routes/_auth/billing/index.tsx`

What:
- The checkout-complete banner is fine, but lightweight.

Why it matters:
- This is a meaningful moment.
- It should reassure the user that billing access is now ready, not just confirm an event occurred.

Suggested improvement:
- Make the success state more specific.
- Explain what the user can do next.
- Link directly into the next most likely billing task.

#### 18. Messages page is structurally competent but too bare for a communication hub

Where:
- `apps/web/src/routes/_auth/messages/index.tsx`

What:
- The page is mostly a shell around compose and sent-message listing.

Why it matters:
- Messaging is emotionally important.
- Communication tools benefit from extra clarity and calm because mistakes feel public.

Suggested improvement:
- Improve the compose dialog hierarchy.
- Make recipient mode selection clearer.
- Add stronger empty-state education about what message types are for.

#### 19. Messages compose flow can become visually dense once recipient selection appears

Where:
- `apps/web/src/routes/_auth/messages/index.tsx`

What:
- Recipient mode, classroom select, guardian checklist, and body can stack into a long modal quickly.

Why it matters:
- Long, growing modals increase composition fatigue.
- This is especially rough for users on tablets.

Suggested improvement:
- Break the modal into visibly grouped sections.
- Add subheads or separators.
- Consider progressive disclosure so recipient selection appears more intentionally.

#### 20. Shared empty states are useful but sometimes too generic for the screen they live on

Where:
- `apps/web/src/components/empty-state.tsx`
- used across multiple routes

What:
- The component gives a clean default pattern, but some pages need more tailored operational instructions than title + description + action.

Why it matters:
- Empty states do most of the onboarding work in a new account.
- Generic empty states leave too much interpretation to the user.

Suggested improvement:
- Expand use of `shape="checklist"` and `shape="inline"` on first-run operational pages.
- Introduce optional secondary action or "what happens next" text.

#### 21. Children search empty state hijacks the page's main CTA

Where:
- `apps/web/src/routes/_auth/children/index.tsx`

What:
- When filters return no matches, the main CTA becomes `Clear filters`.

Why it matters:
- Primary actions should stay stable.
- Reusing the page's most important button for a different job increases hesitation and misclick risk.

Suggested improvement:
- Keep the main CTA as `Enroll child`.
- Move `Clear filters` into inline filter feedback or the empty-state body as a secondary action.

#### 22. Guardians step in enrollment underplays a required action

Where:
- `apps/web/src/routes/_auth/children/enroll.tsx`

What:
- With no guardians added, the step falls back to a plain centered sentence rather than a structured guidance state.

Why it matters:
- This is a required step.
- The current treatment makes the screen feel blank instead of guided.

Suggested improvement:
- Replace the sentence with a proper empty state that explains why a guardian is required.
- Present the two next paths more clearly: add a new guardian or link an existing one.

#### 23. Billing metrics disappear when values are zero

Where:
- `apps/web/src/routes/_auth/billing/index.tsx`

What:
- The KPI cards are only rendered when invoices or balances are greater than zero.

Why it matters:
- Zero can be a reassuring state.
- Hiding the whole metric band makes the page collapse visually and removes useful confirmation like `0 open invoices`.

Suggested improvement:
- Always render the key billing metrics.
- Let zero values communicate calm and completeness rather than absence.

#### 24. Billing header CTA changes jobs based on invoice count

Where:
- `apps/web/src/routes/_auth/billing/index.tsx`

What:
- The top-right CTA links to Settings when there are no invoices, but to Payments once invoices exist.

Why it matters:
- The page's primary action should not shift information architecture underneath the user.
- It makes Billing feel unstable and leaks setup logic into the wrong place.

Suggested improvement:
- Keep the primary CTA billing-native.
- Good directions: `Create invoice`, `View payments`, or `Set up family billing` with settings as a secondary link.

#### 25. Invoice line items rely too much on placeholders

Where:
- `apps/web/src/routes/_auth/billing/index.tsx`

What:
- Line-item fields use placeholders like `Description`, `Qty`, and `Unit price` without a clear column header structure.

Why it matters:
- Repetitive finance forms should reduce parsing effort, not increase it.
- Placeholder-only layouts feel more like raw admin scaffolding than finished billing software.

Suggested improvement:
- Add a compact header row for description, quantity, unit price, and amount.
- Keep placeholders as examples, not as the only labeling mechanism.

### P3

#### 26. Search inputs across the app feel visually similar but behaviorally different

Where:
- `apps/web/src/components/attendance-search.tsx`
- guardians search and other list screens

What:
- Search bars look related but behave differently depending on page.

Why it matters:
- Small consistency gaps create low-grade friction in daily use.

Suggested improvement:
- Standardize search shell, clear button placement, widths, and focus behavior.
- Consider a shared search-input primitive for operational pages.

#### 27. Attendance search expands width on focus, which can feel jumpy

Where:
- `apps/web/src/components/attendance-search.tsx`

What:
- The control changes width between idle and focused states.

Why it matters:
- Movement in a compact header control can feel jittery, especially on repeated daily use.

Suggested improvement:
- Keep width stable.
- Use stronger focus styling rather than layout shift to signal interactivity.

#### 28. Attendance roster context bar could be more human-readable

Where:
- `apps/web/src/routes/_auth/attendance.tsx`

What:
- The room summary bar is useful, but some ratio text reads like system output.

Why it matters:
- Attendance is one of the most used pages.
- Small readability wins matter a lot here.

Suggested improvement:
- Replace technical phrasing like raw ratio fractions with clearer operator language.
- Example direction:
  - "4 children with 1 staff"
  - "Room within ratio"
  - "Near capacity"

#### 29. Some pages lean too heavily on centered empty-state composition

Where:
- dashboard recovery
- empty list views
- shared `EmptyState` usage

What:
- The centered-card pattern is used often.

Why it matters:
- Repetition makes the product feel template-driven.
- Not every empty state should look like a marketing block.

Suggested improvement:
- Use more inline and left-aligned empty states on operational screens.
- Reserve large centered states for truly blank first-run moments.

#### 30. Operational pages could use stronger sectional dividers and subheads

Where:
- classrooms
- guardians
- billing
- messages

What:
- Several pages place controls and content in a single vertical rhythm without enough sectional distinction.

Why it matters:
- Users scanning quickly need stronger grouping.

Suggested improvement:
- Use subtle dividers, section labels, or tonal containers more intentionally.
- Reduce the feeling that every page is just:
  - heading
  - controls
  - content block

#### 31. Several pages use "Add" language where task-specific verbs would be clearer

Where:
- classrooms
- guardians
- billing
- messages

What:
- CTA language is frequently generic.

Why it matters:
- Specific verbs reduce hesitation.

Suggested improvement:
- Prefer verbs tied to intent:
  - "Create classroom"
  - "Add family contact"
  - "Draft invoice"
  - "Write message"

#### 32. Recovery and error states are reliable but emotionally flat

Where:
- dashboard recovery
- billing error block
- messages error block

What:
- Errors are functional but generic.

Why it matters:
- This audience is risk-averse.
- High-stakes admin software should feel steady and helpful under failure.

Suggested improvement:
- Add more specific recovery language.
- Where possible, mention whether data is safe and what action is best next.

#### 33. Sidebar grouping reflects feature buckets more than director workflows

Where:
- `apps/web/src/components/sidebar.tsx`

What:
- Groups like `Compliance`, `Data`, and `Messages` read more like internal implementation categories than a center director's daily jobs.

Why it matters:
- Navigation should mirror how the customer thinks, especially in a line-of-business product.
- Slight taxonomy drift makes the shell feel less intuitive than it could.

Suggested improvement:
- Rework grouping around jobs to be done such as `Today`, `Families`, `Operations`, `Finance`, and `Compliance`.

#### 34. Sidebar lacks persistent center context inside the nav itself

Where:
- `apps/web/src/components/sidebar.tsx`
- `apps/web/src/routes/_auth.tsx`

What:
- Center identity is mostly carried by the top header rather than being anchored in the sidebar.

Why it matters:
- On mobile and in dense daily use, users need stronger orientation cues.
- A persistent center identity block would make the shell feel more grounded.

Suggested improvement:
- Add the current center name and role or state near the brand area at the top of the nav.

#### 35. There are visible encoding glitches in user-facing strings

Where:
- `apps/web/src/routes/_auth/children/enroll.tsx`
- `apps/web/src/routes/_auth/billing/index.tsx`
- other user-facing copy should be swept as well

What:
- Several strings contain mojibake characters like `Â·`, `â€”`, and `Openingâ€¦`.

Why it matters:
- Even minor encoding artifacts immediately make the product feel less trustworthy and less polished.

Suggested improvement:
- Sweep and normalize user-facing copy to plain ASCII or valid Unicode everywhere.

#### 36. Guardian card actions in enrollment are too icon-heavy

Where:
- `apps/web/src/routes/_auth/children/enroll.tsx`

What:
- Edit and remove actions on guardian cards are icon-only.

Why it matters:
- Compact controls are fine, but icon-only actions reduce clarity and can feel riskier on touch devices.

Suggested improvement:
- Add tooltips or short labels, especially for destructive actions.
- Keep the card easy to scan without making the affordances cryptic.

## Best Next Batch

If prioritizing for design impact rather than engineering convenience, the best next implementation batch is:

1. Enrollment wizard age-group suggestion behavior
2. Dashboard hierarchy and onboarding tightening
3. Classroom-step truthfulness plus room-capacity clarity
4. Explicit action affordances on list rows and cards
5. Attendance empty-state/action hierarchy cleanup
6. Billing information architecture stabilization
7. Dialog guidance improvements for classroom and guardian creation
8. Guardians populated-state redesign

## Fast Wins

These are lower-risk improvements that should noticeably improve polish quickly:

- Make dialog descriptions visible in creation modals
- Stabilize attendance search width on focus
- Upgrade CTA labels from generic "Add" wording
- Improve dashboard state language
- Add more scan cues to guardian list rows
- Increase contrast between `done`, `next`, and `ready` dashboard tasks
- Sweep user-facing mojibake copy
- Keep billing metric cards visible at zero
- Stop using placeholder-only line-item labeling in billing

## Notes

- This audit is intentionally product-facing, not just bug-facing.
- Some findings are based on live production observation.
- Some findings are based on source review where the UI pattern was clear without needing a separate live failure.
