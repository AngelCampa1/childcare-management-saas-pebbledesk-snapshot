# Spec: Persona Landing Pages (apps/site)

Goal: ultra-specific landing pages for each PebbleDesk user persona, with strong
internal linking, schema-rich SEO/AI-SEO, and copy that will pass humanizer +
third-grade-copy passes. Static pages so the existing `internal-links-source.test.ts`
auto-discovers them.

## Personas (from `apps/site/src/config/personas.ts`)

1. `center-director` — licensed center, 20–75 children. Plan: Center Starter / Center Pro.
2. `in-home-daycare-operator` — home program using `formatPlanCapacityClaim("home")`. Plan: Home.
3. `multi-site-operator` — multi-site / Head Start grantee. Plan: Group / Enterprise.

## Routes (all STATIC `.astro`, trailingSlash always)

- `/for/` — hub page listing all 3 personas (index.astro)
- `/for/childcare-center-directors/`
- `/for/in-home-daycare-providers/`
- `/for/multi-site-childcare-operators/`

## Files to create

1. `apps/site/src/config/persona-pages.ts` — typed data (single source of truth for copy).
2. `apps/site/src/components/persona-landing.astro` — renders one persona page body.
3. `apps/site/src/components/persona-hub.astro` — renders the `/for/` hub body (optional; can inline in index).
4. `apps/site/src/pages/for/index.astro`
5. `apps/site/src/pages/for/childcare-center-directors.astro`
6. `apps/site/src/pages/for/in-home-daycare-providers.astro`
7. `apps/site/src/pages/for/multi-site-childcare-operators.astro`
8. `apps/site/src/test/persona-landing-pages-source.test.ts` (source-lint, written FIRST, must fail before impl)
9. `apps/site/src/test/persona-pages-config.test.ts` (unit test on the data, written FIRST)

## Files to edit

- `apps/site/src/config/site.ts` — add nav `megaMenu` item "Who it's for" + footer link group "Who it's for".
- `apps/site/src/pages/index.astro` — in the "Who PebbleDesk is for" section, link the audience descriptions to the persona pages (add at least 3 internal links to `/for/...`).
- `apps/site/src/pages/llms.txt.ts` — add a "Who It's For" section listing the 4 `/for/` URLs.

## Data model (`persona-pages.ts`)

```ts
import type { PersonaSlug } from "./personas";

export interface PersonaHelp {
  title: string;
  body: string;
  links: { label: string; href: string }[]; // internal feature links
}
export interface PersonaCrossLink { title: string; href: string; description: string }
export interface PersonaFaq { q: string; a: string }

export interface PersonaPage {
  slug: string;                 // url segment, e.g. "childcare-center-directors"
  route: string;                // "/for/childcare-center-directors/"
  canonicalPath: string;        // "/for/childcare-center-directors" (no trailing slash)
  personaSlug: PersonaSlug;     // must exist in personas.ts
  navLabel: string;             // "Center Directors"
  title: string;                // <= 60 chars
  description: string;          // <= 160 chars
  eyebrow: string;
  headline: string;
  subheadline: string;
  trustSignal: string;
  plan: string;                 // "center_starter" | "home" | "group" etc (for signup CTA)
  pains: string[];              // 3 items
  helps: PersonaHelp[];         // 3-4 items, each with >=1 internal feature link
  takeaways: string[];          // 3 items, AI-extractable summary
  planFit: string;
  crossLinks: PersonaCrossLink[]; // 3-5, for RelatedPages component
  faqs: PersonaFaq[];           // >=4
  relatedPersonaSlugs: string[];// the OTHER 2 persona slugs
}

export const personaPages: PersonaPage[] = [ /* see copy below */ ];
export const personaPagesBySlug = Object.fromEntries(personaPages.map(p => [p.slug, p]));
```

## Component `persona-landing.astro`

Props: `{ page: PersonaPage; config: SiteConfig }`. Render, in order, using the SAME design
tokens/classes as `apps/site/src/pages/index.astro` (CSS vars like `--surface-primary`,
`--color-brand-text`, `--color-accent-700`, `--radius-xl`, `--shadow-card`, etc.) and these
existing marketing components:

