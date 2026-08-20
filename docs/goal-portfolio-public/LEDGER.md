# Goal: PebbleDesk portfolio snapshot ready for public release

> Turn the private PebbleDesk working repository into a public-facing engineering record:
> a single-commit export whose every claim is checkable from the tree, every link resolves,
> every image is worth showing, and a root-level `portfolio/` directory a reviewer finds in
> the first five seconds.
>
> The audience is a skeptical senior engineer who gives the page ninety seconds and is
> allergic to inflated claims. The product is dead; the writing says so plainly rather than
> working around it.
>
> **This track does not make the repository public.** Visibility is the owner's decision and
> the owner's action.

## Method

1. Build a reproducible exporter rather than copying files by hand, so the export can be
   rebuilt from the source commit and re-verified.
2. Export the tracked tree at one commit, then assert the result matches the source tree
   file-for-file before committing anything.
3. Read the source for a genuinely hard engineering idea worth putting above the fold.
   Reject feature lists.
4. Verify every number personally with a command before it enters a document. Re-derive
   anything handed over second-hand.
5. Judge candidate images by opening them, not by filename.
6. Write `portfolio/` as retrospective, reader-addressed documents; leave prospective
   working documents (plans, audits, specs) in `docs/` where they belong.
7. Re-check every relative link mechanically before commit.

## Cycle log

### Cycle 0 — 2026-08-13 — Source recon

- Confirmed the source working tree clean and on its default branch before any export, so
  the recorded source commit is an honest description of what shipped.
- Measured the tree directly rather than trusting the brief: commit count, date range,
  file count, and image count all differed from the figures handed over. Used the measured
  values throughout. The brief's line-count figure was low by roughly an order of magnitude
  and was discarded.
- Inventoried candidate documentation. `docs/audit/cycle-1-defects.md` (a self-produced
  47-defect inventory) and `docs/decommissioning/2026-06-11-pebbledesk-shutdown.md` stood
  out as unusually good raw material.

### Cycle 1 — 2026-08-13 — Exporter

- Built the exporter on the existing pipeline pattern: refuse a dirty tree or an unexpected
  branch, record the source repository's real history into `docs/source-history.json`,
  export through a tar file so binaries survive, and diff `ls-tree` against `ls-files`
  before committing so a silently truncated export fails loudly instead of shipping.
- Kept the exporter outside the published tree, matching the established convention that
  the build script is not part of its own output.
- Added assertions that run before the commit, not after, so a failure produces no artifact.

### Cycle 2 — 2026-08-13 — The hook

- Chose the subsidy-claim overlap constraint as the above-the-fold idea: a time-of-check /
  time-of-use race that no application-level check can close, solved with a Postgres GiST
  exclusion constraint, including the `IMMUTABLE` workaround the obvious implementation
  forces and the driver-error unwrapping needed to turn the violation back into a clean
  `409`. Concrete, checkable, and not a feature.
- Verified the supporting claim about the product's "audit-ready" name before writing about
  it. The audit log is real and genuinely centralized; it is not tamper-evident. Said so.

### Cycle 3 — 2026-08-13 — Images

- Opened candidates rather than trusting filenames. Rejected the dashboard and ratio
  captures that show a zeroed center, the ratio-history capture that is an empty state, and
  the higher-resolution app captures whose headers are stamped with E2E run identifiers.
- Selected a ratio-dashboard capture that shows the compliance rule, the live-polling
  label, and a healthy three-state counter row against synthetic data.

### Cycle 4 — 2026-08-13 — Documents

- Wrote seven `portfolio/` documents plus a rewritten README and a LICENSE consistent with
  the README's source-available claim.
- Placed the shutdown record's retrospective in `portfolio/DECOMMISSIONING.md` and left the
  original dated record untouched in `docs/decommissioning/`. The raw record is the
  primary artifact; the portfolio document frames it and links to it.
- Delegated four documents to sub-agents with explicit instructions to invent nothing, then
  re-verified their numeric and `file:line` claims against the tree. Two errors found and
  corrected (see registry).

### Cycle 5 — 2026-08-13 — Verification

- Checked all 74 relative links mechanically; zero broken.
- Re-ran the metrics script published in `portfolio/METRICS.md` and confirmed it reproduces
  the documented figures exactly, so a reader can check the headline numbers in one paste.
- Confirmed the source repository was left untouched: clean tree, unchanged HEAD, unchanged
  branch.

## Findings registry

`P0` = broken or blocking · `P1` = looks bad or confusing · `P2` = polish
`RETRACTED` = recorded, then disproved on re-verification. Retractions stay in the log.

