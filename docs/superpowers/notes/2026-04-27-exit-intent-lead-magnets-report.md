# Exit Intent Lead Magnets Implementation Report

Date: 2026-04-27  
Branch merged: `codex/exit-intent-lead-magnets-clean`  
Primary merge commit: `cb704cd Merge branch 'codex/exit-intent-lead-magnets-clean'`  
Follow-up production fix: `7737c3a fix(api): serve lead magnet downloads from live site`

## Goal

Add an exit-intent popup that offers a relevant free resource, captures the visitor's
email, sends the selected resource, and enrolls the lead in a Resend-backed nurture
sequence based on the selected lead magnet.

The second requirement was to make sure the resources are real, high-quality,
downloadable PDF/resource files, and to create them if they were missing.

## Plan Executed

1. Explore the API, marketing package, site content, email templates, and deploy scripts.
2. Add tests first for the lead magnet slug flow, popup submit flow, suppression behavior,
   asset verification, and deploy source behavior.
3. Implement API validation and selected-magnet nurture sequencing.
4. Replace exit-intent direct signup CTA with inline email capture.
5. Generate and verify production PDF and cover assets for all lead magnets.
6. Wire the marketing site to the real API URL.
7. Update Astro content handling for the current Content Layer API.
8. Add deploy-time verification/upload of lead magnet assets.
9. Run final review agents, fix findings, verify, merge to `master`, push, deploy, and
   live-test the result.

## What Changed

### API

- `apps/api/src/routes/leads.ts`
  - Requires `magnetSlug` to match the supported lead magnet set.
  - Builds the PDF download URL from the selected magnet slug.
  - Sends the welcome email with the selected download URL.
  - Schedules a track-specific nurture sequence via `MAGNET_TRACKS`.
  - Rejects unknown lead magnet slugs before DB/email side effects.

- `apps/api/src/routes/leads.test.ts`
  - Covers unknown magnet rejection, selected download URLs, trailing-slash URL handling,
    and track-specific scheduled sends.

- `apps/api/src/index.test.ts`
  - Updated API routing expectations for the lead endpoint.

- `apps/api/wrangler.jsonc`
  - Production `R2_PUBLIC_URL` now points to `https://pebbledesk.app` because the live,
    verified PDF assets are served from the marketing Pages domain.

- `apps/api/tsconfig.json`
  - Added `@pebbledesk/shared` path mapping because API typecheck includes
    `packages/emails/src`, and email layouts import shared brand constants.

### Marketing Package

- `packages/marketing/src/components/exit-intent-popup.tsx`
  - Shows an inline lead-capture form instead of sending users to signup.
  - Uses the selected lead magnet slug.
  - Fails closed when no explicit lead magnet slug is provided.
  - Suppresses itself after successful capture.

- `packages/marketing/src/components/lead-capture-form.tsx`
  - Added optional `onSuccess` callback.
  - Preserves success state and download link behavior after API response.

- `packages/marketing/src/lib/marketing-api-url.ts`
  - Resolves the public API base URL for marketing pages.

- Layouts touched:
  - `article-layout.astro`
  - `comparison-layout.astro`
  - `content-layout.astro`
  - `landing-layout.astro`
  - `listicle-layout.astro`
  - `pricing-breakdown-layout.astro`

  Final review found that `signInHref` had been dropped in these layouts. It was restored.

### Marketing Site

- `apps/site/src/config/site.ts`
  - Added exit-intent and lead magnet CTA copy/config.

- `apps/site/.env.example`
  - Added `PUBLIC_API_URL=https://api.pebbledesk.app`.

- `apps/site/src/content.config.ts`
  - Migrated the lead magnet content loader to Astro 6 `glob({ pattern, base })`.

- `apps/site/src/lib/content-paths.ts`
  - Added slug/id normalization for Astro Content Layer entries.

- Site route updates:
  - `apps/site/src/pages/free/[slug].astro`
  - `apps/site/src/pages/free/[slug]/print.astro`
  - `apps/site/src/pages/features/[slug].astro`
  - `apps/site/src/pages/childcare-software/[slug].astro`
  - `apps/site/src/pages/resources/best/[slug].astro`
  - `apps/site/src/pages/resources/guides/[slug].astro`
  - related index/pagination/rss files

