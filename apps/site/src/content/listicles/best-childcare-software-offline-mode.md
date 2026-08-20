---
title: "Best Childcare Software with Offline Mode (2026)"
description: "Our breakdown of childcare software that keeps running when state portals go down. Independent records, local access, and subsidy-safe workflows."
publishedAt: "2026-04-04"
updatedAt: "2026-04-16"
publicKnowledge: true
buyerStage: "mofu"
targetPersona:
  - "center-director"
  - "in-home-daycare-operator"
  - "multi-site-operator"
schema: "ItemList"
bluf: "When Missouri's CCDF billing system failed in December 2023, it left $191 million of $215 million in funds undistributed. Michigan's MiLEAP system errors left one provider billed for 59 children but paid for 19. State systems fail. This list evaluates which childcare management platforms keep working when internet or state portals go down, and which ones leave you with no independent records."
category: "Childcare Software"
qualifier: "Offline Mode and Independent Record Storage"
tools:
  - name: "PebbleDesk"
    summary: "Independent record storage that doesn't depend on state portal availability. Attendance, ratio logs, and billing records are yours."
    pros:
      - "Attendance and billing records stored independently of state subsidy portals; accessible when state systems are down"
      - "Ratio monitoring logs maintained locally so an inspection visit during an outage doesn't leave you without documentation"
      - "Export-ready reports that can be submitted manually when state submission portals are unavailable"
      - "Flat pricing: Home {{plan.home.priceLabel}}, Center Starter {{plan.center_starter.priceLabel}}"
    cons:
      - "Full native offline mode (no internet required) is not a current feature; requires internet connection for real-time sync"
      - "New product; online-only workflow should be confirmed with the vendor for your specific use case"
    pricing: "Home {{plan.home.priceLabel}}, Center Starter {{plan.center_starter.priceLabel}}, custom multi-site rollout"
    verdict: "Best for centers that want independent records not tied to state portal availability. PebbleDesk is online-only for V1; current capability is independent record storage with export."
  - name: "Procare"
    summary: "Desktop-legacy architecture means local data storage is inherent to the older product line. Cloud version has different characteristics."
    pros:
      - "Procare desktop (legacy) stores data locally by default; software functions when internet is unavailable"
      - "Long-established workaround for programs in rural areas with unreliable connectivity"
      - "Billing and attendance records exist independent of any state portal"
    cons:
      - "Procare's cloud-based product has different offline characteristics than the legacy desktop version; confirm which you're buying"
      - "Desktop version is legacy and receives fewer updates than cloud platforms"
      - "Interface complexity is higher than modern cloud-first platforms"
    pricing: "Written quote required by modules"
    verdict: "If your connectivity is unreliable and you need proven local data storage, the Procare desktop product has the longest track record. Confirm you're not buying the cloud version if offline is a priority."
  - name: "Kangarootime"
    summary: "Cloud-first platform. Offline mode is not a documented feature. Independent record storage available through data export."
    pros:
      - "Strong billing and subsidy management in connected mode"
      - "Data export tools allow centers to maintain local backup copies of records"
      - "Billing history accessible through the platform's reporting"
    cons:
      - "No documented offline mode; requires internet connectivity to access records"
      - "During a state portal outage, billing submission tools are unavailable but records remain in the platform"
      - "An inspection visit during an internet outage would require pre-exported records"
    pricing: "Not published"
    verdict: "Adequate for programs with reliable connectivity where offline is not a frequent concern. Maintain regular exports of billing and attendance records as a backup practice."
  - name: "Brightwheel"
    summary: "No offline mode. Requires internet connectivity. Records are unavailable if internet drops during an inspection."
    pros:
      - "Strong parent communication in connected mode"
      - "Large user base with active community sharing workarounds"
      - "Enrollment and attendance tracking work well when connected"
    cons:
      - "No offline mode; confirmed by Brightwheel support documentation"
      - "If internet connectivity drops during a licensing inspection, attendance records in Brightwheel are inaccessible"
      - "Records are stored in Brightwheel's cloud infrastructure, not locally; no local backup without manual export"
      - "State subsidy billing reconciliation requires manual work alongside the platform even in connected mode"
    pricing: "Not published; written quote required"
    verdict: "Not suitable for programs in areas with unreliable internet or those that want independent record storage outside a vendor's cloud. Requires active export discipline to maintain local copies."
  - name: "Lillio (formerly HiMama)"
    summary: "Cloud-only. No offline mode. Records are in Lillio's infrastructure."
    pros:
      - "Good developmental documentation and milestone tracking"
      - "Parent communication features are well-reviewed"
    cons:
      - "No offline mode; requires internet for all functions"
      - "Records stored in Lillio's cloud, not independently accessible during outages"
      - "Built for Canadian regulatory environment; US state-specific compliance features are secondary"
    pricing: "Not published"
    verdict: "Not recommended for programs where exportable records in an online-only workflow or independent record storage is a priority."
  - name: "LifeCubby"
    summary: "Cloud-based platform with data export capability. No documented offline mode."
    pros:
      - "Flat monthly pricing with no per-transaction fees"
      - "Billing and attendance in the same system"
      - "Data can be exported for local backup"
    cons:
      - "No offline mode; requires internet for platform access"
      - "Smaller company; infrastructure reliability track record is shorter than larger platforms"
    pricing: "$30-350/month"
    verdict: "Reasonable choice for programs with reliable connectivity. Establish a regular export routine to maintain independent records."
