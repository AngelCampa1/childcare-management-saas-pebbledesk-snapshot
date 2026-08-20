# Humanizer Review: LinkedIn 315-Post Calendar

Review date: 2026-05-05

## Scope

Reviewed the assembled LinkedIn calendar and day JSON files for posts that felt generic, templated, robotic, repetitive, too salesy, too long, too bland, or weakly adapted to LinkedIn.

Edited only the approved marketing output files:

- `docs/marketing/linkedin-rewrite/days/day-03.json`
- `docs/marketing/linkedin-rewrite/days/day-15.json`
- `docs/marketing/linkedin-rewrite/days/day-18.json`
- `docs/marketing/linkedin-rewrite/days/day-20.json`
- `docs/marketing/linkedin-rewrite/days/day-21.json`
- `docs/marketing/linkedin-2026-05-06-to-2026-05-26.md`
- `docs/marketing/linkedin-2026-05-06-to-2026-05-26.csv`
- `docs/marketing/linkedin-2026-05-06-to-2026-05-26.postiz.jsonl`

## Issues Found and Fixed

1. Repeated stat hooks made the CCDF posts feel assembled rather than written.
   - Three posts opened with "The national CCDF improper payment rate was 3.55% in 2023."
   - Reworked the later uses so the stat supports a different operator lesson instead of carrying the hook each time.

2. Duplicate inspection-response framing created a samey calendar feel.
   - The May 11 and May 25 inspection posts both opened with "When an inspector arrives, staff should not have to improvise."
   - Rewrote the May 25 version around the first five minutes of an inspection and supervision-first staff roles.

3. Several CCDF provider-participation posts were too long and essay-like.
   - Tightened May 23 posts so they read more like LinkedIn posts: stronger first lines, shorter movement, clearer director takeaways.
   - Preserved source-backed claims: the 53% CCDF provider participation decline, the 3.55% improper payment rate, and the over-8% subsidy revenue-at-risk claim.

4. The final product recap day leaned too salesy in places.
   - Reworked selected May 26 product posts to sound more like a practical operator point of view than a product brochure.
   - Kept qualified claims around CSV import, Brightwheel and Procare presets, online-only V1 fallback, multi-center support, and state-specific ratio support.

5. Resource roundup posts were accurate but a little bland.
   - Tightened the May 25 checklist/toolkit/resource posts around "what a director can use on a Tuesday" instead of generic resource descriptions.

## Examples

- Before: "The national CCDF improper payment rate was 3.55% in 2023."
  After: "A CCDF payment review is usually won or lost in the small records."

- Before: "When an inspector arrives, staff should not have to improvise."
  After: "The first five minutes of an inspection should feel boring."

- Before: final recap language centered more heavily on the product list.
  After: "For directors comparing childcare software, the demo is not the whole test. The real test is a Tuesday."

## Verification

Regenerated the final Markdown, CSV, and Postiz JSONL outputs from the edited day JSON files.

Final validation result:

- Day files: 21
- Posts: 315
- JSONL rows: 315
- CSV records: 315
- Markdown post headings: 315
- Required Central time slots: clean
- Date sequence from 2026-05-06 through 2026-05-26: clean
- Source paths: clean
- Posts over 3,000 characters: none
- Duplicate opening lines: none
- Generic SaaS terms checked: `seamless`, `streamline`, `optimize`, `unlock`, `game-changing`, `robust`, `centralized platform`; all absent

## Remaining Concerns

No blocking humanization concerns remain.

The calendar is still intentionally high-volume at 15 posts per day, so even with stronger individual posts, the cadence itself may feel aggressive if published as-is. The content should continue to be treated as a draft calendar for selection, scheduling, or thinning, not as a recommendation to post all 315 items without a channel strategy pass.
