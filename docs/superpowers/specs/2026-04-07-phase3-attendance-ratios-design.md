# Phase 3: Attendance & Ratios — Design Spec

> Child check-in/out, staff clock-in/out, live ratio dashboard, violation tracking, attendance history calendar.

**Builds on:** Phase 2 (classrooms, children, guardians CRUD, enrollment wizard).

**Goal:** Staff can check children in/out and clock themselves in/out. Directors see a live multi-room ratio dashboard with compliance status. Ratio violations are detected and recorded automatically. Child profiles show attendance history as a color-coded calendar.

---

## Scope

**In scope:**
- Child check-in / check-out (classroom roster workflow + child search fallback)
- Staff clock-in / clock-out (self-service + director override)
- Multi-room ratio dashboard with color-coded compliance cards (polls 15s, on-screen only)
- Ratio violation auto-detection on every check-in/out and clock-in/out mutation
- Ratio violation auto-resolution when compliance restores, with optional director notes
- Ratio history page (violations log + snapshots tab)
- Attendance history calendar on child profiles
- Today's attendance log (who's in, who's out, who left early)

**Out of scope:**
- Subsidies and billing (Phase 4)
- Scheduling (Phase 5)
- Messaging (Phase 5)
- Audit report generation (later phase — ratio history provides the raw data)

---

## Schema Changes

No new tables — `check_ins`, `staff_check_ins`, `ratio_snapshots`, and `ratio_violations` already exist from Phase 1. Minor fixes needed:

### 1. Fix shared types (packages/shared/src/types/attendance.ts)

Current `AttendanceRecord` type has incorrect field names:
- `checkInByUserId` → `checkedInBy` (references `memberships`, not `users`)
- `checkOutByUserId` → `checkedOutBy`
- Remove `createdAt` and `updatedAt` (not in DB schema)
- Rename `checkInAt` / `checkOutAt` → `checkedInAt` / `checkedOutAt` (match DB)

Current `StaffAttendanceRecord` type:
- `userId` → `membershipId` (DB column is `membership_id`)
- `checkInAt` / `checkOutAt` → `clockedInAt` / `clockedOutAt` (match DB)
- Remove `createdAt` and `updatedAt`

**New types to add:**
- `RatioSnapshot` — id, centerId, classroomId, snapshotAt, staffCount, childrenCount, ratioRequired, ratioActual, inCompliance
- `RatioViolation` — id, centerId, classroomId, detectedAt, resolvedAt?, resolvedBy?, resolutionNotes?
- `RoomRatioStatus` — classroomId, classroomName, ageGroup, maxCapacity, minRatioStaff, minRatioChildren, currentChildCount, currentStaffCount, ratioRequired, ratioActual, inCompliance, nearLimit (boolean), openViolationId?

### 2. Update shared validators (packages/shared/src/validators/attendance.ts)

Existing validators are correct for basic schemas. Add:
- `staffCheckInSchema` — add optional `membershipId` field for director override (if omitted, uses self)
- `checkInHistoryQuerySchema` — `childId` (uuid), `from` (date string), `to` (date string)
- `attendanceQuerySchema` — `classroomId?` (uuid), `date?` (date string), `childId?` (uuid)
- `staffAttendanceQuerySchema` — `classroomId?` (uuid), `date?` (date string)
- `violationQuerySchema` — `classroomId?` (uuid), `status?` (open | resolved), `from?` (date), `to?` (date)
- `violationNotesSchema` — `resolutionNotes` (string, max 2000)

---

## API Routes

All routes prefixed `/api/`, scoped to authenticated user's center via `centerId` from auth middleware. Every query filters by `center_id`.

### Check-ins — `/api/check-ins`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/` | All | Check in a child. Body: `{ childId, classroomId, notes? }`. Rejects if child already has an open check-in. Evaluates room ratio after insert. |
| PATCH | `/:id/check-out` | All | Check out a child. Body: `{ notes? }`. Sets `checkedOutAt` and `checkedOutBy`. Evaluates room ratio after. |
| GET | `/` | All (staff filtered to their classroom) | Today's attendance log. Query: `classroomId?`, `date?`, `childId?`. Defaults to today. |
| GET | `/history` | All (staff filtered) | Historical records for calendar view. Query: `childId` (required), `from`, `to`. Returns records with dates, times, durations. |

