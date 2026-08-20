# CLAUDE.md — PebbleDesk

## Decommissioned Product

PebbleDesk is decommissioned. Do not deploy PebbleDesk Cloudflare projects or
recreate PebbleDesk external services from this repository. Keep the repository
as source history only.

## Before Starting Work

Run `git pull` before beginning any task. This repository is developed across multiple computers and your local copy may be behind.

This file provides guidance to Claude Code when working in this repository.

## LinkedIn/Postiz Shutdown Gate

Do not create, upload, or schedule PebbleDesk LinkedIn posts through Postiz.
`node scripts/postiz-schedule-linkedin-calendar.mjs` now refuses because PebbleDesk is
decommissioned. The historical review gate remains only for archival audit of existing
marketing files.

## Project Overview

PebbleDesk was a childcare center administration SaaS. It is now decommissioned;
this monorepo remains as the archival source record.

### Structure

```
pebbledesk/
├── apps/
│   ├── web/          — React + Vite SPA archive
│   └── api/          — Hono on Cloudflare Workers
├── packages/
│   ├── db/           — Drizzle schema, Neon client
│   ├── auth/         — Better Auth config
│   ├── shared/       — Types, Zod validators, constants
│   └── ui/           — Shadcn/UI, Tailwind, design tokens
```

## Common Commands

```bash
pnpm dev                        # all apps concurrently
pnpm --filter @pebbledesk/web dev   # web only
pnpm --filter @pebbledesk/api dev   # api only
pnpm build                      # turbo build
pnpm typecheck                  # turbo typecheck
pnpm test                       # turbo test
pnpm test:watch                 # vitest watch
pnpm lint                       # biome check
pnpm lint:fix                   # biome check --write
pnpm db:generate                # drizzle-kit generate
pnpm db:migrate                 # drizzle-kit migrate
pnpm db:studio                  # drizzle-kit studio
```

## Local Port Assignments

Stable ports across Angel's projects — use these to avoid collisions when running multiple stacks locally.

| Project | Frontend | Backend |
|---|---|---|
| Kaiplan | 3030 | 5030 |
| PebbleDesk | 3040 | 8790 |
| PebbleDesk Site | 4321 | — |
| Grantpipe | 3050 | 5050 |

PebbleDesk dev commands should target **web: 3040**, **api: 8790**, and **site: 4321**. The Wrangler dev server uses 8790 locally to avoid a Windows service port conflict.

## Environment Variables

