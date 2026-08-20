# PebbleDesk Product Scaffold — Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Context:** Scaffolding the PebbleDesk SaaS product from an empty directory. The validation landing page lives separately in `ideas-validation/sites/pebbledesk/` and will be migrated later.

---

## 1. Product Overview

PebbleDesk is a childcare center administration SaaS — "The Audit-Ready Childcare Platform." It targets licensed childcare center directors and in-home daycare operators who deal with subsidy reimbursements, state licensing audits, and staff-to-child ratio compliance.

**V1 scope:** Full Center plan feature set — ratio tracking, attendance, subsidy reconciliation, staff scheduling, audit report builder, multi-room ratio dashboard, QuickBooks sync, parent messaging, and billing.

**What V1 does NOT include:** Offline-first support, mobile native apps, state-specific compliance engines, E2E tests.

---

## 2. Architecture

### Monorepo Structure

Apps + Packages monorepo with Turborepo and pnpm workspaces.

```
pebbledesk/
├── apps/
│   ├── web/          — React + Vite SPA (dashboard, behind auth)
│   └── api/          — Hono on Cloudflare Workers
├── packages/
│   ├── db/           — Drizzle schema, migrations, Neon client
│   ├── auth/         — Better Auth config, shared auth utilities
│   ├── shared/       — TypeScript types, Zod validators, domain constants
│   └── ui/           — Shadcn/UI components (new-york style), Tailwind CSS 4 config
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
└── biome.json
```

### Deployment Targets

| App | Runtime | Host |
|-----|---------|------|
| apps/web | React + Vite SPA | Cloudflare Pages |
| apps/api | Hono | Cloudflare Workers |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Neon | Postgres database |
| Cloudflare Hyperdrive | Connection pooling between Workers and Neon |
| Cloudflare Pages | Static hosting for the SPA |
| Cloudflare Workers | API runtime |

Single environment (no staging) to start. Add staging with Neon branches when needed.

### Data Flow

```
apps/web (React + TanStack Query)
  ↓ fetch via Hono RPC client (hc)
apps/api (Hono + Better Auth + Drizzle)
  ↓ Drizzle ORM via Hyperdrive
Neon (Postgres) — row-level tenancy via center_id
```

---

## 3. Database Schema

23 tables across 8 domains. Every non-auth table carries `center_id` for row-level tenancy.

### Core: Identity & Tenancy (5 tables)

**centers** — id, name, slug, address, city, state, zip, phone, license_number, licensed_capacity, timezone, created_at, updated_at

**users** (Better Auth managed) — id, name, email, email_verified, image, created_at, updated_at

**sessions** (Better Auth managed) — id, user_id → users, token, expires_at, ip_address, user_agent, created_at, updated_at

**accounts** (Better Auth managed, OAuth providers) — id, user_id → users, account_id, provider_id, access_token, refresh_token, expires_at, ...

**memberships** (links users to centers with roles) — id, center_id → centers, user_id → users, role (owner|director|staff), invited_at, accepted_at, created_at

### People & Rooms (6 tables)

**classrooms** — id, center_id → centers, name, age_group (infant|toddler|preschool|school_age), max_capacity, min_ratio_staff, min_ratio_children, created_at

**children** — id, center_id → centers, first_name, last_name, date_of_birth, age_group, enrollment_status (active|inactive|waitlist), subsidy_eligible, enrolled_at, withdrawn_at, created_at

**guardians** — id, center_id → centers, first_name, last_name, email, phone, relationship, created_at

**child_guardians** (many-to-many) — child_id → children, guardian_id → guardians, is_primary, authorized_pickup

**classroom_assignments** (children → classrooms) — id, center_id, child_id → children, classroom_id → classrooms, effective_date, end_date

**staff_assignments** (staff → classrooms) — id, center_id, membership_id → memberships, classroom_id → classrooms, effective_date, end_date

### Attendance & Ratios (4 tables)

**check_ins** (child attendance) — id, center_id, child_id → children, classroom_id → classrooms, checked_in_at, checked_out_at, checked_in_by → memberships, checked_out_by → memberships, notes

**staff_check_ins** (staff clock in/out) — id, center_id, membership_id → memberships, classroom_id → classrooms, clocked_in_at, clocked_out_at

