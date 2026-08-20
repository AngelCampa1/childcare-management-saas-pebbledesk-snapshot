# Marketing Site Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the marketing header focused on Product, Pricing, Resources, and About, while moving audience and comparison paths into organized resource/footer surfaces.

**Architecture:** The shared header already renders `siteConfig.nav.items`, so the main behavior lives in `apps/site/src/config/site.ts`. Source tests in `apps/site/src/config/site.test.ts`, `apps/site/src/config/resource-hubs.test.ts`, and persona source tests should enforce the new organization without changing the shared header component.

**Tech Stack:** Astro, TypeScript, Vitest, pnpm, Biome.

---

### Task 1: Header Navigation Contract

**Files:**
- Modify: `apps/site/src/config/site.test.ts`
- Modify: `apps/site/src/config/resource-hubs.test.ts`
- Modify: `apps/site/src/test/persona-landing-pages-source.test.ts`
- Modify: `apps/site/src/config/site.ts`

- [ ] **Step 1: Write failing tests**

Update the nav assertions so the top-level labels must be exactly:

```ts
expect(siteConfig.nav?.items?.map((item) => item.label)).toEqual([
	"Product",
	"Pricing",
	"Resources",
	"About",
]);
```

Assert `Product` is a mega menu that includes feature and persona links, `Resources` is a mega menu that includes hub links and comparison/free-tool links, and no top-level item is labeled `Who it's for` or `Compare`.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @pebbledesk/site test -- src/config/site.test.ts src/config/resource-hubs.test.ts src/test/persona-landing-pages-source.test.ts
```

Expected: FAIL because the current nav still exposes `Who it's for` and `Compare` as top-level items.

- [ ] **Step 3: Implement minimal nav change**

Edit `siteConfig.nav.items`:

```ts
items: [
	{
		label: "Product",
		megaMenu: [
			{
				heading: "Features",
				links: [
					{ label: "Features", href: "/features/" },
					{ label: "Ratio Tracking", href: "/features/ratio-tracking/" },
					{ label: "Subsidy Billing", href: "/features/subsidy-billing/" },
				],
			},
			{
				heading: "Who it's for",
				links: [
					{ label: "Center Directors", href: "/for/childcare-center-directors/" },
					{ label: "In-Home Providers", href: "/for/in-home-daycare-providers/" },
					{ label: "Multi-Site Operators", href: "/for/multi-site-childcare-operators/" },
				],
				viewAllHref: "/for/",
				viewAllText: "See who PebbleDesk helps ->",
			},
		],
	},
	{ label: "Pricing", href: "/pricing/" },
	{
		label: "Resources",
		megaMenu: [
			/* keep hub-first resource links, plus compare/free-tool organization */
		],
	},
	{ label: "About", href: "/about/" },
]
```

- [ ] **Step 4: Run focused tests to verify pass**

Run the same focused Vitest command. Expected: PASS.

### Task 2: Marketing Surface Organization Review

**Files:**
- Modify: `apps/site/src/config/site.test.ts`
- Modify: `apps/site/src/config/site.ts`

- [ ] **Step 1: Write failing tests**

Assert the footer keeps secondary surfaces discoverable without adding header clutter:

```ts
expect(siteConfig.footer.linkGroups.map((group) => group.heading)).toEqual([
	"Product",
	"Resources",
	"About",
]);
```

Assert the Product footer group includes feature and pricing paths, Resources includes guides, compare, and free checklist paths, and About includes persona plus founder/company paths.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @pebbledesk/site test -- src/config/site.test.ts
```

Expected: FAIL because the current footer has a separate `Who it's for` group.

- [ ] **Step 3: Implement minimal footer reorganization**

Edit `siteConfig.footer.linkGroups` so secondary material stays in footer groups instead of top-level header items:

```ts
linkGroups: [
	{ heading: "Product", links: [...] },
	{ heading: "Resources", links: [...] },
	{ heading: "About", links: [...] },
]
```

- [ ] **Step 4: Run focused tests to verify pass**

Run the same focused test. Expected: PASS.

### Task 3: Final Verification and Reviews

**Files:**
- Review all changed files.

- [ ] **Step 1: Run copy scan**

Run:

```bash
python scripts/scan_copy.py apps/site/src/config --include-warnings --markdown
```

Expected: Review warnings for changed visible marketing copy. Fix any new hard-gate failures.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @pebbledesk/site test -- src/config/site.test.ts src/config/resource-hubs.test.ts src/test/persona-landing-pages-source.test.ts src/test/internal-links-source.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run site test suite**

Run:

```bash
pnpm --filter @pebbledesk/site test
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --filter @pebbledesk/site typecheck
```

Expected: PASS.