- `BreadcrumbNav` (`@pebbledesk/marketing/components/breadcrumb-nav.astro`) — items:
  `[{label:"Home",href:"/"},{label:"Who it's for",href:"/for/"},{label:page.navLabel,href:page.route}]`,
  `siteUrl="https://pebbledesk.app"`. (Emits BreadcrumbList schema.)
- Inline hero block (copy index.astro's hero markup but WITHOUT the `<HeroSection variant="collage">`/collage —
  use a plain section: eyebrow, h1 headline, subheadline, primary CTA button, trust line). H1 = page.headline.
- Problem agitation section: h2 (question-style ok) + 3 pain cards.
- "How PebbleDesk helps" section: grid of help cards; each card title (h3), body, and an internal-link list
  (reuse the feature-pillar link styling from index.astro).
- Key takeaways: a compact bulleted list with an `editorial-kicker`/eyebrow "Key takeaways" — AI-extractable.
- Plan-fit callout chip (reuse the index.astro plan-fit chip styling) + trial line
  from `PEBBLEDESK_OFFERING.claims.trialDisclosure`.
- `RelatedPages` (`@pebbledesk/marketing/components/related-pages.astro`) heading "Compare and dig deeper",
  pages = page.crossLinks. (Emits ItemList schema.)
- "Also built for" section linking to the other personas (use page.relatedPersonaSlugs → personaPagesBySlug)
  with short blurbs + links to their routes.
- `FaqSection` (`@pebbledesk/marketing/components/faq-section.astro`) faqs=page.faqs, with bottom CTA
  (`bottomCtaHeading`, `bottomCtaText`, `bottomCtaTarget` = signup CTA). (Emits FAQPage schema.)
- Final CTA band (copy index.astro's `#signup` band) + `StickyMobileCta`.

CTA target: mirror index.astro using `resolvePublicSignupCta({ sourcePage: page.route,
explicitTarget: \`${getProductSignupUrl()}?plan=${page.plan}&source=...\`, explicitText: config.funnel.bofu.ctaText })`.
Simplest acceptable: reuse `config.funnel.bofu.ctaTarget` with `sourcePage: page.route`. Keep buttons as `btn-primary`/`btn-secondary` (pill).

## Page files

Each persona `.astro` page:
```astro
---
import "../../styles/global.css";
import LandingLayout from "@pebbledesk/marketing/layouts/landing-layout.astro";
import PersonaLanding from "@/components/persona-landing.astro";
import { personaPagesBySlug } from "@/config/persona-pages";
import { siteConfig } from "@/config/site";
const page = personaPagesBySlug["childcare-center-directors"];
---
<LandingLayout
  config={siteConfig}
  canonicalPath={page.canonicalPath}
  schemaMode="product"
  title={page.title}
  description={page.description}
>
  <PersonaLanding page={page} config={siteConfig} />
</LandingLayout>
```

`/for/index.astro` hub: LandingLayout (canonicalPath="/for", schemaMode="product",
title "Who PebbleDesk Is For | Childcare Software", description <=160), a hero
("Built for the people who own the record"), and a `RelatedPages` (or card grid) linking to the 3 persona
pages, plus a CTA band. Breadcrumb Home > Who it's for.

## COPY (ground all claims in repo facts; NO fake testimonials, NO customer counts —
the site says "We are new". Subsidy stats below are from siteConfig.faqs and are allowed.)

### center-director — `/for/childcare-center-directors/`
- navLabel: "Center Directors"
- title: "Childcare Software for Center Directors | PebbleDesk"
- description: "Keep attendance, ratios, and audit records ready for every licensing visit. PebbleDesk gives center directors one audit-ready record."
- eyebrow: "For licensed center directors"
- headline: "Walk into your next licensing visit already ready."
- subheadline: "PebbleDesk keeps attendance, ratios, and records in one place, so audit prep is not a late-night scramble."
- trustSignal: "Built for licensed centers serving 20 to 75 children."
- plan: "center_starter"
- pains:
  - "Ratios change all day. The proof lives on a paper sheet you rebuild later."
  - "A licensing visit means digging through binders, spreadsheets, and email."
  - "One missing record can put your license at risk."
