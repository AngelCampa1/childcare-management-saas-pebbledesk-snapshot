# Metrics

Every number quoted anywhere in this repository, with the command that produces it. Run these from
the repository root. Where a number describes the *source* repository rather than this export, it
comes from [`../docs/source-history.json`](../docs/source-history.json) and is marked as such.

All figures were measured on 2026-08-13 against the exported tree at commit `78c08934`.

## A note on counting on Windows

Several of these commands sum line counts across more than one `xargs` batch. On Windows, argument
lists are short enough that `git ls-files | xargs wc -l` runs `wc` several times and prints several
`total` lines, so the common idiom `| tail -1` silently reports only the **last batch**. Every
command below sums the totals explicitly:

```bash
... | xargs wc -l | grep -E 'total$' | awk '{s+=$1} END {print s}'
```

An early draft of this document used `tail -1` and understated the test suite by a factor of thirty
before the discrepancy was caught against an independent count. If you reproduce these numbers and
get something much smaller, that is the reason.

---

## Size

| Number | Value | Command |
|---|---:|---|
| Tracked files in this export | 1,794 | `git ls-files \| wc -l` |
| Application source lines (`.ts`, `.tsx`, `.astro`, excluding tests) | 88,514 | `git ls-files \| grep -E '\.(ts\|tsx\|astro)$' \| grep -vE '\.test\.' \| xargs wc -l \| grep -E 'total$' \| awk '{s+=$1} END {print s}'` |
| Application source files | 551 | `git ls-files \| grep -E '\.(ts\|tsx\|astro)$' \| grep -vE '\.test\.' \| wc -l` |
| Test lines | 168,704 | `git ls-files \| grep -E '\.test\.(ts\|tsx)$' \| xargs wc -l \| grep -E 'total$' \| awk '{s+=$1} END {print s}'` |
| Test files | 480 | `git ls-files \| grep -cE '\.test\.(ts\|tsx)$'` |
| Test cases | 7,818 | see [Counting test cases](#counting-test-cases) below |
| Images | 132 | `git ls-files \| grep -Eic '\.(png\|jpe?g\|svg\|webp)$'` |

The "Tracked files" row is regenerated at staging time (the step that commits this snapshot's own
tree on top of the exported source), so it can be off by a small number from the count above until
that step runs.

The test-to-source ratio is roughly 1.9:1 by line count. See [TESTING.md](./TESTING.md) for what
that does and does not buy, including the parts of the suite the project's own audit found weak.

**7,818 is a count of test cases present in the tree, not a count of passing tests.** The suite was
not executed while building this snapshot, and no claim is made here about its pass rate.

### Counting test cases

The obvious command is wrong, and it is worth showing why, because it inflates the headline number
by several hundred:

```bash
# Overcounts. Reports 8,172.
git ls-files | grep -E '\.test\.(ts|tsx)$' | xargs grep -h -c 'it(' | awk '{s+=$1} END {print s}'
```

Two separate errors. `grep -c` counts *matching lines*, not occurrences, so two `it(` blocks on one
line count once. More importantly `it(` is an unanchored substring, so it also matches `submit(`,
`commit(`, `await(`, `edit(`, `omit(`, `split(` and `visit(`: 252 such calls exist in the test
files. The two errors push in opposite directions and do not cancel.

The command behind 7,818 requires a word boundary before `it` and allows Vitest's modifiers:

```bash
git ls-files | grep -E '\.test\.(ts|tsx)$' \
  | xargs grep -hoE '(^|[[:space:];{}])it(\.(only|skip|todo|concurrent))?(\.each\([^)]*\))?\(' \
  | wc -l
```

A plain `\bit\(` gives 7,805; the difference is 38 `it.each(...)` blocks, which the stricter pattern
picks up and the plain one misses.

7,818 undercounts real assertions, and not by a little: one `it.each` block with a table of ten rows
runs as ten cases at runtime, and this suite has enough of them that the gap compounds. To check the
real size of that gap (not to establish a pass rate), the full suite was run once, per workspace,
with Vitest's JSON reporter (`pnpm exec vitest run --reporter=json` against each of the 9
`vitest.config.ts` files, summing `numTotalTests`), and reported **8,959** cases across the same 480
test files: 1,141 more than the static count, a 14.6% gap. That run confirms the magnitude only; no
claim is made anywhere in this repository about the suite's pass/fail rate. 7,818 remains the honest
static number (test cases written, not test cases executed), it just meaningfully undercounts what
runs, rather than slightly.

## Data model

| Number | Value | Command |
|---|---:|---|
| Tables | 44 | `grep -rhoE '= pgTable\(' packages/db/src/schema/ \| wc -l` |
| Migrations | 68 | `git ls-files 'packages/db/drizzle/*.sql' \| wc -l` |
| GiST exclusion constraints | 2 | `grep -rl 'EXCLUDE USING' packages/db/drizzle/` |

The two exclusion constraints are the subject of [CONCURRENCY.md](./CONCURRENCY.md).

## Surface area

| Number | Value | Command |
|---|---:|---|
| API route modules | 34 | `git ls-files 'apps/api/src/routes/*.ts' \| grep -vE '\.test\.' \| wc -l` |
| Route files under `apps/site/src/pages/` | 40 | `git ls-files 'apps/site/src/pages/*' \| wc -l` |
| Of those, `.astro` marketing pages | 31 | `find apps/site/src/pages -type f -name '*.astro' \| wc -l` |
| Of those, `.ts` data/API endpoints | 9 | `find apps/site/src/pages -type f -name '*.ts' \| wc -l` |
| Workspace packages | 6 | `ls packages/` |

