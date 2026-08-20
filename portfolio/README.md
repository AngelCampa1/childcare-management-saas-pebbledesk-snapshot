# portfolio/

Retrospective documentation for PebbleDesk, a childcare center administration SaaS for licensed
daycare operators that was built, shipped, and decommissioned on 2026-06-11.

These seven documents are written **after** the fact and **for a reader**, not for the author while
building. Every claim in them is meant to be checkable against the tree: a number traces to the
command that produced it, a `file:line` reference points at a real line, and a quote from the
product's own audit is copied, not paraphrased. If something here cannot be traced back to this
repository, treat it as a defect in the document and not as evidence.

## The pages

| Document | Length | What is in it |
|---|---:|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 250 lines | The monorepo layout, the request path from browser to Neon Postgres, auth and `center_id` tenancy, and what Cloudflare Workers forced |
| [CONCURRENCY.md](./CONCURRENCY.md) | 314 lines | The two GiST exclusion constraints, the TOCTOU race they close, the `IMMUTABLE` workaround, and the `23P01`→`409` mapping, with a flowchart of the race |
| [COMPLIANCE-MODEL.md](./COMPLIANCE-MODEL.md), this repository's security-and-privacy document | 297 lines | The staff-to-child ratio engine and its cited sources, a state diagram of a room's compliance status, the audit log, its PII redaction rules for children's medical notes, allergies, dates of birth and guardian contact details, and where "audit-ready" oversold the schema |
| [ENGINEERING-LOG.md](./ENGINEERING-LOG.md) | 278 lines | Nine defects read closely out of the project's own 47-defect self-audit, each with root cause, the audit's own words, and the current `file:line` |
| [TESTING.md](./TESTING.md) | 225 lines | What the 7,818 static test cases cover, how the suite is organized, and the specific gaps the project's own audit found in it |
| [METRICS.md](./METRICS.md) | 219 lines | Every number quoted anywhere in this repository, with the exact command that reproduces it and the counting mistakes that were caught along the way |
| [DECOMMISSIONING.md](./DECOMMISSIONING.md) | 184 lines | How the 2026-06-11 shutdown was verified system by system, with a checklist record of which external services were confirmed clean and which stayed open |

Product screenshots referenced from the README and from these documents live in
[`screenshots/`](./screenshots/), curated out of the 106 raw captures in
[`../docs/qa/screenshots/`](../docs/qa/screenshots/).

## If you read one thing

[CONCURRENCY.md, the subsidy-claim overlap
constraint](./CONCURRENCY.md#the-toctou-race-that-mattered). It is the one idea in this repository
that is a genuine correctness problem, not a feature: two
concurrent requests can each pass an application-level overlap check and still both insert, and the
fix that actually closes the race lives in the database, not the API.

## Where these documents draw from

`portfolio/` is retrospective and finite: seven documents, written once, describing a product that
no longer runs. [`../docs/`](../docs/) holds the prospective, dated, open-ended working residue from
actually building PebbleDesk: audits, specs, phase plans, QA sweeps, the raw decommissioning record,
and the full 106-image screenshot archive. Where a `portfolio/` document draws on a `docs/` source
(the 47-defect audit behind `ENGINEERING-LOG.md`, the raw shutdown checklist behind
`DECOMMISSIONING.md`), it links to the original rather than restating it, so the primary record and
its retrospective stay distinguishable.