pricingStats:
  - stat: "Missouri's December 2023 CCDF vendor transition left $191 million of $215 million undistributed for weeks"
    source: "Missouri CCDF vendor transition, December 2023"
    sourceUrl: "https://dese.mo.gov/communications/dese-completes-reviews-child-care-subsidy-backlog"
  - stat: "Michigan's MiLEAP system errors generated 11,000+ call center inquiries; one provider was billed for 59 children but paid for 19"
    source: "Michigan MiLEAP system error reports"
    sourceUrl: "https://audgen.michigan.gov/"
faqs:
  - q: "What happens when a state childcare billing system fails?"
    a: "Missouri's December 2023 CCDF vendor transition failure is the clearest documented case: $191 million of $215 million in funds went undistributed for weeks during the holiday period. Michigan's MiLEAP system errors caused billing discrepancies that generated over 11,000 call center inquiries, including one provider billed for 59 children but paid for 19. Programs with independent attendance and billing records in their own software recovered faster than those relying entirely on state portal data."
  - q: "How can childcare centers protect their billing records from state system failures?"
    a: "Maintain attendance and billing records in software you control, not just in the state's subsidy portal. Software that stores records independently of state systems means that when the state portal goes down, your documentation still exists. At minimum, establish a regular export routine: weekly exports of attendance and billing records stored locally provide a recovery baseline if a state system failure disrupts normal submission processes."
  - q: "Does childcare software need to work without internet to be useful during an outage?"
    a: "Full offline mode is useful but not the only protection. The higher risk for most programs is a state portal outage, not a local internet outage, and state portal failures don't affect software that stores records independently. A platform that maintains your records in its own infrastructure (separate from the state portal) and allows export protects you from state system failures even without true offline capability."
  - q: "What should I do if my state's CCDF billing system goes down?"
    a: "First, confirm the outage is on the state's end and get a case number from your state agency. Second, continue tracking attendance using whatever record you have available; paper logs if necessary. Third, contact your state agency to ask about delayed submission procedures; most states have documented emergency procedures for system outages. Programs with independent attendance records have documentation ready when the portal comes back up."
answers:
  - question: "Does Brightwheel work offline?"
    answer: "No. Brightwheel requires internet connectivity and has no offline mode. If internet access drops during a licensing inspection, attendance records stored in Brightwheel are inaccessible. Centers in areas with unreliable connectivity or those that want records accessible independent of internet availability need to evaluate alternatives or establish a regular manual export routine."
  - question: "Why does offline mode matter for childcare centers?"
    answer: "Two scenarios make exportable records in an online-only workflow a real operational need. First: state system failures like Missouri's December 2023 CCDF crisis, which left $191M undistributed for weeks. Second: licensing inspection visits during connectivity disruptions. In both cases, programs with attendance and billing records accessible outside the state portal or without internet dependency recover faster and face less documentation risk."
