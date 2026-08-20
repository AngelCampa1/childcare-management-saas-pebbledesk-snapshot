# CRM Feedback Widget — E2E Spec (unrun)

## Status
**UNRUN** — This project has no structured Playwright test project configured via
`playwright.config.ts`. E2E coverage lives in ad-hoc `.playwright-cli/*.mjs` scripts
that require the full production stack (database, API Worker, Cloudflare Access) to be
running. The spec below documents the intended assertions; run it once the stack is
available.

## Preconditions
- `.env.local` contains `VITE_CRM_WIDGET_KEY=wk_LOCALTESTPLACEHOLDER00000000000000`
  (LOCAL test key only; never commit)
- `VITE_CRM_LOADER_URL=https://widgets.ventoralabs.com/w/v1.js` (default, may omit)
- App running at `http://localhost:3040` proxied to API at `http://localhost:8790`
- A valid test account is signed in (use the `RUN_TOKEN` pattern from `live-e2e-20260423.mjs`)

## Assertions

### 1. CRM loader script is injected on an authenticated route
```
navigate to http://localhost:3040/dashboard (authenticated)
assert document contains:
  script[data-product="wk_LOCALTESTPLACEHOLDER00000000000000"][data-widget="feedback-button"]
assert script.src === "https://widgets.ventoralabs.com/w/v1.js"
```

### 2. No duplicate scripts on route transition
```
navigate to /attendance
navigate back to /dashboard
assert count of script[data-widget="feedback-button"] === 1
```

### 3. Widget fetch no-ops on localhost (expected — origin not allowlisted)
```
observe network: expect NO request to widgets.ventoralabs.com/w/data/* to return 200
(the loader may make the request; 403/CORS-blocked is the expected outcome on localhost)
```

### 4. Local FeedbackWidget is NOT mounted
```
assert page does NOT contain button[aria-label="Feedback"]
(the old local FeedbackWidget is no longer mounted in _auth.tsx)
```
