# Architecture

How PebbleDesk was put together: the monorepo layout, the request path from browser to database,
how auth and tenancy worked, what Cloudflare Workers forced, and where the tenancy guarantee is
solid versus where it depended on discipline rather than a generic check. Everything below is
past tense: the product is decommissioned and none of these services are reachable.

- [Monorepo layout](#monorepo-layout)
- [Why Turborepo and pnpm](#why-turborepo-and-pnpm)
- [The request path](#the-request-path)
- [Auth](#auth)
- [Multi-tenancy via center_id](#multi-tenancy-via-center_id)
- [What Cloudflare Workers forced](#what-cloudflare-workers-forced)
- [The shared Zod-validator boundary](#the-shared-zod-validator-boundary)
- [Deploy scripts now refuse to run](#deploy-scripts-now-refuse-to-run)

---

## Monorepo layout

```text
pebbledesk/
├── apps/
│   ├── web/: React 19 + Vite SPA, TanStack Router + Query
│   ├── api/: Hono on Cloudflare Workers, 34 route modules
│   └── site/: Astro 5 marketing site, 40 pages
├── packages/
│   ├── db/: Drizzle schema (44 tables), 68 migrations, Neon client
│   ├── auth/: Better Auth server + client config
│   ├── shared/: Zod validators, types, constants, the state ratio tables
│   ├── ui/: Shadcn/UI (new-york), Tailwind, design tokens
│   └── marketing/: shared Astro layouts and SEO primitives
└── tools/qa/: QA harness
```

[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) declares three workspace globs (`apps/*`,
`packages/*`, `tools/*`), and [`turbo.json`](../turbo.json) defines the task graph on top of that:
`build` depends on `^build` (build a package's dependencies before the package itself), `typecheck`
and `test` depend on `^build` for the same reason, and `dev`/`test:watch` are marked
`persistent`/uncached so Turborepo doesn't try to memoize a process that never exits.

Three apps import from six shared packages, unevenly. `apps/web` and `apps/api` both depend on
`@pebbledesk/shared` for Zod schemas and constants, both depend on `@pebbledesk/db` for the Drizzle
schema (the web app for types only; the API for the live client: `apps/web` does not depend on
`@pebbledesk/db` directly, only through `@pebbledesk/shared`'s re-exports), and both depend on
`@pebbledesk/auth` for the Better Auth config. `apps/web` alone pulls `@pebbledesk/ui` for Shadcn
components; `apps/api` and `apps/site` alone pull `@pebbledesk/emails` for transactional templates.
`apps/site` is otherwise independent: it pulls `@pebbledesk/marketing` and `@pebbledesk/shared`'s
public-knowledge constants, not the app schema.

## Why Turborepo and pnpm

The practical reason is dependency direction: `apps/api` cannot type-check without
`@pebbledesk/db`'s generated types, `@pebbledesk/auth` cannot compile without `@pebbledesk/db`'s
`users`/`sessions`/`accounts` tables, and `apps/web` cannot type-check without `@pebbledesk/shared`'s
Zod-inferred types. Turborepo's `dependsOn: ["^build"]` encodes that graph once, in one file,
instead of every app's `package.json` scripts having to know the correct build order by hand.

pnpm's workspace protocol (`workspace:*`) is what makes five internal packages behave like normal
npm dependencies without publishing them anywhere: `apps/api/package.json` depends on
`"@pebbledesk/db": "workspace:*"` and pnpm symlinks it from `packages/db` instead of hitting a
registry. That matters more than usual here because there was no registry to hit: this was a
single-team, single-repo project, so the workspace protocol is doing exactly the job it exists for
and nothing more.

## The request path

Browser → Cloudflare Worker → Hyperdrive → Neon Postgres, with a Durable Object in the loop for
rate limiting.

1. **Browser.** `apps/web` is a Vite-built SPA using TanStack Router for routing and TanStack Query
   for server state. It calls the API with `fetch` (via a thin wrapper, `apiFetch`), not a
   generated client: there is no OpenAPI spec or codegen step between the two apps.

2. **Cloudflare Worker.** `apps/api/src/index.ts` builds one Hono app (469 lines) and layers roughly
   a dozen `app.use("*", ...)` middlewares onto it before any route is mounted. In order: request-ID
   assignment, one-time-per-isolate env validation (`envValidatedMap`, a `WeakMap` keyed on the env
   bindings object: see below), security headers, CORS (origin allow-list built from `APP_URL`),
   a CSRF origin-header check, a 1 MB body-size limit (imports are exempted and rely on a 500-row
   Zod cap instead), then a stack of named rate-limit buckets (sign-in, sign-up, guardian-create,
   message-send, member-invite, reports, a 180 req/min global bucket, and a tighter one on the
   public feedback form) before `initMiddleware` sets up the DB client and Better Auth instance and
   `auditMiddleware` logs mutations after the handler runs. Only after all of that does `app.route()`
   mount the 34 route modules (`apps/api/src/index.ts:310` onward).

3. **Hyperdrive.** [`packages/db/src/client.ts`](../packages/db/src/client.ts) picks between two
   Postgres drivers at request time: `postgres-js` over a real TCP connection when a Hyperdrive
   binding is present (`resolveDbDriver`, lines 16-30), or Neon's HTTP driver (`neon-http`)
   otherwise. The comment at the top of the file is specific about why this matters:

   > Production driver: neon-http (HTTP, stateless). `db.transaction()` calls are NOT atomic in
   > production — neon-http does not support real multi-statement transactions or `FOR UPDATE` row
   > locks. To get real atomicity, wire a Hyperdrive binding pointing to neon-serverless WebSocket.

   `assertProductionDbDriver` (lines 68-78) throws at cold start if `APP_URL` looks like production
   (`https://`) and no Hyperdrive binding exists, so a missing binding fails loudly at isolate
   startup instead of silently degrading every transactional route to non-atomic behavior. The
   check itself is cached per-isolate with the same `WeakMap`-on-env-object pattern used for env
   validation (`apps/api/src/index.ts:77`): a Worker isolate can be reused across many
   requests, so a plain module-level boolean would either never re-check or incorrectly persist
   across different env bindings if the isolate got reused with a different environment.

4. **Neon Postgres.** The actual database. Drizzle ORM is the only thing that talks to it: there is
   no raw-SQL layer outside migrations and the small number of `sql\`...\`` escapes visible in
   [`packages/db/tests/integrity.test.ts`](../packages/db/tests/integrity.test.ts).

## Auth

Better Auth (raw, not a hosted product) provides email/password and Google OAuth.
[`packages/auth/src/server.ts`](../packages/auth/src/server.ts) wires it to the Drizzle schema via
`drizzleAdapter`, maps PebbleDesk's `users`/`sessions`/`accounts`/`verifications` tables onto Better
Auth's expected shape (`AUTH_SCHEMA`, lines 9-14), and configures a 5-minute `cookieCache` (lines
126-131) so most requests don't need a DB round-trip just to confirm a session is still valid. In
production, cookies are `secure` and shared across subdomains via `crossSubDomainCookies` (lines
85-94); in development neither applies.

Session resolution and center-scoping happen in
[`apps/api/src/middleware/auth.ts`](../apps/api/src/middleware/auth.ts), which exports four pieces
that route modules compose:

- **`requireAuth`** (lines 139-167) calls Better Auth's `getSession` via
  `resolveSessionUserId` (lines 66-79), which narrows session-validation failures (anything with a
  numeric `status`/`statusCode`, or Better Auth's own `APIError`) from genuine DB/network errors:
  the former means "not logged in," the latter should still throw. If a session resolves, it then
  calls `resolveActiveMembershipContext` (see below) to figure out which center the request is
  scoped to, and sets `userId`, `centerId`, `membershipId`, and `role` on the Hono context.
- **`requireCenter`** (lines 193-199) is a thin guard that 403s if `centerId` never got set:
  i.e., the user is authenticated but has no active membership in any center, or hasn't picked one.
- **`requireRole(...roles)`** (lines 169-179) and **`requirePermission(permission)`** (lines
  181-191) are two different gates on the same `role` value: `requireRole` checks literal role
  membership (`"owner"`, `"director"`, `"staff"`), `requirePermission` checks a capability against
  the role→permission table in `packages/shared/src/constants/roles.ts` via `hasPermission`. The
  file-header comment on `auth.ts` documents the grant table directly (owner has every permission;
  director has operational and read access but not `quickbooks:manage`, `members:remove`, or
  `center:settings`; staff has only check-in, ratio-read-own-room, and message-send-own-room) and
  recommends composing both guards ("belt-and-suspenders") on sensitive routes so a future change
  to the permission table can't silently widen access on its own.

  That pattern is not hypothetical: `apps/api/src/routes/audit-log.ts:29-33` mounts
  `requireAuth`, `requirePermission("audit-log:read")`, *and* `requireRole("owner", "director")` on
  the same route, with a comment explaining the redundancy is deliberate: `requirePermission` gates
  by the role→permission table, `requireRole` is a second, independent check that doesn't depend on
  that table being correct.

Which center a request is scoped to is resolved by
[`resolveActiveMembershipContext`](../apps/api/src/lib/membership-context.ts) (73 lines): it loads
the user's active (non-deactivated, accepted) memberships, prefers a `x-pebbledesk-center` cookie if
it points at a still-valid membership, auto-resolves for users with exactly one membership, and
otherwise returns a `CENTER_SELECTION_REQUIRED` error the frontend uses to show a center picker. A
small allow-list (`AUTH_ONLY_PATHS` in `auth.ts:41-45`: `/api/memberships/mine`,
`/api/memberships/switch`, `/api/overview/multi-center`) lets multi-center users hit those specific
endpoints before they've picked a center.

## Multi-tenancy via `center_id`

Every tenant-scoped table carries a `center_id` column, and the more interesting guarantee is that
many of the foreign keys referencing those tables are **composite**: they reference
`(id, center_id)` on the parent table, not just `id`. `packages/db/tests/integrity.test.ts` (1,323
lines) asserts a large number of these directly. One representative pair, from the
`classroom_assignments` → `children` relationship (`describe("center-scoped composite foreign
keys")`, migration `0037_classroom_assignment_center_scope.sql`):

```sql
ADD CONSTRAINT "classroom_assignments_child_center_fk"
FOREIGN KEY ("child_id", "center_id")
REFERENCES "children" ("id", "center_id")
```

Because `children.id` alone isn't enough to satisfy that constraint (the referencing row's
`center_id` has to match too), a `classroom_assignments` row cannot point at a child in a different
center. That's enforced by Postgres itself, not by application code remembering to filter. The test
file has the same pattern repeated for invoices/guardians, messages/classrooms, check-ins,
shifts/schedules, subsidy cases/claims, QuickBooks entity links, staff assignments, ratio snapshots,
and more: each one requires a `_id_center_unique` constraint on the parent (so `(id, center_id)` is
actually referenceable) plus the composite FK on the child, and each one showed up in its own
dated migration as the schema was hardened incrementally (`0034` through `0049` are almost entirely
this pattern, one relationship at a time).

**Where this is honest, not aspirational, about its limits:** enforcement was added migration by
migration, table by table, as specific relationships were identified: not as a single
schema-wide policy applied uniformly on day one. There is **no generic test** in
`packages/db/tests/` that iterates every table in the schema and asserts a `center_id` column (or a
composite FK) exists. `integrity.test.ts` and `schema.test.ts` both work by importing specific table
objects and asserting specific constraint names: 45 individual `center_id`/`centerId` assertions in
`schema.test.ts` alone, none of them generated from a loop over `Object.values(schema)`. That means
a new table added without a `center_id` column, or added with `center_id` but without the composite
FK to its parent, would not fail any existing test. It would only get caught if someone wrote a
targeted test for it, the way the existing 15+ center-scope migrations each did.

## What Cloudflare Workers forced

- **No connection pooling without Hyperdrive.** A Worker isolate doesn't keep a long-lived TCP
  connection the way a Node server would; the `resolveDbDriver`/Hyperdrive split described above
  exists because of that constraint specifically, and it's also why the plain `neon-http` fallback
  path explicitly cannot do real transactions: it's stateless HTTP, one request per query.
- **Isolate reuse means module-level state is unreliable.** Both the env-validation cache
  (`apps/api/src/index.ts:77`) and the production-driver assertion (`apps/api/src/middleware/auth.ts:40`)
  use a `WeakMap<object, boolean>` keyed on the `env` bindings object rather than a plain boolean,
  specifically so the check re-runs once per distinct binding context (e.g., a preview deployment
  with different env vars) instead of either running on every single request forever or getting
  stuck "already checked" from a previous isolate's env.
- **Durable Objects for anything stateful.** Rate limiting (`RateLimiterDO`, exported from
  `apps/api/src/index.ts:8`) runs in a Durable Object because Workers have no in-memory state that
  persists or is consistent across the many isolates a single Worker can be running at once.
- **A separate D1 database for the marketing site.** `apps/site` reads from `MARKETING_DB: D1Database`
  (`apps/api/src/lib/context.ts:10`) rather than Neon: lead capture on the marketing site doesn't
  need Postgres, and Neon isn't reachable from a Cloudflare Pages/Workers deployment without the
  same Hyperdrive plumbing the main API needed.
- **CPU-time and bundle-size limits shaped where logic lives.** The 2,830-line QuickBooks
  integration service (`apps/api/src/services/quickbooks.ts`, the largest source file in the repo)
  and the durable-object rate limiter are both excluded from the API's coverage thresholds
  (`apps/api/vitest.config.ts:29-31`) for related but different reasons: QuickBooks because it's a
  third-party integration layer already covered by a 5,692-line test file with diminishing branch
  coverage returns, the Durable Object because it can't be instantiated outside the actual Workers
  runtime at all.

## The shared Zod-validator boundary

`packages/shared/src/validators/` holds 25 non-test files (182 exported schemas/types total, by a
plain `export` grep) that both `apps/api` and `apps/web` import. On the API side these are load-
bearing: `apps/api/src/routes/children.ts` alone calls Hono's `zValidator("json", ...)` or
`zValidator("query", ...)` six times against schemas like `enrollChildSchema`,
`createChildSchema`, and `linkGuardianSchema`: a request that doesn't match the schema never
reaches the handler.

On the web side the same schemas exist and are used by some hooks (e.g.
`apps/web/src/hooks/use-imports.ts` parses import results through `importResultSchema` via a shared
`parseJsonResponse` helper), but not uniformly: a number of query hooks read `res.json()` through a
bare TypeScript cast instead of a runtime parse. That gap, and which hooks it applies to, is covered
in [TESTING.md](./TESTING.md#what-the-projects-own-audit-found) rather than here, since it's
fundamentally a test-coverage and correctness finding, not an architectural one: the validators
exist and are shared, and not every caller uses them yet.

## Deploy scripts now refuse to run

The six scripts under [`scripts/cloudflare/`](../scripts/cloudflare/) that used to bootstrap,
deploy, or clean up the live Cloudflare projects now start with an unconditional `throw`. For
example, all of `deploy-api.ps1`, `deploy-project.ps1`, `deploy-site.ps1`, `deploy-web.ps1`, and
`bootstrap-production.ps1` open with `Set-StrictMode` / `$ErrorActionPreference = "Stop"` followed
immediately by:

```powershell
throw "PebbleDesk has been decommissioned. Refusing to deploy the retired API Worker."
```

(the exact message varies per script). This isn't a comment or a README note: it's the first
executable line, so running any of these scripts against this repository fails immediately and
cannot accidentally recreate infrastructure that no longer exists. `cleanup-pages.ps1` is the
exception: it still runs, because its job is tearing down stray Cloudflare Pages projects, which is
consistent with keeping the product decommissioned rather than in tension with it.
