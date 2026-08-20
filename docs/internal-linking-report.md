# Internal Linking Implementation Report

Date: 2026-04-27
Branch: `codex/internal-linking`
Worktree: `<local-path>`
Status: Historical report. Merged to `master` and deployed; the notes below preserve the
implementation record from the original worktree review.

## Goal

Strengthen PebbleDesk marketing-site internal linking so:

- No single generated page is orphaned.
- SEO pages link into relevant resource, comparison, feature, pricing, and free-tool pages.
- SEO pages are organized in a parsable Resources megamenu.
- Every internal link points to a real route.
- Broken links are caught by tests, build behavior, and the crawler.

## Plan

1. Explore the marketing site routing, navigation, content collections, and related-link patterns.
2. Fix generated SEO route coverage so all content entries render in Astro 6.
3. Build a Resources megamenu that exposes all major SEO page families.
4. Add missing hub coverage for free lead magnets and printable resource pages.
5. Strengthen related-link resolution so authored broken links fail loudly.
6. Normalize internal links in generated HTML to canonical trailing-slash routes.
7. Harden the link checker against production-origin sitemap URLs and known bot-protected external links.
8. Run focused and broad verification, including a full local link crawl.
9. Run independent spec, code, and focused review agents.
10. Document remaining blockers before merge/deploy.

## Implementation Summary

### Navigation And Resources Megamenu

Updated:

- `apps/site/src/config/site.ts`
- `apps/site/src/config/site.test.ts`
- `packages/marketing/src/components/site-header.astro`
- `packages/marketing/src/components/site-header-source.test.ts`
- `packages/marketing/src/types.ts`

Changes:

- Added grouped navigation support through `NavItem.groups`.
- Rebuilt Resources as a desktop megamenu and mobile grouped menu.
- Added Resources groups for Start Here, Guides, Best Software, Compare, Pricing Research, State Compliance, and Free Tools.
- Expanded footer Resources and Compare links for stronger crawl paths.

### Astro Content And SEO Route Generation

Updated:

- `apps/site/src/content.config.ts`
- `apps/site/src/test/content-config-source.test.ts`
- `apps/site/src/lib/page-helpers.ts`
- `apps/site/src/lib/page-helpers.test.ts`

Changes:

- Migrated Astro content collections to explicit `glob` loaders for Astro 6.
- Added shared `entrySlug()` to normalize content entry IDs, nested IDs, and `.md/.mdx` extensions.
- Fixed dynamic route generation so the build emits 200 pages instead of the earlier incomplete output.

### SEO Page Linking And Related Resources

Updated:

- `apps/site/src/pages/resources/guides/[slug].astro`
- `apps/site/src/pages/resources/best/[slug].astro`
- `apps/site/src/pages/childcare-software/[slug].astro`
- `apps/site/src/pages/features/[slug].astro`
- `apps/site/src/pages/compare/alternatives/[slug].astro`
- `apps/site/src/pages/compare/pricing/[slug].astro`
- `apps/site/src/pages/compare/versus/[slugA]-vs-[slugB].astro`
- `apps/site/src/pages/free/[slug].astro`
- `apps/site/src/pages/free/[slug]/print.astro`
- `apps/site/src/pages/childcare-software/index.astro`
- `apps/site/src/pages/features/index.astro`
- `apps/site/src/pages/resources/best/[...page].astro`
- `apps/site/src/pages/resources/guides/[...page].astro`
- `apps/site/src/test/internal-links-source.test.ts`
- `apps/site/src/test/marketing-hubs-source.test.ts`

Changes:

- Updated dynamic SEO pages to use Astro `render()` and shared `entrySlug()`.
- Ensured SEO detail pages build related links from the full content map.
- Added features to the related-link content map so pages can link into the product funnel.
- Fixed listing page source issues that could break rendered hubs.

### Free Resource Hub And Printable Routes

Added:

- `apps/site/src/pages/free/index.astro`
- `packages/marketing/src/components/lead-magnet-page-source.test.ts`

Updated:

- `packages/marketing/src/components/lead-magnet-page.astro`
- `apps/site/src/pages/free/[slug].astro`
- `apps/site/src/pages/free/[slug]/print.astro`

Changes:

- Added a `/free/` hub for all lead magnets.
- Added related resource rendering to lead magnet pages.
- Added visible links from each lead magnet page to its printable route so print pages are not orphaned.

### Related Link Integrity

Updated:

- `apps/site/src/lib/page-helpers.ts`
- `apps/site/src/lib/page-helpers.test.ts`

Changes:

- `resolveRelatedLinksWithFallback()` now preserves valid authored links first.
- Self-links and duplicates are skipped.
- Fallback links top up pages to the minimum link count.
- Missing authored `relatedPages` now throw an error instead of being silently replaced, preventing typo-masked broken links.

### Internal Link Normalization

Added:

- `apps/site/src/lib/internal-link-normalization.ts`
- `apps/site/src/lib/internal-link-normalization.test.ts`

Updated:

- `apps/site/astro.config.mjs`

Changes:

- Added an Astro integration that rewrites generated HTML `href` values to canonical trailing-slash internal URLs.
- Preserves external URLs, fragments, mailto/tel links, assets, `_astro`, `cdn-cgi`, and already-normalized paths.
- Added recursive generated-HTML rewrite tests.

### RSS And LLM Output

Updated:

- `apps/site/src/lib/llms.ts`
- `apps/site/src/lib/llms.test.ts`
- `apps/site/src/pages/rss.xml.ts`

Changes:

- Reused shared `entrySlug()` in llms helpers.
- Ensured RSS item links use canonical trailing-slash URLs.
- Kept llms URL generation aligned with generated SEO paths.

### Link Checker Hardening

Updated:

- `apps/site/scripts/check-links.ts`

Changes:

- Localizes production `https://pebbledesk.app` sitemap URLs to the local preview base during local crawls.
- Localizes sitemap child indexes and seed URLs.
- Treats internal absolute production-origin URLs as internal during preview checks.
- Ignores known bot-protected external 403s from `www.acf.hhs.gov` rather than counting them as broken.
- Confirmed local crawl: 197 pages visited, 0 broken links.

### Test Fixture Maintenance

Updated:

- `packages/marketing/src/lib/sitemap-dates-integration.test.ts`

Changes:

- Removed stale `routes: []` fields from Astro build hook test fixtures.
- This fixed `@pebbledesk/marketing` TypeScript build failures unrelated to the internal-linking implementation.

## Verification Completed

Passed:

- `pnpm lint`
- `pnpm --filter @pebbledesk/site test`
- `pnpm --filter @pebbledesk/site test -- --coverage`
- `pnpm --filter @pebbledesk/site typecheck`
- `pnpm --filter @pebbledesk/site build`
- `pnpm --filter @pebbledesk/marketing test`
- `pnpm --filter @pebbledesk/marketing build`
- `pnpm --filter @pebbledesk/site check:links -- --base http://127.0.0.1:4332`

Key results:

- Site tests: 575 passed.
- Site coverage: 99.32% lines, 95.9% branches.
- Marketing tests: 2272 passed.
- Site build: 200 pages built.
- Link crawl: 197 pages visited, 0 broken links.

Review signoffs:

- Spec review: clean.
- Code review: clean.
- Final focused review: clean.

## Historical Follow-Up Notes

### Coverage Gate Note

The top-level coverage command did not complete:

```bash
pnpm test -- -- --coverage
```

Observed behavior:

- First run exposed a stale marketing test fixture type issue; that was fixed.
- Later runs failed or timed out due `@pebbledesk/marketing` V8 coverage heap allocation/OOM behavior.
- Retries with larger `NODE_OPTIONS` heap and lower worker counts still timed out or hit heap allocation errors.

Historical interpretation:

- This is a repo-level coverage execution/resource issue, not a failing assertion in the internal-linking changes.
- Package-level site coverage, marketing non-coverage tests, and marketing build all pass.
- The original branch waited on this before merge. The implementation has since been merged to
  `master` and deployed.

### Recommended Next Steps

1. Investigate `@pebbledesk/marketing` coverage memory behavior.
2. Consider splitting marketing coverage by file group or lowering V8 coverage concurrency in `packages/marketing/vitest.config.ts`.
3. Rerun the top-level coverage gate.
4. Keep package-level coverage and source tests green when editing the internal-linking surface.
5. Run `pnpm cf:deploy:touched` from clean `master` after future marketing-site changes.

### Non-Blocking Residual Risks

- The HTML normalizer only rewrites generated HTML `href` attributes. XML and text outputs need explicit canonical URL handling, which was added for RSS but should be remembered for future non-HTML outputs.
- Relative links such as `pricing` are intentionally left unchanged by normalization. Current site patterns use root-relative internal links, but future relative links could bypass the normalizer.
- The local link checker can be sensitive to preview/static server behavior, but the final crawl against `http://127.0.0.1:4332` completed cleanly with 0 broken links.

## Current State

Implementation is complete, reviewed, merged to `master`, and deployed. The remaining useful note
from this report is the historical coverage-command behavior, not an active internal-linking
release blocker.
