---
title: "Childcare Software Data Security: What Directors Must Know"
description: "What data childcare software holds, FERPA applicability, state privacy laws, vendor security questions, and what happens to your data if you cancel."
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
publicKnowledge: true
buyerStage: "mofu"
schema: "Article"
bluf: "Childcare software holds some of the most sensitive personal data a small business ever touches: children's health records, custody documentation, family financial information, and staff personal data. Most directors never ask their vendor about security until something goes wrong. Ask before you sign."
targetPersona:
  - "center-director"
  - "owner-operator"
faqs:
  - q: "Is FERPA applicable to childcare centers?"
    a: "FERPA (the Family Educational Rights and Privacy Act) applies to educational institutions that receive federal funding through the Department of Education, including K-12 schools and most colleges. Pure childcare centers; those not attached to a school, typically do not fall under FERPA. However, school-age programs operated by or affiliated with a public school do fall under FERPA, and Head Start programs have their own privacy regulations. If your center operates a pre-K or school-age program through a school district partnership, consult your legal advisor about FERPA applicability."
  - q: "What data security should childcare software have?"
    a: "At minimum: data encrypted at rest and in transit (TLS 1.2 or higher), role-based access controls (staff can only see what their role requires), SOC 2 Type II certification or equivalent audit, defined data breach notification procedures, and regular security testing. For payment data specifically, the vendor should be PCI DSS compliant or use a third-party payment processor (like Stripe) that handles PCI compliance independently. Ask vendors to provide their security documentation before you sign; reputable vendors have this ready."
  - q: "Who owns the data in childcare software?"
    a: "You do; your center owns the data you enter into childcare software. Reputable vendors make this clear in their Terms of Service. Specifically, your contract should state that: (1) you are the data controller and the vendor is the data processor; (2) the vendor will not sell, share, or use your data for purposes other than providing the service to you; (3) you have the right to export all your data at any time, and (4) the vendor will delete your data within a defined period after contract termination. If your contract doesn't say these things clearly, ask your vendor to clarify before signing."
  - q: "What happens to my data if I cancel my childcare software subscription?"
    a: "This varies by vendor, but you have the right to know the answer before you sign. Ask specifically: (1) Can I export all my data before cancellation, and in what format? (2) How long after cancellation will I retain read-only access to historical records? (3) When is data permanently deleted from the vendor's systems? (4) Will I receive written confirmation of deletion? Best practice vendors offer 30-90 days of read-only access post-cancellation, provide full data export in standard formats (CSV, PDF), and confirm deletion in writing. Vendors who can't answer these questions clearly are a data risk."
relatedPages:
  - "/resources/guides/childcare-software-contract-negotiation"
  - "/resources/guides/childcare-software-implementation-guide"
  - "/resources/guides/daycare-licensing-requirements-guide"
---

## What childcare software actually holds

Childcare management software holds a broader range of sensitive personal data than most directors fully recognize. Understanding what's in the system is the first step toward understanding the security obligations that come with it.

**Child personal information.** Name, date of birth, address, school enrollment status. For most children in care, this is relatively standard PII, similar to a doctor's office patient record.

**Child health records.** Allergy information, medication authorizations, special needs documentation, immunization records, and medical action plans. Health records carry heightened privacy expectations under most state laws, separate from general privacy requirements.

**Custody and legal documentation.** Custody orders, protective orders, authorized and unauthorized pickup lists, and court-ordered restrictions on parental access. This documentation has direct legal implications, a custody violation at your center because an unauthorized parent was allowed to pick up a child is a serious incident. The records supporting your pickup authorization decisions need to be both accurate and protected.

**Family financial data.** Billing history, payment methods (including stored credit card and ACH information via your payment processor), subsidy eligibility documentation, and income verification forms. This is the category with the most direct financial fraud risk.

**Staff personal data.** Employee records, Social Security numbers for payroll purposes, certifications, performance notes, and disciplinary records. Employment data has its own set of legal protections and privacy expectations.

