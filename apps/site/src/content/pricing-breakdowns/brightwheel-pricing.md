---
title: "Brightwheel Pricing (2026): Quote Model & Fees"
description: "Brightwheel pricing is quote-based. Review payment processing fees, contract questions, and comparison points for licensed childcare programs."
publishedAt: "2026-03-20"
updatedAt: "2026-04-16"
publicKnowledge: true
buyerStage: "mofu"
targetPersona:
  - "center-director"
  - "in-home-daycare-operator"
  - "multi-site-operator"
schema: "Article"
bluf: "Brightwheel pricing is not public, so most directors only see the real monthly cost after a sales call. Online payment service fees are program-specific and should be confirmed in writing. PebbleDesk starts at {{plan.home.priceLabel}} for Home, {{plan.center_starter.priceLabel}} for Center Starter, and {{plan.center_pro.priceLabel}} for Center Pro."
competitor:
  name: "Brightwheel"
  slug: "brightwheel"
  pricing: "Not publicly listed; quote required"
tiers:
  - name: "Small Program"
    price: "Quote required"
    features:
      - "Digital check-in/check-out"
      - "Parent messaging"
      - "Photo sharing"
      - "Daily activity feed"
  - name: "Mid-Size Center"
    price: "Quote required"
    features:
      - "Everything in small"
      - "Invoicing and billing"
      - "Staff management"
      - "Enrollment management"
  - name: "Large Center"
    price: "Quote required"
    features:
      - "Everything in mid-size"
      - "Multi-room management"
      - "Reporting"
      - "Custom branding"
hiddenCosts:
  - "Payment processing: program-specific service fees should be confirmed in the written quote"
  - "Auto-renewal is the default: cancellation requires advance notice or the next period bills automatically"
  - "No publicly listed prices: you must contact sales to get a quote, which gives them pricing leverage"
  - "Subsidy reconciliation tools are limited: manual workarounds required for CCDF billing"
  - "Audit trail features are basic: compliance documentation requires manual exports"
faqs:
  - q: "Why doesn't Brightwheel publish its prices?"
    a: "Brightwheel uses a sales-led pricing model. They require you to contact them for a quote, which lets them price based on your program size and willingness to pay. This is common with software targeting regulated industries: it also makes comparison shopping harder. Expect a sales call before seeing a number."
  - q: "How much does Brightwheel cost per child?"
    a: "Brightwheel does not confirm its subscription pricing structure publicly. Ask sales for a written quote at your current enrollment and at expected growth levels, then separate the subscription cost from payment processing fees."
  - q: "Does Brightwheel charge payment processing fees on top of the subscription?"
    a: "Yes. If you collect tuition through Brightwheel, online payment service fees apply separately from the monthly subscription and are specific to the program. As a benchmark, standard online card math at 2.9% plus $0.30 would be about $589 across 30 monthly transactions on $20,000 in tuition."
  - q: "Is Brightwheel good for subsidy billing?"
    a: "Brightwheel is built primarily for parent engagement: photos, messaging, daily reports. Subsidy reconciliation and state voucher tracking are not its core strength. Directors managing CCDF billing or DHS vouchers typically need manual workarounds or separate tracking tools alongside Brightwheel."
  - q: "How does Brightwheel compare to PebbleDesk on compliance?"
    a: "Brightwheel prioritizes parent-facing features. PebbleDesk is built around the compliance needs directors face during licensing audits: ratio tracking, subsidy reconciliation, and exportable audit trails. If your main pain is audit readiness rather than parent communication, the tools are built for different jobs."
tableData:
  name: "Brightwheel Pricing Questions by Enrollment Size"
  description: "Brightwheel does not publish official subscription pricing, so directors should request written quotes at multiple enrollment levels"
  columns: ["Enrollment Size", "Subscription Quote", "Growth Question", "Processing Fees (on $10K tuition)"]
  rows:
    - ["~10 children (small/home)", "Ask sales", "What happens at 15 children?", "~$290/mo"]
    - ["~30 children (mid-size)", "Ask sales", "What happens at 50 children?", "~$290/mo"]
    - ["~50 children", "Ask sales", "What happens at 75 children?", "~$290/mo"]
    - ["~200+ children (large)", "Ask sales", "What happens at 250 children?", "~$290/mo"]
    - ["PebbleDesk Center Starter", "{{plan.center_starter.priceLabel}}", "Published plan limit", "Separate processor"]
