# Phase 2: Core Features — Design Spec

> Classrooms, Children, Guardians CRUD routes + UI pages + enrollment wizard.

**Builds on:** Phase 1 foundation (monorepo, DB schema, auth, API shell, web shell).

**Goal:** Directors can manage their classrooms, children, and guardians — create, view, edit, archive/withdraw. An enrollment wizard lets them enroll a new child end-to-end (child details → guardians → classroom assignment) in one flow.

---

## Scope

**In scope:**
- CRUD API routes for classrooms, children, guardians
- Classroom assignments (children → rooms) and staff assignments (staff → rooms)
- Enrollment wizard (multi-step: child → guardians → classroom → review)
- List pages: /classrooms, /children, /guardians
- Detail pages: /classrooms/:id, /children/:id, /guardians/:id
- Soft archive (classrooms) and soft withdraw (children) — no hard deletes
- Role-based access: Owner/Director get full CRUD, Staff gets read-only filtered to their classroom
- Skeleton loading states, empty states

**Out of scope:**
- Attendance / check-in (Phase 3)
- Subsidies and billing (Phase 4)
- Scheduling (Phase 5)
- Messaging (Phase 5)

---

## Schema Changes

### 1. Add `archived_at` to classrooms

```
classrooms.archived_at — timestamp with timezone, nullable, default null
```

When set, the classroom is considered archived. Archived classrooms are hidden by default in list views but visible via a "Show archived" toggle.

### 2. Add `relationship` to child_guardians

```
child_guardians.relationship — text, nullable
```

The relationship is per child-guardian link (e.g., "mother" for one child, "grandmother" for another). This already exists in the shared validator but was missing from the DB schema.

### 3. Align age group enum

The DB enum has 6 values: `infant, young_toddler, toddler, preschool, pre_k, school_age`. The shared constants only have 4. Align shared constants to match all 6 DB values.

### 4. Fix shared type mismatches

**Child type:** Remove `classroomId` (classroom comes from `classroom_assignments` join, not a direct column). Remove `updatedAt` (not in DB schema).

**Guardian type:** Remove `childId` and `relationship` (these live on the `child_guardians` join table). Add `centerId`. Keep `updatedAt` — the DB schema already has this column.

**Classroom type:** Remove `updatedAt` (not in DB schema). Add optional `archivedAt`.

---

## API Routes

All routes are prefixed with `/api/` and scoped to the authenticated user's center via `centerId` from auth middleware. Every query filters by `center_id`.

### Classrooms — `/api/classrooms`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | All | List classrooms. Query params: `ageGroup`, `includeArchived` (default false) |
| GET | `/:id` | All | Get classroom with current child count and staff count |
| POST | `/` | Owner, Director | Create classroom |
| PATCH | `/:id` | Owner, Director | Update classroom |
| POST | `/:id/archive` | Owner, Director | Set `archivedAt` to now |
| POST | `/:id/unarchive` | Owner, Director | Set `archivedAt` to null |
| GET | `/:id/children` | All | List children currently assigned to this classroom |
| GET | `/:id/staff` | All | List staff currently assigned to this classroom |
| POST | `/:id/children` | Owner, Director | Assign child to classroom (create `classroom_assignment`) |
| DELETE | `/:id/children/:childId` | Owner, Director | End child assignment (set `end_date` to today) |
| POST | `/:id/staff` | Owner, Director | Assign staff member to classroom |
| DELETE | `/:id/staff/:membershipId` | Owner, Director | End staff assignment (set `end_date` to today) |

### Children — `/api/children`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | All (staff filtered to their classroom) | List children. Query params: `search`, `status`, `ageGroup`, `classroomId` |
| GET | `/:id` | All | Get child with guardians and current classroom assignment |
| POST | `/` | Owner, Director | Create child |
| PATCH | `/:id` | Owner, Director | Update child |
| POST | `/:id/withdraw` | Owner, Director | Set status to `withdrawn`, set `withdrawnAt` |
| POST | `/:id/reactivate` | Owner, Director | Set status back to `active`, clear `withdrawnAt` |
| GET | `/:id/guardians` | All | List guardians linked to this child |
| POST | `/:id/guardians` | Owner, Director | Link guardian to child (create `child_guardian` record) |
| PATCH | `/:id/guardians/:guardianId` | Owner, Director | Update link (isPrimary, authorizedPickup, relationship) |
| DELETE | `/:id/guardians/:guardianId` | Owner, Director | Unlink guardian from child |
| POST | `/enroll` | Owner, Director | Enrollment transaction (see below) |

### Guardians — `/api/guardians`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | Owner, Director | List all guardians. Query params: `search` (name, email, phone) |
| GET | `/:id` | All | Get guardian with linked children |
| POST | `/` | Owner, Director | Create guardian |
| PATCH | `/:id` | Owner, Director | Update guardian |
| GET | `/:id/children` | All | List children linked to this guardian |

### Enrollment Transaction — `POST /api/children/enroll`

Creates a child, links guardians, and optionally assigns a classroom — all in a single DB transaction.