- helps:
  - { title: "See your ratios as the day happens", body: "Watch room coverage live and keep the history you need for proof.", links: [Ratio Tracking -> /features/ratio-tracking/, Attendance Tracking -> /features/attendance-tracking/] }
  - { title: "Prove every day in minutes", body: "Audit exports pull straight from the daily record, so you are not rebuilding the week.", links: [Audit Reports -> /features/audit-reports/] }
  - { title: "Keep staff and child records together", body: "Enrollment, files, and staff credentials live in one place an inspector can trust.", links: [Enrollment & Records -> /features/enrollment-records/, Staff Credentials -> /features/staff-credentials/] }
  - { title: "Switch without starting over", body: "Bring your data with CSV import and Brightwheel or Procare presets.", links: [Imports & Migration -> /features/imports-migration/] }
- takeaways:
  - "PebbleDesk keeps attendance, ratios, and audit records in one place."
  - "Audit exports come from the same record you use every day."
  - "Most centers start on Center Starter; larger teams use Center Pro."
- planFit: derive Center Starter and Center Pro capacity copy from `formatPlanCapacityClaim("center_starter")` and `formatPlanCapacityClaim("center_pro")`.
- crossLinks:
  - { title: "PebbleDesk vs Brightwheel for center directors", href: "/compare/alternatives/brightwheel-center-directors/", description: "See how PebbleDesk compares for licensed centers." }
  - { title: "Ratio tracking", href: "/features/ratio-tracking/", description: "Live room coverage and ratio history." }
  - { title: "Audit reports", href: "/features/audit-reports/", description: "Pull inspection-ready exports from the daily record." }
  - { title: "Compare childcare software", href: "/compare/", description: "Line PebbleDesk up against other tools." }
  - { title: "See pricing", href: "/pricing/", description: "Plans and the free trial." }
- faqs:
  - q: "Will PebbleDesk work for my state's licensing rules?"
    a: "PebbleDesk supports attendance, ratios, records, and audit exports for centers nationwide. We have verified state-specific ratio and licensing report support for Texas, California, and Florida today. For other states, we map your format during setup."
  - q: "How fast can I switch from my current software?"
    a: "You can import children, guardians, and enrollment with a CSV file, and use Brightwheel or Procare presets to clean up the data. Most single-site centers can start self-serve."
  - q: "What do I show an inspector?"
    a: "Audit exports, attendance reports, and audit log history pull from the same daily record, so the proof matches what actually happened."
  - q: "Do I need a credit card to try it?"
    a: use `PEBBLEDESK_OFFERING.claims.trialStartDisclosure`.
- relatedPersonaSlugs: ["in-home-daycare-providers", "multi-site-childcare-operators"]

### in-home-daycare-operator — `/for/in-home-daycare-providers/`
- navLabel: "In-Home Providers"
- title: "Daycare Software for In-Home Providers | PebbleDesk"
- description: "Run your home daycare without the paperwork pileup. PebbleDesk handles attendance, billing, and records at a price that fits one classroom."
- eyebrow: "For in-home daycare providers"
- headline: "Run your home daycare without the paperwork pileup."
- subheadline: "PebbleDesk handles attendance, billing, and records for small programs, at a price that fits one classroom."
- trustSignal: derive Home capacity copy from `formatPlanCapacityClaim("home")`.
- plan: "home"
- pains:
  - "You wear every hat. Paperwork eats the time you would rather spend with kids."
  - "Big-center software costs too much and does too much."
  - "Subsidy and licensing records still have to be right."
- helps:
  - { title: "One simple place for attendance and records", body: "Track who is here and keep child files in order without a binder.", links: [Attendance Tracking -> /features/attendance-tracking/, Enrollment & Records -> /features/enrollment-records/] }
  - { title: "Send invoices and get paid", body: "Bill families and track payments without a second app.", links: [Billing & Payments -> /features/billing-payments/] }
  - { title: "Keep subsidy paperwork in order", body: "Track what you billed and the records that back up the claim.", links: [Subsidy Billing -> /features/subsidy-billing/] }
  - { title: "Message families in one thread", body: "Send updates and get replies in an operational reply inbox.", links: [Messaging & Alerts -> /features/messaging-alerts/] }