pricingStats:
  - stat: "Brightwheel uses sales-led subscription pricing; centers must request a quote for current plan costs"
    source: "Brightwheel public pricing page"
    sourceUrl: "https://mybrightwheel.com/pricing"
  - stat: "Brightwheel says online payments can use credit/debit card, FSA, or direct bank transfer, each with a service fee specific to the program"
    source: "Brightwheel help center: how payments in brightwheel work"
    sourceUrl: "https://help.mybrightwheel.com/en/articles/5599079-how-payments-in-brightwheel-work"
  - stat: "For a center collecting $15,000/month in tuition, a 2.9% plus $0.30 card benchmark across 30 monthly transactions is approximately $444/month"
    source: "Calculated from Stripe standard online card pricing: 2.9% + $0.30 per transaction"
    sourceUrl: "https://stripe.com/us/pricing"
answers:
  - question: "Why doesn't Brightwheel publish its prices?"
    answer: "Brightwheel uses a sales-led pricing model. They require you to contact them for a quote, which lets them price based on your program size and willingness to pay. This is common with software targeting regulated industries: it also makes comparison shopping harder. Expect a sales call before seeing a number."
  - question: "How much do Brightwheel payment processing fees cost per month?"
    answer: "A center collecting $15,000 per month in tuition should confirm Brightwheel's program-specific payment service fees before budgeting. As a benchmark, standard online card math at 2.9% plus $0.30 across 30 monthly transactions is about $444 before the subscription."
  - question: "Is Brightwheel good for subsidy billing?"
    answer: "Brightwheel is built primarily for parent engagement: photos, messaging, daily reports. Subsidy reconciliation and state voucher tracking are not its core strength. Directors managing CCDF billing or DHS vouchers typically need manual workarounds or separate tracking tools alongside Brightwheel."
relatedPages:
  - "/compare/alternatives/brightwheel"
  - "/compare/versus/brightwheel-vs-procare"
  - "/compare/pricing/procare"
  - "/resources/guides/how-to-choose-childcare-management-software"
---

## What Brightwheel actually costs

Brightwheel does not publish its pricing. You have to contact their sales team for a quote. That opacity is worth noting before you book a demo because it makes budget comparison harder.

Ask for the quote in writing at your current enrollment and at the next two likely enrollment bands. Directors should know whether adding a classroom, moving from 30 to 50 children, or opening a second location changes the subscription tier.

### Payment processing on top

One cost area directors should confirm is payment processing. Brightwheel says online payment service fees are specific to each program.

For benchmark planning only, a standard online card rate of 2.9% plus $0.30 across 30 monthly transactions adds about $444/month on $15,000 in tuition. At $30,000/month, the same benchmark is about $879. Those numbers change how any per-transaction payment model compares to alternatives with flat-rate subscription pricing.

### Auto-renewal

Brightwheel defaults to auto-renewal. Cancellation requires advance notice before the renewal date or you're billed for another period. Clarify the notice window before signing.

### What Brightwheel is built for

Brightwheel was built around parent engagement: photo feeds, daily activity reports, messaging. Those features are polished.

The compliance side is where directors report friction. Brightwheel's reports are designed to share with parents, not licensing officers. Getting the documentation a state auditor needs typically requires manual exports and reformatting outside the platform. Subsidy billing reconciliation and CCDF workflows are not core to the product.

### Cost comparison for a 30-child center

| Platform | Monthly Base | Per-Child | Processing (on $10K tuition) | Estimated Total |
|----------|-------------|-----------|-------------------------------|-----------------|
| Brightwheel | Quote required | Ask sales | Program-specific | Quote + processing |
| PebbleDesk Center Starter | {{plan.center_starter.priceLabel}} | Included in plan | Separate processor | {{plan.center_starter.priceLabel}} + processing |

PebbleDesk Center Starter runs {{plan.center_starter.priceLabel}} for licensed single-site centers before any qualifying integrations or rollout support are discussed. The gap widens as enrollment grows.

Brightwheel fits private-pay programs where parent communication is the priority and budget isn't tight. If you're managing subsidy billing or preparing for state licensing audits, check whether the compliance tools match your requirements before committing.
