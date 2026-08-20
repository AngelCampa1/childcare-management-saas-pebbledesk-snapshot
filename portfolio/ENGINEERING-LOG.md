# Engineering log: reading the project's own audit against its own code

On 2026-05-28 an audit pass was run over PebbleDesk's own source: not a customer complaint,
not an incident, a self-directed sweep of `apps/web/src/{routes,components,hooks,lib}` and
`apps/api/src/routes` looking for defects that ripgrep and re-reading could actually surface. It
found 47: 6 P0 (broken or blocking user flows), 22 P1 (wrong behavior, missing state, wiring
mismatch), 19 P2 (polish). The full inventory is
[`docs/audit/cycle-1-defects.md`](../docs/audit/cycle-1-defects.md), dated and unedited since. It
is not flattering, and it stayed in the repo instead of being quietly deleted once addressed: a
company that only ever shows you audits with zero findings is not showing you real audits.

This document is a curated read of nine of those 47, chosen because each one has a root cause a
reviewer can learn something from, not because it was the easiest to fix. For each one I quote
what the audit said, at the line numbers it cited, and then say what the tree in *this snapshot*
shows now: this repository is a single-commit export (see the main
[README](../README.md#built-with-ai-agents)), so I cannot show you the commit that closed each
item or prove exactly when it landed relative to the audit date. What I can show you is the
current file and line, which you can open yourself. Some of these nine were still open as of this
export; most were closed, and several of the fixes reference the original defect ID directly in a
comment or a test name, which is its own small piece of evidence about how the fix was tracked.

Nothing here claims all 47 were resolved: I read nine closely. The other 38 are in the linked
inventory, unedited.

## Contents

- [Silent failures: a toast provider that made the feature look done](#silent-failures-a-toast-provider-that-made-the-feature-look-done)
- [A partial migration that left no trace of being partial](#a-partial-migration-that-left-no-trace-of-being-partial)
- [Timezone: a date-only string is not a UTC instant](#timezone-a-date-only-string-is-not-a-utc-instant)
- [Two auth checks, zero role checks](#two-auth-checks-zero-role-checks)
- [A crash guard that has to obey the Rules of Hooks](#a-crash-guard-that-has-to-obey-the-rules-of-hooks)
- [Identity: keys and date arithmetic that assume a happy path](#identity-keys-and-date-arithmetic-that-assume-a-happy-path)
- [What picking these nine leaves out](#what-picking-these-nine-leaves-out)

---

## Silent failures: a toast provider that made the feature look done

**[P0-001](../docs/audit/cycle-1-defects.md#p0-001-mutation-hooks-have-no-toast-feedback-silent-failures-across-the-entire-web-app) and [P0-002](../docs/audit/cycle-1-defects.md#p0-002-import-mutations-silently-swallow-row-errors-and-lack-onerror-toast)**

The audit's grep evidence: `grep "toast\.(error|success)" apps/web/src/hooks` returned zero
matches across all 16 mutation-bearing hook files, while the app had 63 `.mutate()` /
`.mutateAsync()` call sites across 19 page files. Only three page files
(`settings.tsx`, `billing/index.tsx`, `children/enroll.tsx`) called `toast.error` or
`toast.success` at all: five calls total, covering three flows out of dozens: invoice send,
payment record, child enroll, guardian link, classroom create, schedule create, time entry edit,
member invite, attendance check-in, message send, subsidy claim, QuickBooks sync, and import all
mutated data without telling the user whether it worked.

The root cause is more interesting than "someone forgot toasts." A toast provider was already
wired up early in the project (the audit doc cites `5e307575 feat(shell): toast provider`), and
once a `<Toaster />` exists and a handful of page-level `toast.success()` calls exist next to it,
the feature *reads* as done in a code review: the import exists, the API is called, a toast shows
up somewhere in the app. What the review missed is that the mechanism existed without being
applied at the only two places that matter for a React Query mutation: `onSuccess` and `onError`
on each hook. A component with a working toast library and zero systematic feedback looks, from a
diff, exactly like a component with a working toast library.

[P0-002](../docs/audit/cycle-1-defects.md#p0-002-import-mutations-silently-swallow-row-errors-and-lack-onerror-toast)
is the same defect with an extra wrinkle: the four `useImport*` hooks in
`apps/web/src/hooks/use-imports.ts:22-98` had `onSuccess` but no `onError`, and the API's
`ImportResult.errors[]` array (per-row failures returned inside a 2xx response, e.g. "row 14: bad
phone number") had no UI path to reach the user at all. A center importing 300 children from a
Brightwheel export could have 40 silently skipped and never know.

**What the current tree shows.** `grep -rn "toast\.(error|success)" apps/web/src/hooks` now
returns matches in all 16 files (122 call sites total), and the fix took the form the audit's own
"fix sketch" suggested: feedback co-located inside each hook's `onSuccess`/`onError`, not
scattered across 19 pages. `apps/web/src/hooks/use-imports.ts:1-21` now opens with a doc comment
that names the defects directly:

```ts
 * Toast policy (audit cycle 1, P0-001/P0-002):
 *   - `onSuccess` toasts the counts (relief-oriented "warm, sturdy, practical" UX).
 *   - `onError` toasts the extracted error message so non-2xx failures are
 *     never silent.
 *   - Row-level partial failures (errors[] populated on a 2xx body) are
 *     surfaced via a follow-up info toast so the caller's UI can still
 *     render a detailed errors table.
```

`announceResult()` at `apps/web/src/hooks/use-imports.ts:86-93` calls `toast.success` with the
insert/update/skip counts, then a second `toast.info` if `result.errors.length > 0`: the
per-row-failure path the audit flagged as missing. Each `useImport*` hook now has both `onSuccess`
and `onError` (e.g. `useImportChildren` at lines 103-120). `apps/web/src/hooks/use-imports.test.tsx:206`
adds a test titled "throws a Zod error when the server returns a malformed body," which is really
the neighboring defect (below) getting test coverage at the same time.

## A partial migration that left no trace of being partial

**[P0-003](../docs/audit/cycle-1-defects.md#p0-003-import-response-cast-bypasses-zod-validation) and [P0-004](../docs/audit/cycle-1-defects.md#p0-004-quickbooks-query-helpers-cast-generic-t-without-runtime-validation)**

The audit doc's framing is precise about the mechanism: "Recent commit `d4ec6533` added zod
response validators on **mutation** hooks, but `useImport*` was missed." The four
`useImport*` hooks in `apps/web/src/hooks/use-imports.ts:33,52,71,90` each did
`return res.json() as Promise<ImportResult>`: a bare TypeScript assertion, checked at compile
time only, that a server-shape drift on `/api/imports/*` would surface as a runtime crash the
first time a consumer read `result.errors[i].rowIndex` on a body that didn't have that shape.

P0-004 is the same failure mode in a different file: `apps/web/src/hooks/use-quickbooks.ts:42-61`
defined `parseJsonResponse<T>(res)` returning `(await res.json()) as T`: a generic-erased cast
with no schema, used by every QuickBooks query and mutation hook (`status`, `history`,
`reconciliation`, `sync`).

What's instructive here isn't the cast itself: bare casts on `fetch` responses are a common,
easy-to-spot smell. It's that a *previous* remediation (the `d4ec6533` Zod-validation sweep across
mutation hooks) had already happened, and its own success is what hid these two files. A codebase
where every hook casts `res.json()` signals "nobody validates responses here yet": obviously
incomplete, obviously a backlog item. A codebase where 90% of hooks validate and two don't signals
nothing, because the two survivors are indistinguishable from validated code by anyone not
re-running the grep. Partial migrations that don't mark themselves as partial are more dangerous
than no migration, because they remove the visual signal that would have caught the gap.

**What the current tree shows.** `apps/web/src/lib/parse-json-response.ts:10-12` now defines
`parseJsonResponse<Schema extends ZodTypeAny>(res, schema, errorMessage)`, which calls
`schema.parse(raw)` at line 33: the schema argument is required, not optional, so a call site
cannot silently opt out the way the old generic-only signature allowed. `use-imports.ts:95-101`'s
`postImport()` calls `parseJsonResponse(res, importResultSchema, errorMessage)`: no more `as
Promise<T>` anywhere in the file. `use-quickbooks.ts` threads a distinct schema per call site
(`quickBooksStatusSchema`, `quickBooksHistoryResponseSchema`,
`quickBooksReconciliationResponseSchema`, and others, imported at lines 10-19 and used at lines
115, 131, 153, 169, 185, 202, 229, and 251) through the same helper. The file's own header comment
now states the policy as a rule rather than an aspiration: "The schema parameter is REQUIRED so a
backend shape regression surfaces as a parse error instead of silent `undefined` propagation."
`apps/web/src/lib/parse-json-response.test.ts:45` tests exactly that: "throws a Zod parse error
when the response body does not match the schema."

## Timezone: a date-only string is not a UTC instant

**[P0-005](../docs/audit/cycle-1-defects.md#p0-005-date-display-drops-timezone--dob-and-timestamps-shift-in-non-local-zones)**

The audit found ten call sites, via `grep new Date(\w+)\.toLocale`, doing
`new Date(isoString).toLocaleTimeString("en-US", {...})` with no `timeZone` option: across
`attendance-calendar.tsx`, `attendance-roster.tsx`, `subsidy-summary-card.tsx`,
`violation-card.tsx`, `attendance.tsx`, `subsidies/index.tsx`, `messages/index.tsx`,
`messages/$id.tsx`, `settings.tsx`, and `reports/index.tsx`. `Date.toLocaleTimeString` without an
explicit zone uses whatever zone the JavaScript runtime is in: the browser's system zone, not the
childcare center's zone, and definitely not a fixed zone.

The specific failure mode is a well-known JavaScript trap that still bites: a date-only ISO string
like a child's date of birth, `"2020-12-31"`, parses under `new Date(...)` as UTC midnight on that
date. In any timezone west of UTC (anywhere in the Americas) local midnight for that instant has
already rolled back to December 30th. A DOB display, an audit-log timestamp, a ratio-violation
alert, and an attendance check-in time were all subject to the same bug family, meaning the drift
wasn't cosmetic: it could make a child's recorded age wrong by a day at a birthday boundary, or
misattribute an attendance event to the wrong calendar day in an audit trail.

The audit's own note on the test gap is the part worth sitting with: "Existing tests run in the
system zone of the CI runner; no zone-shift assertions." A test suite that formats a date and
asserts against `new Date(...).toLocaleDateString()` computed the same way in the same process
will always agree with itself: the bug is invisible to any test that doesn't deliberately fix or
mock a *different* zone than the one it's running in. Every one of the ten call sites could have
been covered by tests and still have shipped the bug.

**What the current tree shows.** `apps/web/src/lib/format-date.ts` (160 lines) is a new module:
exactly the `formatDate/formatTime/formatDateTime` helper the audit's fix sketch proposed. It
takes an optional `centerTimezone` IANA string, documents why in its header comment ("production
callsites should always pass the active center's zone"), and its `parseIso()` helper
(lines 41-58) specifically anchors date-only ISO strings at UTC noon rather than UTC midnight, so
every reasonable timezone reports the same calendar date: solving the DOB-shift bug at the
parsing layer instead of hoping every call site remembers to pass a zone. A `useCenterTimezone()`
hook (lines 150-159) reads the cached auth-session query so components don't have to thread the
zone through props by hand. Several of the original ten call sites (e.g.
`apps/web/src/routes/_auth/children/$id.tsx:67-78`'s `formatDate`) now route date-only strings
through a local noon-anchored `Date` construction using the same technique before formatting.

## Two auth checks, zero role checks

**[P0-006](../docs/audit/cycle-1-defects.md#p0-006-audit-log-route-mounts-requireauth--requirecenter-globally-and-re-applies-requireauth-on-the-get-handler--but-never-enforces-a-role-gate-that-matches-the-directorowner-only-spec)**

`apps/api/src/routes/audit-log.ts:12-18` applied `requireAuth` twice (once globally via
`auditLogRoutes.use("*", requireAuth, requireCenter)`, once again on the `GET` handler itself),
and neither application of `requireAuth` establishes a role. The route relied on
`requirePermission("audit-log:read")`, but the audit's finding wasn't "the permission check is
broken": it was that the permission table it depends on lives in a different file
(`apps/api/src/middleware/auth.ts`), so the route file itself contained no evidence that
`audit-log:read` was actually restricted to owners and directors. The spec called for
Director/Owner-only access to the audit trail (the one feature the product's own name promised
was trustworthy), and the route that gated it had two copies of the wrong check and zero copies of
the right one.

This is a defect about legibility, not just access control. A reviewer reading `audit-log.ts` in
isolation had no way to confirm the security property the spec required; they'd have to
cross-reference a permission map in a different module and trust that it was correct and would
stay correct. Redundant identical middleware (`requireAuth` twice) is the kind of thing that looks
like defense in depth but is actually just noise that makes the *absence* of the real check harder
to notice.

**What the current tree shows.** `apps/api/src/routes/audit-log.ts:29-34` now chains
`requirePermission("audit-log:read")` and `requireRole("owner", "director")` on the same route,
with a comment (lines 25-28) that states the intent directly: "Belt-and-suspenders:
`requirePermission` gates by the role→permission table … and `requireRole` encodes the spec intent
at the route level … Both must pass — neither alone can leak audit history to staff if one is
misconfigured." `apps/api/src/routes/audit-log.test.ts:208-222` adds two tests: one asserts a
`staff`-role request gets a 403, and a second (named directly in the test file as "belt-and-
suspenders: blocks staff even if requirePermission were permissive (P0-006)") mocks
`requirePermission` to be deliberately permissive and confirms `requireRole` alone still blocks
staff. That second test is the more useful one: it's not testing today's permission table, it's
testing that the route doesn't regress silently if that table is ever loosened.

## A crash guard that has to obey the Rules of Hooks

**[P1-021](../docs/audit/cycle-1-defects.md#p1-021-classroom-detail-classroomsfind-every-render-can-crash-if-classrooms-is-undefined-prior-24)**

The frontend deep audit ([`docs/audit/frontend-deep-audit.md:63`](../docs/audit/frontend-deep-audit.md))
flagged `apps/web/src/routes/_auth/classrooms/$id.tsx:1071-1113`: a `.find()` call against query
data that can legitimately be `undefined` while `useClassroomChildren`/ratio data is still
loading, run on every render with no guard.

The reason this defect is worth reading closely isn't the null check itself: it's why the naive
fix is wrong. The obvious instinct is "add an early return before the derived-data computation if
the data isn't loaded yet." But an early return placed before a `useMemo` call, in a component that
calls `useMemo` again later, violates the Rules of Hooks: React requires the same hooks to run in
the same order on every render, and an early return that sometimes skips a hook and sometimes
doesn't will either throw in development (React's own hook-order check) or corrupt state silently
in production. The correct fix has to keep the hook call unconditional and push the guard *inside*
it.

**What the current tree shows.** `apps/web/src/routes/_auth/classrooms/$id.tsx:92-97`:

```ts
// #24: useMemo must be called unconditionally (before any early return) to satisfy Rules of Hooks.
// Guard if ratios is undefined/empty to avoid crashes.
const liveRatio = useMemo(() => {
	if (!ratios || ratios.length === 0 || !classroom) return undefined;
	return ratios.find((ratio) => ratio.classroomId === classroom.id);
}, [ratios, classroom]);
```

The `useMemo` call is unconditional; the `isLoading` and `!classroom` early returns happen only
afterward, at lines 99-114. The comment references the defect by its number from the *other* audit
document (`frontend-deep-audit.md` numbered this issue #24 before the cycle-1 inventory relabeled
it P1-021): small evidence that whoever fixed it had both documents open and was tracking against
them, not just fixing what looked broken.

## Identity: keys and date arithmetic that assume a happy path

**[P1-016](../docs/audit/cycle-1-defects.md#p1-016-attendance-roster-table-renders-by-index-key-breaks-on-roster-reorder-prior-17) and [P1-006](../docs/audit/cycle-1-defects.md#p1-006-calculateage-in-child-profile-breaks-at-month-boundary-prior-6)**

Two smaller defects, grouped here because they're the same category of mistake: code that is
correct for the common case tested and wrong for a boundary nobody exercised.

P1-016: `apps/web/src/components/attendance-roster.tsx:202` rendered
`rows.map((row, index) => <ChildRosterRow key={index} .../>)`. React uses `key` to decide whether
to reuse a DOM node or create a new one across re-renders; keying by array position means that
when the roster is filtered or reordered, React reuses the DOM node that used to be "row 3" for
whatever child is now at position 3, carrying over any local input or selection state that node
held. It's the kind of bug that never shows up in a demo where the list doesn't change, and always
shows up in production where filters do.

P1-006: `calculateAge()` in `apps/web/src/routes/_auth/children/$id.tsx:64-75` (as cited in the
audit) subtracted birth year from current year with no month/day comparison: correct on average,
wrong at the boundary. A child born 2020-12-31, checked on 2026-01-01, would read as 5 if the code
only subtracted years, when the correct age (one day after the fifth birthday, not yet the sixth)
happens to also be 5: but the same code reads the same child as 6 a year later on 2026-12-30,
a day *before* the real sixth birthday. The bug is invisible unless you test near a birthday.

**What the current tree shows.** `attendance-roster.tsx:207-214` now keys by `row.child.id`, a
stable per-child identifier that survives reordering. `children/$id.tsx:80-99`'s `calculateAge()`
now computes `years`/`months` deltas and corrects for negative remainders and for
`now.getDate() < dob.getDate()`, i.e. it compares day-of-month before deciding whether the most
recent birthday has occurred: the boundary case is now part of the arithmetic instead of an
edge case the year-subtraction ignored.

## What picking these nine leaves out

This is nine defects out of 47, chosen for teaching value, not representativeness. The inventory
also documents defects with no interesting root cause beyond "someone missed it" (duplicate
`id` attributes between a `<Label>` and a `<SelectTrigger>`, a dead `AttendanceCalendar` import),
and 19 P2 items that are closer to style than correctness. It also documents defects I did not
re-verify against this tree: string-comparison time validation in scheduling
([P1-012](../docs/audit/cycle-1-defects.md#p1-012-scheduling-end-time-validation-uses-string-comparison-prior-13)),
non-deterministic guardian keys during enrollment
([P2-006](../docs/audit/cycle-1-defects.md#p2-006-guardian-keys-non-deterministic-in-enroll-prior-31)),
and the orphaned `POST /api/messages/inbound/resend` endpoint with no frontend caller. I'm not
claiming a status for those either way. Read
[`docs/audit/cycle-1-defects.md`](../docs/audit/cycle-1-defects.md) directly for the other 38, the
full E2E flow status table, and the coverage-gap list the audit closes with.
