# Getting Badges Review Notes

Last updated: 2026-05-15

## Source Verification Pass

Verified sources:

- SaaSHub submit page: https://www.saashub.com/services/submit
- AlternativeTo browse taxonomy: https://alternativeto.net/browse/
- AlternativeTo public app listing examples: https://alternativeto.net/
- Product Hunt launch guide: https://www.producthunt.com/launch
- Product Hunt preparation checklist: https://www.producthunt.com/launch/preparing-for-launch
- G2 research FAQ: https://research.g2.com/methodology/research-faq
- G2 product information docs: https://documentation.g2.com/g2/docs/product-information
- G2 screenshot docs: https://documentation.g2.com/docs/screenshots
- G2 help center entry point: https://documentation.g2.com/help/en
- G2 badge docs: https://documentation.g2.com/docs/g2-badges
- BetaList guidelines: https://betalist.com/criteria
- BetaList submission terms: https://betalist.com/terms/submissions
- BetaList support FAQ: https://betalist.com/support

Source verification findings:

- SaaSHub accepts released SaaS/software products and asks for categories,
  competitors, product URL, and domain-email verification.
- AlternativeTo public pages verify the listing taxonomy but do not expose the whole
  add-app form without login.
- Product Hunt has strict copy and asset limits that should be prepared before launch.
- G2 is B2B-only and can reject alpha/beta products, duplicate listings, inaccessible
  websites, and weak category evidence.
- BetaList is conditional because it is built around pre-launch and recently launched
  startups.

## Repo Positioning Pass

Repo sources checked:

- `apps/site/src/config/site.ts`
- `apps/site/src/pages/index.astro`
- `apps/site/src/pages/pricing.astro`
- `apps/site/src/pages/about.astro`
- `packages/shared/src/constants/offering.ts`
- `packages/shared/src/public-knowledge/data.ts`
- `.impeccable.md`
- `README.md`
- `apps/site/public/`
- `apps/site/src/assets/`

Repo-derived facts used:

- PebbleDesk is "The Audit-Ready Childcare Platform."
- Product category is childcare center administration software.
- Target audience is licensed childcare centers, family childcare homes, and multi-site
  childcare operators.
- Core product workflows include attendance, ratios, subsidy billing, invoices, family
  records, reports, and audit exports.
- Self-serve trial details and published pricing come from
  `packages/shared/src/constants/billing.ts`, `packages/shared/src/constants/offering.ts`,
  and the generated public file at `apps/site/public/pricing.md`. Directory
  submissions should copy current limited-offer prices only from that generated file.
- The product is online-only in V1.
- Current public materials reference Brightwheel and Procare migration presets.
- Public competitor summaries include Brightwheel, Procare, Lillio, Playground, and
  Kangarootime.
- Existing SVG logo assets and `og-default.png` are usable as sources, but the only
  public PNG logo found is `logo-email.png` at 32x32 and should not be used as a
  directory upload logo.

## Humanizer Pass

Checks applied:

- Removed hype words and superlatives.
- Avoided em dashes.
- Avoided generic SaaS phrases such as "seamless workflows" and "revolutionary."
- Used childcare-specific language: ratios, subsidy billing, attendance, licensing,
  audit exports, family records, center directors.
- Kept Product Hunt copy personal and feedback-oriented.
- Varied the first sentence of each platform description.
- Avoided unsupported customer counts, review claims, ranking claims, and badge claims.

Result:

- Copy is plain, concrete, and ready to paste after asset gaps are resolved.

## Compliance And Claim-Safety Pass

Checks applied:

- No live directory badges are claimed.
- No AI positioning is used.
- No offline support is claimed.
- No state-specific support is overstated.
- No real child, guardian, staff, center, or billing data is requested for screenshots.
- Product Hunt outreach asks for feedback, not upvotes.
- G2 beta-stage risk is called out explicitly.
- BetaList timing risk is called out explicitly.

Result:

- Copy is claim-safe against the public site facts available in the repo.

## Spec Review

Status: Completed, findings fixed.

Reviewer findings:

- P1: Missing explicit docs-only and no-deploy expectation. Fixed in `README.md`
  with an Execution Notes section.
- P2: Review notes still showed pending review status. Fixed by recording actual
  review outcomes here.
