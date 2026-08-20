---
title: "State-by-State Childcare Subsidy Billing Guide"
description: "Reference on subsidy billing cycles, electronic attendance mandates, co-payment rules, and record retention requirements across all 50 states."
publishedAt: "2026-04-04"
updatedAt: "2026-04-04"
publicKnowledge: true
bluf: "Childcare subsidy billing rules vary by state in ways that matter: payment timing (prospective vs. retroactive), attendance tracking format (paper vs. electronic mandate), co-payment structures, and record retention requirements. This guide covers what directors need to know about their state's specific rules, and what software needs to handle them."
freePreviewSections: 2
answers:
  - question: "Which states require electronic attendance tracking for childcare subsidy programs?"
    answer: "Washington has required electronic attendance since 2018 (KinderConnect system). Virginia mandated it in December 2025. Texas requires the TX3C system with smartphone or tablet options. New Jersey requires swipe cards for providers with 5 or more subsidy children. More states are following this trend."
  - question: "Which states pay childcare subsidy providers prospectively?"
    answer: "Approximately 6-7 states pay childcare subsidy providers prospectively, before or at the start of the care period. These include Hawaii, Kansas, Maryland, North Dakota, South Carolina, Utah, and Wisconsin. All other states pay retroactively, with reimbursements arriving 30 to 60 days after care is delivered."
definitions:
  - term: "Prospective billing"
    definition: "A subsidy payment model in which providers receive reimbursement before or at the start of the care period. About 6-7 US states use this model."
  - term: "Retrospective billing"
    definition: "A subsidy payment model in which providers receive reimbursement after care has been delivered, typically 30 to 60 days later. Most US states use this model."
  - term: "Electronic attendance mandate"
    definition: "A state requirement that childcare subsidy providers track attendance using a state-specified electronic system rather than paper sign-in/sign-out sheets."
relatedPages:
  - "/resources/guides/state-subsidy-payment-timelines"
  - "/resources/guides/subsidy-billing-automation-guide"
  - "/resources/guides/subsidy-reimbursement-tracking-guide"
  - "/childcare-software/washington"
  - "/childcare-software/texas"
bullets:
  - "Prospective vs. retroactive payment states: which 7 states pay before care is delivered and why it matters for cash flow"
  - "Electronic attendance mandate map: Washington, Texas, New Jersey, Virginia requirements and what software must support"
  - "Co-payment rules by model type: deduction states vs. collection states and documentation requirements for each"
  - "Billing cycle and submission deadline guide: monthly vs. biweekly states, portal systems, and missing-window consequences"
  - "Record retention requirements by state (1 to 6 years) and the federal 5-year minimum that overrides shorter state rules"
  - "Top 10 most complex states for subsidy compliance with state-specific warnings for New York, Maryland, California, and Tennessee"
---

## How the CCDF Subsidy Billing System Works

The federal Child Care and Development Fund (CCDF) gives states considerable flexibility in how they administer childcare subsidies. The federal government sets the framework; income eligibility floors, quality rating requirements, priority populations, but each state designs its own billing system, attendance tracking requirements, co-payment rules, and audit processes.

That flexibility is why subsidy billing is so complicated for programs that operate in more than one state or that move between states. It is also why software that works fine in Illinois may be completely unsuited for Washington or New Jersey.

The basic flow is the same everywhere: a family applies for childcare assistance, the state determines eligibility and issues an authorization, the provider delivers care, and the state pays the provider. What differs is how each step is documented, submitted, and verified.

State agencies administer CCDF programs under different names. You will see Child Care Assistance Program (CCAP), Child Care Development Fund, DHS Child Care, CCDF Voucher Program, and others. The names differ; the federal rules underneath are the same. The state rules layered on top are not.

For directors running licensed programs, the practical impact is: you cannot assume that your billing process from your last state will transfer to your current one. The payment timing, the attendance format, the co-payment structure, and the record retention rules may all be different.

## Prospective vs. Retroactive Payment: The Cash Flow Difference

The single biggest structural difference between state subsidy programs is when providers get paid: before care is delivered (prospective) or after (retroactive).

Most states pay retroactively. You deliver care in March, submit your attendance records in early April, and receive payment sometime in April or May depending on your state's processing timeline. The gap between delivering care and receiving payment runs 30 to 60 days in most retroactive states. Some states are slower.

A small group of states; roughly 6-7; pay prospectively. You receive payment at the start of the care period or before care begins, then deliver the care the payment covers. The prospective states include Hawaii, Kansas, Maryland, North Dakota, South Carolina, Utah, and Wisconsin, though the specifics vary and states occasionally change their payment model.

For working capital, the difference is significant. In a retroactive state, a provider with 20 subsidized children may carry $20,000 to $40,000 in outstanding receivables at any given time; money earned but not yet paid. In a prospective state, that same provider has already received payment before delivering the care.

