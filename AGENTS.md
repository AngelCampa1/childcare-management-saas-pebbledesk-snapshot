# AGENTS.md - PebbleDesk

## Decommissioned Product

PebbleDesk is decommissioned. Do not deploy PebbleDesk Cloudflare projects or recreate
PebbleDesk external services from this repository. Keep the repository as source history only.

## Design Canon

- **Buttons are pills.** Treat fully rounded button geometry as a standing product preference. Every button or button-styled CTA should use pill corners (`border-radius: 9999px`, `rounded-full`, or equivalent), including primary/secondary actions, link-buttons, toolbar buttons, segmented/toggle controls, and icon buttons (circular when square). Do not introduce square or mildly rounded button shapes unless the user explicitly asks for that exception.

## Before Starting Work

Run `git pull` before beginning any task. This repository is developed across multiple computers and your local copy may be behind.

This file provides guidance to coding agents when working in this repository.

## LinkedIn/Postiz Shutdown Gate

Do not create, upload, or schedule PebbleDesk LinkedIn posts through Postiz.
`node scripts/postiz-schedule-linkedin-calendar.mjs` now refuses because PebbleDesk is
decommissioned. The historical review gate remains only for archival audit of existing
marketing files.

## Project Overview

PebbleDesk is a childcare center administration SaaS - "The Audit-Ready Childcare Platform." Monorepo with Turborepo + pnpm workspaces.

### Structure

```text
pebbledesk/
|-- apps/
|   |-- web/          - React + Vite SPA (Cloudflare Workers Static Assets)
|   |-- api/          - Hono on Cloudflare Workers
|   `-- site/         - Astro marketing site (Cloudflare Workers Static Assets)
|-- packages/
|   |-- db/           - Drizzle schema, Neon client
|   |-- auth/         - Better Auth config
|   |-- shared/       - Types, Zod validators, constants
|   |-- ui/           - Shadcn/UI, Tailwind, design tokens
|   `-- marketing/    - Shared marketing components and content helpers
```

## Common Commands

```bash
pnpm dev                             # all apps concurrently
pnpm --filter @pebbledesk/web dev    # web only
pnpm --filter @pebbledesk/api dev    # api only
pnpm build                           # turbo build
pnpm typecheck                       # turbo typecheck
pnpm test                            # turbo test
pnpm test:watch                      # vitest watch
pnpm lint                            # biome check
pnpm lint:fix                        # biome check --write
pnpm cf:deploy:touched               # refuses because PebbleDesk is decommissioned
pnpm cf:deploy:api                   # refuses because PebbleDesk is decommissioned
pnpm cf:deploy:web                   # refuses because PebbleDesk is decommissioned
pnpm cf:deploy:site                  # refuses because PebbleDesk is decommissioned
pnpm cf:cleanup:pages                # historical cleanup only; no PebbleDesk Pages projects remain
pnpm db:generate                     # drizzle-kit generate
pnpm db:migrate                      # drizzle-kit migrate
pnpm db:studio                       # drizzle-kit studio
```

## Environment Variables

| Variable | Purpose |
|---|---|
| DATABASE_URL | Neon Postgres connection string |
| BETTER_AUTH_SECRET | Session encryption secret |
| BETTER_AUTH_URL | Auth base URL (`http://localhost:8790` for dev) |
| GOOGLE_CLIENT_ID | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret |

## Coding Style & Naming Conventions

Use TypeScript throughout. Biome is the formatter and linter: tabs for indentation, 100-character line width, and LF line endings. Use `PascalCase` for React components, `camelCase` for functions and variables, and keep tests close to the code they exercise with names like `index.test.ts`, `audit.test.ts`, or `billing-subsidy.test.ts`.

Keep changes DRY. Before introducing a new utility, component, validator, or API helper, check whether the repository already provides the same behavior in `apps/`, `packages/`, or `scripts/`. Prefer extending shared code over copy-paste variants.
Keep modules focused and boundaries clean. Avoid mixing UI rendering, validation, persistence, and domain logic in the same file when a clearer split is available.
Reuse shared auth, DB, validation, audit, billing, and UI helpers instead of creating parallel local abstractions. Prefer explicit behavior over hidden side effects.
Use clear, domain-specific names and fail fast on invalid input, especially in auth, billing, attendance, compliance, and enrollment paths.

## Testing Guidelines

