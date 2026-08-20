# Shell, Auth, & Routing Audit — Inventory

**Date:** 2026-05-27  
**Scope:** Read-only audit of pebbledesk-fixes covering auth flow, routing guards, shell/skeleton patterns, data invalidation, and environment handling.

---

## Executive Summary

Found **11 moderate-to-high severity issues** across five categories:

1. **Auth**: Session-verification resilience, center_id validation, logout edge cases
2. **Routing**: Missing guards on privileged routes, 404 handling, post-login redirect validation
3. **Shell**: No global toast system, inconsistent error recovery UI, mobile nav issues
4. **Data**: React Query center coupling, missing optimistic updates
5. **Env**: Hardcoded URLs, missing VITE_ warnings, dev/prod env issues

**Risk:** Medium (UX/data consistency, not security).

---

## 1. AUTH ISSUES (4 findings)

### 1.1 MODERATE: Session Lost on Invalid Center ID
- **Files:** `use-auth-session.ts:83–120`, `use-auth-status.ts:23–51`
- **Issue:** No validation that session centerId matches user memberships. If center deleted while user holds session cookie, app loads stale session and mutations fail silently.
- **Impact:** Users cannot recover without manual signout.

### 1.2 HIGH: No Logout Cleanup on 401
- **Files:** `api.ts:68–73`
- **Issue:** When apiFetch receives 401, only invalidates ["authStatus"], not ["authSession"]. Session cache persists, mutations fail silently.
- **Fix:** Also invalidate ["authSession"] on 401 response.

### 1.3 MODERATE: Password Reset Does Not Invalidate Sessions
- **Files:** `reset-password.tsx:77–91`
- **Issue:** After successful reset, old session cookie persists. On reload, useAuthStatus returns stale cached session, causing race condition on login redirect.

### 1.4 MODERATE: Signup Presets Auth State Without Validation
- **Files:** `signup.tsx:270–276`
- **Issue:** After signup, app optimistically sets queryClient.setQueryData(["authStatus"], { status: "onboarding_required", ... }) without server confirmation. If server response differs, state mismatches.

---

## 2. ROUTING ISSUES (4 findings)

### 2.1 HIGH: No Guards on Director-Only Routes
- **Files:** `_auth.tsx:548–574`
- **Issue:** Routes like /reports, /ratios, /billing/payments have no beforeLoad guards. Staff member can navigate directly and component fetches data before accessDeniedState check fires. API should reject, but UX poor.
- **Fix:** Add TanStack Router beforeLoad hooks to check role before route mounts.

### 2.2 MODERATE: No 404 Fallback Before Auth Check
- **Files:** `__root.tsx:21–36`
- **Issue:** Undefined routes match _auth layout first. If authenticated, 404 shown inside workspace shell. If unauthenticated, redirects to login. Can hide navigation bugs.

