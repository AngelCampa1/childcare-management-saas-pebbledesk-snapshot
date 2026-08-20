# QA tools — bug-hunt classifier

## Why this module exists

Date-stamped Playwright bug-hunt scripts live under `.playwright-cli/` (e.g.
`.playwright-cli/prod-bug-hunt-20260423.mjs`). Until 2026-04-23 each script
duplicated its own first-party / telemetry / severity rules inline, and the
2026-04-23 prod run flagged every Playwright `requestfailed` event as P1
— including benign `net::ERR_ABORTED` from SPA route transitions and noise
from third-party telemetry beacons. The fix-queue item #2 from
`docs/qa/2026-04-23-prod-bug-hunt-playwright.md` was to extract the
classification rules into a shared module so future runs apply them
consistently and tighter heuristics ship in one place.

## How to use it in a new bug-hunt run script

```js
import {
  classifyRequestFailure,
  classifyResponseError,
  classifySmallTargets,
} from "../tools/qa/bug-hunt-classifier.mjs";

page.on("requestfailed", (request) => {
  const verdict = classifyRequestFailure({ request, page });
  if (verdict !== null) findings.push({ ...verdict, url: request.url() });
});

page.on("response", (response) => {
  const verdict = classifyResponseError({ response });
  if (verdict !== null) findings.push({ ...verdict, url: response.url() });
});

const tooSmall = classifySmallTargets(targets);
```

Do NOT reimplement these rules in a one-off script. If a rule needs to
change, update the module and its tests so every future run benefits.

## Classification rules at a glance

| Signal                           | Verdict                                         |
| -------------------------------- | ----------------------------------------------- |
| Third-party request failure      | drop (out of scope)                             |
| Telemetry response (Sentry, GA, Segment, PostHog, Cloudflare RUM) | drop |
| First-party `ERR_ABORTED`, page moved off pathname | P3 — benign navigation abort |
| First-party `ERR_ABORTED`, same path | P2 — in-page request aborted (worth investigating but not a confirmed failure) |
| First-party request failure (other errorText) | P1 — `errorText`                  |
| First-party response < 400       | drop                                            |
| Expected 401 on `/api/auth/*`    | drop (intentional unauth probe)                 |
| Intentional 404 (`bughunt-missing-page-` / `-route-`) | drop                       |
| First-party 5xx                  | P0                                              |
| First-party 4xx                  | P1                                              |

## Running the tests

From repo root:

```bash
pnpm --filter @pebbledesk/qa-tools test
pnpm --filter @pebbledesk/qa-tools test:coverage
```

`pnpm test` (turbo) also runs them as part of the workspace test pass.