- No other spec issues found. The reviewer confirmed all six files exist, all five
  platforms are covered, source links are recorded, readiness gaps and acceptance risks
  are explicit, no live submission is implied, paid upgrades are not assumed, G2 beta
  risk is called out, and the AlternativeTo logged-in-form caveat is present.

## Code And Content Review

Status: Completed, findings fixed.

Reviewer findings:

- Medium: G2 badge guidance was too generic. Fixed in `README.md` and
  `requirements-matrix.md` by clarifying Users Love Us, Grid, report, and badge
  access constraints.
- Medium: G2 paste-ready copy listed screenshot titles without descriptions. The
  first fix was incomplete; the final review found this again, and the completed fix
  now adds descriptions for every G2 screenshot in `submission-copy.md`.
- Low: Future-review wording conflicted with ready-to-paste language. Fixed by
  recording actual review outcomes here.
- Reviewer found no em dashes, no major generic AI tone, no duplicated opening
  sentences, no missing core asset requirements, and no unsupported PebbleDesk product
  claims. The CSV parsed cleanly with 9 headers and 9 fields per row before the later
  tracker expansion.

## Final Reviewer Signoff

Status: Completed, findings fixed.

Final review findings:

- P1: G2 screenshot descriptions were still missing from the paste-ready G2 copy.
  Fixed in `submission-copy.md` by adding descriptions to every G2 screenshot title.
- P2: Final review notes still had a pending signoff state. Fixed by recording the
  final review findings and fix status here.
- Final re-review P2: This section still used future-review wording. Fixed by recording
  the actual re-review outcome here.

## Second Review Cycle

Status: Multiple review agents completed, findings fixed.

Review agents:

- Source and requirements review.
- Copy and claim-safety review.
- Operational usability review.
- Docs quality and repo hygiene review.

Findings fixed:

- G2 submission URL was stale. Replaced the old `g2.com/products/new` path with the
  current G2 help-center entry point and documented the 410 finding.
- BetaList priority guidance was under-specified. Clarified standard submission first,
  with priority only if offered after intake and timing matters.
- Source traceability was weak. Added per-platform source URLs directly in
  `requirements-matrix.md`.
- G2 badge source used a locale-specific URL. Replaced it with the non-locale G2 badge
  documentation URL.
- AlternativeTo was framed too strongly as verified. Reframed it as public taxonomy
  evidence plus a logged-in form-check blocker.
- The package overstated full submission readiness while assets were missing. Added
  a submission-readiness section that separates copy-ready work from asset and stage
  blockers.
- Several fields were conditional. Added default field choices and explicit pause
  points where the live form must decide.
- The tracker was too thin. Expanded it with account readiness, duplicate checks,
  blocker status, asset files, next action, rejection reason, and badge criteria.
- Sequencing was unsafe for launch-sensitive surfaces. Reordered the runbook so
  readiness checks happen first, launch-sensitive Product Hunt and BetaList are not
  buried behind G2, and G2 waits for generally available positioning.
- Badge outcomes were undefined outside G2. Added tracker status guidance for listing,
  backlink, and badge outcomes by platform.
- Asset QA lacked a safe capture workflow. Added a screenshot capture and second-review
  process for demo data.
- Review history had inconsistent wording and long review-log lines. Rewrote this
  section to make the review cycle accurate and easier to scan.

## Second Final Re-Review

Status: Completed, findings fixed.

Findings fixed:

- The asset workflow asked for reviewer and approval date in the tracker, but the
  tracker had no matching columns. Added `asset_reviewer` and `asset_approval_date`.
- Product Hunt tag fallback conflicted between files. Updated `submission-copy.md` to
  match the matrix: pause, record the replacement, then submit.
- Screenshot safety wording conflicted around fake names. Reframed it as demo-safe
  placeholders and no real or realistic identifying data.
- `backlink_or_badge_status` was blank in every tracker row. Populated the column with
  platform-specific status guidance.
- G2 screenshot-description lines in `submission-copy.md` were too long. Wrapped them
  into title and description pairs.

Final criteria:

- Official source requirements are traceable.
- All files are present.
- Submission copy is paste-ready after asset gaps are resolved.
- Asset blockers are explicit.
- Review findings have been fixed or documented as not applicable.