Vitest is the default unit and integration test runner. Follow existing naming patterns such as `*.test.ts` and `*.test.tsx`, and keep tests close to the logic they cover.
For child records, attendance, billing, audit, and auth flows, keep a strict red-green-refactor workflow and avoid merging untested logic.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit style, for example `fix(wave4): auth hardening and tenancy defense-in-depth`. PRs should include a short summary, linked issue or plan doc, verification evidence (`pnpm test`, targeted coverage, or browser verification), and screenshots when UI changes.

During review, explicitly check for DRY violations, repeated business logic, duplicated validation, and missed opportunities to reuse established patterns. Treat unnecessary duplication as a real review issue.
Also flag weak naming, mixed responsibilities, hidden side effects, inconsistent error handling, and missing regression or edge-case tests.

## Security & Data Handling Notes

Never commit real child, guardian, staff, or billing data, never log secrets or raw auth/session tokens, and do not introduce third-party scripts into authenticated app routes. Preserve center scoping, auditability, and attendance/compliance integrity on every data path, and flag any change that could weaken child-data handling, auth, or billing safety before merging.

## Execution Expectations

Work end-to-end without pausing for progress check-ins. Do not stop after completing a batch to ask "ready for feedback?" or "should I continue?". Execute the full plan autonomously. Asking clarifying questions about requirements is still expected.

Keep archival changes complete and internally consistent. Do not restore production-readiness
workflows, deploy paths, or external service integrations unless the user explicitly reverses the
decommissioning decision.

For substantial tasks, use sub-agent-driven development as the default workflow. Keep each phase narrowly scoped so context does not balloon across exploration, execution, review, and merge.

For this repo, a task is substantial if it changes repo-tracked files, requires more than one meaningful step, spans more than one file or subsystem, or would otherwise benefit from separate exploration, implementation, and review contexts. One-off read-only checks or a single trivial edit can stay inline.

Small work such as a quick bugfix, typo, tiny documentation update, or other low-risk one-file change may be done directly on `master` without creating a worktree. If the user explicitly says to work directly on `master`, follow that instruction unless it would risk losing unrelated work.

### Required Default Workflow for Substantial Tasks

1. Use a dedicated exploration subagent to inspect only the minimum codebase surface needed and report concise findings.
2. Turn those findings into a bounded plan before implementation starts.
3. Execute the plan with fresh implementer subagents for independent tasks instead of carrying one large context through the work.
4. Run a dedicated spec review subagent before accepting each task as complete.
5. Run a dedicated code review subagent after spec approval to catch quality and maintainability issues.
6. After implementation completes, run a final review subagent over all work in the worktree before merge. Fix every issue found, then rerun the relevant review or verification until clean.
7. Merge the reviewed worktree back to `master` and remove the worktree. Do not deploy PebbleDesk Cloudflare projects.
8. Keep the existing reviewer signoff requirements in force at all times.

### Cloudflare Deployments

- GitHub Actions workflows are intentionally not used for CI or deploys in this repo.
- PebbleDesk deploy scripts refuse because the product is decommissioned.
- Do not recreate `pebbledesk-api`, `pebbledesk-web`, or `pebbledesk-site`.
- Do not deploy after completing work; PebbleDesk Cloudflare deploy scripts now refuse because the product is decommissioned.
- Cloudflare cleanup commands are historical only. The shutdown record found no PebbleDesk Pages projects or matching Workers.

## Skills, Plugins, and MCPs

### Required Skills Workflow

- Use the Superpowers skill system as the default process layer for work in this repo.
- Check for relevant skills before starting substantial work, especially for planning, debugging, implementation, review, and merge flows.
- Treat repo instructions in this file as higher priority than generic skill defaults when they conflict.

### Skills Expected in Normal Work

- `using-git-worktrees` for substantial feature or fix work before code changes, except quick fixes that are intentionally done directly on `master`
- `subagent-driven-development` for substantial exploration, plan execution, spec review, code review, and final review tasks
- `requesting-code-review` before considering implementation complete
- `finishing-a-development-branch` to merge completed work back to `master`
- `verification-before-completion` before claiming work is done or passing

### Preferred Plugin and Tool Stack

The original Claude setup in `.claude/settings.json` enables the following tool and plugin set. When equivalent tools are available in the current agent environment, prefer them:

- `superpowers@claude-plugins-official`
- `frontend-design@claude-plugins-official`
- `context7@claude-plugins-official`
- `cloudflare@cloudflare`
- `typescript-lsp@claude-plugins-official`
- `playwright@claude-plugins-official`
- `claude-md-management@claude-plugins-official`
- `skill-creator@claude-plugins-official`
- `neon@claude-plugins-official`
- `stripe@claude-plugins-official`
- `sentry@claude-plugins-official`
- `posthog@claude-plugins-official`
- `security-guidance@claude-plugins-official`
- `marketing-skills@marketingskills`

### MCP Guidance

- No repo-local MCP manifest or server configuration was found beyond the enabled plugin list in `.claude/settings.json`.
- When MCP-backed tools are available in the active agent environment, prefer them for Cloudflare, Neon, Stripe, Sentry, PostHog, Playwright, TypeScript/LSP, security guidance, and marketing workflows.
- If an environment does not expose an equivalent MCP or plugin, fall back to native CLI and repository tools without changing the intended workflow.

### Required Workflow

- **Worktree isolation.** Substantial feature/fix work MUST happen inside a git worktree. Quick fixes and explicitly requested direct-`master` work may be done on `master` after confirming the worktree is clean enough for the task.
- **Sub-agent driven development.** For substantial tasks, use `subagent-driven-development` as the default workflow for codebase exploration and plan execution so context stays narrow.
- **Task reviews.** For substantial tasks, run a spec review subagent and then a code review subagent before marking the task complete. Use `requesting-code-review` to structure those reviews.
- **Final review before merge.** When implementation is complete, spin up a final review agent for all work in the worktree. Fix every finding, merge the reviewed branch back to `master`, and remove the worktree. Do not deploy PebbleDesk Cloudflare projects. Do not merge a branch back to `master` until final reviewer signoff is complete and every finding has been resolved.

## Quality Gates

- **No placeholder code.** Every function must be fully implemented.
- **No TODO/FIXME/HACK comments.** If it needs doing, do it now.
- **No `any` type in TypeScript.** Use proper types or `unknown` with narrowing.
- **No `biome-ignore` without explanation.** Fix the lint error instead.

### Test-Driven Development (TDD) - MANDATORY

Every task follows this cycle. No exceptions:
1. **Write the failing test first.** The test must define expected behavior before any implementation exists.
2. **Run the test. Confirm it fails.** If it passes, your test is wrong.
3. **Write the minimal implementation** to make the test pass.
4. **Run the test. Confirm it passes.**
5. **Refactor** if needed, re-run tests to confirm still green.

### Coverage Requirements

- **95% code coverage minimum on every file you touch.** Not the repo average - each individual file.
- If a file drops below 95%, you are not done. Write more tests.
- Run coverage: `pnpm test -- --coverage`

## Design Context

### Users
Licensed childcare center directors and owner/operators. Non-technical, time-starved, budget-conscious, risk-averse. Use the app during the workday in bright indoor environments, often on tablets.

### Brand Personality
**Warm, Sturdy, Practical.** Speak like a trusted colleague who knows compliance. Emotional goal: **Relief** - "This used to take me hours. Now it just works."

### Aesthetic Direction
Gusto-inspired - approachable, friendly, professional for non-technical SMB owners. Light mode only. **Anti-reference:** complex enterprise software (no cockpits, no training required).

### Design Principles
1. **Clarity Over Cleverness** - every screen immediately understandable in 3 seconds
2. **Compliance-First Hierarchy** - ratio status and audit readiness surface before operational details
3. **Warm Professional** - well-organized office, not Silicon Valley dashboard. Rounded corners, generous whitespace, clear labels. No gradients or glassmorphism.
4. **Reduce, Don't Add** - every element earns its place. Prefer fewer, larger elements over dense grids.
5. **One Action Per Screen** - each page has one clear primary action

### Component Guidelines
- Shadcn/UI new-york style. Use built-in components before custom ones.
- Border radius: `0.5rem`. Spacing: `p-4`/`p-6` cards, `gap-4`/`gap-6` layouts.
- Icons: Lucide React, 16px inline, 20px nav. Tables: 4-6 columns max.
- Status: pill badges (green=compliant, amber=warning, red=violation).
- Loading: skeleton loaders, not spinners. Empty states: illustration + description + CTA.

Full design context: `.impeccable.md`

## Key Decisions

- Row-level tenancy via `center_id` on every table
- Fixed roles: Owner, Director, Staff (no custom permissions)
- Better Auth (raw) for auth - email+password + Google OAuth
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

- (none yet — initial integration in progress)

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