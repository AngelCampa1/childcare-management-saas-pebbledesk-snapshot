---
title: "Evaluating Childcare Software for Multi-Site Operations"
description: "What single-site software fails at for multi-location operators, what to evaluate, how pricing works, and the right questions to ask vendors."
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
publicKnowledge: true
buyerStage: "mofu"
schema: "Article"
bluf: "Multi-site childcare operators who use single-site software for each location end up with separate databases, no consolidated reporting, and an administrative overhead that grows linearly with locations instead of staying flat. The right software architecture changes that, but you have to know what to ask for during evaluation."
targetPersona:
  - "center-director"
  - "owner-operator"
faqs:
  - q: "What childcare software works for multiple locations?"
    a: "Software built for multi-site operations shares a single database across locations, provides consolidated reporting at the organization level, and allows staff access to be scoped to specific locations. This is architecturally different from single-site software. Some vendors offer 'enterprise' tiers of their single-site product that allow location grouping; evaluate whether this is genuine multi-site architecture or just multiple separate accounts with a shared invoice. Ask vendors specifically: 'Can I run a report showing total enrollment and revenue across all locations in a single view?'"
  - q: "What is the difference between single-site and multi-site childcare software?"
    a: "Single-site software stores each location's data in isolation; child records, billing, and attendance don't connect across locations. Multi-site software uses a unified data model where the organization is the top-level entity and locations are subdivisions. The practical difference: in single-site software, you log in to separate accounts to manage separate locations. In multi-site software, you log in once and see all locations. Reporting that crosses location lines (total revenue, total enrollment, combined subsidy claims) only works correctly in multi-site architecture."
  - q: "How does subsidy billing work across multiple childcare locations?"
    a: "Subsidy billing requirements are the same per location regardless of how many locations you operate; each location files its own claims with your state agency under its own license number. Multi-site software should allow you to manage all these claims from a single interface, with attendance documentation organized by location. The key capability to verify: can the software produce a separate, properly formatted subsidy claim for each location while allowing you to track the combined status of all claims from a single dashboard?"
  - q: "What reporting does a multi-site operator need from childcare software?"
    a: "Four categories of reporting matter at the organization level: (1) consolidated enrollment; total children enrolled across all locations, broken down by location and age group; (2) consolidated revenue; billing and collections by location and in aggregate; (3) consolidated compliance; ratio status, licensing renewal dates, and staff certification status across all locations; (4) subsidy claim status; claim submissions, approvals, and pending amounts by location. Any report that requires manually combining exports from separate systems adds overhead that grows with each location you add."
relatedPages:
  - "/resources/guides/childcare-software-implementation-guide"
  - "/resources/guides/childcare-software-roi-calculator-guide"
  - "/resources/guides/childcare-subsidy-software-buying-guide"
---

## Where single-site software breaks down

Many multi-site childcare operators start with one location using single-site software, and then open a second location, and a third, still using separate software instances for each. By the time they're operating four or five locations, they're spending hours every week manually consolidating data from separate systems to answer basic management questions.

The failure mode is predictable: single-site software stores each location's data in isolation. There's no shared database, no organization-level reporting, and no way to view staffing, enrollment, or compliance status across locations simultaneously without logging into each system separately and combining the results yourself.

For a director managing two locations, this is inconvenient but manageable. For an operator managing five or ten locations, it's a genuine operational bottleneck, and a compliance risk, because compliance status for locations you're not currently logged into is effectively invisible.

## The architecture question: unified vs. aggregated

The most important technical question when evaluating multi-site childcare software isn't about features; it's about data architecture.

**Unified architecture** means a single database where the organization is the top-level entity. All locations share one data model. Child records, staff records, billing, and attendance are all location-scoped within one system. Reporting that crosses locations is native; the system was designed for it.

**Aggregated architecture** means separate databases for each location that are rolled up into a consolidated view. The underlying data is still siloed; the multi-site capability is a layer on top. This is common in vendors who started as single-site products and added multi-site features later. It often works for basic reporting but breaks down for operations that require real-time cross-location visibility.

To distinguish between these during evaluation, ask the vendor: "If a staff member is cross-trained and works at two locations, do they have a single staff record that links to both locations, or do they have separate records in each location's account?" Unified architecture has one record. Aggregated architecture has two.

## What to evaluate in a multi-site demo

**Unified enrollment management.** Can you view a waitlist and enrollment status for all locations simultaneously? Can you transfer a child from one location to another without re-entering their information? Can you see total organization-wide enrollment in a single report?

**Cross-site ratio reporting.** Directors overseeing multiple locations need to see ratio compliance status across all rooms, all locations, in real time. If monitoring compliance requires logging into each location separately, that's not functional multi-site software; that's multiple single-site instances.

**Consolidated subsidy billing.** Subsidy claims are filed per location, but claim management should be visible in aggregate. You need to know which location has a claim pending, which has been approved, which has an outstanding documentation request, and what the total reimbursement expected across all locations is without assembling that picture from separate dashboards.

**Staff access scoping.** A staff member at Location A should not have access to Location B's records unless they're explicitly granted that access. At the same time, an organization-level administrator should have full visibility across all locations. Verify that the permission model supports this granularity; it's a sign of genuine multi-site architecture rather than multi-account workarounds.

**Location-level vs. organization-level reports.** Run both during the demo. A location-level report should show one location's data, an organization-level report should aggregate across all. If the vendor produces the organization-level report by asking you to combine CSVs, that's your answer.

## Pricing models to expect

Multi-site childcare software vendors typically price using one of three models:

**Per-child pricing across all locations.** One rate per enrolled child, regardless of which location they're in. This is straightforward and scales predictably, but can get expensive at high enrollment. Verify whether the rate changes at different enrollment tiers.

**Per-location pricing.** A flat fee per location per month. Predictable regardless of enrollment, but expensive for locations with very few children. Often the right model for operators with large, fully enrolled locations.

**Enterprise flat fee.** A negotiated annual contract for your full organization, regardless of location count or enrollment. Available from most vendors at scale (typically 5+ locations). Requires more negotiation but often the best value for established multi-site operators.

Ask about volume discounts explicitly. Most vendors offer them but don't advertise them. If you have four or more locations, you have meaningful negotiating leverage on price; especially if you're considering consolidating from multiple single-site subscriptions.

## Questions to ask multi-site vendors

These questions distinguish genuinely capable multi-site software from single-site products with multi-account packaging:

1. Can I see enrollment, revenue, and compliance status for all locations in a single dashboard without logging in and out?
2. If a staff member works at two locations, do they have one login that accesses both?
3. Can I generate a subsidy attendance report for each location separately from the same interface?
4. If I add a third location in 18 months, what is the process and what is the pricing?
5. Can I set different billing rates at different locations for the same age group?
6. What does your largest multi-site customer look like; how many locations, how many enrolled children?
7. Are organization-level reports generated in real time or as scheduled exports?

The answers reveal whether you're talking to a vendor whose product was built for multi-site from the ground up, or one who adapted a single-site product to accommodate operators who needed something it wasn't designed for.
