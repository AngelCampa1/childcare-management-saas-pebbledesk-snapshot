---
title: "Cheapest Childcare Software: No Transaction Fees (2026)"
description: "A breakdown of 7 flat-rate childcare platforms with no per-transaction fees. PebbleDesk starts at {{plan.home.priceLabel}}; the rest compared by true cost."
publishedAt: "2026-04-04"
updatedAt: "2026-04-16"
publicKnowledge: true
buyerStage: "mofu"
targetPersona:
  - "center-director"
  - "in-home-daycare-operator"
  - "multi-site-operator"
schema: "ItemList"
bluf: "Brightwheel requires a written quote and says online payment service fees are specific to each program. This list shows which childcare management platforms use flat pricing without per-transaction fees, and what you get for the price."
category: "Childcare Software"
qualifier: "No Per-Transaction Fees"
tools:
  - name: "PebbleDesk"
    summary: "Flat monthly pricing with no per-transaction fees. Home tier covers in-home daycares; Center tier covers licensed programs {{plan.center_starter.capacityLabel}}."
    pros:
      - "Home: {{plan.home.priceLabel}}; no per-child fees, no processing percentage"
      - "Center: {{plan.center_starter.priceLabel}}; full subsidy reconciliation and audit reports included"
      - "Enterprise: custom pricing for multi-site operators and Head Start grantees"
      - "Month-to-month; no annual contract required to access flat pricing"
    cons:
      - "New product, not all state-specific subsidy submission formats supported at launch"
      - "Smaller user community than legacy platforms"
    pricing: "Home {{plan.home.priceLabel}}, Center Starter {{plan.center_starter.priceLabel}}, custom multi-site rollout"
    verdict: "Best flat-rate option for licensed programs under 75 children. At {{plan.center_starter.priceLabel}} with no transaction fees, Center tier becomes easier to budget once monthly credit card collections reach a few thousand dollars."
  - name: "LifeCubby"
    summary: "Flat monthly pricing tiered by enrollment. No per-transaction fees documented."
    pros:
      - "Flat pricing from $30/month (small programs) to $350/month (larger centers)"
      - "Billing and attendance in the same platform"
      - "No per-child or per-transaction fees on top of subscription"
    cons:
      - "Upper tiers ($200-350/month) are expensive relative to alternatives for large programs"
      - "CCDF subsidy reconciliation tools are less developed than Procare or Kangarootime"
      - "Smaller company with a shorter track record"
    pricing: "$30-350/month flat by enrollment"
    verdict: "Solid flat-rate option for programs under 50 children. The $30-80/month range is competitive; pricing becomes less attractive for larger centers."
  - name: "Procare"
    summary: "Flat tiered subscription. No per-transaction fees on the base product. Processing fees depend on how you configure payment collection."
    pros:
      - "Subscription-based pricing; no per-child fees for base modules"
      - "Deepest subsidy billing and CCDF reconciliation of any established platform"
      - "Broad state subsidy agency familiarity"
    cons:
      - "Parent communication app may require a separate paid add-on"
      - "Total cost for most centers requires current written terms"
      - "Interface design requires more staff training than modern platforms"
      - "Enterprise ownership (Roper Technologies) means pricing tends to increase over time"
    pricing: "Written quote required by modules"
    verdict: "Flat pricing but quote-dependent total cost. Directors should compare the current written quote against Brightwheel's program-specific payment service fees at their actual monthly tuition volume."
  - name: "Famly"
    summary: "Processing included in subscription. No separate transaction percentage."
    pros:
      - "Payment processing included in the subscription cost; no separate processing percentage"
      - "Modern interface, faster to onboard staff"
      - "Strong parent communication alongside billing tools"
    cons:
      - "Pricing requires a demo call, not published"
      - "Less US state-specific subsidy compliance depth than Procare or PebbleDesk"
      - "Smaller US market presence"
    pricing: "Not published (processing included in subscription)"
    verdict: "Worth evaluating if you want processing included in subscription without the percentage fee structure. Confirm subsidy billing capabilities for your state before committing."
  - name: "Brightwheel"
    summary: "Quote-based platform with program-specific online payment service fees."
    pros:
      - "Large installed base; many families already familiar with the platform"
      - "Strong parent communication and daily reporting"
      - "Enrollment and general billing work well"
    cons:
      - "Online payment service fees are program-specific and should be confirmed in the quote"
      - "Brightwheel's check-deposit help says the ACH fee is 0.6% for the majority of programs"
      - "High online tuition volume can make separate processing fees a meaningful budget line"
      - "Subscription pricing is not published; adds to total cost"
      - "CCDF subsidy reconciliation requires manual work outside the platform"
    pricing: "Subscription not published; payment service fees are program-specific"
    verdict: "Cost-effective only when the written quote and payment service terms fit your volume. At higher tuition collection levels, flat-rate alternatives may be cheaper."
  - name: "Sawyer"
    summary: "Per-transaction fee platform with compounding rates. Charges its own fee on top of Stripe's processing fee."
    pros:
      - "Free plan available for programs with very low volume"
      - "Activity enrollment and class management tools"
    cons:
      - "Free plan charges 3% per transaction on top of Stripe's 2.9%+$0.30; approximately 6% total per transaction"
      - "Paid plans reduce the Sawyer portion but Stripe fees still apply"
      - "Designed more for activity-based businesses than full childcare center management"
      - "Not built for CCDF subsidy reconciliation or ratio tracking"
    pricing: "Free plan: ~6% per transaction; paid plans: Stripe rate + reduced Sawyer %; subscription not published"
    verdict: "Only cost-effective at extremely low transaction volumes. The compounding fee structure becomes the most expensive option once monthly tuition exceeds a few thousand dollars."
  - name: "Playground"
    summary: "Pricing not published. CACFP automation is the strongest feature. Per-transaction fee status unclear."
    pros:
      - "CACFP meal count automation is a notable strength"
      - "Clean modern interface"
      - "Good enrollment management tools"
    cons:
      - "Pricing not publicly available; requires a sales call"
      - "Per-transaction fee structure not publicly documented"
      - "CCDF subsidy reconciliation tools are underdeveloped"
    pricing: "Not published"
    verdict: "Can't be reliably placed in the flat-rate or per-transaction category without a sales call. If CACFP automation is your primary need, worth evaluating; ask about processing fees explicitly."
