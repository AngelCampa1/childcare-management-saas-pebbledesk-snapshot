# Testing

What the test suite covers, how it's organized, what it does not cover, and what "168,704 lines
of test" actually means. The short version up front: this is a count of test code present in the
tree, not a report that the suite passes. It was never run as part of building this snapshot.

- [The numbers, and where they come from](#the-numbers-and-where-they-come-from)
- [Why the ratio is close to 2:1](#why-the-ratio-is-close-to-21)
- [How tests are organized](#how-tests-are-organized)
- [packages/db/tests/integrity.test.ts](#packagesdbtestsintegritytestts)
- [Vitest setup](#vitest-setup)
- [What manual QA existed](#what-manual-qa-existed)
- [What the project's own audit found](#what-the-projects-own-audit-found)

---

## The numbers, and where they come from

| Number | Value | Command |
|---|---:|---|
| Test files (`*.test.ts` / `*.test.tsx`) | 480 | `git ls-files \| grep -cE '\.test\.(ts\|tsx)$'` |
| Test lines | 168,704 | see [METRICS.md](./METRICS.md): Windows `xargs` batches, summed explicitly |
| Application source lines (non-test) | 88,514 | see [METRICS.md](./METRICS.md) |
| Test cases across test files | 7,818 | see [METRICS.md](./METRICS.md#counting-test-cases) |

The test-case figure deserves a note, because the obvious way to produce it is wrong. Counting
lines that contain the substring `it(` reports 8,172, but that pattern also matches `submit(`,
`commit(`, `await(` and `edit(` (252 such calls exist in these files) while simultaneously
undercounting any line holding two blocks. The 7,818 above uses a word-anchored pattern that also
recognises Vitest's `it.each` form; [METRICS.md](./METRICS.md#counting-test-cases) gives the exact
command and the reasoning.

**7,818 is not a pass count.** It is the number of test cases written, counted statically. It also
undercounts what actually runs, and not by a little: a single `it.each` block with ten rows executes
as ten cases, and a one-time verification run (documented in
[METRICS.md](./METRICS.md#counting-test-cases)) put the real runtime count at 8,959 cases across the
same 480 files, a 14.6% gap, not a rounding error. That run checked case-count magnitude only. The
suite's headline figures for this snapshot were not built from a test run, and no claim is made
anywhere about pass/fail rate. See [What the project's own audit
found](#what-the-projects-own-audit-found) for what that means and does not mean.

## Why the ratio is close to 2:1

168,704 test lines against 88,514 source lines is roughly 1.9:1. That ratio isn't incidental: the
repository's own `CLAUDE.md` makes it a requirement, not a preference. Two sections, quoted
directly:

> ### Test-Driven Development (TDD) — MANDATORY
>
> Every task follows this cycle. No exceptions:
> 1. **Write the failing test first.** The test must define expected behavior before any
>    implementation exists.
> 2. **Run the test. Confirm it fails.** If it passes, your test is wrong.
> 3. **Write the minimal implementation** to make the test pass.
> 4. **Run the test. Confirm it passes.**
> 5. **Refactor** if needed, re-run tests to confirm still green.
>
> ### Coverage Requirements
>
> - **95% code coverage minimum on every file you touch.** Not the repo average — each individual
>   file.
> - If a file drops below 95%, you are not done. Write more tests.
> - Run coverage: `pnpm test -- --coverage`

Both of `apps/api/vitest.config.ts` and (by its own coverage block) the other workspace packages
enforce this at the tool level, not just as a written policy: `apps/api/vitest.config.ts` sets
`thresholds: { lines: 95, functions: 95, statements: 95, branches: 85 }` under the v8 coverage
provider, with branch coverage deliberately set lower than the others: the config comments explain
that v8 counts every `?.` and `??` as a separate branch, which produces misleading percentages for
optional-chaining-heavy Cloudflare Worker code, so branches gets a lower, still-enforced bar (85%)
instead of being dropped from the gate entirely. Two files are excluded from the threshold outright:
`src/durable-objects/**` (can't be instantiated outside the real Workers runtime) and
`src/services/quickbooks.ts` (a 2,830-line third-party integration already covered by a 5,692-line
test file, where remaining branch gaps are logically unreachable without a live QuickBooks account).

Whether every file in the tree actually holds at 95% today was not verified for this snapshot: no
coverage report is committed, and the suite was not run. What's verifiable is the policy itself
(quoted above, exact) and the tooling that would enforce it if the suite were run.

## How tests are organized

Tests are co-located, not segregated into a separate `test/` tree: `apps/api/src/routes/children.ts`
sits next to `apps/api/src/routes/children.test.ts`, `apps/web/src/hooks/use-imports.ts` sits next
to `apps/web/src/hooks/use-imports.test.ts`, and so on across all 480 test files. Each workspace
package and app has its own `vitest.config.ts` (nine of them: `apps/{api,web,site}`,
`packages/{auth,db,emails,marketing,shared,ui}`), so `pnpm test` (a Turborepo task depending on
`^build`) runs nine independent Vitest processes rather than one shared config, and each package's
coverage thresholds are its own to tune: `apps/api`'s 95/95/85/95 split above is not necessarily
identical to every other package's.

A few directories stand out from the norm:

- `apps/web/src/test/` and `apps/api/src/test/` hold shared test infrastructure: a Vitest
  `setupFiles` entry point, mock helpers (`with-center-timezone.tsx`, `timezone-select-mock.tsx`),
  and a handful of "source" tests (`schema-source.test.ts`, `brand-source.test.ts`,
  `coverage-gate-source.test.ts`) that assert properties of *other* source or config files rather
  than of application logic (for example, `apps/api/src/test/wrangler-config-source.test.ts`
  presumably asserts something about `wrangler.jsonc` directly rather than about runtime behavior).
- `packages/db/tests/` (as opposed to `packages/db/src/**/*.test.ts`) holds cross-cutting schema
  and migration assertions rather than per-module unit tests: `integrity.test.ts`,
  `migrations.test.ts`, `schema.test.ts`, and three files about verifying the *production* schema
  matches what's expected (`production-schema-verifier.test.ts`,
  `verify-production-schema.test.ts`, `deploy-api-production-db.test.ts`).

## `packages/db/tests/integrity.test.ts`

The single largest test file dedicated to schema correctness: 1,323 lines. It does three
categorically different things, all against the actual Drizzle table definitions and the raw
migration SQL, not against a running database:

1. **Reads migration SQL files as text and asserts they contain specific fragments.** Every
   `describe("migration NNNN SQL")` block reads a migration file with `readFileSync` and asserts
   `toContain(...)` against exact constraint names, `ADD CONSTRAINT` clauses, preflight-check error
   messages (e.g. `"Cannot add invoices_amounts_nonnegative_check: negative invoice amounts
   exist"`), and `FOREIGN KEY (...)` / `REFERENCES (...)` clauses. This catches typos and dropped
   clauses in the SQL itself without needing a database to run it against.
2. **Reads the live Drizzle table objects via `getTableConfig()`** and asserts the same
   constraints, foreign keys, indexes, and check names exist on the in-memory schema definition, for
   example `expect(getForeignKeyNames(invoiceLineItems)).toEqual(expect.arrayContaining([
   "invoice_line_items_invoice_center_fk", "invoice_line_items_child_center_fk" ]))`. This is what
   catches drift between a migration file and the schema TypeScript actually describing it.
3. **Reads `drizzle/meta/_journal.json` and the numbered snapshot files** and asserts specific
   entries exist with the right `idx`, `version`, and `breakpoints` fields, a sanity check that
   Drizzle's own migration bookkeeping is consistent, not just that the SQL and schema agree with
   each other.

The composite-foreign-key pattern that makes cross-tenant references referentially impossible (see
[ARCHITECTURE.md](./ARCHITECTURE.md#multi-tenancy-via-center_id)) is asserted here table by table,
not with a schema-wide loop: `describe("center-scoped composite foreign keys")` is roughly 620
lines of individually named `it()` blocks, one relationship at a time. There is no test in this
file, or anywhere else in `packages/db/tests/`, that iterates every table in the schema and asserts
a `center_id` column or composite FK exists generically. `packages/db/tests/schema.test.ts` has the
same shape: 45 individual `center_id`/`centerId` assertions, none of them generated from a loop.

## Vitest setup

`apps/api/vitest.config.ts` aliases `cloudflare:workers` to a local stub
(`src/__stubs__/cloudflare-workers.ts`) so Durable Object base classes can be imported in a Node
test environment that has no Cloudflare Workers runtime underneath it. The actual DO behavior is
tested separately, against a mock namespace, in `rate-limit.test.ts`. `apps/web/vitest.config.ts`
runs under `jsdom` with `pool: "threads"` and `maxWorkers: 2`, and points `setupFiles` at
`./src/test/setup.ts`. Coverage across the workspace uses the `v8` provider, reported as
`text`/`json-summary`/`lcov` where configured (`apps/web/vitest.config.ts`).

## What manual QA existed

`docs/qa/screenshots/` holds 106 image files: 78 under `2026-04-23-prod-bug-hunt/`, 14 under
`2026-04-23-live-e2e/`, and 14 loose files at the top level named `flow7-*` through `flow11-*`
(attendance check-in/check-out, staff clock-in/clock-out, ratio violations and history, scheduling,
and messages: five numbered flows, several with multiple captures each). These are dated captures
from manual or scripted walkthroughs against seeded local and E2E environments, not an automated
visual-regression suite: there's no snapshot-diffing tool wired to them, and no CI step that
regenerates or compares them. They're a record that specific flows were exercised and what the UI
looked like on 2026-04-23, nothing more.

There is no Playwright, Cypress, or other browser-automation E2E suite in this repository. "E2E" in
`docs/audit/cycle-1-defects.md`'s flow table (see below) refers to manually walking through flows
and recording findings in a markdown table with a status column (`✓`/`⚠`/`❌`), not automated tests.

## What the project's own audit found

The repository's own audit process found real, specific gaps in the test suite: not hypothetical
ones. [`docs/audit/cycle-1-defects.md`](../docs/audit/cycle-1-defects.md) (dated 2026-05-28, 47
defects: 6 P0, 22 P1, 19 P2) names test gaps alongside almost every defect it lists. Three
categories the task behind this document specifically asked to be checked, all directly quoted:

**Tests that mock the hook layer and never assert user-facing feedback.** [P0-001] found that 63
`.mutate()`/`.mutateAsync()` call sites across 19 page files produced only 5 toast notifications
across 3 files: most mutations failed or succeeded silently from the user's perspective. Its test
gap note: *"No page tests assert toast appearance after mutation; tests like
`attendance-page.test.tsx`, `classroom-detail.test.tsx` mock hooks and never verify user-facing
feedback."* Mocking the hook is a reasonable way to isolate a component under test, but it also
means the test can't see whether the component wired up the mocked hook's error path to anything a
user would notice: the mock always "succeeds" from the test's point of view.

**Tests that feed only valid shapes to parsers with no runtime schema.** [P0-004] found that every
QuickBooks read (`status`, `history`, `reconciliation`, sync mutations) flowed through a generic
`parseJsonResponse<T>(res)` that cast the response as `T` with no Zod validation: a server-side
shape change would silently corrupt UI state instead of failing loudly. Test gap: *"Tests mock
fetch and feed valid shapes only."* The related [P1-001] finding lists eleven files reading
responses via bare TypeScript casts (`apps/web/src/hooks/use-attendance.ts`,
`use-children.ts`, `use-center.ts`, `use-classrooms.ts`, `use-finance.ts`, `use-guardians.ts`,
`use-members.ts`, `use-overview.ts`, `use-phase5.ts`, `use-auth-status.ts`,
`use-guidance-progress.ts`), with the same test gap noted generally: *"Query tests mock with
shape-correct fixtures; no negative-shape tests."*

**Timezone tests that run in the CI runner's own zone.** [P0-005] found ten call sites using
`new Date(iso).toLocaleTimeString(...)` with no explicit `timeZone` option, meaning date and time
display used whatever zone the browser (or, in tests, the Node/jsdom process) happened to be running
in, not the childcare center's configured zone. A date-only DOB string parsed as UTC midnight and
rendered as the previous day in negative-UTC zones. Test gap, quoted directly: *"Existing tests run
in the system zone of the CI runner; no zone-shift assertions."*

**A caveat on that last one, because it's checkable and worth checking rather than just repeated:**
spot-checking the current tree against the audit's own file list shows this finding no longer holds
for every listed file. `apps/web/src/lib/format-date.ts` exists, accepts an explicit
`centerTimezone` parameter, and its test file (`format-date.test.ts`) includes cases like *"respects
the explicit centerTimezone over browser zone"* and *"renders a different time when zone changes"*.
These are tests that do pass an explicit non-default zone and assert the output differs, exactly
what the audit said was missing. `violation-card.tsx`, one of the ten files the audit named, now imports
`formatDateTime` from that module instead of calling `toLocaleTimeString` directly. Similarly,
[P0-006] (audit-log route missing an explicit role gate matching "Director/Owner only") has a test
in the current `audit-log.test.ts` named `"belt-and-suspenders: blocks staff even if
requirePermission were permissive (P0-006)"` that references the finding by its audit ID directly.
Both are concrete evidence that at least some P0 findings were acted on after 2026-05-28 and before
the 2026-06-11 decommission. What this does **not** mean: that the remaining ~45 findings in the
same document were also fixed. They were not individually re-verified for this snapshot, and the
audit document itself was left as-is rather than edited to reflect partial remediation, because
editing someone else's dated audit after the fact to mark items "fixed" without re-running the
suite would be a bigger claim than this snapshot can support.

**The suite was never run as part of building this snapshot.** 7,818 is a count of test cases
present in the source, not a report that they pass. No `pnpm
test` was executed against this tree while writing these portfolio documents, no coverage report
was generated, and no claim is made here (implicit or explicit) about the suite's current pass
rate. An earlier, narrower audit
([`docs/audit/test-coverage-inventory.md`](../docs/audit/test-coverage-inventory.md), dated
2026-05-27) does record a `pnpm test -- --run` pass at 414 test files / "2,556+" tests, but that
predates 66 of the current 480 test files and is not evidence about the suite in its current form.

One narrow exception, added later: the 8,959 runtime case count cited above and in
[METRICS.md](./METRICS.md#counting-test-cases) came from running the suite once, specifically to
correct the size of the static/runtime gap. That run reported per-file pass/fail counts as a
side effect of the JSON reporter, but this document still makes no claim about pass rate: a single
run on one machine at one point in time isn't sufficient evidence for a claim like that, and doesn't
change the point above: the 480-file, 7,818-case snapshot figures were not built from a test run.
