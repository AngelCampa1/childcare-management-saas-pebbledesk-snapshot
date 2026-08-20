# PebbleDesk Feature Gap Analysis

**Date:** 2026-04-14  
**Source:** pebbledesk.app marketing site vs. codebase implementation

---

## Status: All gaps closed as of commit `17c94fa` (2026-04-14)

The gaps documented below were real as of the initial analysis, but were fully resolved later the same day. This document is retained for historical context.

---

## Resolved Gaps

### 1. Offline Check-in/Out — RESOLVED (copy fix)
**Was:** Marketing copy claimed offline capability; `CLAUDE.md` states "Online-only for V1".  
**Resolution:** Marketing copy updated to remove the offline claim (commits `608d542`, `9d1a85b`). PebbleDesk is correctly described as online-only in V1.

---

### 2. CSV Import (Rosters, Contacts, Billing Records) — SHIPPED (`17c94fa`)
**Was:** No import routes, no upload UI, no parsing/validation.  
**Shipped in:** `apps/api/src/routes/imports.ts`, `apps/web/src/routes/_auth/import/index.tsx`  
**Coverage:** `apps/api/src/routes/imports.test.ts` (942 lines)

---

### 3. Migration Support from Brightwheel and Procare — SHIPPED (`17c94fa`)
**Was:** No migration tooling, no field mapping, no import pipeline.  
**Shipped in:** `apps/web/src/lib/migration-presets/brightwheel.ts`, `apps/web/src/lib/migration-presets/procare.ts`, `apps/web/src/lib/migration-presets/index.ts`

---

### 4. State-Specific Compliance Workflows (TX, CA, FL) — SHIPPED (`17c94fa`)
**Was:** Generic compliance only; no state-specific ratio rules or report formats.  
**Shipped in:** `apps/api/src/services/report-artifacts.ts` (TX HHSC 2936, CA LIC 9040, FL DCF CF-FSP 5337), `apps/api/src/routes/ratios.ts` (state ratio tables)  
**Coverage:** `apps/api/src/services/report-artifacts.test.ts` (1156 lines)

---

### 5. Automated Subsidy Reconciliation — SHIPPED (`17c94fa`)
**Was:** Manual-only flow; no scheduled automation; no tier-gating.  
**Shipped in:** `apps/api/src/scheduled/subsidy-auto-draft.ts` — Monday 09:00 UTC cron (`apps/api/wrangler.jsonc:32`)  
**Coverage:** `apps/api/src/scheduled/subsidy-auto-draft.test.ts` (396 lines)

---

### 6. Multi-Location Management — SHIPPED (`17c94fa`)
**Was:** No cross-center dashboard; each center was siloed.  
**Shipped in:** `apps/api/src/routes/overview.ts` (cross-center overview), `apps/web/src/components/center-switcher.tsx`  
**Coverage:** `apps/api/src/routes/overview.test.ts` (674 lines)

---

## What IS Fully Implemented

| Feature | Status |
|---|---|
| Room-level attendance capture | Built |
| Real-time ratio visibility & violation detection | Built |
| Ratio history by room | Built |
| Subsidy attendance exports (via audit reports) | Built |
| Audit report builder | Built |
| Staff scheduling & hour tracking | Built |
| QuickBooks integration | Built |
| Stripe billing (subscriptions + center-level payments) | Built |
| Public payment links for guardians | Built |
| Messaging (announcements, alerts, direct) | Built |
| Role-based access (Owner, Director, Staff) | Built |
| Trial + promo codes | Built |
| CSV import with Brightwheel/Procare presets | Built |
| State-specific compliance (TX, CA, FL) | Built |
| Automated weekly subsidy reconciliation | Built |
| Multi-location dashboard + center switcher | Built |