- **RETRACTED — the test-case count was 8,172.** That figure came from
  `grep -c 'it(' | awk` summed across test files, and it is wrong twice over. `grep -c`
  counts *matching lines*, not occurrences, so two test declarations on one line count once.
  More importantly `it(` is an unanchored substring, so it also matches `submit(`,
  `commit(`, `await(`, `edit(`, `omit(`, `split(` and `visit(` — 252 such calls exist in
  these files. The two errors push in opposite directions and do not cancel. Re-counted with
  a word-anchored pattern that also recognises Vitest's `it.each` form: **7,818**. Corrected
  in the README and in every portfolio document that cited it.
  `portfolio/METRICS.md` now publishes both the wrong command and the reasoning, because the
  failure mode is more instructive than the number.
- **RETRACTED — "`requireCenter` and `requireRole` line references are swapped."** Recorded
  against `portfolio/ARCHITECTURE.md`, then disproved. The original text was correct; the
  error was in how the verification output was read — a `sed` range prints in file order, not
  argument order, which inverted the apparent positions. The "fix" was itself the defect and
  was reverted. Re-verified with `grep -n` on the export declarations, which is unambiguous.
- **P0 FIXED — line counts understated by roughly thirty times.** `xargs wc -l | tail -1`
  reports only the *last* `xargs` batch, and on Windows the argument limit splits these file
  lists into several batches. Every affected figure was re-derived by summing all `total`
  lines. `portfolio/METRICS.md` documents the trap up front, since anyone reproducing the
  numbers will otherwise hit it and conclude the document is inflated.
- **P0 FIXED — an unverifiable claim about customers.** A draft README asserted the product
  never had a paying customer. Nothing in the tree establishes that in either direction, and
  the source of the belief was outside the repository. Removed and replaced with an explicit
  statement that the repository does not record it — the one claim on the page that could
  not have been checked by a reader.
- **P1 FIXED — a self-audit described as unfixed.** A draft README framed the 47-defect
  inventory as "published rather than quietly fixed", implying the shipped product still
  carried them. Verified in the tree that the defects were in fact remediated. Re-framed:
  the inventory was kept after the work was done, so both the as-found and as-shipped states
  are readable. The accurate version is the better story.
- **P1 FIXED — a cited test file was 5,692 lines, not "4,200+".** A sub-agent's figure was
  imprecise in the safe direction but still wrong. Replaced with the measured value.
- **P1 FIXED — image count conflated with screenshot count.** The README described the
  repository's 132 images as though all were screenshots. 106 are; the remainder are
  marketing and lead-magnet assets. Both figures corrected to their real subjects.
- **P1 FIXED — a shutdown finding undercounted its own subject.** `DECOMMISSIONING.md`
  summarised the external systems that could not be confirmed clean as "four", conflating
  four *failure modes* with the seven systems they cover. Corrected to name all seven.
  Undercounting unresolved items in a document whose entire value is candour is the worst
  place to be loose.
- **P1 FIXED — author records read as a four-person team.** The exported history grouped
  commits by display name, and the same person committed under three names across machines.
  Grouped by email instead, which is the identity that is actually stable. The two remaining
  identities are one human and one agent account, which the README states plainly.
- **P2 FIXED — workspace package list was incomplete.** The README's repository map and the
  metrics table both listed five packages; there are six. Corrected in both.
- **P2 FIXED — broken inline-code spans in two agent-instruction files.** `CLAUDE.md` and
  `AGENTS.md` each rendered several empty `` `` `` spans mid-sentence, leaving instructions
  that read as truncated. Repaired so each names the repository it refers to.
- **P2 — committed tooling output remains in `docs/`.** Some documents under `docs/audit/`
  are raw generated output rather than written material. They are legitimate working
  records and are left in place, but they are not portfolio material and are not linked
  from the README.

### Cycle 6 — 2026-08-14 — Content reviewer fixes

- **P1 FIXED — a WeakMap citation pointed at the wrong location.** `portfolio/ARCHITECTURE.md`
  said the check cached by `assertProductionDbDriver` used "the same `WeakMap`-on-env-object
  pattern used for env validation (`apps/api/src/middleware/auth.ts:40-52`)". That location is
  the production-driver assertion's own cache (`asserted`, confirmed against
  `apps/api/src/middleware/auth.ts:40-52` and `88-89`), not the env-validation cache — that's
  `envValidatedMap` at `apps/api/src/index.ts:77`, used at `index.ts:83-90`. The document's own
  "What Cloudflare Workers forced" section already cited both correctly. Repointed the citation
  to `index.ts:77` rather than relabeling the paragraph, since the paragraph's subject (the
  production-driver check) was already correctly described — only the "used for env validation"
  citation was wrong.
