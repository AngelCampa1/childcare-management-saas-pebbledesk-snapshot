# Factual and Editorial Review: LinkedIn 315-Post Calendar

Review date: 2026-05-05

## Scope

Reviewed the assembled May 6-26, 2026 LinkedIn calendar outputs:

- `docs/marketing/linkedin-2026-05-06-to-2026-05-26.md`
- `docs/marketing/linkedin-2026-05-06-to-2026-05-26.csv`
- `docs/marketing/linkedin-2026-05-06-to-2026-05-26.postiz.jsonl`
- `docs/marketing/linkedin-rewrite/days/day-01.json` through `day-21.json`
- `docs/marketing/linkedin-rewrite/editorial-brief.md`

## Checks Performed

- Confirmed 21 day files, 315 total posts, and exactly 15 posts per day.
- Confirmed date sequence runs from 2026-05-06 through 2026-05-26.
- Confirmed all posts use the required Central slots from `04:00` through `18:00`.
- Confirmed assembled JSONL UTC times use May 2026 Central daylight time, UTC-05.
- Confirmed required fields are present on every day-file post.
- Confirmed every post is under 3,000 characters.
- Confirmed all source paths resolve to files in the repository after fixes.
- Checked for broken PebbleDesk URL patterns, especially lead-magnet links.
- Checked for legal/compliance overclaims such as guaranteed compliance, guaranteed inspection results, or software replacing state/legal judgment.
- Checked competitor mentions for unnecessary comparative claims.
- Checked for fake specificity, unsupported statistics, and duplicated post ideas.
- Confirmed the Markdown, CSV, and JSONL outputs were regenerated consistently from the corrected day JSON.

## Issues Found and Fixed

1. Four CCDF lead-magnet URLs used the wrong route:
   - From: `https://pebbledesk.app/resources/lead-magnets/ccdf-billing-error-prevention/`
   - To: `https://pebbledesk.app/free/ccdf-billing-error-prevention/`
   - Fixed in `day-03.json` and regenerated MD/CSV/JSONL.

2. The May 25 resource-roundup post used eight semicolon-separated source files in the singular `source` field.
   - Changed source to `apps/site/src/pages/free/index.astro`, which matches the roundup URL `https://pebbledesk.app/free/`.
   - Fixed in `day-20.json` and regenerated MD/CSV/JSONL.

3. One post used a negated version of a guarded compliance phrase: "software guarantees compliance."
   - Replaced with "software can make compliance automatic" to keep the disclaimer without repeating a risky overclaim phrase.
   - Fixed in `day-18.json` and regenerated MD/CSV/JSONL.

## Editorial Assessment

The calendar is publishable as draft LinkedIn content after the fixes above.

The strongest posts are operator-specific and practical: ratio transition windows, subsidy reconciliation, attendance as billing evidence, staff credential lead time, state-specific support scoping, migration cleanup, and pricing transparency. The calendar generally avoids generic SaaS phrasing and does not rely on fake customer stories or invented testimonials.

State-specific and product-support claims are appropriately qualified. The calendar repeatedly states that PebbleDesk support is verified today for Texas, California, and Florida, and that software does not replace state requirements, local judgment, or outage fallback procedures.

Competitor mentions are limited and mainly appear in migration-support language for Brightwheel and Procare presets. I did not find unsupported attacks or unnecessary comparative claims in the reviewed calendar files.

## Remaining Concerns

No blocking factual or editorial concerns remain in the reviewed files.

Operational note: the `.postiz.jsonl` file still uses Postiz `type: "schedule"` payloads with future timestamps for later import. That appears consistent with the existing assembled format and the Markdown disclaimer says nothing has been scheduled, but the file should be treated carefully so draft-only review does not become accidental scheduling.

## Verification

Final validation result:

- Day files: 21
- Posts: 315
- JSONL rows: 315
- CSV records: 315
- Markdown post headings: 315
- Schema/date/time/source/URL-pattern checks: clean
