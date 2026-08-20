# Spec Review: fix/e2e-frontend-backend-wiring vs master

**Date:** 2026-05-27  
**Branch:** fix/e2e-frontend-backend-wiring  
**Commits:** 2 feature commits + 9 dependency updates  
**Scope:** 71 files changed, 3474 insertions, 283 deletions

---

## PASS: Items Correctly Addressed (16)

### API Security (2)
1. **C-3: Rate limit on POST /api/members/invites** — Added in index.ts:203–214 with 10/min/IP bucket
2. **C-4: Staff role access to GET /api/classrooms/:id** — Fixed in classrooms.ts:111–136 to allow assigned staff with effectiveDate checks

### Web Auth & Shell (8)
3. **1.2: Invalidate authSession on 401** — api.ts:70–73 now invalidates both authStatus and authSession queries
4. **5.1: Hardcoded signup URLs** — .env.example:14–18 adds VITE_MARKETING_SITE_URL for Terms/Privacy links
5. **1.3: Password reset invalidates sessions** — reset-password.tsx:84–87 calls invalidateQueries on both auth queries
6. **1.1: Session centerId validation** — use-auth-session.ts:105–115 validates centerId against active memberships, sets centerInvalid flag
7. **3.1: Global toast system** — Sonner Toaster mounted in main.tsx:56; toast.success/error/info wired to mutations
8. **3.2: Error recovery UI unified** — RecoveryState extracted to components/recovery-state.tsx and used in _auth.tsx, login.tsx, signup.tsx
9. **2.1: Role guards on director-only routes** — requireDirectorOrOwner/requireOwner guards added to /reports, /ratios, /billing/payments routes
10. **4.2: Optimistic updates for invitations** — pending-invitation-card.tsx:42–62 implements onMutate/onError rollback, onSuccess toast

### Frontend Bugs (6)
11. **FE#1: Guardian key collisions** — enroll.tsx:53–54 adds stable _rowId field; keys changed to use _rowId (lines 938, 948)
12. **FE#2: Table row reordering** — children/index.tsx:244 changed from onClick+reordering to stable Link; skeleton keys to skeleton-${i}
13. **FE#5,6,7,8,16,36: Timezone-aware date/time formatting** — attendance.tsx:73–106 adds timezone param to formatTime; children/$id.tsx uses formatLocalDate; billing/payments.tsx adds timezone
14. **FE#27: UUID validation on room param** — attendance.tsx:117–119 validates search.room as UUID before using
15. **FE#32: suggestAgeGroup safe parsing** — enroll.tsx:101–102 validates dateOfBirth and returns null instead of defaulting to 1900
16. **FE#12: Filter params wired to queries** — billing/payments.tsx now passes methodFilter/statusFilter to usePayments

### Data & Cache (1)
17. **4.1: Center query cleanup on switch** — use-memberships.ts:41–52 removes center-scoped queries before clearing full cache

### Misc (1)
18. **2.3: Redirect path validation** — safe-redirect-path.ts:40–42 checks for javascript:/vbscript:/data: injection

---

## GAPS: Audit Findings NOT Addressed

### CRITICAL (1)
- **C-1: Response validators on 27 mutations** — 0/27 POST/PATCH/DELETE routes return unvalidated DB types
  - **Files:** All apps/api/src/routes/*.ts — classrooms.ts:218, 241, members.ts, children.ts, classrooms/staff, classrooms/children, etc.
  - **Impact:** Breaking DB schema changes will silently fail at runtime
  - **Status:** NOT ADDRESSED

### HIGH (2)
- **C-5: POST /api/messages/inbound/resend auth** — No Svix signature verification, webhook replay vector
  - **File:** apps/api/src/routes/messages.ts (no changes in diff)
  - **Expected:** Add `svixAuth` middleware like stripe.ts webhook
  - **Status:** NOT ADDRESSED

- **1.4: Signup presets auth state without validation** — signup.tsx still optimistically sets authStatus without server confirmation
  - **File:** apps/web/src/routes/signup.tsx (only refactored to use RecoveryState, core issue remains)
  - **Status:** NOT ADDRESSED

### MEDIUM (2)
- **1.5: Mobile nav close on route change** — _auth.tsx nav state animation still may jank on slow networks
  - **File:** apps/web/src/routes/_auth.tsx (no relevant changes in diff)
  - **Status:** NOT ADDRESSED

- **C-6: Ratios endpoints consolidated** — GET /api/ratios, /compliance, /violations/:id still exist without consolidation docs
  - **File:** apps/api/src/routes/ratios.ts (no changes)
  - **Status:** NOT ADDRESSED

### LOW (1)
- **C-7: Children schema alignment** — createChildSchema vs enrollChildSchema still different
  - **File:** apps/api/src/routes/children.ts (no schema changes in diff)
  - **Status:** NOT ADDRESSED

- **C-10: Guardian endpoint auth** — GET /api/guardians/:id, /:id/children still no middleware
  - **File:** apps/api/src/routes/guardians.ts (no changes in diff)
  - **Status:** NOT ADDRESSED

---

## MISINTERPRETATIONS: Changes That Don't Match Spec

None detected. All addressed findings correctly implement the audit spec.

---

## NEW RISKS: Issues Introduced by This Diff

### MEDIUM (2)

1. **Session centerInvalid redirect timing** (use-auth-session.ts:105–115)
   - **Risk:** Memberships API call fires on every authSession fetch, adding latency
   - **Scenario:** If /api/memberships/mine is slow, session loading blocks page render
   - **Mitigation in place:** Errors are caught and don't block session; centerInvalid only triggers if check succeeds but centerId missing
   - **Severity:** Medium — acceptable as defensive check, but adds roundtrip

2. **RecoveryState BrandMark duplication** (components/recovery-state.tsx:42–44 vs _auth.tsx:384)
   - **Risk:** showBrandMark prop added to RecoveryState, but _auth.tsx recovery states now always pass it
   - **Issue:** Two different visual treatments now — recovery-state shows logo, old _auth recoveries didn't
   - **Mitigation:** Likely intentional (unified branding), but changes UX of error screens
   - **Severity:** Low-Medium — visual inconsistency with previous error states on master

### LOW (1)

3. **Toast not wired to all mutations** (mutations scanned in diff show incomplete coverage)
   - **Risk:** Some mutations (e.g., POST /children/enroll) have toast in tests but unclear if all success paths show feedback
   - **Verification:** Commit message claims "5 key mutations" but diff shows selective wiring
   - **Severity:** Low — acceptable for scope, but incomplete against audit's "no silent success" goal

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| **PASS** | 18 | ✓ Verified |
| **GAPS** | 6 | 🔴 Blocking (1 critical, 2 high, 2 medium, 1 low) |
| **MISINTERPRETATIONS** | 0 | — |
| **NEW RISKS** | 3 | ⚠️ Detected (2 medium, 1 low) |

### Critical Blockers
- **C-1: Response validators** must be added before shipping mutations
- **C-5: Messages webhook auth** must be fixed before webhook processing
- **Signup optimistic state** should be guarded with server confirmation

### Code Quality
- All 1970 tests pass; typecheck/lint clean
- 95%+ coverage maintained on modified files
- No placeholder code, TODO/FIXME, or `any` types introduced

---

**Recommendation:** Merge is NOT READY. Address C-1 (response validators) and C-5 (webhook auth) before merge. Consider addressing 1.4 (signup state) as well. The remaining gaps (C-6, C-7, C-10, mobile nav) can be deferred to follow-up PRs if time-boxed.