**Request body:**

```typescript
{
  child: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;       // YYYY-MM-DD
    ageGroup: AgeGroup;
    enrollmentStatus: "active" | "waitlist";
    subsidyEligible: boolean;
  };
  guardians: Array<
    | { type: "new"; firstName: string; lastName: string; email: string; phone: string; isPrimary: boolean; authorizedPickup: boolean; relationship?: string }
    | { type: "existing"; guardianId: string; isPrimary: boolean; authorizedPickup: boolean; relationship?: string }
  >;
  classroom?: {
    classroomId: string;
    effectiveDate: string;     // YYYY-MM-DD
  };
}
```

**Transaction flow:**

1. Insert into `children` → get `childId`
2. For each guardian:
   - If `type: "new"`: insert into `guardians` → get `guardianId`
   - If `type: "existing"`: use provided `guardianId`
   - Insert into `child_guardians` (childId, guardianId, isPrimary, authorizedPickup, relationship)
3. If `classroom` provided: insert into `classroom_assignments` (childId, classroomId, effectiveDate)
4. Return `{ child, guardians, classroomAssignment }`

If any step fails, the entire transaction rolls back.

---

## UI Pages

### Shared Components

These are reused across multiple pages:

- **DataTable** — Shadcn Table with sortable headers, hover rows, clickable row navigation
- **FilterBar** — Search input + dropdown filters, horizontally laid out
- **StatusBadge** — Pill badges using semantic colors (green/amber/red/gray)
- **EmptyState** — Illustration + description + CTA button
- **SkeletonTable** — Skeleton rows matching table column layout
- **SkeletonCards** — Skeleton cards matching card grid layout

### Children List — `/children`

- **Header:** Title, summary counts (e.g., "24 active · 2 waitlist · 3 withdrawn"), "Enroll Child" primary button
- **Filters:** Search by name, dropdown filters for status (default: Active + Waitlist), age group, classroom
- **Table columns:** Name (with DOB subtitle), Age Group, Classroom (or "Unassigned" in muted italic), Status badge, Primary Guardian name
- **Rows clickable** → `/children/:id`
- **Staff view:** Same page, filtered to children in their assigned classroom, no "Enroll Child" button
- **Default filter:** Hides withdrawn children. Toggling status to "All" or "Withdrawn" shows them.

### Child Profile — `/children/:id`

- **Header:** Child name + status badge, "Edit" and "Withdraw" buttons (Owner/Director only)
- **Two-column card layout:**
  - Left: Child details card (DOB, age, age group, subsidy eligibility)
  - Right: Current classroom card (room name, age group, ratio, capacity bar, "Reassign" button)
- **Guardians section:** List of linked guardians with Primary/Authorized Pickup badges, "Add New" and "Link Existing" buttons, Edit/Remove per guardian
- **Placeholder cards** for Attendance History (Phase 3) and Subsidy Info (Phase 4) — shown as empty states with "Coming soon" text
- **Edit:** Inline edit mode on child details card
- **Withdraw:** Confirmation dialog → sets status to withdrawn
- **Reassign:** Opens classroom selection panel (same UI as enrollment Step 3)

### Classrooms List — `/classrooms`

- **Header:** Title, summary counts, "Show archived" checkbox toggle, "Add Classroom" primary button
- **Card grid** (not table — rooms are few enough and benefit from visual treatment):
  - Each card: Room name, age group, ratio requirement, compliance status badge, capacity progress bar (blue normal / amber ≥85% / red over), staff count, child count
  - Amber border on "Near Capacity" cards
  - Cards clickable → `/classrooms/:id`
- **"Add Classroom" modal/dialog:** Form with name, age group, max capacity, staff ratio (min staff : min children)

### Classroom Detail — `/classrooms/:id`

- **Header:** Room name, age group, ratio, compliance badge, "Edit" and "Archive" buttons
- **Capacity bar** with counts
- **Two tabs:** Children and Staff
  - **Children tab:** Table of assigned children (name, age, enrollment status, assignment date). "Assign Child" button opens a typeahead search of unassigned children in the matching age group. "Remove" ends assignment (sets end_date).
  - **Staff tab:** Table of assigned staff (name, role, assignment date). "Assign Staff" button opens a typeahead of center members. "Remove" ends assignment.

### Guardians Directory — `/guardians`

- **Header:** Title, count, "Add Guardian" primary button
- **Search:** Single search input (searches name, email, phone)
- **Table columns:** Name, Contact (email + phone), Children (clickable links to child profiles), Pickup authorization badge
- **Rows clickable** → `/guardians/:id`

### Guardian Detail — `/guardians/:id`

- **Header:** Guardian name, "Edit" button
- **Contact card:** Email, phone
- **Children section:** Table of linked children with enrollment status, classroom, Primary badge, relationship. "Link to Child" button to add another child link.

### Enrollment Wizard — `/children/enroll`

4-step wizard held in React state (no URL params). Cancel discards everything. Back/forward preserves inputs.