pricingStats:
  - stat: "Brightwheel says online payments can use credit/debit card, FSA, or direct bank transfer, each with a service fee specific to the program"
    source: "Brightwheel help center: how payments in brightwheel work"
    sourceUrl: "https://help.mybrightwheel.com/en/articles/5599079-how-payments-in-brightwheel-work"
  - stat: "Sawyer's free plan charges 3% per transaction plus Stripe's 2.9%+$0.30, totaling nearly 6% per transaction"
    source: "Sawyer published pricing"
    sourceUrl: "https://www.hisawyer.com/for-business/pricing"
faqs:
  - q: "Why do some childcare platforms charge per-transaction fees?"
    a: "Payment processing costs money; Stripe, Square, and other processors charge a percentage plus a flat fee per transaction. Some platforms absorb this cost into their subscription pricing. Others pass it through to the provider, sometimes with their own markup on top. The distinction matters: a platform charging $0/month for the software but 3% per transaction is not free once you run actual billing through it."
  - q: "Is flat-rate pricing always cheaper than per-transaction?"
    a: "No. At very low volume, per-transaction fees can be cheaper because you only pay when you collect money. The crossover point depends on the rate, payment mix, and your monthly tuition volume. Directors should calculate the crossover from the current plan price and payment mix before budgeting."
  - q: "What is ACH processing and does it reduce fees compared to credit cards?"
    a: "ACH (Automated Clearing House) is a bank-to-bank transfer that bypasses credit card networks. Most processors charge lower fees for ACH than credit cards. Brightwheel says online payment service fees are specific to each program, and its check-deposit help says the ACH fee is 0.6% for the majority of programs with a $0.25 minimum and $2 maximum. Flat-rate platforms eliminate this variable entirely."
  - q: "Do childcare centers have to pay Stripe fees separately if they use those platforms?"
    a: "It depends on the platform's arrangement with the processor. Some platforms (like Brightwheel) pass through Stripe or similar processor fees directly with a markup. Others bundle processing into the subscription; you pay the subscription, the platform absorbs the Stripe fees. When evaluating pricing, ask specifically: 'What is the total cost including payment processing at our monthly tuition volume?' The subscription price alone is not the full picture for per-transaction platforms."
answers:
  - question: "Which childcare software has no per-transaction fees?"
    answer: "Flat-rate platforms with no per-transaction fees include PebbleDesk (see {{plan.center_starter.priceLabel}}), LifeCubby ($30-350/month flat by enrollment), Procare (written quote required by modules), and Famly (processing included in subscription, price requires sales call). Brightwheel and Sawyer can add separate payment service fees that compound with tuition volume."
  - question: "How much do Brightwheel payment service fees cost per year?"
    answer: "Brightwheel payment service fees are program-specific, so directors should confirm card and bank-transfer terms in writing before budgeting. Flat-rate platforms cost the same regardless of tuition volume."
