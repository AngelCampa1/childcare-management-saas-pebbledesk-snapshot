---
title: "How to Switch from Brightwheel (2026 Guide)"
description: "Step-by-step guide to migrating off Brightwheel: what to export, how to time the cutover, and how to keep families informed during the switch."
publishedAt: "2026-04-16"
updatedAt: "2026-05-20"
publicKnowledge: true
buyerStage: "mofu"
schema: "Article"
bluf: "Switching off Brightwheel is less risky than most directors think if the migration is sequenced around billing cycles and subsidy reporting windows. This guide walks through a 2-to-3 week cutover that keeps attendance records intact, parents informed, and compliance documentation current through the change."
targetPersona:
  - "center-director"
faqs:
  - q: "How long does switching from Brightwheel usually take?"
    a: "Most single-site centers complete the switch in 2 to 3 weeks end to end: one week to export and clean data, one week running both systems in parallel, and a final cutover week. Multi-site operations usually add a week per additional location for staff training."
  - q: "Will parents lose their account access during the switch?"
    a: "Not if the cutover is sequenced correctly. Send parents new login credentials 5 to 7 days before the Brightwheel cutover date and keep both apps active during the parallel week so they can transition at their own pace."
  - q: "Can I export attendance history out of Brightwheel?"
    a: "Brightwheel supports CSV export for child rosters, family contacts, and billing records. Historical attendance logs require a specific request through support and may take several business days. Request the export as the first step, not the last."
  - q: "What happens to subsidy billing in progress during the switch?"
    a: "Close out the current billing cycle in Brightwheel before cutting over. Never split a subsidy claim across two systems; reconciliation becomes painful and auditors ask why the records disagree. Start the new platform on the first day of the next billing cycle."
  - q: "Do I need to run both systems in parallel?"
    a: "Strongly recommended for at least one week. Staff use the new system for real operations while Brightwheel stays available as a reference for historical records. This catches data gaps before they become compliance problems."
  - q: "What is the biggest mistake directors make when switching off Brightwheel?"
    a: "Underestimating the parent communication work. Brightwheel's app is what families interact with daily. If you do not proactively train parents on the new system with a clear why, you'll field 40 calls in the first week asking where photos went. Plan the parent rollout."
relatedPages:
  - "/compare/alternatives/brightwheel"
  - "/compare/pricing/brightwheel"
  - "/compare/versus/brightwheel-vs-procare"
  - "/features/subsidy-billing"
  - "/features/ratio-tracking"
  - "/features/attendance-tracking"
  - "/resources/best/best-childcare-management-software-centers"
  - "/resources/guides/how-to-choose-childcare-management-software"
answers:
  - q: "Can I migrate from Brightwheel without paying for both systems at once?"
    a: "Brightwheel bills monthly, so one overlap month is usually the maximum cost. Time the cutover for the last week of your Brightwheel billing cycle so the parallel week falls in a period you've already paid for. PebbleDesk Center Starter at {{plan.center_starter.priceLabel}} keeps the new-system cost predictable."
  - q: "Will switching off Brightwheel affect my state licensing compliance?"
    a: "Not if attendance records are exported and imported intact. State licensors care about the continuity of the record, not which platform holds it. Keep the Brightwheel export archived as a backup for at least 12 months after the cutover in case an auditor asks for historical data."
  - q: "How do I tell parents we're switching off Brightwheel?"
    a: "Send one clear email 2 weeks before cutover, a reminder 5 days before, and a same-day login guide. Lead with the why (better compliance tooling, better value), not the how. Parents do not care about your software; they care about photos, messages, and billing. Reassure them those work on day one."
steps:
  - title: "Week 1: Export and clean"
    content: "Pull a full CSV export of children, families, and billing records from Brightwheel. Request historical attendance separately through support. Review each file for stale data: terminated enrollments still marked active, outdated emergency contacts, duplicate family entries. Clean before import; never import dirty data."
  - title: "Week 1-2: Import and configure"
    content: "Use PebbleDesk's Brightwheel CSV preset to map columns automatically. Configure classrooms, ratio rules, subsidy funding sources, and billing schedules. Run the first ratio dashboard check to confirm attendance flows match Brightwheel's records."
  - title: "Week 2: Staff training"
    content: "Schedule two 45-minute training sessions for staff: one for check-in workflow, one for incident and activity logging. Give each staff member a one-page cheat sheet for the first week. Do not assume familiarity; the daily motions change even when the underlying job is identical."
  - title: "Week 2-3: Parallel run"
    content: "For 5 to 7 days, staff enter data in the new system while Brightwheel stays available as a reference. This is the last chance to catch missing records. Reconcile daily attendance counts between the two systems each morning for the first 3 days."
  - title: "Week 3: Cutover and parent rollout"
    content: "On cutover day, set Brightwheel to read-only. Send parents their PebbleDesk login credentials with a short welcome note. Keep both apps accessible for 7 days so parents can transition gradually. Cancel Brightwheel at the end of the current billing cycle, not sooner."