tableData:
  name: "Childcare Software Offline and Independent Record Storage Comparison"
  description: "Platforms evaluated on offline capability, record independence from state portals, and local storage options"
  columns: ["Platform", "Offline Mode", "Records Independent of State Portal", "Export Capability", "Monthly Cost"]
  rows:
    - ["PebbleDesk", "Not supported", "Yes", "Export-ready", "{{plan.center_starter.priceLabel}}"]
    - ["Procare (Desktop)", "Yes", "Yes (local)", "Yes", "Written quote required"]
    - ["Kangarootime", "No", "Yes (in-platform)", "Data export", "Not published"]
    - ["Brightwheel", "No", "No (vendor cloud only)", "Manual export required", "Not published"]
    - ["Lillio", "No", "No", "Limited export", "Not published"]
    - ["LifeCubby", "No", "Yes (in-platform)", "Data export", "$30-350/mo"]
relatedPages:
  - "/resources/guides/when-state-subsidy-systems-fail"
  - "/resources/guides/subsidy-reimbursement-tracking-guide"
  - "/childcare-software/missouri"
  - "/childcare-software/michigan"
  - "/free/ccdf-billing-error-prevention"
  - "/compare/alternatives/brightwheel"
---

## When state systems fail, who has records?

The Missouri CCDF billing system transition in December 2023 left 88% of allocated funds; $191 million of $215 million; undistributed during one of the worst possible times: the holiday period. Michigan's MiLEAP system, implemented to manage childcare subsidy payments, generated over 11,000 call center inquiries as billing errors accumulated. One provider's experience became the documentation example: billed for 59 children, paid for 19.

These are not isolated edge cases. State childcare subsidy administration systems are aging infrastructure managed by state IT departments with limited modernization budgets. System failures, vendor transitions, and billing errors are recurring events across the country.

Programs that recover fastest from state system failures share one characteristic: their attendance and billing records exist in software they control, not only in the state portal.

### What "offline mode" actually means

"Offline mode" gets used to describe at least three different things in childcare software:

1. **Full offline operation**: the software functions with no internet connection at all; records are stored locally on a device
2. **Independent record storage**: the software stores records in its own infrastructure, separate from state portals; accessible even when state systems are down, but still requires internet to access the vendor's platform
3. **Export capability**: the software allows you to download records locally; exportable records in an online-only workflow requires prior export

For the Missouri and Michigan scenarios, type 2 or 3 is the relevant protection. State portal failures don't affect software that stores records in its own infrastructure. A center that can pull up its own platform's billing records; even while the state portal is unavailable; can document its position, prepare submissions for when the portal returns, and avoid the scramble of reconstructing records from paper logs.

Full offline mode (type 1) matters for programs in rural areas with unreliable internet connectivity, or for inspection visits when connectivity drops unexpectedly.

### The inspection scenario

State licensing inspections are not scheduled around your connectivity. If an inspector arrives and asks to see attendance records for the past 30 days, the answer "our internet is down and our records are in Brightwheel" creates a problem. Software that stores records only in a vendor's cloud with no local backup or export; creates documentation risk during any connectivity disruption.

This is a scenario most directors don't think about until it happens. Building the export habit before the inspection is the right time.

### What this means practically

For most programs, the practical protection is:

- Use software that stores records independently of the state subsidy portal
- Establish a weekly export routine: billing records, attendance logs, and subsidy reconciliation data stored locally
- Know where your state agency's emergency procedures are documented for system outages

None of this requires that your software have full offline mode. It requires that your records not be held exclusively in the state's infrastructure.

### State-specific context

Not all states have experienced the failures documented in Missouri and Michigan. But vendor transitions, system upgrades, and billing platform changes happen regularly across states. The risk is not hypothetical, and it's not uniform; programs in states with recently transitioned billing systems carry higher near-term risk.

If you're in Missouri or Michigan: the failure history is documented and recovery procedures now exist. The relevant question is whether your current software gives you records you control, or records you access through a state portal.