### Generated Resources

Created and committed 9 PDFs plus 9 cover PNGs in:

- `apps/site/public/lead-magnets/`

PDFs:

- `brightwheel-cost-calculator.pdf`
- `ccdf-billing-error-prevention.pdf`
- `childcare-software-pricing-comparison.pdf`
- `childcare-software-scorecard.pdf`
- `licensing-compliance-checklist.pdf`
- `parent-handbook-template.pdf`
- `ratio-tracking-cheatsheet.pdf`
- `state-audit-preparation-toolkit.pdf`
- `state-subsidy-billing-guide.pdf`

Each has a matching `*-cover.png`.

### Asset Generation and Deploy

- `apps/site/scripts/build-lead-magnet-pdfs.ts`
  - Generates PDF and PNG resource assets.
  - Verifies expected files, minimum sizes, and file headers.

- `apps/site/scripts/build-lead-magnet-pdfs.test.ts`
  - Covers missing file, too-small file, bad PDF header, and bad PNG header cases.

- `scripts/cloudflare/deploy-site.ps1`
  - Verifies lead magnet assets before deploy.
  - Uploads assets to the `pebbledesk-lead-magnets` R2 bucket.
  - Sets `PUBLIC_API_URL` for the marketing build.

- `apps/site/src/test/deploy-site-source.test.ts`
  - Source-level tests for deploy asset publication behavior.

## Review Findings Fixed

Final review agent found two real issues:

1. `signInHref` was dropped from shared marketing layouts.
   - Fixed by restoring `signInHref={config.nav?.signInHref}` in the affected layouts.

2. Exit intent popup defaulted a missing `leadMagnet.slug` to
   `licensing-compliance-checklist`.
   - Fixed by failing closed when no explicit slug exists.

After deploy, live verification found one more production issue:

3. API-generated download URLs pointed to `https://cdn.pebbledesk.app/...`, but that host
   returned 404 for the uploaded resource.
   - Fixed by changing production `R2_PUBLIC_URL` to `https://pebbledesk.app`, where the
     committed and deployed static assets are live and downloadable.

## Verification Run

Clean/pass:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm exec turbo test --concurrency=1`
- `pnpm --filter @pebbledesk/site build`
- `pnpm --filter @pebbledesk/site test:coverage`
  - 26 files, 569 tests passed
  - Statements 99.26%, branches 96.09%, functions 100%, lines 99.23%
- `pnpm --filter @pebbledesk/api test -- --coverage`
  - 71 files, 1064 tests passed
  - Statements 95.11%, functions 99.29%, lines 98.38%
- `pnpm --filter @pebbledesk/marketing test:coverage -- --maxWorkers=1 --no-file-parallelism`
- Manual resource check:
  - Verified 9 PDFs and 9 covers
  - PDF header `%PDF`
  - PNG header valid
  - Minimum size checks passed
- `git diff --check`

Notes:

- The normal unconstrained full test run initially hit a Vitest worker out-of-memory
  condition in the marketing package. The full suite passed after rerunning Turbo with
  package concurrency set to 1 and Node heap raised.
- The deploy script initially failed migrations because this shell did not have
  `DATABASE_URL`. No DB schema files changed, so deploy was rerun with migrations disabled.

## Deploy and Live Verification

Pushed to `origin/master`.

Deploy:

- `pnpm cf:deploy:touched` initially hit the migration environment issue.
- Reran deploy directly with migrations disabled.
- API deploy completed after refreshing workspace package links with `pnpm install`.
- Marketing site, API, and web were deployed as touched projects.

Live checks:

- `https://pebbledesk.app/` returned 200.
- `https://my.pebbledesk.app/` returned 200.
- `https://api.pebbledesk.app/api/health` returned 200 with `{"status":"ok"}`.
- `https://pebbledesk.app/free/licensing-compliance-checklist/` returned 200 and included
  expected lead/resource content.
- Submitted a live test lead:
  - Email: `codex-live-test+20260427102108@pebbledesk.app`
  - Endpoint: `https://api.pebbledesk.app/api/leads`
  - Status: 200
  - Returned download URL:
    `https://pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf`
  - Downloaded PDF header: `%PDF`
  - Downloaded PDF size: 104,257 bytes

