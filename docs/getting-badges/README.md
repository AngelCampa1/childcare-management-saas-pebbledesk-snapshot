# PebbleDesk Getting Badges Runbook

Last verified: 2026-05-15

This folder is the copy-paste text package and requirements runbook for submitting
PebbleDesk to SaaSHub, AlternativeTo, Product Hunt, G2, and BetaList. The copy,
field values, and tracker are ready to use, but some platforms are blocked until
the asset pack, logged-in form checks, or launch-stage decisions are finished.

## Product Facts To Use

- Product name: PebbleDesk
- Website: https://pebbledesk.app
- Category: childcare center administration software, childcare management software
- Audience: licensed childcare center directors, owner/operators, family childcare
  providers, administrators, and multi-site operators
- Core promise: keep attendance, ratios, subsidy billing, family records, invoices,
  and audit exports connected in one operational record
- Availability: public website on PebbleDesk's own domain with pricing, privacy, terms,
  and signup paths
- Pricing: use the shared pricing source in
  `packages/shared/src/constants/billing.ts`. Copy current trial details and
  limited-offer prices only from the generated public file at
  `apps/site/public/pricing.md`. Enterprise is sales-led.
- Proof-safe differentiators: audit readiness, ratio tracking, subsidy workflows,
  billing records, CSV import, Brightwheel and Procare migration presets, online-only V1
- Founder: Angel Campa, bootstrapped founder
- Contact email: angel.campa@pebbledesk.app

## Submission Readiness

- Copy-ready now: platform descriptions, profile copy, founder notes, Product Hunt
  launch comment, review ask, tags, competitors, and category recommendations.
- Submit-ready now after account login: SaaSHub, assuming no screenshot upload is
  required in the current form.
- Form-check blocked: AlternativeTo, because the full logged-in add-app flow was
  not publicly visible during research.
- Asset blocked: Product Hunt, G2, AlternativeTo, and BetaList need clean product
  screenshots or directory-specific image exports before submission.
- Stage blocked: G2 should wait unless PebbleDesk is ready to be presented as
  generally available B2B software. BetaList should wait unless PebbleDesk still
  qualifies as recently launched.

## Submit In This Order

0. Readiness checks
   - Create or log in to each account.
   - Check each platform for an existing PebbleDesk listing.
   - Export the assets listed in `asset-checklist.md`.
   - For AlternativeTo, open the logged-in add-app form and update this folder if
     the form requires fields not listed here.

1. SaaSHub
   - Lowest asset burden and a good first software-directory profile.
   - Use the SaaSHub copy in `submission-copy.md`.
   - Verify with an email address on `pebbledesk.app` for higher priority.

2. Product Hunt
   - Treat this as the launch event, not a casual directory entry.
   - Do not submit until Product Hunt gallery images, thumbnail, maker accounts, first
     comment, and a launch-day response plan are ready.
   - If Product Hunt is planned, do it before broad launch recap distribution.

3. BetaList
   - Submit only if PebbleDesk is still recently launched enough to qualify.
   - Submit through the standard flow first. If BetaList offers priority review after
     intake and timing matters, then decide whether the fee is worth it.

4. AlternativeTo
   - Good fit once competitor alternatives are ready because AlternativeTo is built
     around app alternatives and public app taxonomy.
   - Log in first and confirm the full add-app form. Public pages verify the taxonomy,
     but the add flow is not fully exposed without an account.

5. G2
   - Submit only if PebbleDesk should be represented as generally available B2B
     software, not alpha or beta software.
   - Use the current G2 help article entry point in `requirements-matrix.md`.
   - Prepare a review drive separately. G2 badge outcomes are not automatic.
   - Users Love Us requires 20 reviews with a 4.0+ average rating.
   - Grid and report badges depend on G2 report placement and may require paid badge
     licensing before use in marketing.

## Execution Notes

- This is a docs-only submission package. No app code changes, database migrations,
  Cloudflare deploys, or live directory submissions are expected from this work.
- Deploy only if a future change touches a deployed app package.

## Account Prerequisites

- SaaSHub account plus a working `@pebbledesk.app` email address.
- AlternativeTo account. Check whether PebbleDesk already exists before adding it.
- Product Hunt personal maker account. Product Hunt prohibits company accounts.
- G2 seller or product-submission account. Check for an existing PebbleDesk listing
  first to avoid duplicate rejection.
- BetaList account tied to an authorized founder or representative.

## Ready Now

- Public product website on the product domain.
- Pricing, privacy, and terms pages.
- Product category and audience are clear.
- Competitor/alternative content exists for Brightwheel, Procare, Lillio, Playground,
  Kangarootime, Famly, iCare, Jackrabbit Care, Sawyer, Xplor, and more.
- Logo assets exist as SVG plus an email PNG.
- Open Graph image exists at `apps/site/public/og-default.png`.
- Lead magnets exist and can support directory visitors.

## Blocks Before Submission

- Capture 5 to 8 real product screenshots with no child, guardian, staff, billing,
  or center-identifying data.
- Export platform-specific assets:
  - Product Hunt thumbnail: 240x240, under 3 MB.
  - Product Hunt gallery: at least 2 images, 1270x760.
  - G2 screenshots: up to 6 JPG, PNG, or GIF files, each under 5 MB.
  - G2 profile logo: at least 400 px, JPG, PNG, or GIF.
  - G2 grid logo: SVG under 5 MB, ideally icon-only.
  - G2 banner: 1260x240 or 2500x476 JPG, PNG, or GIF under 5 MB.
- Decide whether to record a short YouTube demo for Product Hunt.
- Confirm whether PebbleDesk is still early enough for BetaList.
- Confirm whether G2 should be submitted now or held until the product is clearly not
  beta-stage.

## Copy Rules

- Do not claim state-specific support beyond verified TX, CA, and FL licensing report
  formats unless the app has been updated.
- Do not claim offline support. PebbleDesk is online-only in V1.
- Do not describe PebbleDesk as an AI product.
- Do not imply G2, Product Hunt, or any directory badge is already earned.
- Do not use unsupported revenue-loss figures in directory copy unless the destination
  page cites the source. Keep directory copy focused on product behavior.
- Do not ask Product Hunt users for upvotes. Ask for feedback.

## Folder Contents

- `requirements-matrix.md`: verified platform requirements and acceptance risks.
- `submission-copy.md`: platform-specific paste-ready copy.
- `asset-checklist.md`: required assets, current assets, and gaps.
- `submission-tracker.csv`: tracking sheet for manual submission status.
- `review-notes.md`: source, copy, compliance, and reviewer signoff log.
