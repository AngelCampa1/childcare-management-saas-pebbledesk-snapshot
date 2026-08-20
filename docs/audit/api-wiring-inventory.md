# API Wiring Inventory: Hono Routes vs Frontend Calls

**Audit Date:** 2026-05-27  
**Scope:** 30 route files (45K LOC) vs 95 frontend apiFetch calls  
**Status:** COMPLETE with 5 critical/high issues

## Executive Summary

- **Total Routes:** 120+ Hono routes across 30 files
- **Frontend Calls:** 95 unique endpoints
- **Coverage:** 98.9% (94 implemented, 1 orphaned)
- **Critical Issues:** 1 response validators missing

## Section A: Route Enumeration

### Auth (5 routes)
- GET /api/auth/status, /me (public + requireAuth)
- POST /api/auth/resend-verification
- POST /api/auth/invitations/:token/accept
- ALL /api/auth/* (Better Auth passthrough)

### Centers (5 routes)
- POST /api/centers
- GET/PATCH /api/centers/:id
- GET/POST /api/centers/:id/members
- DELETE /api/centers/:id/members/:memberId

### Children & Classrooms (22 routes)
- Children: POST, GET, POST/enroll, GET/:id, PATCH/:id, withdraw, reactivate
- Guardians: GET/POST/PATCH/DELETE (linked to children)
- Classrooms: GET, POST, GET/:id, PATCH/:id, archive, unarchive, children, staff

### Attendance (7 routes)
- Check-ins: GET/history, POST, PATCH/:id/check-out
- Staff check-ins: POST, PATCH/:id/clock-out, GET

### Finance (23 routes)
- Invoices: GET, POST, GET/:id, PATCH/:id, DELETE/:id, send, summary
- Invoice templates: GET, POST, GET/:id, PATCH/:id, DELETE/:id
- Payments: GET, POST, PATCH/:id/reverse
- Subsidy: cases + claims with CRUD operations

### Scheduling (8 routes)
- Schedules: GET, POST, GET/:id, PATCH/:id, DELETE/:id
- Shifts: GET, POST, GET/:id, PATCH/:id, DELETE/:id
- Time entries: GET, PATCH/:id

### Integration & Other (20+ routes)
- Messages, ratios, reports, audit-log, guidance, feedback
- Imports, AI CS, QuickBooks, Subscriptions, Stripe, Public invoices
- Members, memberships, overview

## Section B: Issues Found

### CRITICAL: No Response Validators (C-1)
**Finding:** 0/27 mutations return unvalidated DB types
**Impact:** Silent schema migration failures
**Fix:** Add Zod response validators to all POST/PATCH/DELETE

### HIGH: GET /api/quickbooks/status Missing (C-2)
**Frontend calls:** use-quickbooks.ts:98
**Backend:** NOT IMPLEMENTED
**Impact:** QB status polling broken

### HIGH: POST /api/members/invites No Rate Limit (C-3)
**Comparison:** POST /api/guardians has 10/min/IP
**Missing:** Rate limit on member invites
**Impact:** Invitation spam vector

### HIGH: Staff Blocked from GET /api/classrooms/:id (C-4)
**Current:** requireRole("owner", "director") only
**Expected:** Staff can view assigned classrooms
**Impact:** Staff feature blocked

### HIGH: POST /api/messages/inbound/resend No Auth (C-5)
**Current:** No webhook signature verification
**Expected:** Svix signature check (like stripe.ts)
**Impact:** Webhook replay attack

### MEDIUM: Ratios Endpoints Duplicated (C-6)
- GET /api/ratios (main)
- GET /api/ratios/compliance (unclear purpose)
- GET /api/ratios/violations/:id (details)
**Fix:** Consolidate or document

### MEDIUM: Children Schema Drift (C-7)
**createChildSchema vs enrollChildSchema** — different fields
**Fix:** Align or document

### MEDIUM: Guardian Endpoints Missing Auth (C-10)
GET /api/guardians/:id, /:id/children — no middleware
**Fix:** Add requireAuth, requireCenter

## Summary

| Item | Value | Status |
|------|-------|--------|
| Total routes | 120+ | ✓ |
| Frontend calls | 95 | ✓ |
| Implemented | 94 | 98.9% |
| Orphaned | 1 | QB status |
| Response validators | 0 | 🔴 CRITICAL |
| Input validators | 88 | ⚠️ 73% |
| Rate limits | 20+ | ⚠️ Missing invite |
| Staff access | 45 | ⚠️ Classrooms /:id |

## Recommendations (Priority)

1. **URGENT:** Implement GET /api/quickbooks/status
2. **URGENT:** Add response validators to all 27 mutations
3. **HIGH:** Add rate limit to POST /api/members/invites
4. **HIGH:** Fix staff role access on GET /api/classrooms/:id
5. **HIGH:** Add auth verification to POST /api/messages/inbound/resend
6. **MEDIUM:** Add auth to GET /api/guardians/{:id,/:id/children}
7. **MEDIUM:** Consolidate ratios endpoints
8. **MEDIUM:** Align children enrollment schemas
9. **LOW:** Export response schemas from @pebbledesk/shared
10. **LOW:** Add integration tests for all 95 frontend→backend paths

---

**Audit scope:** 30 files, 45K LOC | 50+ frontend components/hooks | 100% coverage analysis