## Closeout Completed

Follow-up closeout commit: `86bf891 fix(marketing): restore lead magnet cdn downloads`

Completed on 2026-04-27:

- Published lead magnet PDFs and covers to the remote `pebbledesk-reports` R2 bucket, which
  is the bucket attached to the active `https://cdn.pebbledesk.app` custom domain.
- Switched API `R2_PUBLIC_URL` back to `https://cdn.pebbledesk.app`.
- Added source-level regression tests for CDN download config, deploy asset publication, and
  the missing-`DATABASE_URL` migration hint.
- Added `--remote` to deploy-time R2 uploads so production deploys cannot write only to local
  Wrangler storage.
- Added a clear API deploy error when migrations are requested without `DATABASE_URL`.
- Normalized `deploy-project.ps1` Boolean parameters so the documented
  `pnpm cf:deploy:touched -RunMigrations $false` command works when pnpm forwards arguments
  as strings.
- Normalized `deploy-project.ps1` touched deploy target output to an array so the documented
  command also works when exactly one project changed.
- Hardened `POST /api/leads` so a Resend welcome-email failure does not block the lead
  magnet response. The API now still records the lead, schedules the nurture sequence, and
  returns the CDN download URL with `emailed: false`.
- Hardened `POST /api/leads` so download-audit and nurture-scheduling failures are also
  logged as side-effect failures instead of blocking the lead magnet download response.
- Committed the previously untracked docs:
  - `docs/superpowers/notes/2026-04-27-exit-intent-lead-magnets-report.md`
  - `docs/superpowers/notes/2026-04-27-pebbledesk-logo-rollout-report.md`
  - `docs/superpowers/specs/2026-04-25-whole-site-ux-improvement-design.md`
- Removed the stale root `node_modules/@pebbledesk/*` junctions and refreshed package-local
  workspace links.
- Deployed touched projects: API, web app, and marketing site.

Additional verification:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm exec turbo test --concurrency=1`
- `pnpm --filter @pebbledesk/site build`
- `pnpm --filter @pebbledesk/site test:coverage`
  - 27 files, 574 tests passed
  - Statements 99.26%, branches 96.09%, functions 100%, lines 99.23%
- `pnpm --filter @pebbledesk/api test -- --coverage`
  - 73 files, 1066 tests passed
  - Statements 95.11%, functions 99.29%, lines 98.38%
- `pnpm --filter @pebbledesk/marketing test:coverage -- --maxWorkers=1 --no-file-parallelism`
  - 112 files, 2317 tests passed
  - Statements 99.56%, branches 97.71%, functions 97.95%, lines 99.56%
- `pnpm --filter @pebbledesk/api test -- src/test/deploy-project-source.test.ts src/test/deploy-api-source.test.ts`
- `pnpm --filter @pebbledesk/api test -- src/routes/leads.test.ts`
- `git diff --check`
- `wrangler r2 bucket domain get pebbledesk-reports --domain cdn.pebbledesk.app`
  - Domain enabled, ownership active, SSL active.

Closeout live checks:

- `https://pebbledesk.app/` returned 200.
- `https://my.pebbledesk.app/` returned 200.
- `https://api.pebbledesk.app/api/health` returned 200.
- `https://pebbledesk.app/free/licensing-compliance-checklist/` returned 200.
- `https://cdn.pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf` returned 200,
  `Content-Type: application/pdf`, header `%PDF`, and size 104,257 bytes.
- Submitted a live test lead:
  - Email: `codex-live-test+20260427112000@pebbledesk.app`
  - Endpoint: `https://api.pebbledesk.app/api/leads`
  - Status: 200
  - Returned download URL:
    `https://cdn.pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf`
  - Downloaded PDF header: `%PDF`
  - Downloaded PDF size: 104,257 bytes

Housekeeping:

- Deleted the old exit-intent worktrees and branches after merge.

Final deployment note:

- A follow-up API deploy of the side-effect hardening commit was attempted after local
  verification, but Wrangler returned `Invalid access token [code: 9109]` for Cloudflare API
  calls. The code is merged and pushed to `master`; deploying commit `e232609` requires
  refreshing the local Cloudflare credentials and rerunning
  `pnpm cf:deploy:touched -RunMigrations $false`.