**Step 1 — Child Details:**
- Fields: first name, last name, date of birth (Shadcn DatePicker), age group (Shadcn Select, auto-suggested from DOB but overridable), enrollment status (Active or Waitlist), subsidy eligible checkbox
- Footer: Cancel / Next: Guardians →

**Step 2 — Guardians:**
- Shows list of added guardians as cards (name, contact, Primary badge, Authorized Pickup badge)
- "Add New Guardian" — expands inline form: first name, last name, email, phone, relationship, isPrimary toggle, authorizedPickup toggle. Save adds to list.
- "Link Existing Guardian" — expands typeahead search of center's existing guardians. Selecting one prompts for isPrimary, authorizedPickup, relationship, then adds to list.
- "Edit" on guardian card — inline-expands card into editable form
- "Remove" — removes from this enrollment (doesn't delete guardian record). Validation: at least one guardian required.
- Footer: ← Back / Next: Classroom →

**Step 3 — Classroom Assignment:**
- Description text includes child's name: "Pick a room for {name}. Showing {ageGroup} rooms with available space."
- Radio-card selection: list of classrooms filtered by child's age group, each showing room name, ratio, staff count, capacity bar. Selected card has blue border + checkmark.
- Effective date picker (Shadcn DatePicker, defaults to today)
- Info callout: "You can skip this step for waitlisted children."
- Skip allowed — classroom assignment is optional
- Footer: ← Back / Next: Review →

**Step 4 — Review & Confirm:**
- Summary cards for Child, Guardian(s), Classroom — each with an "Edit" link that navigates back to that step
- Green "Enroll Child" button submits the enrollment transaction
- On success: redirect to `/children/:id` (the new child's profile)
- On error: show error message, stay on review step

**Stepper bar:** Horizontal step indicator aligned with form content. Completed steps show green checkmark, current step is blue, future steps are gray. Progress lines between steps colored to match.

---

## Shadcn Components to Add

`Table`, `Select`, `Input`, `Label`, `Dialog`, `Calendar`, `Popover`, `Badge`, `Tabs`, `Card`, `Skeleton`, `Separator`, `Command` (for typeahead search)

---

## TanStack Query Hooks

Queries:
- `useChildren(filters)` — paginated list with search/filter params
- `useChild(id)` — single child with guardians + current classroom
- `useClassrooms(filters)` — list with ageGroup/includeArchived params
- `useClassroom(id)` — single classroom with child + staff counts
- `useClassroomChildren(classroomId)` — children assigned to room
- `useClassroomStaff(classroomId)` — staff assigned to room
- `useGuardians(search)` — list with search param
- `useGuardian(id)` — single guardian with linked children

Mutations:
- `useCreateClassroom`, `useUpdateClassroom`, `useArchiveClassroom`, `useUnarchiveClassroom`
- `useAssignChild`, `useUnassignChild`, `useAssignStaff`, `useUnassignStaff`
- `useCreateChild`, `useUpdateChild`, `useWithdrawChild`, `useReactivateChild`
- `useCreateGuardian`, `useUpdateGuardian`
- `useLinkGuardian`, `useUnlinkGuardian`, `useUpdateGuardianLink`
- `useEnrollChild` — the enrollment transaction mutation

All mutations invalidate relevant query caches on success.

---

## Role-Based Access Summary

| Action | Owner | Director | Staff |
|--------|-------|----------|-------|
| View classrooms list | ✓ | ✓ | ✗ (hidden) |
| View classroom detail | ✓ | ✓ | ✗ |
| Create/edit/archive classrooms | ✓ | ✓ | ✗ |
| Assign children/staff to rooms | ✓ | ✓ | ✗ |
| View children list | ✓ | ✓ | ✓ (own classroom only) |
| View child profile | ✓ | ✓ | ✓ (own classroom only) |
| Create/edit/withdraw children | ✓ | ✓ | ✗ |
| Enroll child (wizard) | ✓ | ✓ | ✗ |
| View guardians directory | ✓ | ✓ | ✗ (hidden) |
| View guardian detail | ✓ | ✓ | ✓ (from child profile) |
| Create/edit guardians | ✓ | ✓ | ✗ |
| View guardian contact on child profile | ✓ | ✓ | ✓ |

---

## Archive & Withdraw Behavior

**Classrooms:** Setting `archivedAt` hides the classroom from default list views. Archived classrooms cannot accept new assignments. Existing assignments are not affected (children already in the room stay in the room — the director must reassign them first or the archive action warns if children are still assigned).

**Children:** Setting `enrollmentStatus` to `withdrawn` and `withdrawnAt` timestamp. Withdrawn children are hidden from default list views (filter defaults to Active + Waitlist). Withdrawal does not delete classroom assignments — it ends them (sets `end_date`).

**Guardians:** No archive/delete. Guardians are unlinked from children but never destroyed. A guardian with zero linked children simply doesn't appear in filtered views but remains in the database.

No hard deletes anywhere. This is a compliance-focused app — audit trail integrity matters.