The 40-file count was previously labeled "Astro pages on the marketing site," which overstated it: 9 of
the 40 are `.ts` route handlers, not Astro pages: `llms.txt.ts`, `llms-full.txt.ts`, `pricing.txt.ts`,
`rss.xml.ts`, and five `ai/*.json.ts` endpoints. Only 31 render as marketing pages.

## Compliance model

| Number | Value | Command |
|---|---:|---|
| Staff-to-child ratio rules | 18 | 3 states × 6 age groups in `packages/shared/src/constants/state-ratios.ts` |
| Occurrences of `citation` in the ratio table | 20 | `grep -c 'citation' packages/shared/src/constants/state-ratios.ts` |
| Test cases for the ratio table | 31 | the strict pattern above, over `state-ratios.test.ts` |
| Test cases for subsidy claims | 47 | the strict pattern above, over `subsidy-claims.test.ts` |

The `citation` count is 20 rather than 18 because the type definition and one comment also contain
the word. The 18 is the product of the table's own dimensions, which is why it has no one-line
command: read the table.

## Key files

| File | Lines | Command |
|---|---:|---|
| `packages/db/drizzle/0067_subsidy_claim_no_overlap.sql` | 53 | `wc -l <file>` |
| `packages/db/drizzle/0066_shifts_no_overlap.sql` | 55 | `wc -l <file>` |
| `apps/api/src/routes/subsidy-claims.ts` | 548 | `wc -l <file>` |
| `apps/api/src/routes/subsidy-claims.test.ts` | 1,806 | `wc -l <file>` |
| `apps/api/src/services/quickbooks.ts` | 2,830 | `wc -l <file>` |
| `docs/audit/cycle-1-defects.md` | n/a | the 47-defect inventory behind [ENGINEERING-LOG.md](./ENGINEERING-LOG.md) |

`quickbooks.ts` is listed because it is the largest single source file in the repository:

```bash
git ls-files | grep -E '\.(ts|tsx)$' | grep -vE '\.test\.' \
  | xargs wc -l | sort -rn | grep -v total | head -5
```

## Source repository history

These describe the private repository this was exported from, **not this export**, which has one
commit. They are recorded in [`../docs/source-history.json`](../docs/source-history.json) and were
produced by `git` in the source repository at export time.

| Number | Value | Command (run in the source repository) |
|---|---:|---|
| Commits | 1,443 | `git rev-list --count HEAD` |
| First commit | 2026-04-07 | `git log --format=%ad --date=short \| tail -1` |
| Last commit | 2026-07-08 | `git log --format=%ad --date=short \| head -1` |
| Source commit exported | `78c0893472ad45eb25b1dc1bd4bc77a2c6ad8a84` | `git rev-parse HEAD` |
| Distinct author identities | 2 | `git shortlog -sne HEAD`, normalized by email |

The author breakdown is 1,404 commits from one human account and 39 from an agent account
(`ai.alex@`). The normalization matters: `git shortlog -sne` reports four rows, because the same
person committed under three display names across different machines. Grouped by display name it
would read as a four-person team, which is why `source-history.json` groups by email instead.

Development ran from 2026-04-07 to 2026-07-08, and the product was decommissioned on 2026-06-11:
the last month of commits is post-shutdown work: the decommissioning record itself, the deploy
guardrails, and the audit documents. See [DECOMMISSIONING.md](./DECOMMISSIONING.md).

## Re-verifying the whole table at once

Paste this into a shell at the repository root. It prints the size and data-model figures in one
pass, so a reader can check the headline numbers without working through the table row by row.

```bash
#!/usr/bin/env bash
set -euo pipefail

sum_lines() { xargs wc -l | grep -E 'total$' | awk '{s+=$1} END {print s+0}'; }

src=$(git ls-files | grep -E '\.(ts|tsx|astro)$' | grep -vE '\.test\.')
tests=$(git ls-files | grep -E '\.test\.(ts|tsx)$')

printf 'tracked files      %s\n' "$(git ls-files | wc -l)"
printf 'source files       %s\n' "$(echo "$src"   | grep -c .)"
printf 'source lines       %s\n' "$(echo "$src"   | sum_lines)"
printf 'test files         %s\n' "$(echo "$tests" | grep -c .)"
printf 'test lines         %s\n' "$(echo "$tests" | sum_lines)"
printf 'test cases         %s\n' "$(echo "$tests" | xargs grep -hoE '(^|[[:space:];{}])it(\.(only|skip|todo|concurrent))?(\.each\([^)]*\))?\(' | wc -l)"
printf 'tables             %s\n' "$(grep -rhoE '= pgTable\(' packages/db/src/schema/ | wc -l)"
printf 'migrations         %s\n' "$(git ls-files 'packages/db/drizzle/*.sql' | wc -l)"
printf 'api route modules  %s\n' "$(git ls-files 'apps/api/src/routes/*.ts' | grep -vE '\.test\.' | wc -l)"
printf 'images             %s\n' "$(git ls-files | grep -Eic '\.(png|jpe?g|svg|webp)$')"
```

Expected output on the exported tree:

```text
tracked files      1794
source files       551
source lines       88514
test files         480
test lines         168704
test cases         7818
tables             44
migrations         68
api route modules  34
images             132
```

`tracked files` counts the eight files this snapshot adds on top of the tree exported from the
source repository: the seven documents in `portfolio/`, plus `docs/source-history.json`, which the
exporter writes. Like the row above, this number is regenerated at staging time and can be off by
a small number from `1794` until that commit runs.

## Where these numbers stop

**Test coverage percentage.** The repository's `CLAUDE.md` mandates 95% per-file coverage, but no
coverage report is committed and the suite was not run to produce one. Quoting the mandate as
though it were a measurement would be a fabricated metric.

**Lighthouse or Core Web Vitals scores for the marketing site.** The site is not deployed; any
score produced now would describe a local build, not what was served.
