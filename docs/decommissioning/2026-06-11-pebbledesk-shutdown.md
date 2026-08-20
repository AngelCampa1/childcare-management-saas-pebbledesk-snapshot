# PebbleDesk Shutdown Record

Date: 2026-06-11

PebbleDesk is retired. This repository remains as the archival record only.

## Verified Cloudflare State

- Deleted Worker: `pebbledesk-api-production`.
- Worker inventory after deletion: zero Worker scripts matching `*pebble*`.
- Pages inventory: no PebbleDesk Pages projects.
- R2 inventory: no PebbleDesk buckets.
- D1 inventory: no PebbleDesk databases.
- Hyperdrive inventory: no PebbleDesk Hyperdrive configs.
- KV and queue inventory: no PebbleDesk-named resources found.
- Email Routing inventory: no zones found with Email Routing in this Cloudflare account.

Live host checks after deletion and DNS removal:

- `https://api.pebbledesk.app/api/health` does not resolve.
- `https://my.pebbledesk.app/` does not resolve.
- `https://pebbledesk.app/` does not resolve.
- `https://www.pebbledesk.app/` does not resolve.
- `https://cdn.pebbledesk.app/` does not resolve.

## Repository Guardrails

- `scripts/cloudflare/deploy-api.ps1`, `deploy-web.ps1`, `deploy-site.ps1`, and
  `deploy-project.ps1` intentionally throw instead of deploying.
- `apps/api/wrangler.jsonc`, `apps/web/wrangler.jsonc`, and `apps/site/wrangler.jsonc`
  are non-deployable decommission records. They intentionally omit Worker `name`, `main`,
  asset, route, and binding configuration so raw `wrangler deploy` fails before recreating
  PebbleDesk Workers.
- No shutdown Worker entrypoints are retained; the intended state is no PebbleDesk Worker
  recreation from this repository.

## Postiz State

- `scripts/postiz-schedule-linkedin-calendar.mjs` now exits nonzero and refuses to create,
  upload, or schedule PebbleDesk LinkedIn posts through Postiz.
- PebbleDesk X integration `cmq5d28va00ovmv0ys1z8r4gr` is disabled.
- PebbleDesk LinkedIn integration `cmorpckmz03sbqi0yay2i3ds6` is disabled.
- A later `postiz integrations:list` check returned no connected PebbleDesk integrations.
- Search window `2026-06-11T00:00:00Z` through `2026-06-15T00:00:00Z` found 12
  PebbleDesk matches: 11 `PUBLISHED`, 1 `ERROR`, 0 queued.
- Search window `2026-06-15T00:00:00Z` through `2026-08-01T00:00:00Z` found 0
  PebbleDesk matches.
- A later `postiz posts:list --startDate "2026-06-11T00:00:00Z" --endDate
  "2026-08-01T00:00:00Z"` check filtered for `PebbleDesk`, `pebbledesk`, and `Pebble`
  returned no matches.

## Google Search Console State

- Property `sc-domain:pebbledesk.app` existed with no submitted sitemaps.
- The `sc-domain:pebbledesk.app` property was removed.
- Verification after removal: `sc-domain:pebbledesk.app` no longer appears in the property list.

## Neon State

- Deleted project: `snowy-wind-09622188`, named `Pebbledesk`.
- Deleted branches with the project: `production` (`br-morning-unit-am0bct0e`) and
  `local-e2e-pristine` (`br-square-sea-amqrpjls`).
- Deleted computes with the project: `ep-icy-tooth-amkbpujk` and `ep-damp-block-amdqx2u8`.
- Verification after deletion: Neon project searches for `snowy-wind-09622188` and
  `Pebbledesk` returned no projects in organization `org-late-surf-71944343`.

## External Checks Still Requiring Dashboard Confirmation

- Stripe CLI was authenticated to a non-PebbleDesk display account. Read-only product and
  webhook searches found no PebbleDesk matches there, but this does not prove all Stripe
  cleanup is complete across any other accounts.
- Sentry CLI was authenticated, but organization listing failed due a CLI/API schema mismatch.
  A direct project search under `ventora-labs` found no PebbleDesk matches.
- Resend CLI was installed but not authenticated, so domains and webhooks could not be
  verified.
- No authenticated tool was available in this session for PostHog, Google OAuth,
  QuickBooks/Intuit, or domain registrar deletion. Treat those as separate external cleanup
  checks unless current dashboard state proves they are already removed or disabled.