**ratio_snapshots** (periodic ratio state per room) — id, center_id, classroom_id → classrooms, recorded_at, children_count, staff_count, ratio_required, ratio_actual, in_compliance (bool)

**ratio_violations** (flagged breaches) — id, center_id, classroom_id → classrooms, started_at, resolved_at, children_count, staff_count, ratio_required, ratio_actual, resolved_by → memberships, resolution_notes

### Subsidy Management & Billing (5 tables)

**subsidy_cases** (child's subsidy enrollment) — id, center_id, child_id → children, program (ccdf|state_voucher|head_start|other), case_number, agency_name, authorized_hours_weekly, rate_daily, rate_weekly, effective_date, end_date, status (active|pending|expired|denied)

**subsidy_claims** (monthly billing to agencies) — id, center_id, subsidy_case_id → subsidy_cases, period_start, period_end, days_attended, hours_attended, amount_claimed, amount_paid, status (draft|submitted|paid|denied|appealed), submitted_at, paid_at, denial_reason

**invoices** (parent billing) — id, center_id, guardian_id → guardians, period_start, period_end, subtotal, subsidy_credit, amount_due, status (draft|sent|paid|overdue|void), due_date, paid_at, created_at

**invoice_line_items** — id, invoice_id → invoices, description, quantity, unit_price, amount, child_id → children

**payments** — id, center_id, invoice_id → invoices, amount, method (card|ach|check|cash), reference, paid_at

### Staff Scheduling (3 tables)

**schedules** (weekly schedule templates) — id, center_id, name, effective_from, effective_until, created_at

**shifts** — id, center_id, schedule_id → schedules, membership_id → memberships, classroom_id → classrooms, day_of_week (0-6), start_time, end_time

**time_entries** (actual hours worked) — id, center_id, membership_id → memberships, date, hours_worked, hours_scheduled, overtime_hours, status (auto|manual|approved)

### Audit Trail & Reports (2 tables)

**audit_reports** (generated compliance exports) — id, center_id, report_type (attendance|ratio|subsidy|licensing), period_start, period_end, generated_by → memberships, file_url, generated_at

**audit_log** (system-wide change tracking) — id, center_id, user_id → users, action (create|update|delete), entity_type, entity_id, changes (jsonb), ip_address, created_at

### Parent Messaging (2 tables)

**messages** — id, center_id, sender_id → users, subject, body, message_type (announcement|direct|alert), classroom_id → classrooms (nullable, for room-scoped), created_at

**message_recipients** — id, message_id → messages, guardian_id → guardians, read_at, delivered_at

### QuickBooks Integration (2 tables)

**quickbooks_connections** — id, center_id, realm_id, access_token (encrypted), refresh_token (encrypted), token_expires_at, connected_at, last_sync_at

**quickbooks_sync_log** — id, center_id, connection_id → quickbooks_connections, entity_type (invoice|payment), entity_id, qb_id, direction (push|pull), status (success|error), error_message, synced_at

---

## 4. Authentication & Authorization

### Auth Stack

- **Better Auth** (raw, not Neon Auth wrapper) with Drizzle adapter for Neon
- **Login methods:** Email + password, Google OAuth
- **Session strategy:** Cookie-based (httpOnly, secure, sameSite=lax)
- Better Auth manages `users`, `sessions`, and `accounts` tables

### Auth Middleware Chain

1. Session middleware — resolves cookie → session → user
2. Membership middleware — loads user's active membership → injects `center_id` and `role` into Hono context
3. Permission middleware — `requireRole('owner')`, `requireRole('director')` etc.

### Post-Signup Flow

New user either:
- Creates a center → becomes Owner (onboarding flow)
- Accepts an invite → joins existing center as Director or Staff

### Role Permission Matrix

| Action | Owner | Director | Staff |
|--------|-------|----------|-------|
| Check in/out children | Yes | Yes | Yes |
| View own classroom ratios | Yes | Yes | Yes |
| Send messages to parents | Yes | Yes | Own room only |
| View all classrooms & ratios | Yes | Yes | No |
| Manage children & guardians | Yes | Yes | No |
| Manage classrooms & assignments | Yes | Yes | No |
| Manage staff schedules | Yes | Yes | No |
| View subsidy claims & reports | Yes | Yes | No |
| Generate audit reports | Yes | Yes | No |
| Manage subsidy cases & billing | Yes | No | No |
| Manage invoices & payments | Yes | No | No |
| Invite/remove staff | Yes | No | No |
| Center settings & billing plan | Yes | No | No |
| QuickBooks connection | Yes | No | No |

---

## 5. API Design

### Framework

Hono on Cloudflare Workers with:
- `zValidator` middleware for Zod request validation (schemas from `packages/shared`)
- Hono RPC (`hc`) for end-to-end type safety with the React frontend
- Global error handler returning consistent JSON error responses
- Audit logging middleware that records all mutations as JSONB diffs

### Route Structure

```
# Auth (Better Auth handles)
POST /api/auth/sign-up/email
POST /api/auth/sign-in/email
POST /api/auth/sign-in/social         (Google)
POST /api/auth/sign-out
GET  /api/auth/session

# Centers
POST /api/centers                     (create, user becomes Owner)
GET  /api/centers/:id
PATCH /api/centers/:id

# Team
GET  /api/centers/:id/members
POST /api/centers/:id/invites
DELETE /api/centers/:id/members/:memberId

# Classrooms
CRUD /api/classrooms
CRUD /api/classrooms/:id/assignments  (children & staff)

# Children & Guardians
CRUD /api/children
CRUD /api/guardians

# Attendance & Ratios
POST /api/check-ins
PATCH /api/check-ins/:id/check-out
POST /api/staff-check-ins
PATCH /api/staff-check-ins/:id/clock-out
GET  /api/ratios                      (current, all rooms)
GET  /api/ratios/history              (snapshots for audit)
GET  /api/ratios/violations

# Subsidies
CRUD /api/subsidy-cases
CRUD /api/subsidy-claims
POST /api/subsidy-claims/:id/submit
GET  /api/subsidy-claims/reconciliation

# Billing
CRUD /api/invoices
POST /api/invoices/:id/send
POST /api/payments

# Scheduling
CRUD /api/schedules
CRUD /api/shifts
GET  /api/time-entries

# Reports & Audit
POST /api/reports/generate
GET  /api/reports
GET  /api/audit-log

# Messaging
CRUD /api/messages

# QuickBooks
POST /api/quickbooks/connect
POST /api/quickbooks/disconnect
POST /api/quickbooks/sync
GET  /api/quickbooks/status
```

---

## 6. Frontend App

### Stack

- React 19 + Vite
- TanStack Router (file-based routing, type-safe params)
- TanStack Query (data fetching, caching, polling)
- Hono RPC client (`hc`) for typed API calls
- Shadcn/UI (new-york style) + Tailwind CSS 4
- Deployed to Cloudflare Pages

### Route Tree

```
# Public
/login
/signup
/invite/:token
/onboarding                          (create center after signup)

# Authenticated — sidebar + header layout
/dashboard                           (today's attendance, ratio status, alerts)

# Attendance & Ratios
/attendance                          (check-in/out interface, today's log)
/ratios                              (multi-room ratio dashboard, polls every 15s)
/ratios/history                      (snapshots & violations)

# People
/children                            (roster list)
/children/:id                        (profile, attendance history, subsidy info)
/children/new
/guardians                           (parent/guardian directory)
/guardians/:id

# Classrooms
/classrooms                          (room list with current counts)
/classrooms/:id                      (room detail, assigned children & staff)

# Subsidies
/subsidies                           (active cases list)
/subsidies/:id                       (case detail, linked claims)
/subsidies/claims                    (claims list, reconciliation view)
/subsidies/claims/:id

# Billing
/billing                             (invoices list)
/billing/:id                         (invoice detail)
/billing/payments                    (payment history)

# Scheduling
/scheduling                          (weekly schedule grid)
/scheduling/time                     (time entries & hours)

# Reports & Audit
/reports                             (generate & download audit reports)
/reports/audit-log                   (activity feed)

# Messaging
/messages                            (inbox, compose announcements)
/messages/:id

# Settings (Owner/Director)
/settings                            (center profile)
/settings/team                       (invite, manage members)
/settings/quickbooks                 (connect, sync status)
/settings/billing                    (PebbleDesk subscription plan)
```

### App Shell

- **Sidebar** (dark, left) — grouped nav sections: Main (Dashboard, Attendance, Ratios), Manage (Children, Guardians, Classrooms, Scheduling), Finance (Subsidies, Billing), Compliance (Reports, Messages). Settings at bottom.
- **Header** (top) — center name + location, ratio status badge (green/yellow/red), user avatar.
- **Role-based UI** — sidebar items and page access filtered by membership role. Staff sees only their classroom + attendance. Directors see everything except billing and settings. Owners see all.
- **Auth guard** — root authenticated layout checks session via TanStack Query. Redirects to `/login` if no session.

### Frontend Patterns

- All API calls through TanStack Query hooks wrapping the Hono RPC client
- `refetchInterval: 15000` on ratio queries for polling
- Optimistic updates for check-in/check-out actions
- Shadcn data tables for list views, forms for create/edit, dialogs for confirmations

---

## 7. Testing & Dev Tooling

### Test Strategy

| Package | Test Type | What's Tested |
|---------|-----------|---------------|
| packages/shared | Unit (Vitest) | Zod schema validation, domain helpers (ratio calculation, subsidy eligibility), constants |
| packages/db | Unit (Vitest) | Schema exports compile, query builder helpers |
| apps/api | Integration (Vitest) | API routes end-to-end: HTTP request → Hono handler → DB → response. Auth, permissions, CRUD, ratio calculations |
| apps/web | Unit (Vitest) | Component rendering (Testing Library), hook logic |

E2E tests (Playwright) deferred — not part of the scaffold.

### Coverage Requirement

**95% code coverage minimum on every file you touch.** Not the repo average — each individual file. If a file drops below 95%, write more tests. This matches the standard from the ideas-validation monorepo.

### Dev Commands

```bash
# Development
pnpm dev                    # runs apps/web + apps/api concurrently
pnpm --filter web dev       # Vite dev server only
pnpm --filter api dev       # Wrangler dev only

# Build & Type Check
pnpm build                  # turbo build (all packages + apps)
pnpm typecheck              # turbo typecheck (tsc --noEmit across all)

# Testing
pnpm test                   # turbo test (vitest run across all)
pnpm test:watch             # vitest watch (for TDD)

# Database
pnpm db:generate            # drizzle-kit generate (migration from schema diff)
pnpm db:migrate             # drizzle-kit migrate (apply to Neon)
pnpm db:studio              # drizzle-kit studio (visual DB explorer)

# Deploy
pnpm --filter web deploy    # Cloudflare Pages
pnpm --filter api deploy    # Cloudflare Workers
```

### Tooling

| Tool | Purpose |
|------|---------|
| Turborepo | Build orchestration, caching across packages |
| pnpm workspaces | Package manager with workspace protocol |
| TypeScript | Strict mode, composite projects with project references |
| Biome | Linting + formatting (replaces ESLint + Prettier) |
| Vitest | Test runner for all packages, workspace config at root |
| Wrangler | Cloudflare CLI for Workers dev and deployment |
| Drizzle Kit | Schema migrations, studio |

---

## 8. Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo structure | Apps + Packages with Turborepo | Standard convention, clear separation of deployables vs libraries |
| Marketing site | Stays in ideas-validation for now | Keep scaffold lean, migrate later |
| Database | Neon (Postgres) | Real Postgres for production workloads, Drizzle adapter available |
| Auth | Raw Better Auth | Full control, email+password+Google OAuth, Drizzle adapter |
| Tenancy | Row-level with center_id | Simple, cost-effective, right for early stage |
| Roles | Fixed Owner/Director/Staff | Matches domain, no over-engineering |
| Real-time | Polling (15s via TanStack Query) | Simple, works on Workers without extra infra |
| Offline | Online-only for V1 | Avoids complexity tax, add later as differentiator |
| Router | TanStack Router | Type-safe, file-based routing |
| Linting | Biome | Faster than ESLint+Prettier, zero config |
| Environment | Single (no staging) | Ship fast, add staging when needed |
| Schema | Full upfront | Lock in data model and relationships early |
| Coverage | 95% per file minimum | Matches ideas-validation standard |
| Workflow | Git worktrees for all feature work | Isolation, review before merge |
| Design system | Established via teach-impeccable skill | Persistent design guidelines for consistency |