## FERPA and childcare: what actually applies

FERPA applies to educational institutions receiving federal funding from the Department of Education. For most stand-alone licensed childcare centers, FERPA doesn't directly apply. Your childcare license comes through your state's licensing agency, not through the Department of Education.

However, several situations bring FERPA into play:

**School-age programs.** If you operate before/after school care in partnership with a public school, and that school shares student records with you (names, grade levels, parent contacts), those records may be FERPA-protected. The school is the FERPA-covered entity; you're a contractor operating under their coverage when you handle their student data.

**Pre-K programs funded through Title I or similar.** Some publicly funded pre-K programs have specific confidentiality requirements that parallel FERPA even where strict FERPA coverage is unclear.

**Head Start.** Head Start programs operate under their own federal privacy framework (the Head Start Act), which is distinct from but similar to FERPA in its child record protections.

If you run a pure private childcare program with no school partnership, FERPA likely doesn't apply. But state laws on data privacy for children's records often go further than FERPA; check your state's specific requirements.

## State data privacy laws

State-level data privacy laws vary significantly. A few important categories:

**Children's online privacy.** COPPA (Children's Online Privacy Protection Act) is the federal baseline; it restricts collection of personal information from children under 13 online without parental consent. If your center uses a parent-facing app, your software vendor is the relevant party here; verify they handle COPPA compliance appropriately.

**State health record privacy.** Most states have laws governing the protection of health information beyond HIPAA (which generally doesn't apply to childcare centers). Your state's health department may have specific requirements for how child health records are stored and who can access them.

**Employment data laws.** Several states (California, Virginia, Colorado, and others) have comprehensive consumer privacy laws that also cover employment data. If you're in a covered state, your staff have defined rights regarding how you collect and use their personal information.

## Questions to ask vendors before signing

These questions should be answered in writing; either in the vendor's security documentation or in your contract:

1. Is your platform SOC 2 Type II certified? (If not, why not, and what equivalent audit do you undergo?)
2. Is data encrypted at rest and in transit? What encryption standards do you use?
3. How do you handle payment processing; are you PCI DSS compliant, or do you use a third-party processor?
4. What is your data breach notification policy? How quickly will you notify me if a breach occurs?
5. Who has access to my center's data within your organization?
6. Where is data stored geographically?
7. What is your data deletion policy after I cancel?
8. Do you sell or share my data with third parties? Under what circumstances?

A vendor who struggles to answer these questions is telling you something about their security posture. Reputable vendors have this documentation ready.

## Cloud hosting vs. on-premise

Nearly all modern childcare software is cloud-hosted. On-premise options (software installed on your own server) are increasingly rare and generally not recommended for small childcare operations. Cloud hosting, when implemented properly, is more secure than on-premise solutions at small centers; enterprise cloud providers like AWS, Google Cloud, and Azure have security infrastructure far beyond what a small business can maintain independently.

The relevant security question for cloud software isn't "cloud vs. on-premise"; it's "how seriously does this vendor take their cloud security practices?" That's what the questions above are designed to surface.

## After you cancel: the data portability right

One of the most important data security provisions for a childcare software customer isn't about preventing breaches; it's about ensuring you can leave with your data intact when you choose to switch.

Before signing any software contract, confirm:

**Export availability.** Can you export all your data, including historical records, in a standard readable format (CSV, PDF)? Some vendors limit export to current records only, which means your historical records are effectively held hostage.

**Post-cancellation access window.** How long after cancellation can you access the system to complete exports and retrieve records? 30 days minimum; 90 days is better.

**Data deletion timeline.** When is your data permanently deleted from the vendor's systems after cancellation? Get this in writing, along with a commitment to written confirmation of deletion upon request.

**Data portability for regulatory compliance.** Your licensing agency may require you to produce records from specific past dates for inspections. If you've cancelled software that holds those records and can't access them, you have a compliance problem. Make sure your export covers everything that might be requested.