For billing software, the difference affects how you track and reconcile payments. In retroactive states, you need to match incoming payments to prior-period billing claims and identify short-pays and denials. In prospective states, you need to track which payment periods have been received and ensure that attendance records justify the advance payment if the state audits.

The retroactive majority means that cash flow management is a real operational problem for most subsidy providers. Directors who accept a high percentage of subsidized children are effectively extending credit to the state for weeks at a time.

---

## Electronic Attendance Mandates by State

Paper sign-in/sign-out sheets are disappearing in subsidy billing. A growing number of states now require electronic attendance tracking through state-specified systems, and more are moving in this direction.

Washington was an early mover. The state has required electronic attendance since 2018 through the KinderConnect system. Providers in Washington use state-issued devices or their own smartphones and tablets to record electronic check-in and check-out for subsidy children. Paper sign-ins are no longer accepted for subsidy claims.

Texas requires the Texas Child Care Attendance system (TX3C) for subsidy providers. Like Washington, Texas allows providers to use a smartphone or tablet. The system generates electronic attendance records that feed directly into the billing process, reducing manual data entry errors.

New Jersey requires swipe card or key fob attendance tracking for providers who serve five or more subsidy children. The swipe card system is state-issued and tracks arrival and departure times automatically.

Virginia became one of the latest states to mandate electronic attendance, with its requirement taking effect in December 2025. Virginia's system requires electronic sign-in/sign-out for all subsidy children.

For software purposes, electronic attendance mandates have two implications. First, your attendance tracking system must produce records in the format required by the state, not just any digital record, but records compatible with the state's specific reporting or portal requirements. Second, manual or paper-based workarounds are no longer acceptable in mandate states, regardless of provider size or technology comfort level.

States not yet mandating electronic attendance are still moving toward it. Federal CCDF rules have encouraged electronic attendance as a fraud prevention measure, and states receive technical assistance from federal partners to implement it. Directors in currently paper-based states should expect a mandate within the next 3-5 years.

## Co-Payment Rules: Who Pays, Who Collects, Who Documents

Every state CCDF program requires most subsidized families to pay a co-payment, a portion of childcare costs the family is responsible for. But how that co-payment flows varies by state, and the documentation requirements vary with it.

In some states, the state deducts the co-payment from the provider's reimbursement check. The provider bills the full rate, and the state pays only the difference between the rate and the family's co-payment. Illinois uses this model. The provider never touches the co-payment; it is simply subtracted before payment arrives.

In other states, the provider collects the co-payment directly from the family, and the state pays the remaining portion separately. New York falls into this category. The provider is responsible for collecting from the parent and cannot bill the state for the co-payment amount. If a parent fails to pay, the provider absorbs the loss; they cannot rebill the state for uncollected co-payments.

Texas uses a hybrid: the state deducts the co-payment from the contractor payment, similar to Illinois, but providers must still document that they have a co-payment policy in place and disclose it to families.

Documentation requirements follow the same pattern. In deduction states, your billing records need to show the gross amount billed and the net amount received. In collection states, you must maintain records showing co-payment collection from each family; the date, amount, and method of payment. These records are what auditors check when they suspect co-payment waivers (which the state treats as fraud, because waiving a co-payment effectively means the state is paying 100% of cost for a family assessed as able to contribute).

Waiving co-payments for financial hardship is generally prohibited without state approval. If a family cannot afford their co-payment, the correct approach is to contact the state agency and request a reassessment, not to waive the co-pay and continue billing as if the family were current.

## Billing Cycles and Submission Deadlines

Billing cycles vary from weekly to monthly depending on the state, and submission methods vary from electronic portals to paper forms to fax (yes, still).

Most states use monthly billing cycles. Providers submit attendance records and billing claims for the prior month within the first few days of the following month. Processing time varies from one to four weeks, so payment for March care typically arrives in April or May.

Some states use biweekly cycles. Maryland uses a biweekly attendance verification model that requires providers to submit attendance for each two-week period within a short window after the period closes. Missing the submission window delays payment for that period.

Illinois is one of the more unusual systems: the state mails paper certificates to providers for each authorized child, and providers submit the certificates along with attendance records. Electronic submission is available but not universally mandated. Directors new to Illinois from other states are often surprised by the paper-based process.

Most states have moved to electronic provider portals for billing submission. These portals vary significantly in usability. Some; like Washington's ProviderOne system; are reasonably functional. Others are difficult to navigate and lack bulk submission features, requiring providers with many subsidized children to enter attendance records child by child.

Submission deadlines are strictly enforced. Missing the billing window for a period means you typically cannot recover that revenue; the state will not accept late submissions without a formal exception request. Build billing submission into your schedule as a non-negotiable deadline, not a task to get to when time permits.

## Record Retention Requirements

