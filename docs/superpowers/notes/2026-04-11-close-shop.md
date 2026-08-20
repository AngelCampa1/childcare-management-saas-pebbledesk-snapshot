# Close Shop - 2026-04-11

## Scope Snapshot

This checkpoint captures the current `master` branch after a broad product-hardening pass across auth, onboarding, first-week owner workflows, attendance, ratios, billing, messages, scheduling, route recovery, and design-system cleanup.

The intent of this commit is to preserve the working product changes and test coverage without carrying forward local-only artifacts such as screenshots, generated caches, coverage output, or secrets.

## What Landed

- Local dev stack guardrails:
  - Added `scripts/dev/manage-pebbledesk-stack.ps1`
  - Added root scripts:
    - `pnpm dev:stack:start`
    - `pnpm dev:stack:stop`
    - `pnpm dev:stack:status`
    - `pnpm dev:stack:restart`
- Local auth and origin reliability:
  - tightened local origin handling
  - stabilized auth-status/session resolution
  - reduced stale-session fallback risk
- Onboarding and first-week UX:
  - owner onboarding path hardens around real session state
  - dashboard now acts like a guided first-week setup surface instead of a dead empty shell
- Attendance and timezone correctness:
  - center-local date handling improved in calendar/history flows
  - child-profile attendance views now respect center timezone more consistently
- Child/guardian/classroom workflow polish:
  - enrollment edge cases tightened
  - archived/waitlist validation improved
  - empty states and recovery guidance are more actionable
- Billing, settings, reports, messages, and scheduling polish:
  - copy is more honest about current capabilities
  - route-level invalid-id handling improved
  - token-based design language is used more consistently
- Design system cleanup:
  - many raw palette classes replaced with semantic tokens on touched pages
  - route tests strengthened to catch palette regressions

## Key Learnings

1. The highest-friction failures were not isolated bugs. They were mismatches between honest product capability, auth/session edge cases, and local dev ergonomics.
2. The strict-user view was useful. The pages that felt worst were usually technically functional but emotionally misleading:
   - they implied a workflow existed when only read-only data was present
   - they routed users to generic setup pages instead of the next concrete action
3. Hardcoded colors were a real maintenance smell. Semantic tokens made the touched routes more coherent and easier to reason about.
4. The local stack needed operational discipline. Multiple stale `wrangler` and `vite` processes created false negatives during browser testing.
5. Timezone handling is easy to get almost right and still ship wrong behavior around midnight or date-only fields.

## Remaining Todos

### Product honesty and workflow completion

- Scheduling still does not expose create/edit flows for templates or recurring shifts. The page is more honest, but the workflow is still incomplete.
- Messages is still an archive-first experience. There is no compose/send path in the current local surface.
- Billing still lacks a first-class invoice creation flow in the product shell.

### Design-system enforcement

- Continue sweeping touched-but-not-yet-reviewed routes for any remaining hardcoded palette classes.
- Consider adding a repo-level lint/test rule for raw Tailwind palette classes outside approved token layers.

### E2E depth

- Continue strict browser loops across:
  - owner setup -> classroom -> child -> guardian -> attendance
  - ratios/history under warning and violation states
  - billing/settings/reporting empty and populated states
  - invite/pending-member flows

### Operational cleanup

- Keep using the guarded stack scripts instead of ad-hoc `wrangler`/`vite` launches.
- If screenshot artifacts are needed again, save them outside the repo or in a deliberate evidence folder that is explicitly documented.

## Verification Commands Used In This Phase

Representative checks run during this hardening pass included:

```powershell
pnpm --filter @pebbledesk/api test -- src/middleware/auth-session-cache.test.ts src/routes/auth.test.ts src/middleware/auth-require.test.ts src/routes/check-ins.test.ts
pnpm --filter @pebbledesk/api typecheck
pnpm --filter @pebbledesk/web test -- src/components/attendance-calendar.test.tsx src/routes/child-profile.test.tsx src/routes/reports-pages.test.tsx
pnpm --filter @pebbledesk/web test -- src/routes/children-page.test.tsx src/routes/guardian-pages.test.tsx src/routes/child-profile.test.tsx
pnpm --filter @pebbledesk/web test -- src/routes/finance-pages.test.tsx src/routes/phase5-pages.test.tsx
pnpm --filter @pebbledesk/web typecheck
pnpm --filter @pebbledesk/shared test -- tests/validators.test.ts
```

Before the final commit, fresh verification should still be treated as authoritative over this note.

## Intentionally Excluded From Commit

- local secrets:
  - `apps/api/.dev.vars`
- generated caches:
  - `apps/site/.astro/`
  - `apps/web/.tanstack/`
  - `apps/web/coverage/`
- local browser artifacts:
  - screenshots
  - console/network dumps
  - markdown snapshots generated for inspection

## Next Suggested Restart Point

1. Run the guarded stack.
2. Recheck `scheduling`, `messages`, and `billing` as a strict owner.
3. Continue the design-token sweep and convert any remaining raw palette utilities on touched surfaces.
4. Push deeper into real workflow completion instead of additional copy-only polish.