tableData:
  name: "Childcare Software Cost Comparison at Different Tuition Volumes"
  description: "Monthly total cost (subscription + processing fees) at $8K, $15K, and $22K monthly tuition; credit card payments assumed"
  columns: ["Platform", "Fee Model", "$8K/mo Tuition", "$15K/mo Tuition", "$22K/mo Tuition"]
  rows:
    - ["PebbleDesk (Center)", "Flat {{plan.center_starter.priceLabel}}", "{{plan.center_starter.priceLabel}}", "{{plan.center_starter.priceLabel}}", "{{plan.center_starter.priceLabel}}"]
    - ["LifeCubby", "Flat $30-350/mo", "~$60", "~$150", "~$250"]
    - ["Procare", "Written quote required", "Quote required", "Quote required", "Quote required"]
    - ["Brightwheel", "Program-specific", "Confirm quote", "Confirm quote", "Confirm quote"]
    - ["Sawyer (free plan)", "~6%/transaction", "~$480", "~$900", "~$1,320"]
relatedPages:
  - "/compare/pricing/brightwheel"
  - "/compare/pricing/brightwheel-hidden-costs"
  - "/compare/pricing/sawyer"
  - "/free/childcare-software-pricing-comparison"
  - "/resources/best/best-childcare-billing-software"
  - "/compare/alternatives/brightwheel"
  - "/resources/guides/childcare-licensing-audit-prep-guide"
---

## The hidden cost of per-transaction pricing

Childcare software pricing looks straightforward until you factor in payment processing. A platform advertised as low-cost or free can become one of your larger operating expenses once you run actual billing through it.

The math is simple: separate payment service fees compound directly with your tuition revenue. Brightwheel says those fees are specific to each program, so directors should confirm the card and bank-transfer terms in writing. Every time you raise tuition to keep up with operating costs, a percentage-based processing fee goes up proportionally.

Flat-rate platforms charge the same amount regardless of whether you collect $8,000 or $22,000 in tuition. The difference becomes material quickly.

### The crossover point

Per-transaction fees are not always the wrong choice. At very low tuition volumes, a flat {{plan.center_starter.priceLabel}} subscription can be more expensive than a low-volume processing model. The per-transaction model is cheaper for programs with minimal billing volume.

The crossover depends on the specific rates, payment mix, and current plan price. For any program-specific processing model versus PebbleDesk Center Starter at {{plan.center_starter.priceLabel}}, flat-rate pricing is cheaper once payment volume is high enough for processing fees to exceed the subscription. Directors should calculate that crossover from current terms before budgeting.

### ACH as a partial workaround

Some centers encourage or require families to pay via ACH bank transfer instead of credit card. Brightwheel says payment service fees are program-specific, and its check-deposit help says the ACH fee is 0.6% for the majority of programs with a $0.25 minimum and $2 maximum.

The limitations of this approach: not all families are willing to authorize bank account access, ACH payments can fail and require follow-up, and percentage-based ACH fees still scale with tuition volume. ACH reduces the problem; it doesn't eliminate it. Flat-rate platforms don't require families to choose a payment method based on the center's fee structure.

### What the comparison in this list measures

This list divides platforms into three groups: flat-rate with no processing fees, processing included in subscription (where the vendor absorbs the processor cost), and per-transaction fee platforms.

The cost comparison table at the bottom of this article uses $8,000/month, $15,000/month, and $22,000/month in tuition as reference points. These represent a small-to-midsize home daycare, a midsize licensed center, and a larger licensed center respectively. All calculations assume credit card payments; the highest-cost scenario for per-transaction platforms. ACH-only scenarios would lower the per-transaction costs but not eliminate them.

### What the table doesn't cover

The table shows direct cost. It doesn't capture features, compliance capability, or support quality. A platform that is cheaper but lacks CCDF subsidy reconciliation tools will have real operational costs for programs that need those features; staff time, reconciliation errors, and audit risk. Cost should be the tiebreaker between otherwise comparable platforms, not the primary selection criterion.

If you're comparing PebbleDesk Center Starter at {{plan.center_starter.priceLabel}} against Procare, use Procare's current written quote rather than a public estimate. Where flat-rate pricing matters most is in the comparison against Brightwheel and Sawyer, where separate payment fee structures can make the all-in cost materially higher for many licensed centers.
