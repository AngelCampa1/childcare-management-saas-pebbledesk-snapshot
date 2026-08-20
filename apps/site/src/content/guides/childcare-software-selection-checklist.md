---
title: "Childcare Software Selection Checklist (2026)"
description: "Practical checklist for center directors evaluating software. Covers ratio tracking, subsidy billing, audit docs, and pricing questions to ask first."
publishedAt: "2026-03-31"
updatedAt: "2026-03-31"
publicKnowledge: true
buyerStage: "tofu"
targetPersona:
  - "center-director"
bluf: "Before selecting childcare software, run through this checklist: does it alert you before a ratio violation? Can it produce state agency billing in your voucher format? Does it generate audit documentation in one step? What is the real monthly cost at your enrollment level? Most demos don't surface these questions; you have to ask them."
steps:
  - title: "Define your primary software job before you look at demos"
    content: "Most demos lead with what the vendor wants to show you, not what you need to evaluate. Write down the top three operational problems you're hiring software to solve before any demo call. Common answers: subsidy billing reconciliation, ratio compliance monitoring, eliminating paper enrollment packets, or parent communication. The order matters; if ratio compliance is number one, evaluate that feature first in every demo."
  - title: "Test ratio monitoring before anything else"
    content: "Ask the vendor directly: 'When a room approaches its staff-to-child ratio limit, how does the system alert the staff on the floor?' A product that has ratio monitoring will explain the alert workflow. A product that doesn't have it will redirect to how you can see check-in counts and calculate ratios from there. These are not the same thing. Get a live demonstration of the alert triggering, not a slide about the feature."
  - title: "Verify subsidy billing support for your state's programs"
    content: "Ask specifically: 'Can this system generate a billing submission in the format [your state CCAP or DHS program] requires?' Not 'does this system support subsidy billing'; every vendor will say yes. The specific question is whether the output matches what your state agency actually accepts. Ask the vendor to show you what the billing export looks like."
  - title: "Calculate the real monthly cost at your enrollment level"
    content: "Never evaluate software at the entry-tier price. Ask: 'What is the monthly cost for a center with [your enrollment count] children?' Write it down. Add payment processing fees if you'll collect tuition through the platform. Add the cost of any parent communication add-ons that aren't included in the base price. The number you end up with is your real monthly cost."
  - title: "Ask how audit documentation is generated"
    content: "During a licensing visit, an inspector might ask for: staff-to-child ratios for specific dates, attendance records, subsidy billing reconciliation records. Ask the vendor: 'If an inspector asks for my ratio documentation for last month, what steps do I take to produce it?' Count the steps. A good system should be two or three steps. If the answer involves exporting multiple reports and assembling a document, that's a manual process the software hasn't solved."
  - title: "Check the contract terms before the pricing conversation ends"
    content: "Ask: Is this month-to-month or annual? What happens if I need to cancel? Is there an implementation fee or onboarding cost on top of the monthly subscription? Annual contracts are common in this category; they're not inherently bad, but you should know before you commit. Some vendors bury contract terms in the fine print of the demo follow-up email."
  - title: "Run a real enrollment scenario in the trial"
    content: "Before committing to any platform, create a test family that has both a private-pay portion and a subsidy portion. Walk through enrollment, attendance, billing, and generating a compliance report for that family. If the platform can't complete this workflow cleanly, it won't serve your needs in production. A demo using the vendor's pre-built test data is not sufficient."
timeEstimate: "2-3 hours across multiple vendor evaluations"
difficulty: "Moderate"
definitions:
  - term: "Staff-to-Child Ratio"
    definition: "The maximum number of children permitted per qualified staff member in a licensed childcare setting. Ratios vary by state, age group, and type of program. Exceeding the licensed ratio is a violation that can result in licensing citations, correction orders, or suspension."
  - term: "CCAP (Child Care Assistance Program)"
    definition: "A state-administered subsidy program funded through the federal Child Care and Development Fund (CCDF). CCAP pays part of childcare tuition for eligible low-income families. Centers that accept CCAP must bill the state agency in a specific format and maintain enrollment records that meet CCAP compliance requirements."
  - term: "Voucher-Funded Enrollment"
    definition: "Children whose tuition is paid wholly or partially by a state or local subsidy voucher rather than private family payment. Centers with voucher-funded enrollment must track billing separately for the state-paid portion and any family co-pay, and reconcile against state payment records."
  - term: "Audit Trail"
    definition: "A chronological record of system actions; check-ins, staff clock-ins, billing transactions, enrollment changes; that can be reviewed by state licensing authorities. A reliable audit trail demonstrates that the center maintained compliant operations over a period of time."
answers:
  - question: "What questions should I ask a childcare software vendor about ratio monitoring?"
    answer: "Ask: Does your system send alerts when a room approaches its ratio limit? Does the alert go to the staff on the floor or only to the director? How is the ratio threshold configured per room and age group? Can you demonstrate the alert triggering in a live demo? These questions separate genuine proactive monitoring from attendance tracking you can use to calculate ratios manually."
  - question: "How do I evaluate whether childcare software supports my state's subsidy billing format?"
    answer: "Ask the vendor to show you what a CCAP or state voucher billing export looks like from their system. Compare it to the billing submission format your state agency currently accepts. If the vendor can't show you the output format, or if it doesn't match your state's requirements, subsidy billing will still require manual reconciliation."
  - question: "What is the difference between month-to-month and annual childcare software contracts?"
    answer: "Month-to-month contracts allow you to cancel with 30-day notice if the software doesn't work for your center. Annual contracts typically offer lower monthly pricing but commit you to 12 months of payment regardless of whether you continue using the platform. For a first software purchase, month-to-month reduces financial risk during evaluation."
relatedPages:
  - "/resources/best/best-childcare-software-small-centers"
  - "/compare/alternatives/brightwheel"
  - "/compare/versus/brightwheel-vs-procare-small-centers"
  - "/resources/guides/preparing-for-state-audit-childcare"
  - "/resources/best/best-subsidy-tracking-childcare-apps"
---

## Why Standard Software Demos Don't Surface the Right Questions

A standard childcare software demo shows you: the parent communication app, the enrollment flow, the billing dashboard, and maybe the reporting section.

What it doesn't show you, unless you ask: what happens when a room goes out of ratio at 8:15 AM. How subsidy billing reconciliation actually works for your state's specific voucher format. What steps are required to produce audit documentation for a licensing visit.

These are the questions that determine whether a software actually reduces your operational risk, or whether it's a parent communication platform you're paying compliance prices for.

## The Checklist Philosophy

The goal of this checklist is not to find the software with the best demo. It's to find the software that solves the three or four operational problems that consume the most time and carry the most risk at your center.

Every director's top three problems are slightly different. Some centers' primary pain is subsidy billing reconciliation that takes two days every month. Some centers' primary pain is ratio monitoring during morning drop-off when staffing is thinnest. Some centers' primary pain is the annual licensing visit where documentation needs to be produced quickly.

Identify your top three problems first. Then run every vendor through the same questions about those specific problems. The vendor that answers those questions best with live demonstrations, not slide decks; is the right vendor.

## What Compliance-Focused Evaluation Looks Like in Practice

When we built PebbleDesk, we started by asking directors what a state licensing visit actually required from them and how their current software fell short. The answers shaped the product.

The pattern we heard most often: directors spent the days before a licensing visit assembling documentation from multiple sources; attendance exports, billing records, staff schedule printouts because their software didn't produce the compilation the inspector needed.

That's a software failure. The audit documentation job was handed back to the director. A compliance-first evaluation asks, before anything else: does this software complete that job, or just provide the raw materials for me to complete it myself?