- takeaways:
  - Use `formatPlanFitSummary("home")`.
  - "Attendance, billing, and records live in one simple place."
  - "Start the free trial with no credit card."
- planFit: derive from `formatPlanFitSummary("home")`, then append the flat-price/no-setup-fee note.
- crossLinks:
  - { title: "Affordable Lillio alternative", href: "/compare/alternatives/lillio-affordable/", description: "A lower-cost option for small programs." }
  - { title: "Billing & payments", href: "/features/billing-payments/", description: "Invoice families and track payments." }
  - { title: "Subsidy billing", href: "/features/subsidy-billing/", description: "Keep claims and records together." }
  - { title: "See pricing", href: "/pricing/", description: "The Home plan and the free trial." }
  - { title: "Compare childcare software", href: "/compare/", description: "See how PebbleDesk stacks up." }
- faqs:
  - q: "Is PebbleDesk affordable for a home daycare?"
    a: derive Home capacity copy from `formatPlanFitSummary("home")`, then append flat-price/no-setup-fee and trial disclosure.
  - q: "Is this too much software for a small program?"
    a: "No. You can start with attendance, records, and billing and leave the rest off until you need it."
  - q: "Can it handle subsidy billing?"
    a: "Yes. PebbleDesk tracks what you billed, what is still outstanding, and the records that support each claim."
  - q: "Do I need a credit card to start?"
    a: use `PEBBLEDESK_OFFERING.claims.trialStartDisclosure`.
- relatedPersonaSlugs: ["childcare-center-directors", "multi-site-childcare-operators"]

### multi-site-operator — `/for/multi-site-childcare-operators/`
- navLabel: "Multi-Site Operators"
- title: "Childcare Software for Multi-Site Operators"
- description: "Run every site from one clear view. PebbleDesk gives multi-site operators and Head Start grantees consistent records and subsidy billing."
- eyebrow: "For multi-site operators and Head Start grantees"
- headline: "Run every site from one clear view."
- subheadline: "PebbleDesk gives multi-site operators and Head Start grantees consistent records and subsidy billing across locations."
- trustSignal: "Built for groups running more than one location."
- plan: "group"
- pains:
  - "Every site tracks things a little differently, so reports never line up."
  - "Subsidy billing at scale leaves money on the table."
  - "Rolling out new software across sites feels risky."
- helps:
  - { title: "See every site in one place", body: "Roll up attendance, ratios, and records across locations.", links: [Multi-Location Oversight -> /features/multi-location-oversight/] }
  - { title: "Bill subsidy the same way everywhere", body: "Run consistent subsidy workflows and keep the records that back each claim.", links: [Subsidy Billing -> /features/subsidy-billing/] }
  - { title: "Keep audit records consistent", body: "Every site exports the same audit-ready proof.", links: [Audit Reports -> /features/audit-reports/] }
  - { title: "Roll out with a plan", body: "Map migration and sequencing before you switch sites over.", links: [Imports & Migration -> /features/imports-migration/] }
- takeaways:
  - "Group fits growing multi-site teams; Enterprise adds sales-led rollout."
  - "Run the same subsidy and audit workflows at every site."
  - "Research estimates centers lose more than 8% of revenue to subsidy billing errors without automation."
- planFit: "Group fits growing multi-site teams. Enterprise adds sales-led rollout, migration sequencing, and cross-center reporting."
- crossLinks:
  - { title: "PebbleDesk vs Procare for multi-location", href: "/compare/alternatives/procare-multi-location/", description: "Compare PebbleDesk for groups." }
  - { title: "Multi-location oversight", href: "/features/multi-location-oversight/", description: "One view across every site." }
  - { title: "Subsidy billing", href: "/features/subsidy-billing/", description: "Consistent claims at scale." }
  - { title: "See pricing", href: "/pricing/", description: "Group and Enterprise plans." }
  - { title: "Compare childcare software", href: "/compare/", description: "See how PebbleDesk compares." }
