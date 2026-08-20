# PebbleDesk pricing reference

Last reviewed: 2026-05-31

This memo points reviewers to the current pricing source paths. It is not the
canonical source of truth for prices.

## Canonical sources

- `packages/shared/src/constants/billing.ts` defines subscription plans, base
  prices, limited subscription offer rules, and rounded public price labels.
- `packages/shared/src/constants/offering.ts` defines the trial, setup fee, and
  self-serve offer rules used by marketing surfaces.
- `packages/shared/src/public-knowledge/marketing-surfaces.ts` generates the
  public pricing knowledge file from the shared constants.
- `apps/site/public/pricing.md` is generated public output and is verified by
  `apps/site/src/test/pricing-md-source.test.ts`.

## Public pricing rules

- Do not hardcode PebbleDesk public prices in content pages. Use plan tokens in
  markdown or shared pricing helpers in code.
- Public annual-equivalent monthly labels are rounded up to whole dollars by
  `formatRoundedUpCurrencyCents()`.
- Self-serve trial details come from `packages/shared/src/constants/offering.ts`
  and the generated public file at `apps/site/public/pricing.md`.
- Self-serve plans have no setup fee.
- Enterprise is sales-led and scoped directly.
- PebbleDesk is online-only in V1. Do not claim offline check-in or offline
  checkout.

## Review checklist

- If Stripe base prices change, update `SUBSCRIPTION_PLAN_CONFIG` first.
- Regenerate public knowledge after source constants change.
- Keep tests that lock public display values in sync with the intended display.
- Competitor prices may be hardcoded only when the page states the source and
  date clearly enough for review.