tableData:
  name: "Brightwheel to PebbleDesk migration parity"
  description: "Feature-by-feature comparison for centers evaluating the switch"
  columns: ["Feature", "Brightwheel", "PebbleDesk"]
  rows:
    - ["Parent messaging", "Native app", "Native app"]
    - ["Photo sharing", "Unlimited", "Unlimited"]
    - ["Ratio tracking", "Basic (manual headcounts)", "Real-time 15s polling"]
    - ["Subsidy reconciliation", "Manual CSV", "Built in, weekly automated"]
    - ["Audit-ready reports", "Manual assembly", "State templates for TX/CA/FL"]
    - ["Pricing", "Quote required (per-enrollment)", "{{plan.center_starter.priceLabel}} (Center Starter, 16-50 active children)"]
    - ["CSV import preset", "N/A", "Brightwheel + Procare presets"]
    - ["QuickBooks sync", "Via add-on", "Qualifying plans or rollout-supported setup"]
---

## Why centers switch

The switch usually starts with a single moment. A state licensor asks for 12 months of ratio documentation, and the director spends Saturday assembling spreadsheets from Brightwheel's basic attendance exports. Or a subsidy agency kicks back a claim because the attendance records do not match the billed hours, and reconciling the mismatch takes half a week.

Brightwheel is genuinely good at what it was built for: parent engagement. The app is polished, parents adopt it quickly, and the daily reports keep families feeling connected. None of that is at risk when you switch. What switches is which platform does the compliance heavy lifting.

The common triggers: per-enrollment pricing that grew past $300 a month as the center filled up. Subsidy billing that requires manual CSV reconciliation every month. Ratio tracking that shows the morning headcount but misses the transitions that actually cause licensing violations. Audit prep that requires a full weekend of spreadsheet assembly before every inspection.

If any of those sound familiar, the switch is a cost-savings and risk-reduction move, not a downgrade on parent experience.

## What you'll need to export

Get these five things out of Brightwheel before you commit to a cutover date.

**Child roster CSV:** Full names, dates of birth, enrollment dates, classroom assignments, and current status (active, waitlist, withdrawn). This is Brightwheel's cleanest export.

**Family contact CSV:** Parent/guardian names, phone numbers, emails, pickup authorizations, and emergency contacts. Verify emergency contacts are current before import; stale contact data is common and dangerous.

**Billing records CSV:** Invoice history, payment records, and any outstanding balances. Do not attempt to migrate in-progress invoices; close them out in Brightwheel first.

**Subsidy billing data:** If you bill CCDF, CCAP, or state vouchers, export the authorization documentation and any active reconciliation records. Subsidy data is the most fragile part of the migration; budget extra time here.

**Historical attendance:** Request this through Brightwheel support, not the self-serve export. Attendance logs older than 90 days may take 3 to 5 business days. Request it the day you decide to switch so it's ready when you need it.

## Step-by-step migration

The migration runs over 2 to 3 weeks. Front-load the data work; back-load the cutover.

See the ordered step checklist below for the week-by-week breakdown.

Two principles matter more than the specific tasks. First, never run a single subsidy billing cycle across two systems; reconciliation becomes impossible and auditors notice. Second, never cut Brightwheel off before the parallel run is complete. You will need it as a reference, and cancelling early invites data loss panic.

## Staff training checklist

Staff training is where migrations quietly fail. The operational motions look familiar, but enough details change that staff slip back into paper workarounds during the first week if they don't feel confident in the new system.

Hold two 45-minute sessions: one for the check-in, check-out, and incident workflow, another for activity logging, photo sharing, and parent messaging. Give each staff member a printed one-page cheat sheet for the first week. Identify one "power user" per classroom, a lead teacher who picks it up fastest as the go-to for day-to-day questions.

Do not schedule training the week of cutover. Staff need a week between training and go-live to practice without operational pressure.

## Go-live timeline (2-3 weeks)

**Days 1-3:** Export all data from Brightwheel. Start the historical attendance request.

**Days 4-7:** Import into the new platform. Configure classrooms, ratios, subsidy sources, and billing.

**Days 8-10:** Staff training. Power users configure their classrooms.

**Days 11-17:** Parallel run. Staff operate in the new system; Brightwheel stays as reference.

**Days 18-19:** Send parents their new credentials. Share the why.

**Day 20:** Cutover. Brightwheel becomes read-only.

**Days 21-27:** Support parents transitioning. Keep Brightwheel accessible as a parent-only reference.

## What to expect in month 1

Week 1 post-cutover is the hardest. Expect 30 to 50 parent support messages; most are login help, missing photos from a specific day, or confusion about the new billing portal. Stock a FAQ document for your front-desk staff.

Week 2 normalizes. Parents who are going to use the new app daily have adopted it. Holdouts ping you for help.

Week 3 is when operational benefits show up. Your Monday morning ratio check takes 2 minutes instead of 20. The first subsidy reconciliation of the new month runs automatically against attendance records. A staff certification renewal alert fires before it expires.

By week 4, the director's weekly paperwork load drops noticeably; usually 3 to 5 hours per week returned to the work you actually want to do.

The compliance posture is the bigger shift. Instead of assembling audit documentation after an inspector asks, the records are audit-ready continuously. That is the durable benefit of the switch.