### Staff check-ins — `/api/staff-check-ins`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/` | All (self or Director+) | Clock in. Body: `{ membershipId?, classroomId }`. If `membershipId` omitted, uses authenticated user's membership. Directors can specify another staff member. Rejects if already clocked in. Evaluates room ratio after. |
| PATCH | `/:id/clock-out` | All (self or Director+) | Clock out. Evaluates room ratio after. |
| GET | `/` | Owner, Director | Today's staff attendance. Query: `classroomId?`, `date?` |

### Ratios — `/api/ratios`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | Owner, Director | Current ratio state for all rooms. Computes live counts from open check-ins and staff clock-ins per classroom. Returns `RoomRatioStatus[]`. |
| GET | `/snapshots` | Owner, Director | Historical snapshots. Query: `classroomId?`, `from`, `to` |
| GET | `/violations` | Owner, Director | Violation records. Query: `classroomId?`, `status?` (open/resolved), `from`, `to` |
| PATCH | `/violations/:id` | Owner, Director | Add resolution notes to a violation. Body: `{ resolutionNotes }` |

### Key behaviors

- **No duplicate check-ins:** `POST /check-ins` rejects if the child has an open `check_ins` record (no `checked_out_at`). Same for staff clock-in.
- **Staff scoping:** Staff can only see/act on children and attendance for their assigned classroom. Directors and Owners see all rooms.
- **Self-service + override:** Staff can clock themselves in/out without specifying `membershipId`. Directors can clock any staff in/out by providing `membershipId`.
- **GET /ratios computes live:** It doesn't read from `ratio_snapshots`. It counts currently-open check-ins and clock-ins per classroom and calculates compliance on the fly. This ensures the dashboard always reflects the true current state.

---

## Ratio Service

Shared module at `apps/api/src/services/ratio.ts`.

### `evaluateRoomRatio(classroomId, centerId, tx)`

Called within the transaction of every check-in, check-out, clock-in, and clock-out mutation.

**Logic:**

1. Count children currently checked in (open `check_ins` where `checked_out_at` is null, matching `classroom_id`)
2. Count staff currently clocked in (open `staff_check_ins` where `clocked_out_at` is null, matching `classroom_id`)
3. Read classroom's `min_ratio_staff` and `min_ratio_children` to get required ratio
4. Compute actual ratio: `staff_count / children_count` (if 0 children, ratio is Infinity → always compliant)
5. Determine compliance: `ratio_actual >= ratio_required` (where `ratio_required = min_ratio_staff / min_ratio_children`)
6. Insert `ratio_snapshots` row with all computed values
7. If **out of compliance** and no open violation exists → insert `ratio_violations` row with `detected_at = now()`
8. If **in compliance** and an open violation exists → set `resolved_at = now()` on the violation

**Edge cases:**
- 0 children + 0 staff = compliant (empty room, no snapshot needed)
- 0 children + any staff = compliant
- Any children + 0 staff = violation
- All operations within caller's transaction — if check-in insert fails, no snapshot/violation is created
- Multiple rapid mutations (e.g., checking in 5 kids): each creates its own snapshot, violation is created on the one that crosses the threshold

---

## UI Pages

### Attendance Page — `/attendance`

**Layout:** Tabbed classroom roster. Directors see tabs for all rooms; staff sees only their assigned room (no tabs visible).

**Header:**
- Page title "Attendance" + current date
- Search bar (expands from icon on focus, width transition) for quick child lookup
- "Clock In" / "Clock Out" button for staff self-service (toggles with smooth color/label swap)

**Room info bar** (below tabs):
- Current child count / max capacity
- Staff count
- Compliance status dot + current ratio
- Counts animate (number counter) when values change

**Roster:**
- List of all children assigned to the selected classroom
- Each row shows: avatar initials, child name, check-in time or "Not checked in", action button
- **Row states:**
  - Checked in: green background (`#f0fdf4`), green border, "Check Out" button
  - Not here: gray background, muted text, blue "Check In" button
  - Checked out: red-tinted background (`#fef2f2`), red border, departure time, "Left early" / time noted
- Rows sorted: checked-in first, then not-here, then checked-out

**Staff tab** (directors only):
- Secondary tab next to child roster
- Lists staff assigned to the room with clock-in status
- Clock In / Clock Out button per staff member

**Role behavior:**
- **Staff:** Lands on their room. No tabs. Can check in/out children and clock themselves in/out.
- **Director/Owner:** Sees all room tabs. Can check in/out children in any room. Can clock any staff in/out.

