---
title: "Brightwheel Alternative for Subsidy-Heavy Centers"
description: "Brightwheel subsidy reports are not formatted for state submission. PebbleDesk handles CCDF reconciliation and co-pay billing with published pricing."
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
publicKnowledge: true
buyerStage: "bofu"
targetPersona:
  - "center-director"
  - "owner-operator"
schema: "Article"
bluf: "Brightwheel works well for private-pay centers. For centers where 30% or more of enrollment is state-subsidy-funded, the manual reconciliation work piles up fast. Brightwheel's subsidy billing reports are not formatted for state agency submission, co-pay calculations require manual tracking, and there is no attendance-to-billing link that automates the claim process for CCDF and DHS voucher families. PebbleDesk is built for mixed private-pay and subsidy billing from a single system. Current PebbleDesk pricing is listed on the pricing page."
competitor:
  name: "Brightwheel"
  slug: "brightwheel-subsidy-centers"
  pricing: "Written quote required"
  weakness: "Subsidy billing reports not formatted for state agency submission; co-pay billing requires manual calculation; no automated attendance-to-billing link for subsidy children"
faqs:
  - q: "How does Brightwheel handle CCDF subsidy billing?"
    a: "Brightwheel allows you to tag families as subsidy-funded and track co-pay amounts. The billing reports you can export are formatted for internal records, not state agency submission. Directors submitting attendance-based claims to state CCDF agencies report that the Brightwheel export does not match the column format their state requires. Most subsidy-heavy centers end up exporting Brightwheel data and reformatting it in a spreadsheet before submission every billing cycle."
  - q: "Why do subsidy-heavy centers look for Brightwheel alternatives?"
    a: "The manual reconciliation burden is the primary driver. A center where 40% of families are CCDF-funded processes subsidy billing every two to four weeks. If each billing cycle requires an hour or two of manual data reformatting, that adds up to 25-50 hours per year on a single administrative task. Directors who have been through that cycle look for a system where the attendance records link directly to subsidy billing and the export is already formatted for their state."
  - q: "What documentation does subsidy billing require that Brightwheel doesn't produce?"
    a: "State CCDF agencies typically require: attendance records for each subsidy child showing present/absent for each authorized day in the billing period, the authorized care level for each child (full-time, part-time), the co-pay amount collected for the billing period, and sometimes the provider's electronic signature on the claim. Brightwheel can produce attendance records but does not generate the claim document in the format state agencies expect, and it does not link the attendance data to the billing claim automatically."
  - q: "Can PebbleDesk handle both private-pay and subsidy in one system?"
    a: "Yes. PebbleDesk tracks private-pay tuition billing and state subsidy billing in a single system. For subsidy families, the attendance record links to the billing period automatically, co-pay amounts are tracked per family, and the export is formatted for state CCDF submission. Private-pay families receive standard invoices through the same system. Directors do not need to manage billing in two different tools or reconcile between them."
relatedPages:
  - "/resources/guides/childcare-subsidy-software-buying-guide"
  - "/resources/guides/cacfp-food-program-compliance-guide"
  - "/compare/alternatives/brightwheel"
  - "/features/subsidy-billing"
proscons:
  - subject: "Brightwheel"
    pros:
      - "Solid private-pay billing: invoicing, autopay, and payment tracking work well"
      - "Parent communication is the best in the category"
      - "Digital enrollment and document collection simplify intake for all families"
      - "Tagging subsidy families and tracking co-pay amounts is possible"
    cons:
      - "Subsidy billing reports not formatted for state CCDF agency submission"
      - "Attendance records and billing claims are not linked; reconciliation is manual"
      - "Co-pay calculation requires manual tracking or spreadsheet work"
      - "No attendance-to-billing automation for subsidy billing cycles"
      - "Pricing scales with enrollment, making it expensive as subsidy enrollment grows"
      - "Directors report hours of manual reformatting per billing cycle"
---

## The subsidy billing gap in Brightwheel

Brightwheel handles private-pay billing well. Tuition invoicing, autopay enrollment, and payment tracking work reliably. For a center where most families pay privately, Brightwheel's billing module is sufficient.

The gap appears when state-voucher-funded families represent a significant share of enrollment. CCDF, DHS vouchers, and state Pre-K funding all come with billing requirements that are different from private tuition: attendance-based claims, authorized care level documentation, co-pay tracking, and submission to a state agency on a defined billing cycle.

Brightwheel was not built to produce those claim documents. The platform stores the underlying data, but turning that data into what a state CCDF office will accept requires manual work outside the system.

## What the manual workaround actually looks like

Directors at subsidy-heavy centers who use Brightwheel describe the same recurring process:

1. Export attendance data from Brightwheel at the end of the billing period
2. Open a spreadsheet and reformat the columns to match the state agency's required layout
3. Manually calculate co-pay amounts for each subsidy family
4. Enter the reformatted data into the state's subsidy billing portal
5. Save the spreadsheet as documentation for audit purposes

For a center with 20 CCDF-funded families billing every two weeks, that process runs 26 times per year. Directors who have measured it report it taking 1-2 hours per cycle.

## What automated subsidy billing looks like

PebbleDesk links attendance records to billing claims automatically. When a subsidy child is marked present or absent, that attendance record is part of the billing period record. At the end of the billing cycle, the director generates a claim report that is pre-formatted for state CCDF submission: the column layout, date formatting, and data fields match what the state agency expects.

Co-pay tracking is built in. Each subsidy family's co-pay amount is stored in PebbleDesk, deducted from the family invoice, and documented in the billing record.

Private-pay and subsidy billing coexist in a single system. Directors do not manage two billing platforms or reconcile between them.

## The compliance documentation connection

Subsidy billing audits and licensing audits both rely on the same attendance records. When a state CCDF agency audits a billing claim, they want to see the attendance documentation that supports each day billed. When a licensing inspector visits, they want the same attendance records.

In Brightwheel, the attendance records exist but the documentation trail requires manual assembly for both purposes. In PebbleDesk, the same attendance record supports both the subsidy billing claim and the licensing audit export.

## Feature comparison

| Feature | Brightwheel | PebbleDesk |
|---|---|---|
| CCDF billing claim generation | No; manual reformatting | Formatted for state submission |
| Attendance-to-billing link | No; manual | Automatic |
| Co-pay billing | Manual tracking | Tracked per family |
| Private-pay billing | Yes | Yes |
| Mixed billing in one system | Partial | Yes |
| Real-time ratio alerts | No | Yes |
| Audit documentation | Manual assembly | Formatted for inspectors |
| Pricing | Written quote required | {{plan.center_starter.priceLabel}} Center Starter; {{plan.center_pro.priceLabel}} Center Pro |

## Pricing

A center with 60 enrolled children, 20 of whom are CCDF-funded, needs a current written Brightwheel quote before budgeting subscription cost. PebbleDesk Center Starter is {{plan.center_starter.priceLabel}} for licensed single-site centers. The billing and compliance functionality needed for subsidy-heavy operations is included at that price, not gated behind a higher tier.
