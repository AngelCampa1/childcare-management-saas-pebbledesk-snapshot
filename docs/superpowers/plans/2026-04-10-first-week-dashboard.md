# First-Week Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder dashboard with a first-week setup dashboard that guides new owners into the correct setup order.

**Architecture:** Build the dashboard as a single route-level page that reads lightweight setup signals from existing hooks and renders a setup hero plus a prioritized checklist. Keep the logic inside the dashboard route unless a clearly reusable helper emerges.

**Tech Stack:** React, TanStack Router, TanStack Query hooks, Shadcn UI, Vitest, Testing Library

---

### Task 1: Add dashboard tests for first-week guidance

**Files:**
- Create: `apps/web/src/routes/dashboard-page.test.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run the dashboard test file and verify it fails for the placeholder dashboard**
- [ ] **Step 3: Implement the minimal dashboard state and rendering needed to pass**
- [ ] **Step 4: Re-run the dashboard test file and verify it passes**

### Task 2: Add the guided first-week dashboard UI

**Files:**
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`
- Test: `apps/web/src/routes/dashboard-page.test.tsx`

- [ ] **Step 1: Add a setup hero with a classroom-first primary CTA when no classrooms exist**
- [ ] **Step 2: Add a prioritized checklist with practical descriptions and CTAs**
- [ ] **Step 3: Derive completion states from real classroom and child data where available**
- [ ] **Step 4: Re-run the dashboard tests and adjust copy/layout until green**

### Task 3: Verify the owner journey in-browser

**Files:**
- No repo file changes required unless defects are found

- [ ] **Step 1: Open the clean local owner session in Playwright**
- [ ] **Step 2: Verify the dashboard now points a brand-new owner to classrooms first**
- [ ] **Step 3: Capture a screenshot and note any trust-breaking UI or copy issues**
- [ ] **Step 4: Fix any discovered issues with tests first before moving on**