### Ratio Dashboard — `/ratios`

**Director/Owner only.** Live multi-room compliance view.

**Header:**
- Title "Staff-to-Child Ratios"
- Subtitle "Live · Updates every 15 seconds"
- Summary pills: compliant count (green), near-limit count (amber), violation count (red)
- "View History" button → `/ratios/history`

**Card grid** (2 columns):
- One card per active (non-archived) classroom
- Each card shows:
  - Room name, age group, required ratio
  - Staff count, child count, actual ratio (large numbers, color-coded)
  - Capacity progress bar
  - Compliance badge (pill)

**Card states:**
- **Compliant (green):** Default border, green capacity bar, green ratio text, "Compliant" badge
- **Near Limit (amber):** Amber border (2px), amber capacity bar, amber ratio text, "Near Limit" badge, warning text: "1 more child triggers violation"
- **Violation (red):** Red border (2px), red background tint (`#fef2f2`), red capacity bar, red ratio text, "Violation" badge, alert text: "need X more staff"

**Near Limit threshold:** A room is "near limit" when adding 1 more child (with current staff count) would push the actual ratio below the required ratio.

**Polling:** `refetchInterval: 15_000` on `useRatios()`. Only active when the component is mounted. `refetchOnWindowFocus: true` for immediate update when switching back to the tab. No background polling anywhere in the app.

**Cards clickable** → navigates to `/attendance` with that room's tab pre-selected.

### Ratio History — `/ratios/history`

**Director/Owner only.** Violations log and raw snapshot data for audit preparation.

**Header:**
- Title "Ratio History"
- Filters: room dropdown (all rooms), date range picker, status dropdown (all / open / resolved)

**Two tabs:**

**Violations tab (primary):**
- Card list of violations, newest first
- Open violations: red left border, live elapsed duration (updates every minute), "Add Resolution Notes" button
- Resolved with notes: green left border, resolution notes shown inline in green panel, duration shown
- Resolved without notes: green left border, "Add Notes" button with subtle prompt
- Each card shows: room name, age group, detected timestamp, actual ratio. Staff/child counts are read from the `ratio_snapshots` row created at the same moment (joined by `classroom_id` and closest `snapshot_at` to `detected_at`)

**Snapshots tab:**
- Table of `ratio_snapshots` records: timestamp, room, staff count, children count, required ratio, actual ratio, compliance status badge
- Filterable by room and date range
- For auditors who need raw data

### Attendance Calendar — Child Profile

Replaces the "Attendance History — Coming soon" placeholder on `/children/:id`.

**Summary stats bar** (4 cards):
- Days attended (this month)
- Attendance rate (percentage)
- Average hours per day
- Partial days count

**Calendar grid:**
- Standard month calendar (Sun–Sat)
- Day cells color-coded:
  - Green (`#dcfce7`): full day (6+ hours attended)
  - Amber (`#fef3c7`): partial day (< 6 hours)
  - Light gray (`#fafafa`): absent (no record) or weekend
  - Blue ring: today
- Each attended day shows hours inside the cell
- Future days are empty/gray

**Day detail panel:**
- Click any day → detail panel slides open below the calendar
- Shows: check-in time, check-out time, who performed each action, classroom name, total hours, notes

**Month navigation:** ← → arrows to change months. Stats update per selected month.

---

## TanStack Query Hooks

### Queries

- `useCheckIns(filters)` — today's attendance log. Params: `classroomId?`, `date?`, `childId?`
- `useCheckInHistory(childId, from, to)` — historical records for calendar view
- `useStaffCheckIns(filters)` — today's staff attendance. Params: `classroomId?`, `date?`
- `useRatios()` — live ratio state for all rooms. `refetchInterval: 15_000`, `refetchOnWindowFocus: true`, enabled only when component is mounted
- `useRatioSnapshots(filters)` — historical snapshots. Params: `classroomId?`, `from`, `to`
- `useRatioViolations(filters)` — violation records. Params: `classroomId?`, `status?`, `from`, `to`

### Mutations

- `useCheckIn()` — `POST /check-ins`. Optimistic update: immediately moves child to "checked in" state in the roster, reverts on error. Invalidates `useCheckIns` and `useRatios`.
- `useCheckOut()` — `PATCH /check-ins/:id/check-out`. Optimistic update: immediately moves child to "checked out" state. Invalidates `useCheckIns` and `useRatios`.
- `useStaffClockIn()` — `POST /staff-check-ins`. Invalidates `useStaffCheckIns` and `useRatios`.
- `useStaffClockOut()` — `PATCH /staff-check-ins/:id/clock-out`. Invalidates `useStaffCheckIns` and `useRatios`.
- `useUpdateViolationNotes()` — `PATCH /ratios/violations/:id`. Invalidates `useRatioViolations`.