State record retention requirements for subsidy providers range from one year to six years, and federal CCDF audit lookback periods can extend further than state minimums. When state and federal requirements differ, keep records for the longer period.

The shortest state retention requirements cluster around one year: Connecticut, North Carolina, and Oregon each require approximately one year of retention for basic subsidy billing records.

Mid-range requirements (three to four years) are most common. States in this range include California, Texas, Florida, and most Midwest states. Three years covers most state audit cycles and aligns with standard IRS documentation requirements.

The longest requirements are in New York and Minnesota, which require up to six years of retention for subsidy billing records. New York's requirements reflect the state's active subsidy fraud enforcement program and its practice of conducting retrospective audits covering multiple years of billing.

Federal CCDF rules require states to maintain records for five years and to pass equivalent requirements down to providers. Even if your state says three years, federal audit authority can extend to five. If you accept any federal pass-through funds, including CCDF, Head Start, or CACFP, maintain billing records for at least five years.

What to keep: attendance records (with timestamps and signatures where required), authorization documents for each subsidized child, billing claims submitted, payment remittances received, co-payment collection records, and any correspondence with the state agency about authorizations, denials, or disputes.

## The Top 10 Most Complex States for Subsidy Compliance

Some states have subsidy billing systems that require significantly more administrative effort than others. Directors relocating programs or managing multi-state operations should plan for the following states to require the most setup time and ongoing attention.

**New York** tops most compliance complexity lists. The state runs county-administered subsidy programs, meaning the rules in New York City differ from those in Albany County or Suffolk County. Billing is submitted to the county, not the state. Six-year record retention, active fraud enforcement, and county-level variation in forms and requirements make New York the highest-complexity state.

**Massachusetts** requires monthly billing submission with attendance verification and has strict rules about authorized hours; providers can only bill for the specific schedule authorized, not for additional hours the child actually attends.

**Maryland** uses biweekly attendance verification with tight submission windows and requires electronic submission through a state portal. The biweekly cycle doubles the number of billing transactions compared to monthly states.

**Vermont** has a small subsidy population but complex income-based co-payment tiers that require careful tracking to bill correctly.

**California** operates a county-administered system similar to New York, with significant variation by county. Los Angeles and San Diego have different portal systems and different requirements from smaller counties.

**Pennsylvania** is transitioning between billing systems and has had extended periods of payment delays during system changes. Providers in Pennsylvania need reliable receivables tracking.

**Connecticut** has one of the shortest retention requirements but complex income eligibility tiers and frequent authorization period changes.

**North Carolina** requires paper submission for some provider types despite having an electronic portal, creating a hybrid process that increases administrative burden.

**Tennessee** has strict absence limits; lower than most states; requiring careful absence tracking to avoid billing errors.

**Washington** is complex primarily because of its mature electronic attendance requirement and the KinderConnect system integration requirement for all subsidy providers.

## What Your Software Needs to Handle

The variation across states translates into specific software requirements. Generic billing software or platforms built for private-pay childcare will fail subsidy providers in several predictable ways.

Authorization period tracking is non-negotiable. Software must store the start and end date of each child's subsidy authorization and alert directors when a renewal is approaching or when billing extends past an authorization period. Manual tracking of authorization dates across 20+ subsidized children is how billing errors happen.

Attendance format must match state requirements. If your state requires electronic attendance with timestamps and parent signatures, your software needs to capture all three, not just daily present/absent. If your state uses a specific electronic system (KinderConnect, TX3C), your software needs to produce records compatible with that system or integrate with it.

Absence tracking by child and by month prevents over-billing. Each state has an absence allowance; software should count absence days against that allowance and flag when a child is approaching the limit.

Co-payment tracking depends on your state's model. In collection states, software should record co-payment receipts with dates and amounts. In deduction states, software needs to reconcile the expected deduction against the actual payment received.

Record retention archiving means keeping records in a retrievable format for five years minimum, with access controls that prevent accidental deletion.

## Quick Reference: State Compliance Snapshot

**Electronic attendance mandates:** Washington (2018, KinderConnect), Texas (TX3C), New Jersey (swipe cards for 5+ subsidy children), Virginia (December 2025)

**Prospective payment states:** Hawaii, Kansas, Maryland, North Dakota, South Carolina, Utah, Wisconsin

**County-administered programs (highest variation):** New York, California, Pennsylvania (partially)

**Longest record retention:** New York and Minnesota (6 years); federal minimum is 5 years for CCDF-funded providers

**Shortest retention:** Connecticut, North Carolina, Oregon (~1 year, though federal requirements supersede)

**Paper-heavy billing:** Illinois (mailed paper certificates), some county programs in Pennsylvania and California

**Strictest absence limits:** Tennessee, followed by Massachusetts and Connecticut

The right approach for any multi-state operator is to document the requirements for each state you operate in and treat them as separate billing processes. Do not assume that a process that passes audit in one state will satisfy the requirements in another.