- faqs:
  - q: "Can PebbleDesk handle billing across multiple sites?"
    a: "Yes. Group and Enterprise plans support subsidy and billing workflows across locations, with the records that back each claim."
  - q: "How does rollout work for several locations?"
    a: "Enterprise rollouts are sales-led. We map center setup, migration sequencing, and cross-center reporting during implementation."
  - q: "Does it support Head Start and CCDF reporting?"
    a: "PebbleDesk keeps attendance, ratios, and subsidy claim support in one record. CACFP tracking and audit exports help with program reporting."
  - q: "How much revenue can subsidy billing errors cost?"
    a: "Research estimates providers miss more than 8% of annual revenue from subsidy billing errors without automation. On $200,000 in subsidy revenue, that is about $16,000 a year."
- relatedPersonaSlugs: ["childcare-center-directors", "in-home-daycare-providers"]

## Nav + footer wiring (`site.ts`)

Add to `nav.items` (after "About" or before "Pricing"):
```ts
{
  label: "Who it's for",
  megaMenu: [
    {
      heading: "By role",
      links: [
        { label: "Center Directors", href: "/for/childcare-center-directors/" },
        { label: "In-Home Providers", href: "/for/in-home-daycare-providers/" },
        { label: "Multi-Site Operators", href: "/for/multi-site-childcare-operators/" },
      ],
      viewAllText: "Who PebbleDesk is for ->",
    },
  ],
},
```
Add a footer linkGroup:
```ts
{
  heading: "Who it's for",
  links: [
    { label: "Center Directors", href: "/for/childcare-center-directors/" },
    { label: "In-Home Providers", href: "/for/in-home-daycare-providers/" },
    { label: "Multi-Site Operators", href: "/for/multi-site-childcare-operators/" },
    { label: "Who PebbleDesk is for", href: "/for/" },
  ],
}
```

## Tests (write FIRST, confirm fail, then implement)

`persona-pages-config.test.ts`:
- imports `personaPages`, `personaPagesBySlug` from config, and `personas` from personas.ts.
- exactly 3 persona pages; slugs == ["childcare-center-directors","in-home-daycare-providers","multi-site-childcare-operators"].
- each `personaSlug` exists in `personas`.
- each title length <= 60; description length <= 160 and >= 50.
- each has >= 3 pains, >= 3 helps (each help >=1 link), >= 3 takeaways, >= 4 faqs.
- every help link href and crossLink href starts with "/" and ends with "/".
- feature links point to real feature slugs (validate against `src/content/features/*.md` filenames).
- relatedPersonaSlugs reference the other two valid persona slugs (not self).
- canonicalPath == route without trailing slash; route == `/for/${slug}/`.
- no banned phrases in any copy string: ["customers report","directors report","trusted by","#1","best-in-class","thousands of"] (case-insensitive).

`persona-landing-pages-source.test.ts`:
- the 4 page files exist under src/pages/for/.
- each of the 3 persona page sources contains `LandingLayout`, `schemaMode="product"`, `PersonaLanding`, and the correct `canonicalPath={page.canonicalPath}` usage (or literal). Hub contains `canonicalPath`.
- the persona-landing.astro component source imports BreadcrumbNav, RelatedPages, FaqSection, StickyMobileCta.
- siteConfig nav contains a "Who it's for" megaMenu whose links include the 3 persona routes; footer has a "Who it's for" group including `/for/`.
- index.astro contains at least the 3 persona routes (homepage internal links).
- llms.txt.ts contains "Who It's For" and the persona routes/URLs.

## Quality gates
- No `any`. No TODO/placeholders. Strong typing on the data module.
- `pnpm --filter @pebbledesk/site test`, `pnpm --filter @pebbledesk/site typecheck` (or repo typecheck), `pnpm lint` (biome) all green.
- All copy will get a separate humanizer + third-grade pass after build — keep sentences short and plain.
