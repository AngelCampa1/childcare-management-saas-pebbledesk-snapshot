# Badge Submission Asset Checklist

Last reviewed: 2026-05-15

## Current Repo Assets

Usable now:

- `apps/site/public/favicon.svg`
- `apps/site/public/logo-dark.svg`
- `apps/site/public/logo-light.svg`
- `apps/site/public/logo-email.png` at 32x32. This is useful for email, not for
  directory uploads that expect a large logo.
- `apps/site/public/og-default.png`
- `apps/site/src/assets/logo-dark.svg`
- `apps/site/src/assets/logo-icon.svg`
- `apps/site/src/assets/logo-light.svg`
- `apps/site/src/assets/logo-wordmark.svg`
- Lead magnet PDFs and cover images in `apps/site/public/lead-magnets/`

Current limitation:

- The repo does not contain a complete directory-ready product screenshot pack.
- The repo does not contain Product Hunt gallery assets.
- The repo does not contain a G2 profile banner export.
- The only public PNG logo found in this pass is 32x32, which is too small for
  G2 and Product Hunt upload expectations.
- The repo does not contain a public YouTube demo URL.

## Required Exports

Create a local asset folder before submitting:

`docs/getting-badges/assets/`

Use this naming pattern:

- `pebbledesk-logo-icon-1024.png`
- `pebbledesk-logo-wordmark-light.svg`
- `pebbledesk-logo-wordmark-dark.svg`
- `pebbledesk-g2-profile-logo-400.png`
- `pebbledesk-g2-grid-logo.svg`
- `pebbledesk-g2-banner-1260x240.png`
- `pebbledesk-ph-thumbnail-240x240.png`
- `pebbledesk-ph-gallery-01-attendance-1270x760.png`
- `pebbledesk-ph-gallery-02-ratios-1270x760.png`
- `pebbledesk-ph-gallery-03-billing-1270x760.png`
- `pebbledesk-ph-gallery-04-audit-1270x760.png`
- `pebbledesk-screenshot-01-attendance.png`
- `pebbledesk-screenshot-02-ratios.png`
- `pebbledesk-screenshot-03-child-records.png`
- `pebbledesk-screenshot-04-billing.png`
- `pebbledesk-screenshot-05-subsidy.png`
- `pebbledesk-screenshot-06-audit-reports.png`

Do not commit screenshots that contain real child, guardian, staff, center, billing, or
auth data. Use seeded demo data only.

## Safe Screenshot Capture Workflow

1. Use a local or staging environment with seeded demo data only.
2. Do not capture production records, even if names are blurred later.
3. Use demo-safe placeholders for center, child, guardian, staff, and invoice names.
4. Before exporting, inspect every screenshot at full size for names, emails, phone
   numbers, addresses, billing identifiers, auth tokens, browser extensions, and URLs
   that should not be public.
5. Ask a second reviewer to inspect the asset folder before upload.
6. Record the reviewer and approval date in `submission-tracker.csv`.
7. If any screenshot contains real or uncertain data, discard it and recapture from
   demo data instead of redacting it.

## SaaSHub

Minimum assets:

- Website URL
- Logo, if form asks for one
- Optional screenshots, if form asks for them

Recommended:

- Square PNG logo, 1024x1024.
- 3 clean screenshots showing attendance, ratios, and billing or audit exports.

Asset notes:

- SaaSHub's public submit page does not publish strict image dimensions. Keep files
  clean, small, and conventional.

## AlternativeTo

Minimum assets:

- App icon or logo
- Screenshots
- Official website URL

Recommended:

- 1024x1024 icon PNG.
- 3 to 5 screenshots with descriptive captions.
- Screenshots should show product UI, not only marketing pages.

Suggested screenshot order:

1. Attendance and room record
2. Ratio visibility
3. Child and guardian records
4. Billing and invoice tracking
5. Audit reports or subsidy workflow

## Product Hunt

Required assets:

- Thumbnail: square, recommended 240x240, under 3 MB.
- Gallery: at least 2 images, recommended 1270x760.

Optional but recommended:

- YouTube demo video. Must be a full YouTube URL, not private, and not shortened.
- Interactive demo link if using Arcade, Storylane, Hexus, Supademo, Layerpath, or
  ScreenSpace.

Product Hunt gallery sequence:

1. "Attendance, ratios, and billing in one childcare record"
2. "Catch room coverage gaps before they become audit issues"
3. "Tie invoices and subsidy follow-up back to attendance"
4. "Export audit-ready records without rebuilding the week"

Design guidance:

- Use real product screenshots captured from demo data.
- Keep text large enough to read in the gallery.
- Avoid dense UI montages.
- Do not use real or realistic customer, child, billing, or center-identifying data.
- Keep the tone practical, warm, and clear.

## G2

Required or strongly recommended assets:

- Profile logo: at least 400 px, JPG, PNG, or GIF.
- Grid logo: SVG under 5 MB, icon-first rather than text-heavy.
- Profile banner: JPG, PNG, or GIF under 5 MB. Recommended 1260x240. If rendering
  needs more resolution, use 2500x476.
- Screenshots: up to 6 JPG, PNG, or GIF files, each under 5 MB.
- Optional banner video: Vimeo, Vidyard, Wistia, or YouTube Universal Link.

Screenshot rules:

- G2 states screenshots must not include proprietary product details or sensitive
  customer information.
- Each screenshot needs a title and description.

Recommended G2 screenshot titles and descriptions:

- `pebbledesk-screenshot-01-attendance.png`
  - Title: Daily attendance and room record
  - Description: Track check-ins, room assignments, and the daily record directors
    need later.
- `pebbledesk-screenshot-02-ratios.png`
  - Title: Ratio visibility for room coverage
  - Description: See room coverage status while the center can still fix staffing gaps.
- `pebbledesk-screenshot-03-child-records.png`
  - Title: Child and guardian records
  - Description: Keep enrollment, guardians, pickup details, and family records connected.
- `pebbledesk-screenshot-04-billing.png`
  - Title: Billing and invoice tracking
  - Description: Track invoices, payment status, and guardian payment links from the
    same record.
- `pebbledesk-screenshot-05-subsidy.png`
  - Title: Subsidy workflow and claim support
  - Description: Keep subsidy follow-up connected to attendance and family records.
- `pebbledesk-screenshot-06-audit-reports.png`
  - Title: Audit reports and exports
  - Description: Prepare exports and reports without rebuilding the week from separate
    tools.

## BetaList

Minimum assets:

- Product website with signup or access path.
- Product screenshot or landing-page image.
- Founder profile information.

Recommended:

- 1 strong product screenshot showing the actual app.
- 1 square logo.
- 1 short founder headshot only if the form requests it.

## Asset QA Checklist

- No sensitive child, guardian, staff, center, invoice, or auth data.
- No screenshots of internal admin pages unless they are demo-safe.
- Files open locally and are under platform size limits.
- Product Hunt gallery images are exactly or very close to 1270x760.
- Product Hunt thumbnail is square and under 3 MB.
- G2 screenshots are JPG, PNG, or GIF and under 5 MB each.
- G2 profile logo is at least 400 px.
- G2 banner is 1260x240 or 2500x476.
- All assets use the current PebbleDesk logo and warm, practical visual style.
