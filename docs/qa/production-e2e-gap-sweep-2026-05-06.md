# Production E2E Gap Sweep - 2026-05-06

Target: `https://my.pebbledesk.app` and `https://api.pebbledesk.app`

Tooling: Playwright CLI manual session `prod-gap-20260506`

Credentials: disposable production E2E credentials are stored in local `.env.local` and referenced
from `agents/claude.md`. No secrets are stored in this report.

## Summary

The second production sweep covered the remaining high-value gaps after the earlier login,
enrollment, and attendance fixes. Three product bugs were confirmed:

1. Time-entry approval failed in production with `PATCH /api/time-entries/:id => 400`.
2. The Import wizard kept stale parsed CSV rows after changing import type.
3. Mobile navigation did not return keyboard focus to the menu trigger after Escape close.

All three issues now have regression coverage and code fixes in this branch. The rest of the tested
owner flows passed with the disposable E2E center.

## Flow Results

| Area | Result | Notes |
| --- | --- | --- |
| Returning login | Pass | Existing disposable owner account reached `/dashboard`; dashboard API calls returned 200. |
| Scheduling/time empty state | Pass | `/scheduling/time` rendered cleanly with no entries and no console errors. |
| Scheduling/time approval | Failed before fix | Staff clock-out created a time entry; clicking `Approve` returned 400 and showed `Request failed with status 400`. |
| Import invalid CSV | Pass | Invalid children CSV showed row-level validation and disabled `Import 0 rows`. |
| Import type/source reset | Failed before fix | Children CSV rows remained after Back to Configure and switching Import type to Guardians. |
| Import successful CSV | Pass | Valid guardian CSV imported 1 row through `/api/imports/guardians`. |
| Guardian standalone CRUD | Pass | Created guardian, edited phone, linked to child, changed pickup authorization, unlinked. |
| Child profile lifecycle | Pass | Created child, edited fields, withdrew, and reactivated through production APIs. |
| Subsidy case and claim | Pass | Invalid date range returned 400; valid case and claim were created, submitted, approved, and paid. |
| Settings profile/timezone | Pass | Center timezone update and restore returned 200; Settings route rendered owner-only UI cleanly. |
| Mobile navigation keyboard | Failed before fix | Escape closed the drawer but focus landed on `body`, not `Open navigation`. |
| Mobile overflow smoke | Pass | 390px Settings route had no horizontal overflow during the mobile nav smoke. |
| Auth/session reload | Pass | Authenticated session survived reload; new-context state was saved for post-deploy verification. |

Role-specific production sessions were not available beyond the owner account. Owner-only and
staff/director access expectations remain covered by local route and API tests; a disposable
accepted staff/director production account would be needed for a true browser-session role sweep.

## Bugs

### P1 - Time Entry Approval Sends Incomplete Payload

Status: Fixed, deployed, and post-deploy verified.

Evidence:

- Route: `/scheduling/time`
- Setup: production staff clock-out created time entry `auto` for May 6, 2026.
- Request: `PATCH https://api.pebbledesk.app/api/time-entries/{id}`
- Result: 400
- UI result: inline alert `Request failed with status 400`

Root cause:

The UI approval hook sent only `{ "status": "approved" }`, while the API adjustment validator
requires the existing `hoursWorked`, `hoursScheduled`, `overtimeHours`, and `status`.

Fix:

- `useApproveTimeEntry` now accepts the selected `TimeEntry`.
- The approval request preserves the existing hour values and changes only `status` to `approved`.
- The time entries page passes the full entry to the mutation.

Verification:

- Added hook and route regression tests.
- `pnpm --filter @pebbledesk/web test -- src/hooks/use-phase5.test.tsx src/routes/_auth/scheduling/time.test.tsx`
- `pnpm --filter @pebbledesk/web test`
- Post-deploy: approving the pending production time entry returned
  `PATCH /api/time-entries/{id} => 200`; UI moved it from Pending to Approved.

### P1 - Import Wizard Keeps Stale Rows Across Import Type Changes

Status: Fixed, deployed, and post-deploy verified.

Evidence:

- Route: `/import`
- Flow: configure Children, upload invalid children CSV, preview, Back twice, change Import type to
  Guardians, Next.
- Result: Upload step still showed `1 rows detected`; preview validated the old children columns as
  guardian data.

Root cause:

Changing `importType` or `sourcePreset` on the Configure step did not clear `rows`, `rawRowCount`,
`hasFile`, or related parse/submit state.

Fix:

- Added a shared upload-state reset helper.
- Import type and source preset changes now clear parsed rows, file state, row count, parse errors,
  submit errors, and pending parse state.
- In-flight parser callbacks are generation-guarded so an old CSV parse cannot repopulate rows after
  the user changes import type or source preset.

Verification:

- Added regression tests for type-change reset, source-preset reset, and stale parser callbacks.
- `pnpm --filter @pebbledesk/web test -- src/routes/_auth/import/index.test.tsx`
- Successful guardian import remained green in production before fix and local tests after fix.
- Post-deploy: after uploading a children CSV, going Back, changing Import type to Guardians, and
  clicking Next, the Upload step showed no stale row count and kept Next disabled until a new file.

### P2 - Mobile Navigation Escape Close Drops Focus

Status: Fixed, deployed, and post-deploy verified.

Evidence:

- Route: `/settings`, viewport `390x844`
- Flow: open mobile nav, press Escape.
- Result: dialog closed, but active element was `body`.
- Expected: focus returns to `Open navigation`.

Root cause:

The auth shell controlled the Sheet open state but did not keep a ref to the trigger or restore focus
when the drawer was closed.

Fix:

- Header accepts a ref for the mobile navigation trigger button.
- Auth shell restores focus to the trigger after a previously open mobile drawer closes.
- The focus effect is guarded so initial page load does not steal focus.

Verification:

- Added auth shell regression test.
- `pnpm --filter @pebbledesk/web test -- src/routes/auth-shell.test.tsx`
- Targeted coverage for `_auth.tsx` is above 95%.
- Post-deploy: at 390x844 on `/settings`, Escape closed the mobile nav and returned focus to the
  `Open navigation` button.

## Verification To Date

- `pnpm typecheck`
- `pnpm --filter @pebbledesk/web typecheck`
- `pnpm lint`
- `pnpm test` - 11 Turbo tasks passed; web reported 106 test files and 1,577 tests passed.
- `pnpm --filter @pebbledesk/web test`
- Targeted web regression tests for scheduling/time, imports, auth shell, phase 5 pages, and hooks.
- Targeted coverage:
  - `_auth.tsx`: 100% statements, 95.55% branches, 100% functions, 100% lines.
  - `header.tsx`: 100% statements, 97.43% branches, 100% functions, 100% lines.
  - `time.tsx`: 100% statements, 93.1% branches, 100% functions, 100% lines.
  - `import/index.tsx`: 98.34% statements, 91.91% branches, 97.82% functions, 99.41% lines.

The repo changed-line coverage gate still includes unrelated older branch history. The branch uses
targeted include-scoped coverage for the files touched by this sweep. V8 branch counters remain
below 95% on `time.tsx` and `import/index.tsx`; statement, function, and line coverage exceed 95%
on every touched file with production-behavior regressions covered.

## Remaining Post-Deploy Checks

Completed on 2026-05-06 after deploying `pebbledesk-web` from `master`:

- Time entry approval returned 200 and moved the entry to Approved.
- Import Back/type-change flow cleared stale rows.
- Mobile nav Escape close returned focus to `Open navigation`.
- Browser console after post-deploy checks reported 0 errors.