| Variable | Purpose |
|---|---|
| DATABASE_URL | Neon Postgres connection string |
| BETTER_AUTH_SECRET | Session encryption secret |
| BETTER_AUTH_URL | Auth base URL (http://localhost:8790 for dev) |
| GOOGLE_CLIENT_ID | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret |
| PUBLIC_APP_URL | Product app base URL used by the marketing site signup redirect (apps/site). Defaults to `https://my.pebbledesk.app`. Set to `http://localhost:3040` for local dev to point CTAs at the local app. |
| VITE_SENTRY_DSN | Web app browser Sentry DSN (build-time, apps/web) |
| PUBLIC_SENTRY_DSN | Marketing site browser Sentry DSN (build-time, apps/site). Must point to a different Sentry project than `VITE_SENTRY_DSN`. |
| SENTRY_DSN | API server Sentry DSN (Wrangler secret, apps/api) |

## Execution Expectations

Work end-to-end without pausing for progress check-ins. Do not stop after completing a batch to ask "ready for feedback?" or "should I continue?". Execute the full plan autonomously. Asking clarifying questions about requirements is still expected.

For substantial tasks, sub-agent-driven development is the required default workflow. Keep each phase narrowly scoped so context does not creep across exploration, execution, review, and merge.

For this repo, a task is substantial if it changes repo-tracked files, requires more than one meaningful step, spans more than one file or subsystem, or would otherwise benefit from separate exploration, implementation, and review contexts. One-off read-only checks or a single trivial edit can stay inline.

### Required Default Workflow for Substantial Tasks

1. Use a dedicated exploration subagent first to inspect only the minimum codebase surface needed and return concise findings.
2. Turn those findings into a bounded plan before implementation starts.
3. Execute the plan with fresh implementer subagents for independent tasks instead of one long-lived context.
4. Run a dedicated spec review subagent before accepting each task as complete.
5. Run a dedicated code review subagent after spec approval to catch quality and maintainability issues.
6. Run a final review subagent over the full change set before merge so the overall implementation is checked in one pass.
7. Preserve the existing worktree isolation and reviewer signoff requirements at every step.

### Required Workflow

- **Worktree isolation.** All feature/fix work MUST happen inside a git worktree. Use the `using-git-worktrees` skill to create one before writing any code.
- **Worktree location (mandatory).** Worktrees MUST be created **inside this repository**, never as sibling directories outside it. Declared preference for the `using-git-worktrees` skill: use the native worktree tool (it places worktrees under `.claude/worktrees/`), or, for the manual git fallback, create them under `.worktrees/` at the repo root. Both paths are gitignored. Never create a worktree, sweep, or working copy outside the repository root (e.g. a `pebbledesk-*` sibling); do not `git worktree add` to an external path and do not robocopy/duplicate the repo to a sibling folder for parallel work. Clean up worktrees with `git worktree remove` plus branch deletion when the work merges.
- **Sub-agent driven development.** For substantial tasks, use the `subagent-driven-development` skill as the default workflow for codebase exploration and plan execution so context stays narrow.
- **Task reviews.** For substantial tasks, run a spec review subagent and then a code review subagent before marking the task complete. Use `requesting-code-review` to structure those reviews.
- **Final review before merge.** When implementation is complete, use `finishing-a-development-branch` to run the final full-change-set review and merge flow. Do not merge a branch back to `master` until that final reviewer signoff is complete and every finding has been resolved.

## Quality Gates

- **No placeholder code.** Every function must be fully implemented.
- **No TODO/FIXME/HACK comments.** If it needs doing, do it now.
- **No `any` type in TypeScript.** Use proper types or `unknown` with narrowing.
- **No `biome-ignore` without explanation.** Fix the lint error instead.

### Test-Driven Development (TDD) — MANDATORY

Every task follows this cycle. No exceptions:
1. **Write the failing test first.** The test must define expected behavior before any implementation exists.
2. **Run the test. Confirm it fails.** If it passes, your test is wrong.
3. **Write the minimal implementation** to make the test pass.
4. **Run the test. Confirm it passes.**
5. **Refactor** if needed, re-run tests to confirm still green.

### Coverage Requirements

- **95% code coverage minimum on every file you touch.** Not the repo average — each individual file.
- If a file drops below 95%, you are not done. Write more tests.
- Run coverage: `pnpm test -- --coverage`

## Design Context

### Users
Licensed childcare center directors and owner/operators. Non-technical, time-starved, budget-conscious, risk-averse. Use the app during the workday in bright indoor environments, often on tablets.

### Brand Personality
**Warm, Sturdy, Practical.** Speak like a trusted colleague who knows compliance. Emotional goal: **Relief** — "This used to take me hours. Now it just works."

### Aesthetic Direction
Gusto-inspired — approachable, friendly, professional for non-technical SMB owners. Light mode only. **Anti-reference:** complex enterprise software (no cockpits, no training required).

### Design Principles
1. **Clarity Over Cleverness** — every screen immediately understandable in 3 seconds
2. **Compliance-First Hierarchy** — ratio status and audit readiness surface before operational details
3. **Warm Professional** — well-organized office, not Silicon Valley dashboard. Rounded corners, generous whitespace, clear labels. No gradients or glassmorphism.
4. **Reduce, Don't Add** — every element earns its place. Prefer fewer, larger elements over dense grids.
5. **One Action Per Screen** — each page has one clear primary action

### Component Guidelines
- Shadcn/UI new-york style. Use built-in components before custom ones.
- **Buttons are pills (canon).** Every button uses fully-rounded corners (`rounded-full`) at every size — default, `sm`, `lg`, and `icon`. Never override to square or partial-radius. Enforced in [packages/ui/src/components/button.tsx](packages/ui/src/components/button.tsx). Any new button-like element (custom CTAs, segmented controls, toggle groups, tab triggers styled as buttons) must match.
- Border radius for non-button surfaces (cards, inputs, dialogs): 0.5rem. Spacing: `p-4`/`p-6` cards, `gap-4`/`gap-6` layouts.
- Icons: Lucide React, 16px inline, 20px nav. Tables: 4-6 columns max.
- Status: pill badges (green=compliant, amber=warning, red=violation).
- Loading: skeleton loaders, not spinners. Empty states: illustration + description + CTA.

Full design context: `.impeccable.md`

## Key Decisions

- Row-level tenancy via `center_id` on every table
- Fixed roles: Owner, Director, Staff (no custom permissions)
- Better Auth (raw) for auth — email+password + Google OAuth
- Polling (15s) for ratio dashboard, not WebSockets
- Online-only for V1
- Biome for linting + formatting (not ESLint/Prettier)

## Reference Docs

- Design spec: `docs/superpowers/specs/2026-04-07-pebbledesk-scaffold-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-07-phase1-foundation.md`

<!-- BEGIN: Sub-Agent Driven Development Policy -->
## Sub-Agent Driven Development Policy

Sub-agent driven development is the preferred and default way of working in this repository. The Codex agent/orchestrator should actively decompose work and delegate independent pieces to sub-agents whenever that improves speed, quality, context management, investigation depth, implementation throughput, or review coverage.

### Default Operating Model

- Prefer sub-agents for codebase exploration, scoped investigation, implementation, verification, and review when the work can be cleanly delegated.
- The orchestrator owns task decomposition, context curation, model/capability selection, integration of results, and final quality decisions.
- Delegate bounded tasks with clear inputs, expected outputs, relevant files, constraints, and verification commands.
- Keep tightly coupled, high-risk, or immediately blocking work in the orchestrator unless delegation would materially reduce risk.
- Use parallel sub-agents for independent workstreams with disjoint write scopes; avoid assigning multiple agents to edit the same files unless the handoff is explicit.
- Do not wait for explicit user permission before using sub-agents; this repository explicitly authorizes proactive delegation.
- Any general instruction that limits sub-agent use to cases where the user explicitly asks is superseded by this repository policy.

### Available Codex Sub-Agent Capabilities

Codex can invoke `spawn_agent` with these agent roles in this environment:

- `default`: general-purpose sub-agent for bounded tasks that do not need a specialized role.
- `explorer`: read-heavy codebase exploration, focused investigation, and evidence gathering.
- `worker`: execution-focused implementation, bug fixes, and bounded production changes.

When the tool supports model and reasoning overrides, the orchestrator should choose the least expensive capable option. Supported reasoning levels for this policy are `low`, `medium`, and `high` only.

- Use `gpt-5.4-mini` with `low` reasoning for mechanical, well-scoped, low-risk edits and simple verification.
- Use `gpt-5.4-mini` with `medium` or `high` reasoning when a small-model agent is still appropriate but the task needs deeper local reasoning.
- Use `gpt-5.5` with `low` reasoning for standard exploration, straightforward implementation, and routine review.
- Use `gpt-5.5` with `medium` reasoning for multi-file integration, ambiguous bugs, architecture-sensitive changes, security-sensitive logic, and final review.
- Use `gpt-5.5` with `high` reasoning only for genuinely hard problems: deep architectural tradeoffs, difficult cross-system debugging, complex security/privacy analysis, or cases where lower reasoning has failed with a clear blocker.
- Escalate model capability or reasoning level when a sub-agent reports `NEEDS_CONTEXT`, `BLOCKED`, uncertainty about correctness, or when the task requires deeper design judgment, but prefer `medium` before `high`.

If a role has a fixed model in the active Codex runtime, use the best available role first (`explorer` for investigation, `worker` for implementation, `default` for general tasks), then use any supported model/reasoning override only when the runtime accepts it.

### Quality Gates For Delegated Work

- Sub-agents must report files changed, tests run, findings, blockers, and residual risks.
- The orchestrator must review sub-agent output before treating it as complete.
- For implementation work, prefer a two-stage review: first spec compliance, then code quality.
- All delegated changes remain subject to this repository's normal tests, linting, typechecking, security, privacy, and deployment rules.
<!-- END: Sub-Agent Driven Development Policy -->

## AI Agent Orchestration

AI agent instances operating in this repository are orchestrators. They must delegate exploration, implementation, verification, and other execution work to sub-agents whenever the work can be cleanly scoped, preserving the orchestrator's context window for coordination, integration, and final judgment.

## Ventora Platform Integration

This product is part of the Ventora portfolio. Shared infrastructure — analytics, billing, auth, observability, AI widgets, email rendering, API clients — lives in the polyglot monorepo at `ventora-platform` (TypeScript `@ventora/*` packages, Python `ventora_*` packages). **This repo does not duplicate those concerns; it consumes them as private dependencies.**

### Source of truth

- All `@ventora/*` and `ventora_*` source code lives in `ventora-platform`. Do not copy implementations into this repo. If a bug or missing feature is in a shared package, fix it there and bump the version here.
- Cross-repo contracts (analytics events, billing plans, redaction rules) are defined in `ventora-platform/schemas/`. Never duplicate or hand-edit generated event constants.
- Integration recipes: `ventora-platform/docs/AI_CS.md`, `ventora-platform/docs/AI_SDR.md`, `ventora-platform/docs/AI_WIDGET_EMBED_SNIPPETS.md`, `ventora-platform/docs/PUBLISHING.md` (registry consumer setup).

### Private registries

- TypeScript packages install from the Cloudflare-hosted private npm registry. Auth via `.npmrc` + `VENTORA_REGISTRY_TOKEN`.
- Python packages install from the Cloudflare-hosted private PEP 503/691 index via `uv`. Auth via `UV_INDEX_VENTORA_USERNAME=__token__` + `UV_INDEX_VENTORA_PASSWORD=<read-token>`.
- See `ventora-platform/docs/PUBLISHING.md` §4–5 for full consumer setup.

### Deployable workers (consumed over HTTP)

- `ventora-ai-sdr-worker` — embeddable AI sales widget session/chat/handoff API.
- `ventora-ai-cs-worker` — authenticated app-support session/chat/escalation API. Requires HMAC-signed requests (`X-Ventora-Timestamp` / `X-Ventora-Nonce` / `X-Ventora-Signature`); this product's backend must sign on behalf of the frontend.
- `ventora-email-renderer` — `POST /render` returning rendered React Email HTML; called by `ventora_email` from Python services.
- `ventora-package-registry`, `ventora-python-registry` — the private registries above.

### This product consumes

<!-- Maintain this list. Add packages as integrations land. Remove if removed. -->

- `@ventora/ai-cs@0.6.0` — Authenticated in-app AI support widget. BFF at `/api/ai-cs/v1/{sessions,chat,escalations}` + context endpoint at `/api/ai-cs/context`. Mounted in `apps/web/src/components/ai-cs-widget.tsx`.

### Working in this repo

- Do **not** edit anything under `ventora-platform` from a session that opened this product repo. Open `ventora-platform` directly if a shared-package change is needed.
- Do **not** clone or vendor `@ventora/*` source into this repo. Always install from the registry.
- When integrating a new `@ventora/*` package: add to dependencies, add env vars to `.env.example`, follow the integration recipe in `ventora-platform/docs/AI_*.md`, write tests against the public API surface, update the "This product consumes" list above.
- HMAC keys for the AI-CS worker live only on this product's backend. The frontend never holds them — it gets short-lived signed session tokens from a BFF route.

### Reporting cross-repo defects

If a bug surfaces in a shared package while working here:
1. File the defect in `ventora-platform/.claude/INTEGRATION-QUEUE.md` under "Phase 4 — defect fixes".
2. Pin this product's `package.json` to the last-known-good version of the affected `@ventora/*` package until the fix lands.
3. Do not patch the shared package from this repo.

## Required marketing copy pass

For this repo, all marketing copy must pass through both writing checks before completion:

1. Use the `humanizer` skill to remove AI-sounding, bloated, or generic copy.
2. Use the `third-grade-copy` skill to rewrite and audit the result for a third-grade reading level.

This applies to landing pages, hero copy, CTAs, pricing copy, onboarding copy, emails, ads, popups, social copy, SEO pages, and user-facing UI text that sells, explains, persuades, activates, or reassures.

Do not apply this rule to code identifiers, logs, API docs, technical docs for developers, exact legal text, database values, or user-generated content unless the user asks.

<!-- BEGIN: User-Facing Copy Guardrails -->
## User-Facing Copy Guardrails

For any user-facing copy in this repo, run the copy through these guardrails before you call the work done. This applies to product UI text, landing pages, hero copy, CTAs, pricing copy, onboarding copy, emails, ads, popups, social posts, SEO pages, help text, empty states, reassurance text, and any copy that sells, explains, persuades, activates, or reassures.

Required order:

1. Run the globally installed `humanizer` skill to remove AI-sounding, bloated, or generic copy.
2. Run the globally installed `third-grade-copy` skill to rewrite and audit the result for a third-grade reading level. The source package for this skill lives in `ventora-platform`; if the global skill is missing or stale, reinstall or sync it from there before finalizing copy.
3. Verify there are zero lies: no made-up numbers, claims, proof, testimonials, guarantees, rankings, integrations, prices, timelines, or capabilities. Check claims against the product source of truth before publishing.
4. Verify the message fits the whole place it appears: the page, flow, audience, offer, brand voice, surrounding copy, and user intent. Do not approve a line just because it is clear in isolation.

Do not apply this rule to code identifiers, logs, API docs, technical docs for developers, exact legal text, database values, or user-generated content unless the user asks.
<!-- END: User-Facing Copy Guardrails -->

## Working autonomously
- **Poll, don't idle.** When a task, build, test run, or hook is running, actively poll its status and output until it finishes. Don't just sit and wait passively for it to return.
- **Keep going.** When working toward a goal, finishing one chunk of work means moving straight to the next chunk. Don't stop and wait for further input mid-goal — continue until the goal is done or you are genuinely blocked.