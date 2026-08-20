---
title: "Sawyer Pricing in 2026"
description: "Estimated Sawyer pricing and what the cost model looks like for licensed childcare centers."
publishedAt: "2026-04-04"
updatedAt: "2026-04-16"
publicKnowledge: true
buyerStage: "mofu"
targetPersona:
  - "center-director"
  - "in-home-daycare-operator"
schema: "Article"
bluf: "Sawyer is built for enrichment programs; camps, arts classes, after-school activities, not licensed childcare centers. Its free plan costs 3% per transaction in platform fees, plus standard card processing of 2.9% + $0.30, pushing combined fees close to 6% per transaction. The $189/month plan eliminates Sawyer's 3% fee and is often cheaper in total for programs with consistent monthly volume. DaySmart acquired Sawyer in November 2023. If you run a licensed childcare center with CCDF obligations, Sawyer is out of scope."
competitor:
  name: "Sawyer"
  slug: "sawyer"
  pricing: "Free (3% fee), $189/mo, $379/mo, Enterprise"
tiers:
  - name: "Free Plan"
    price: "$0/month + 3% per transaction"
    features:
      - "Class and camp registration"
      - "Basic parent messaging"
      - "Attendance tracking"
      - "Online payments (3% Sawyer fee + 2.9% + $0.30 card processing)"
  - name: "Growth Plan"
    price: "$189/month"
    features:
      - "All free features"
      - "No Sawyer transaction fee (card processing only: 2.9% + $0.30)"
      - "Advanced reporting"
      - "Priority support"
  - name: "Premium Plan"
    price: "$379/month"
    features:
      - "All Growth features"
      - "Multi-location support"
      - "Custom branding"
      - "API access"
  - name: "Enterprise"
    price: "Custom"
    features:
      - "Volume pricing"
      - "Dedicated account management"
      - "Custom integrations"
hiddenCosts:
  - "Free plan stacks Sawyer's 3% fee on top of card processing: combined rate approaches 6% per transaction"
  - "Built for enrichment programs: no CCDF billing, ratio tracking, or state licensing audit documentation"
  - "DaySmart acquisition (Nov 2023): roadmap decisions now reflect acquirer priorities"
  - "No offline mode: requires internet connectivity for all operations"
faqs:
  - q: "What does Sawyer's free plan actually cost in total fees?"
    a: "Sawyer's free plan charges 3% per transaction as a platform fee, plus the standard Stripe card processing rate of 2.9% plus $0.30 per transaction. Combined, a $200 class registration costs approximately $11.90 in fees (3% + 2.9% + $0.30). A program collecting $8,000/month in registrations on the free plan pays roughly $472 in combined fees per month. At that volume, the $189/month Growth plan (which eliminates Sawyer's 3% fee) typically costs less in total."
  - q: "Is Sawyer worth $189/month compared to the free plan?"
    a: "For programs collecting more than roughly $6,300/month in registration fees, yes. At $6,300/month, Sawyer's 3% fee equals $189, the same as the Growth plan's monthly subscription. Above that revenue level, the Growth plan eliminates the per-transaction cost and comes out ahead. Below that level, the free plan's fee-based model may be cheaper despite the higher per-transaction rate."
  - q: "Is Sawyer right for licensed childcare centers?"
    a: "No. Sawyer is designed for enrichment programs: arts classes, music studios, camps, and after-school activities that sell sessions and class registrations. It does not support CCDF billing, staff-to-child ratio tracking, or state licensing audit documentation. Licensed childcare centers that hold state licenses and bill subsidy agencies need different software."
  - q: "What changed when DaySmart acquired Sawyer?"
    a: "DaySmart, a software company that serves fitness studios, salons, and pet services businesses, acquired Sawyer in November 2023. The acquisition positions Sawyer within a broader portfolio of class and appointment-based service businesses. For Sawyer users, this means product development decisions now reflect DaySmart's portfolio strategy. The enrichment program focus is unlikely to change, but compliance features for licensed childcare are even less likely to appear on the roadmap."
tableData:
  name: "Sawyer Plan Cost Comparison by Monthly Revenue"
  description: "True cost of Sawyer free vs. paid plans at different monthly revenue levels"
  columns: ["Monthly revenue", "Free plan total cost", "Growth ($189/mo) total cost", "Break-even point"]
  rows:
    - ["$2,000/mo", "~$118 in fees", "$189/mo sub + $58 processing", "Free plan cheaper"]
    - ["$4,000/mo", "~$236 in fees", "$189/mo sub + $116 processing", "Near break-even"]
    - ["$6,300/mo", "~$372 in fees", "$189/mo sub + $183 processing", "Break-even"]
    - ["$10,000/mo", "~$592 in fees", "$189/mo sub + $290 processing", "Growth plan cheaper"]
    - ["$20,000/mo", "~$1,180 in fees", "$189/mo sub + $580 processing", "Growth plan cheaper"]
