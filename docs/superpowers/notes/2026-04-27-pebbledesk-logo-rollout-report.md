# PebbleDesk Logo Rollout Report

Date: 2026-04-27

## Goal

Use the new PebbleDesk logo everywhere it should appear: marketing site, web app, email templates, API-generated emails, browser icons, and social preview assets.

## Plan Followed

1. Find every existing brand/logo surface across the monorepo.
2. Replace the old logo system with the new PebbleDesk mark and wordmark assets.
3. Add shared brand constants so URLs and names are not duplicated.
4. Update email layouts and API-generated email HTML to include the brand mark with a text fallback.
5. Add the logo to web app shells, auth pages, recovery/error states, invitation flows, and root fallbacks.
6. Add tests that prevent the old logo/palette from coming back and verify the new logo appears in key surfaces.
7. Run lint, typecheck, tests, build, review passes, merge to `master`, remove the temporary worktree, and deploy touched Cloudflare projects.

## Branch, Worktree, and Merge

- Feature branch created: `codex/pebbledesk-logo-refresh`
- Temporary worktree used: `<local-path>`
- Feature commit: `81497bd feat(brand): roll out PebbleDesk logo`
- Merged to `master`: `1de1923 Merge branch 'codex/pebbledesk-logo-refresh'`
- Temporary logo worktree: removed

Current `master` has a newer commit after the logo merge:

- `7737c3a fix(api): serve lead magnet downloads from live site`

That later commit is separate from the logo rollout and changes API/R2 lead magnet URL behavior.

## What Changed

### Shared Brand Constants

- Added `packages/shared/src/constants/brand.ts`
- Updated `packages/shared/src/constants/index.ts`
- Added shared constants:
  - `PEBBLEDESK_BRAND_NAME`
  - `PEBBLEDESK_LOGO_EMAIL_URL`

### Marketing Site Assets

Updated the public and source marketing logo assets:

- `apps/site/public/favicon.svg`
- `apps/site/public/logo-dark.svg`
- `apps/site/public/logo-light.svg`
- `apps/site/public/logo-email.png`
- `apps/site/public/og-default.png`
- `apps/site/src/assets/logo-dark.svg`
- `apps/site/src/assets/logo-icon.svg`
- `apps/site/src/assets/logo-light.svg`
- `apps/site/src/assets/logo-wordmark.svg`

The new logo palette uses warm, sturdy PebbleDesk brand colors:

- Sage: `#6f8b72`
- Navy: `#243446`
- Cream: `#f3e7d6`
- Coral: `#d97b67`

### Marketing Site Tests

- Added `apps/site/src/test/logo-assets.test.ts`
- Updated `apps/site/src/config/site.test.ts`
- Updated `apps/site/src/content.config.ts` through Biome import ordering

The tests check that old logo colors/shapes are gone, new brand colors are present, the Open Graph image is `1200x630`, and the email PNG is `32x32`.

### Web App Brand Component

- Updated `apps/web/src/components/brand-mark.tsx`
- Updated `apps/web/src/components/brand-mark.test.tsx`

The `BrandMark` component now renders the new inline SVG mark plus live text wordmark, with configurable wordmark color so it works in both the sidebar and public auth shells.

### Web App Logo Placements

Added or verified the new logo in:

- `apps/web/src/routes/login.tsx`
- `apps/web/src/routes/signup.tsx`
- `apps/web/src/routes/start-trial.tsx`
- `apps/web/src/routes/forgot-password.tsx`
- `apps/web/src/routes/reset-password.tsx`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/components/root-error-boundary.tsx`
- `apps/web/src/routes/_auth.tsx`
- `apps/web/src/routes/_auth/dashboard.tsx`
- `apps/web/src/routes/onboarding.tsx`
- `apps/web/src/components/pending-invitation-card.tsx`
- `apps/web/public/favicon.svg`

Updated tests across the corresponding web app routes and components to assert brand presence in auth pages, password reset pages, error states, recovery states, onboarding, dashboard recovery, and invitation flows.

### Email Templates

- Updated `packages/emails/package.json`
- Updated `packages/emails/src/layout.tsx`
- Updated `packages/emails/src/subscription-layout.tsx`
- Updated `packages/emails/__tests__/templates.test.ts`
- Updated `packages/emails/__tests__/subscription-emails.test.ts`
- Updated `pnpm-lock.yaml`

Emails now use the hosted PNG logo URL plus live text fallback for better client compatibility.

### API-Generated Emails

- Added `apps/api/src/lib/brand-email.ts`
- Updated `apps/api/src/routes/messages.ts`
- Updated `apps/api/src/routes/members.ts`
- Updated `apps/api/src/routes/invoices.ts`
- Updated tests:
  - `apps/api/src/routes/messages.test.ts`
  - `apps/api/src/routes/members.test.ts`
  - `apps/api/src/routes/invoices.test.ts`

Customer-facing raw API emails now prepend a centralized branded header. The internal feedback email was intentionally left plain.

## Review Findings Fixed

The review passes found and the implementation fixed:

- Root route error/not-found states were missing the logo.
- Forgot/reset password pages were missing the logo.
- Email logo usage needed a PNG fallback instead of relying only on SVG.
- Sidebar logo text color needed to preserve contrast.
- Raw API email branding was duplicated and needed a helper.
- Dashboard recovery state was unbranded.
- Onboarding recovery state was unbranded.
- Invoice emails were unbranded.
- Full-page pending invitation state was unbranded.

## Verification Completed

Passed:

- `git diff --check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Targeted API tests:
  - `pnpm --filter @pebbledesk/api test -- src/routes/invoices.test.ts src/routes/messages.test.ts src/routes/members.test.ts`
- Targeted web tests:
  - `pnpm --filter @pebbledesk/web test -- src/components/pending-invitation-card.test.tsx src/routes/auth-shell.test.tsx`

Known warnings during successful build:

- Existing TanStack route warning for `apps/web/src/routes/_auth/billing-state.ts`
- Existing large web bundle chunk warning
- Marketing build IndexNow warning: `429 Too Many Requests`
- Wrangler dry-run warning about multiple environments when no explicit env is passed

Coverage:

- `pnpm test -- --coverage` failed because Turbo received the wrong argument syntax.
- Retried as `pnpm exec turbo test "--" "--coverage"`.
- Coverage ran but failed existing repo-wide thresholds in unrelated files. Normal tests passed.

## Deployment Status

Attempted:

- `pnpm cf:deploy:touched`

Result:

- Failed in `scripts/cloudflare/deploy-project.ps1` while detecting touched deploy targets against `HEAD`.
- Error: `The property 'Count' cannot be found on this object.`

Attempted:

- `pnpm cf:deploy:touched` with `PEBBLEDESK_DEPLOY_BASE_REF=HEAD^1`

Result:

- Exited unsuccessfully without useful output.

Attempted:

- `pnpm cf:deploy:api`

Result:

- Exited unsuccessfully without useful output from the wrapper.

Completed:

- Direct API deploy from `apps/api`:
  - `pnpm exec wrangler deploy --env production`

Result:

- API deployed successfully to `pebbledesk-api-production`
- Version ID: `e15b2d3c-44fd-415a-8e3d-8d20640374ed`
- Routes/triggers deployed:
  - `api.pebbledesk.app/*`
  - `*/5 * * * *`
  - `0 3 * * *`
  - `0 9 * * 1`

Interrupted:

- Web app deploy was started with `scripts/cloudflare/deploy-web.ps1`, then this report request interrupted the flow before a confirmed result.

Not completed yet:

- Confirmed web app Cloudflare Pages deploy
- Confirmed marketing site Cloudflare Pages deploy

## Missing / Next To Do

1. Deploy the web app to Cloudflare Pages:
   - `pnpm cf:deploy:web`
2. Deploy the marketing site to Cloudflare Pages:
   - `pnpm cf:deploy:site`
3. Re-run or fix `pnpm cf:deploy:touched` so touched deploy detection handles a single project result without the `.Count` PowerShell error.
4. Optionally fix repo-wide coverage thresholds or scope coverage enforcement so unrelated low-coverage files do not block this logo rollout.
5. Visually check production after deploy:
   - `https://pebbledesk.app`
   - `https://my.pebbledesk.app`
   - `https://api.pebbledesk.app/api/health`
6. Verify a real delivered email in an email client to confirm the PNG logo renders and the live text fallback appears correctly.

## Current Working Tree Notes

At the time this report was created, the only visible untracked file in the main checkout was:

- `docs/superpowers/specs/2026-04-25-whole-site-ux-improvement-design.md`

That file was unrelated to this logo rollout and was left untouched.