Optimistic updates on check-in/out are critical — staff tap the button and immediately look at the next child. Any perceived delay feels broken.

---

## Micro-interactions & Animations

### Attendance page

- **Check-in/out buttons:** press scale (`scale(0.97)` on click), row background transitions color (gray → green on check-in, green → red-tinted on check-out) over 300ms ease
- **Roster rows:** staggered `animate-in` on initial load (fade up, 50ms offset per row)
- **Tab switching:** content cross-fades (150ms opacity transition)
- **Room info bar counts:** number counter animation when values change (after mutation or poll update)
- **Staff clock-in button:** smooth color/label swap transition on toggle
- **Search bar:** expands from icon to full input on focus with width transition

### Ratio dashboard

- **Cards:** hover lift (`translateY(-2px)`, `shadow-md`, 200ms ease)
- **Compliance badge:** color pulse on status change (e.g., green → amber gets a brief pulse)
- **Capacity bars:** animate width on load and on poll update (300ms ease-out)
- **Ratio numbers:** smooth counter transition when values update from polling
- **Violation card (red):** subtle border glow pulse to draw attention
- **Near Limit card (amber):** gentle amber border pulse, less aggressive than red
- **Poll indicator:** small dot in header that briefly flashes on each successful refresh

### Attendance calendar

- **Month navigation:** calendar grid cross-fades between months (200ms)
- **Day cells:** hover scale (`scale(1.05)`) with subtle shadow
- **Day detail panel:** slides down with height animation on click (250ms ease)
- **Summary stat numbers:** counter animation on month change

### Ratio history

- **Violation cards:** staggered fade-in on load
- **"Add Notes" action:** inline textarea expansion with smooth height transition
- **Filter changes:** list cross-fades to new results
- **Live duration on open violations:** ticking counter updating every minute

---

## Shadcn Components to Add

`Progress` (capacity bars), `Tooltip` (ratio explanations)

Most needed components (`Table`, `Badge`, `Card`, `Tabs`, `Calendar`, `Popover`, `Skeleton`, `Input`, `Select`, `Dialog`) were added in Phase 2.

---

## Route Tree Additions

```
/attendance                — Tabbed classroom roster, check-in/out, staff clock-in/out
/ratios                    — Multi-room ratio dashboard (polls 15s when mounted)
/ratios/history            — Violations log + snapshots tab
```

### Sidebar changes

"Main" nav group (currently just "Dashboard"):
- Dashboard
- **Attendance** (new)
- **Ratios** (new, Director/Owner only)

### Child profile update

Replace "Attendance History — Coming soon" placeholder on `/children/:id` with the calendar view section.

---

## Role-Based Access Summary

| Action | Owner | Director | Staff |
|--------|-------|----------|-------|
| Check in/out children (any room) | ✓ | ✓ | ✗ |
| Check in/out children (own room) | ✓ | ✓ | ✓ |
| Clock self in/out | ✓ | ✓ | ✓ |
| Clock other staff in/out | ✓ | ✓ | ✗ |
| View attendance log (any room) | ✓ | ✓ | ✗ |
| View attendance log (own room) | ✓ | ✓ | ✓ |
| View ratio dashboard | ✓ | ✓ | ✗ |
| View ratio history | ✓ | ✓ | ✗ |
| Add violation resolution notes | ✓ | ✓ | ✗ |
| View child attendance calendar | ✓ | ✓ | ✓ (own room's children) |

---

## General Principles

- **Polling is on-screen only.** The 15s `refetchInterval` on `useRatios()` only runs while the ratio dashboard component is mounted. No background polling anywhere in the app. `refetchOnWindowFocus: true` ensures fresh data when switching tabs. This avoids overwhelming the database at low user counts.
- **No hard deletes.** Check-in records are never deleted. Violations are never deleted. This is a compliance app — audit trail integrity matters.
- **Ratio service is the single source of truth** for violation detection and resolution. All four mutation handlers (child check-in, child check-out, staff clock-in, staff clock-out) call `evaluateRoomRatio()` in the same transaction.
