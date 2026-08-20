# Decommissioning: what shutting a product down actually involved

PebbleDesk was retired on 2026-06-11. The raw record of that shutdown is
[`docs/decommissioning/2026-06-11-pebbledesk-shutdown.md`](../docs/decommissioning/2026-06-11-pebbledesk-shutdown.md),
a checklist run against live infrastructure, with the output of each check written down. This
document does not replace it or edit it. This is the reader-facing walkthrough of why that record
looks the way it does, and why its most rigorous section is the one that names what it could not
confirm.

Turning off a product touches a working set of external systems, and every one of them can
silently keep serving traffic, keep billing a card, or keep a domain looking "live" if you only
delete the parts you remember. The interesting part of a shutdown record isn't the list of things
that got deleted: it's whether the person who wrote it was willing to also list what they
couldn't confirm.

- [What got checked, and how](#what-got-checked-and-how)
- [DNS and live-host verification](#dns-and-live-host-verification)
- [Neon: the database itself](#neon-the-database-itself)
- [Search visibility and social integrations](#search-visibility-and-social-integrations)
- [Making the repository itself refuse to redeploy](#making-the-repository-itself-refuse-to-redeploy)
- [The part that matters most: what could not be verified](#the-part-that-matters-most-what-could-not-be-verified)
- [The general lesson](#the-general-lesson)

---

## What got checked, and how

PebbleDesk ran on Cloudflare Workers, so the shutdown record starts with a Cloudflare account
inventory across every resource type the product could have used: Worker scripts, Pages projects,
R2 buckets, D1 databases, Hyperdrive configs, KV namespaces, queues, and Email Routing rules. The
record states the result of each check, not just a summary: "Worker inventory after deletion:
zero Worker scripts matching `*pebble*`," "R2 inventory: no PebbleDesk buckets," "Hyperdrive
inventory: no PebbleDesk Hyperdrive configs," and so on for KV/queues and Email Routing. Six
separate checks, six separate negative results, rather than one line that says "Cloudflare is
clean."

That level of granularity matters because a Cloudflare account shutdown is not one delete
operation. A Worker can be gone while its bound R2 bucket or D1 database survives, still holding
data, still billing storage, still reachable by anyone who knows the resource name. Checking each
binding type separately is the only way to know that didn't happen here.

## DNS and live-host verification

Deleting cloud resources doesn't prove a domain stopped resolving to them: DNS can be stale, a
CDN edge can cache a response, or a redirect rule can point somewhere unexpected. The shutdown
record verifies five hostnames directly, after the Cloudflare deletions and DNS record removal:

- `https://api.pebbledesk.app/api/health` does not resolve.
- `https://my.pebbledesk.app/` does not resolve.
- `https://pebbledesk.app/` does not resolve.
- `https://www.pebbledesk.app/` does not resolve.
- `https://cdn.pebbledesk.app/` does not resolve.

Five hostnames, not one. `pebbledesk.app` and `www.pebbledesk.app` are different DNS records that
can drift independently; `cdn.pebbledesk.app` is easy to forget if it was set up once for a static
asset host and never touched again. Checking the apex, the `www` alias, the API host, the app
host, and the CDN host separately is what makes "the site is down" into something that was
actually confirmed rather than assumed from the marketing domain alone.

## Neon: the database itself

The application database (Neon Postgres, reached in production through Cloudflare Hyperdrive)
gets the same treatment as the Cloudflare resources: named identifiers, not a general statement.
The record names the deleted project (`snowy-wind-09622188`, display name `Pebbledesk`), both
branches deleted with it (`production` at `br-morning-unit-am0bct0e`, and
`local-e2e-pristine` at `br-square-sea-amqrpjls`), and both computes (`ep-icy-tooth-amkbpujk`,
`ep-damp-block-amdqx2u8`). It then re-searches the Neon organization
(`org-late-surf-71944343`) for both the project ID and the display name and records that neither
turned up a result.

Naming the branch that held a full pre-production/E2E copy of the schema (`local-e2e-pristine`)
matters on its own: a "staging" or "test" branch of a production database is exactly the kind of
resource that survives a cleanup because nobody thinks of it as production.

## Search visibility and social integrations

Two categories that aren't infrastructure but are still externally visible surface area:

**Google Search Console.** The `sc-domain:pebbledesk.app` property existed (with no submitted
sitemaps, per the record) and was removed; the record confirms the property no longer appears in
the property list afterward. A domain that keeps showing up in someone's Search Console account
after a product is dead is a minor but real leftover: it's a live credential to a defunct
product's search data.

**Postiz (social scheduling).** The record disables the PebbleDesk X integration
(`cmq5d28va00ovmv0ys1z8r4gr`) and LinkedIn integration (`cmorpckmz03sbqi0yay2i3ds6`), confirms via
`postiz integrations:list` that no PebbleDesk integrations remain connected, and then does
something more specific than "check it's off": it searches for scheduled or queued PebbleDesk
posts in two separate windows: `2026-06-11T00:00:00Z` through `2026-06-15T00:00:00Z` (12 matches:
11 published, 1 error, 0 still queued) and `2026-06-15T00:00:00Z` through `2026-08-01T00:00:00Z`
(0 matches). The point of the second search is to prove there was nothing left in the pipeline
that could fire after the account was disabled: disabling an integration stops new posts from
being *created*, it doesn't necessarily cancel posts that were already scheduled inside it.

## Making the repository itself refuse to redeploy

Deleting the live infrastructure stops the product from running today. It doesn't stop someone
(a future contributor, an automated CI job, a future version of an AI coding agent working in this
repo without full context) from running `wrangler deploy` against `apps/api` and recreating a
Worker that starts serving traffic under a domain nobody intended to revive. The repository has
two layers of guardrail against that, both meant to fail loudly rather than quietly:

**The deploy scripts throw.** `scripts/cloudflare/deploy-api.ps1`, `deploy-web.ps1`,
`deploy-site.ps1`, and `deploy-project.ps1` no longer deploy anything. Each is now three lines:

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

throw "PebbleDesk has been decommissioned. Refusing to deploy the retired API Worker."
```

**The `wrangler.jsonc` files are decommission records, not configs.** Reading
[`apps/api/wrangler.jsonc`](../apps/api/wrangler.jsonc) directly, the entire file:

```jsonc
{
	"decommissioned": true,
	"note": "PebbleDesk has been decommissioned. Do not deploy Cloudflare Workers from this repo."
}
```

`apps/web/wrangler.jsonc` and `apps/site/wrangler.jsonc` are the same shape. A `wrangler.jsonc`
normally carries the Worker's `name`, `main` entrypoint, routes, and resource bindings:
everything `wrangler deploy` needs to know what to build and where to send it. None of that is
present here. Even if someone bypassed the throwing PowerShell scripts and ran `wrangler deploy`
directly against one of these apps, there's no `name` to deploy under, no `main` to build, and no
route or binding to attach: the command has nothing to act on. The scripts stop the easy path;
the config files stop the path that skips the scripts.

## The part that matters most: what could not be verified

Everything above the fold in the shutdown record reads as complete, because it's phrased as
completed, verified, negative-result checks. The record's last section is different in kind, and
it's the one worth reading most carefully:

> Stripe CLI was authenticated to a non-PebbleDesk display account. Read-only product and webhook
> searches found no PebbleDesk matches there, but this does not prove all Stripe cleanup is
> complete across any other accounts.
>
> Sentry CLI was authenticated, but organization listing failed due a CLI/API schema mismatch. A
> direct project search under `ventora-labs` found no PebbleDesk matches.
>
> Resend CLI was installed but not authenticated, so domains and webhooks could not be verified.
>
> No authenticated tool was available in this session for PostHog, Google OAuth,
> QuickBooks/Intuit, or domain registrar deletion. Treat those as separate external cleanup checks
> unless current dashboard state proves they are already removed or disabled.

Four different failure modes, spelled out rather than collapsed into "some things weren't
checked": Stripe was checked, but against the wrong account, so the "no matches" result only rules
out one place PebbleDesk data could exist. Sentry's CLI *worked* for authentication but not for
listing organizations: a tooling bug that stopped a real verification partway through, distinct
from the Stripe case where the check ran cleanly against the wrong scope. Resend had no
credentials in this session at all, so nothing was checked. PostHog, Google OAuth, QuickBooks, and
the domain registrar weren't attempted because no tooling was available for any of them: that's
different again from "attempted and failed."

This is the most useful part of the whole record, for one reason: a shutdown document that claims
every external system was confirmed clean is not more trustworthy than this one: it's less
trustworthy, because "everything checked out" from a session that only had working credentials for
some of the relevant tools is either lucky or dishonest. Seven systems across four failure modes
(Stripe, Sentry, Resend, PostHog, Google OAuth, QuickBooks and the domain registrar), correctly
labeled as unverified, is a more accurate set of open questions than a document that
silently rounds "checked with the wrong account" or "wasn't checked" up to "verified clean." A
reader of this record (including whoever eventually audits this account for real) knows exactly
where to look next: Stripe under whatever account PebbleDesk's payments actually ran on, Sentry
once the CLI/API mismatch is fixed or the dashboard is checked by hand, Resend once someone
authenticates the CLI, and PostHog/Google OAuth/QuickBooks/the registrar from scratch.

## The general lesson

A decommission is not one action, it's a checklist against a set of systems that were never
inventoried in one place while the product was alive, because nothing forced anyone to. Writing
the checklist *at* shutdown time is also writing the only complete inventory of external
dependencies the product ever had: Cloudflare's seven resource types, five live hostnames, one
database project with two branches, one search-console property, two social integrations, and (at
minimum) four billing/analytics/error-tracking/OAuth systems that were never confirmed either way.

The instinct to omit the "still requires dashboard confirmation" section, or to soften it into
something that sounds finished, is understandable: nobody wants their shutdown record to look
incomplete. But an incomplete shutdown that says so is something the next person can act on. An
incomplete shutdown that claims completeness is a liability that looks resolved until someone
finds the Stripe webhook, the PostHog project, or the still-registered domain that the record never
actually checked.