pricingStats:
  - stat: "Sawyer's free plan combines a 3% platform fee with 2.9% + $0.30 card processing, a program collecting $10,000/month pays approximately $592/month in combined fees on the free plan"
    source: "Calculated from Sawyer published pricing and standard card processing rates"
    sourceUrl: "https://www.hisawyer.com/for-business/pricing"
  - stat: "The Growth plan at $189/month eliminates Sawyer's 3% fee; programs collecting more than ~$6,300/month in registrations pay less in total on the $189 plan than the free plan"
    source: "Calculated from Sawyer published pricing: break-even at $6,300/month in revenue"
    sourceUrl: "https://www.hisawyer.com/for-business/pricing"
answers:
  - question: "At what monthly revenue does Sawyer's $189/month plan save money over the free plan?"
    answer: "At approximately $6,300 per month in collected fees. Below that, the free plan's combined fee rate (approximately 6% total) costs less than the $189/month subscription plus card processing. Above $6,300/month, the Growth plan eliminates Sawyer's 3% fee and comes out ahead. Programs with consistent monthly volume above that threshold should default to the paid plan."
  - question: "Does Sawyer work for a licensed childcare center?"
    answer: "No. Sawyer is designed for enrichment programs and class-based activities, not state-licensed childcare. It doesn't support CCDF billing, ratio tracking, or state licensing audit documentation. A licensed daycare director evaluating Sawyer should look at platforms built for licensed childcare compliance instead."
relatedPages:
  - "/compare/alternatives/brightwheel"
  - "/compare/versus/brightwheel-vs-sawyer"
  - "/compare/pricing/brightwheel"
  - "/compare/pricing/playground"
  - "/resources/guides/how-to-choose-childcare-management-software"
---

## What Sawyer is and who it's for

Sawyer is a registration and payment platform for enrichment programs: music schools, art studios, dance classes, camps, and after-school activities that sell sessions and class registrations. It is not built for state-licensed childcare centers with CCDF billing obligations.

DaySmart acquired Sawyer in November 2023. DaySmart's portfolio includes software for fitness studios, salons, and pet services; all class and appointment-based service businesses. Sawyer fits that portfolio. Licensed childcare compliance does not.

## Plan structure

Sawyer offers a free plan with a 3% per-transaction platform fee, a $189/month Growth plan, a $379/month Premium plan, and custom Enterprise pricing.

**Free plan:** No subscription cost, but Sawyer charges 3% per transaction on top of card processing fees (2.9% + $0.30). For a $200 class registration, that's approximately $11.90 in combined fees. For a program collecting $10,000/month in registrations, total fees run roughly $592/month.

**Growth plan ($189/month):** Eliminates Sawyer's 3% fee. Card processing fees (2.9% + $0.30) still apply. For a $10,000/month program, total fees drop to approximately $479/month ($189 subscription + $290 in processing).

**Premium plan ($379/month):** Adds multi-location support, custom branding, and API access for larger operators.

## When the free plan makes sense

The free plan is cost-effective for programs with monthly revenue under approximately $6,300. At that level, the 3% platform fee costs less than the $189/month subscription would cost when added to processing-only fees. Below that threshold, the free plan's per-transaction model is cheaper. Above it, pay the subscription.

## The break-even math

| Monthly revenue | Free plan total fees | Growth plan total | Verdict |
|---|---|---|---|
| $2,000 | ~$118 | $247 (sub + processing) | Free cheaper |
| $6,300 | ~$372 | $372 (sub + processing) | Break-even |
| $10,000 | ~$592 | $479 (sub + processing) | Growth cheaper |
| $20,000 | ~$1,180 | $769 (sub + processing) | Growth significantly cheaper |

## Why licensed childcare centers should look elsewhere

If you run a state-licensed childcare center that bills CCDF or DHS vouchers, accepts subsidy children, tracks staff-to-child ratios, or faces licensing inspections, Sawyer is not the right platform. Its feature set was built for enrichment programs that operate outside the licensed childcare regulatory environment.

The licensing, ratio documentation, subsidy billing, and audit report requirements that define licensed childcare operations don't appear anywhere in Sawyer's feature set because they're not relevant to the programs Sawyer was designed for.

PebbleDesk publishes flat-rate plans and shows {{plan.center_starter.priceLabel}} on the pricing page, and is built for licensed childcare compliance: ratio tracking, CCDF reconciliation, and audit-ready documentation.