- **P2 FIXED — "slightly undercounts" understated a 14.6% gap.** `portfolio/METRICS.md` and
  `portfolio/TESTING.md` described the 7,818 static test-case count as "slightly" undercounting
  the runtime total because of `it.each` expansion. Re-ran the suite myself — 9 `vitest run
  --reporter=json` invocations, one per workspace config, summing `numTotalTests` — and got
  **8,959** cases across 480 files, matching the file count in the README exactly. That's 1,141
  more cases, a 14.6% gap, not "slight." Kept 7,818 as the documented static figure (it remains
  correct and reproducible) and rewrote the surrounding prose in both files to state the real
  magnitude, while being explicit that the verification run established case-count magnitude
  only and makes no claim about pass/fail rate.
- **P2 FIXED — a local absolute path in git-bash notation.**
  `docs/audit/test-coverage-inventory.md:231` read as an absolute path into a local sibling directory
  — an author-machine path naming a local sibling directory not part of this snapshot. The file
  describes itself (confirmed against its own closing line, "Report saved to
  docs/audit/test-coverage-inventory.md"), so rewrote it repo-relative. Swept the repo for the
  same notation class (`/mnt/[cd]/[Uu]sers/...`, `/[cC]/[Uu]sers/...`,
  `/[dD]/code/...`) via ripgrep: 1 match before, 0 after.
- **P2 FIXED — the author's real username in four `packages/shared` test fixtures.**
  `url-safety.test.ts:30`, `public-knowledge.test.ts:292/320/322/418`, and
  `generate-public-knowledge.test.ts:284/290` used `/Users/Angel/...`-style paths as sample
  input. Checked the production code being tested
  (`isFilesystemLikePublicKnowledgePath`, `validatePublicKnowledgeSourceUrl`,
  `assertPublicKnowledgeArtifactSafe`) — detection is by generic path shape (`users`, `home`,
  `c:` segments), not by matching the literal username, so the value is arbitrary sample data,
  not load-bearing. Renamed `Angel` → `dev` in all 5 occurrences across 3 files. Ran the 3
  affected test files: 36/36 passed.

### Cycle 7 — 2026-08-18 — Reviewer findings: screenshot grid, security pointer, Contents headings, labeling

- **P1 FIXED — `marketing-home.png` paired against `settings.png` at mismatched height.** The
  screenshot was a full-page capture, 1440×9024, rendered at the same column width as ten
  1440×1000 / 1536×774 app screens. Opened the image: after "Licensed centers get squeezed by
  compliance work that never stays still." there is a genuinely blank ~560px band (roughly
  y=1408–1972 of the original, sampled pixel-uniform cream background, no invisible text) before
  the next line of copy. Traced it to `packages/marketing/src/components/problem-agitation.astro`
  — the pain-points `<ul>` between the heading and the closing line rendered with zero `<li>`
  items at capture time, but its `border-y` and section padding still rendered, producing the
  empty band. Confirmed the same band exists byte-for-byte in the original raw capture,
  `docs/qa/screenshots/2026-04-23-live-e2e/01-marketing-desktop.png` (and its duplicate in
  `2026-04-23-prod-bug-hunt/`), so this is a real product-side rendering gap from capture time, not
  something introduced by curation. Cropped `portfolio/screenshots/marketing-home.png` to
  1440×1128 — hero through the three value-proposition cards, ending at the section's own
  background-color boundary — which sits entirely above the blank band and removes it from the
  curated image. Rewrote the image's alt text and caption to describe the new crop instead of the
  content (pricing grid, FAQ) that no longer appears in it, and pointed the caption at the raw
  full-page capture for a reader who wants the whole page.
- **P1 FIXED — checked every row in the screenshot grid, found a second mismatched pair.**
  `audit-log.png` (1440×1000) was paired with `messages.png` (1536×774, a ~38% height difference
  at equal column width) — a smaller version of the same defect. Regrouped the ten app screenshots
  by their actual capture aspect ratio (six at 1440×1000, three at 1536×774) so every two-column
  row now pairs same-ratio images: dashboard+children, attendance+scheduling, billing+subsidies,
  audit-log+settings. `messages.png` has no same-ratio partner left over (three is an odd count),
  so it now runs full-width (`colspan="2"`) rather than force a fifth mismatched pair; the cropped
  `marketing-home.png` runs full-width beneath it for the same reason. Added `valign="top"` to
  every cell in the grid, paired and full-width alike.