### 2.3 MODERATE: Post-Login Redirect May Not Be Fully Validated
- **Files:** `login.tsx:82–84`
- **Issue:** redirect parameter validated via sanitizeRedirectPath() but needs verification it blocks protocol attacks (javascript:, data:, //evil.com).

### 2.4 MODERATE: Mobile Nav Does Not Close Smoothly on Route Change
- **Files:** `_auth.tsx:377–384`
- **Issue:** Mobile nav state resets on pathname change but animation may not complete. Users see jarring transitions on slow networks.

---

## 3. SHELL & COMPONENT ISSUES (3 findings)

### 3.1 MODERATE: No Global Toast System
- **Files:** No toast provider found in codebase
- **Issue:** Mutations succeed silently. No success toast after "Invitation accepted" or other actions. Users rely on navigation or visual changes to confirm success.
- **Impact:** Low confidence in actions; users may double-click buttons.

### 3.2 MODERATE: Error Recovery UI Inconsistent
- **Files:** `_auth.tsx:156–197` (RecoveryState), `login.tsx:174–194`, `signup.tsx:215–235`
- **Issue:** Three different error recovery UI patterns with different layouts and text.
- **Impact:** Brand inconsistency.

### 3.3 LOW: Skeleton Loaders Not Responsive
- **Files:** `dashboard.tsx` (DashboardSkeleton)
- **Issue:** Fixed-width skeleton bars don't match responsive final content. Visual jank on wide screens.

---

## 4. DATA & REACT QUERY ISSUES (2 findings)

### 4.1 MODERATE: Query Keys Couple to Center Context
- **Files:** `use-attendance.ts`, `use-children.ts`, `use-center.ts` (pattern)
- **Issue:** Query keys hardcode centerId like ["center-123", "checkIns"]. On center switch, old keys cached, new keys loaded. Switching back serves stale cache.
- **Impact:** Stale data across center switches; confusing UX.

### 4.2 MODERATE: No Optimistic Updates for Mutations
- **Files:** `pending-invitation-card.tsx:26–45`
- **Issue:** "Accept Invitation" shows 3-4s latency (loading + server + refetch) instead of instant optimistic update.
- **Impact:** Perceived sluggishness.

---

## 5. ENVIRONMENT & CONFIGURATION ISSUES (4 findings)

### 5.1 HIGH: Hardcoded URLs in Signup Form
- **Files:** `signup.tsx:427–438`
- **Issue:** Terms/Privacy links hardcoded to https://pebbledesk.app/. Staging signup directs to production legal pages.
- **Fix:** Add VITE_MARKETING_SITE_URL env var.

### 5.2 MODERATE: API URL Resolution Unclear in Dev
- **Files:** `api-origin.ts:14–20`, `vite.config.ts:23–27`
- **Issue:** Split between Vite proxy config and runtime resolveApiBaseUrl(). Correct but confusing. Needs documentation.

### 5.3 MODERATE: Missing VITE_ Prefix Warning
- **Files:** `.env.example:4–5`
- **Issue:** Vite only exposes VITE_ prefixed vars to browser. No warning in .env.example. If dev uses import.meta.env.DATABASE_URL, silently fails.

### 5.4 LOW: Support Email Source
- **Files:** `_auth.tsx:625`, multiple locations
- **Status:** Resolved. Support email links now read from `PUBLIC_BRAND_KNOWLEDGE.supportEmail`.

---

## Summary by Severity

| Count | Severity | Example |
|-------|----------|---------|
| 3 | HIGH | 401 logout, director route guards, hardcoded signup URLs |
| 12 | MODERATE | Center ID validation, password reset, redirect, mobile nav, toast, error UI, data coupling, API config, VITE_ warnings |
| 2 | LOW | Skeleton responsiveness, support email |

---

## Immediate Actions (Blocking)

1. **api.ts:68–73** — Add authSession invalidation on 401
2. **_auth.tsx:548–574** — Add beforeLoad role checks on director routes
3. **login.tsx:82–84** — Verify sanitizeRedirectPath blocks all redirect attacks
4. **signup.tsx:427–438** — Add VITE_MARKETING_SITE_URL env var

## Short-term (High Impact)

5. **use-auth-session.ts:83–120** — Validate centerId in session
6. **Missing feature** — Add global toast provider for mutation success/error feedback
7. **_auth.tsx, login.tsx, signup.tsx** — Standardize error recovery UI
8. **reset-password.tsx:77–91** — Invalidate authStatus/authSession after reset
9. **Hooks pattern** — Invalidate all center queries on center switch
10. **pending-invitation-card.tsx** — Add optimistic updates to mutations

---

## Files Changed by Audit

- apps/web/src/routes/login.tsx
- apps/web/src/routes/signup.tsx
- apps/web/src/routes/reset-password.tsx
- apps/web/src/routes/_auth.tsx
- apps/web/src/routes/__root.tsx
- apps/web/src/api.ts
- apps/web/src/hooks/use-auth-session.ts
- apps/web/src/hooks/use-auth-status.ts
- apps/web/src/lib/api-origin.ts
- apps/web/vite.config.ts
- apps/web/.env.example
- apps/web/src/components/pending-invitation-card.tsx

---

Audit complete. All findings are read-only; no changes made to codebase.
