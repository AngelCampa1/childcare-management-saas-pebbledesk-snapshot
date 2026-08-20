# PebbleDesk LinkedIn Editorial Brief

## Goal

Prepare draft-only LinkedIn company page content for PebbleDesk. Do not schedule anything.

The final calendar needs 315 posts: 21 days, 15 posts per day, May 6-26, 2026, Central local time. Each day-writer owns exactly one day and exactly 15 posts.

## Audience

Licensed childcare center directors, owner/operators, assistant directors, and administrators. They are non-technical, time-starved, budget-conscious, risk-averse, and responsible for attendance, ratios, subsidy billing, state licensing audits, family records, and staff documentation.

Write like a trusted colleague who knows childcare compliance. Warm, sturdy, practical. Clear over clever.

## Voice Rules

- Use childcare admin language: ratio tracking, subsidy reconciliation, state audit, licensing compliance, attendance records, staff credentials, reimbursement, classroom coverage.
- Avoid generic SaaS words: streamline, seamless, optimize, unlock, workflows, game-changing, robust, centralized platform.
- No fake stories, fake customers, fake testimonials, fake before/after metrics, or invented statistics.
- PebbleDesk does not have clients yet. Do not imply customer traction, customer usage, testimonials, case studies, adoption, social proof, or that directors have already used PebbleDesk.
- Founder context: PebbleDesk was built by an engineer/founder after seeing a gap in the childcare administration market. Founder/company POV is allowed, but frame it as product philosophy, market observation, or research-backed belief, not customer proof.
- No legal advice. Use "helps", "supports", "can reduce", "makes easier", not "guarantees compliance" or "will pass inspection".
- No hashtags unless a post naturally needs one. Default: none.
- Keep external links selective. Most posts should stand alone. When using a link, use a real PebbleDesk URL from the repo.
- Company page voice can say "we" when speaking as PebbleDesk, but do not over-promote.

## Quality Bar

Every post must:

- Have a real hook written for LinkedIn, not a page title pasted into a sentence.
- Teach one useful thing, name one real risk, or ask one meaningful operator question.
- Be specific enough that a childcare director recognizes the job.
- Be under 3,000 characters.
- Include a source file and optional URL.
- Pass these gates: truth, source-backed, LinkedIn-native, humanized, brand voice, no duplication.

## Useful PebbleDesk Positioning

- Tagline: Audit-ready records without the end-of-week scramble.
- Core promise: PebbleDesk keeps attendance, ratios, subsidy billing, family records, and reports connected so directors are not rebuilding the story before licensing visits or payment reviews.
- Product category: Childcare Center Administration Software.
- Product fit: licensed centers, family childcare homes, and multi-site operators.
- Verified state-specific ratio and licensing report support today: Texas, California, and Florida.
- Online-only in V1. If internet drops, centers should keep temporary paper fallback and enter records once service returns.
- Import support: CSV import plus Brightwheel and Procare migration presets.
- Pricing posture: tiered flat pricing; no setup fee on self-serve plans; no surprise per-child add-on for center plans.

## Source Claim Guardrails

Allowed claims if tied to repo source:

- CCDF provider participation fell from 475,394 in 2006 to 225,204 in 2022, a 53% decline.
- Research cited in the repo estimates providers miss over 8% of annual subsidy revenue from billing errors without automation.
- The repo cites the national CCDF improper payment rate as 3.55% in 2023.
- The repo cites 40% of CCDF improper payment errors as coming from missing or insufficient documentation.
- Most states pay CCDF reimbursements after care is delivered and documented; reimbursement can take up to 60 days depending on state and review issues.
- PebbleDesk supports generic ratio workflows nationally, with verified state-specific ratio support today for Texas, California, and Florida.

When in doubt, soften the claim or avoid the number.

## Output Schema

Each day file must be JSON with this shape:

```json
{
  "date": "2026-05-06",
  "theme": "Audit-ready records",
  "posts": [
    {
      "index_in_day": 1,
      "time_central": "04:00",
      "pillar": "Audit readiness and licensing confidence",
      "format": "Practical tip",
      "post_content": "...",
      "source": "apps/site/src/content/guides/preparing-for-state-audit-childcare.md",
      "url": "https://pebbledesk.app/resources/guides/preparing-for-state-audit-childcare/",
      "review_status": "writer self-reviewed: truth, source, humanization, brand, duplication, LinkedIn fit",
      "notes": "Why this post belongs in the day."
    }
  ]
}
```

Use exactly these slots:

`04:00`, `05:00`, `06:00`, `07:00`, `08:00`, `09:00`, `10:00`, `11:00`, `12:00`, `13:00`, `14:00`, `15:00`, `16:00`, `17:00`, `18:00`