- **P1 FIXED — no pointer to the security/privacy document.** PebbleDesk stores children's medical
  notes, allergies, dates of birth and guardian contact details and runs Stripe billing, which
  requires a `SECURITY.md` or named equivalent under the standard's §2.4. The content already
  exists in `portfolio/COMPLIANCE-MODEL.md` (confirmed: it names `allergies`, `dateofbirth`,
  `medicalnotes`, `guardianname`, `guardianphone` directly in its redaction-rules section) but
  nothing pointed a security-scanning reader at it. Did not create a stub `SECURITY.md`. Instead
  labeled the `portfolio/README.md` index row for `COMPLIANCE-MODEL.md` as "this repository's
  security-and-privacy document" and added a sentence to the root README's `## Documentation`
  section naming it the same way, with the specific PII categories it covers.
- **P2 FIXED — missing `## Contents` heading on three docs over 250 lines.** `COMPLIANCE-MODEL.md`,
  `CONCURRENCY.md` and `ENGINEERING-LOG.md` each opened with a bare bullet link list and no
  heading above it, which the standard requires past 250 lines. Added `## Contents` above each
  list; did not otherwise touch the lists or the mermaid diagram in `COMPLIANCE-MODEL.md`
  (re-verified zero orphan nodes after editing — the fix stands).
- **P2 FIXED — "40 Astro marketing pages" overstated what the count actually measures.** The
  disclosed command (`git ls-files 'apps/site/src/pages/*' | wc -l`) counts 40 top-level route
  files, but 9 are `.ts` data/API endpoints (`llms.txt.ts`, `llms-full.txt.ts`, `pricing.txt.ts`,
  `rss.xml.ts`, five `ai/*.json.ts`), not Astro pages — verified with
  `find apps/site/src/pages -type f -name '*.astro' | wc -l` (31) and the equivalent for `.ts` (9),
  31 + 9 = 40. Relabeled every occurrence (`README.md`'s prose, its numbers table, its repository
  map, the screenshot caption, and `portfolio/METRICS.md`'s surface-area table) to state the split
  rather than the flat "40 Astro pages."
- **P2 — 1,794 vs 1,795 tracked files is expected staleness, not fixed.** Per instruction, did not
  touch the number and did not run git. Added one sentence each to `portfolio/METRICS.md`'s Size
  table and its "Re-verifying" section disclosing that the tracked-files figure is regenerated at
  staging time and can be off by a small number until that commit runs.
- Recomputed every length in `portfolio/README.md`'s index with `wc -l` after all edits above
  landed: `CONCURRENCY.md` 312→314, `COMPLIANCE-MODEL.md` 295→297, `ENGINEERING-LOG.md` 276→278,
  `METRICS.md` 208→219 lines. `ARCHITECTURE.md`, `TESTING.md` and `DECOMMISSIONING.md` were
  untouched this cycle and keep their published lengths.
- Wrote a small script-based link/anchor checker (GitHub slug rules: strip backticks and
  asterisks, drop non-word/non-space/non-hyphen characters, replace each individual space with a
  hyphen without collapsing runs) and ran it against the root `README.md` and every file in
  `portfolio/`. Two apparent failures on the first pass were checker bugs, not real breaks — the
  first version of the slugifier also stripped underscores (`center_id` anchors) and collapsed
  double spaces from a removed em dash into a single hyphen instead of two. Fixed the checker;
  final pass reports zero broken links and zero broken anchors across all nine files.

### Settled, not findings — do not re-raise

- `.claude/`, `CLAUDE.md`, `AGENTS.md`, `.impeccable.md` and the committed agent skills.
  The owner builds with AI openly and does not hide it. These are deliberate and were
  carried across intact.
- Screenshots whose headers carry E2E run identifiers. They are honest evidence of how the
  captures were produced. They are unsuitable as a *hero* image and were not used as one,
  but they are not a defect.
- The audit log's lack of tamper-evidence. This is a real limitation of the product, not a
  defect in the snapshot. It is documented in `portfolio/COMPLIANCE-MODEL.md` rather than
  written around.

### Cycle 8 — 2026-08-18 — Corpus-wide index column order (`PORTFOLIO-STANDARD.md` §2.5)

- The cross-repo standard fixed `portfolio/README.md`'s index table column order as link,
  length, summary — length second, not last, because a 375px viewport pushes the rightmost
  column off-screen first. This repo's table had `Document | What is in it | Length`, length
  last.
- Reordered to `Document | Length | What is in it`; all seven rows and the alignment row
  updated, cell content unchanged.
- Recomputed every length cell against `wc -l` after the edit: all seven rows still match
  exactly, since the edit only moved columns.
- Ran a relative-link and `#anchor` resolution sweep over `README.md` and every
  `portfolio/*.md` file: all resolve, nothing else touched this cycle.
