import type { FaqItem } from "@pebbledesk/marketing";
import {
	formatPlanCapacityClaim,
	getPromotionalPriceLabel,
	PEBBLEDESK_OFFERING,
} from "@pebbledesk/shared/constants";

export const hubFaqs: Record<string, FaqItem[]> = {
	"/compare": [
		{
			q: "How is PebbleDesk different from Brightwheel for childcare center directors?",
			a: "Brightwheel is built around parent engagement, photo sharing, messaging, and lesson plans. PebbleDesk is built for the director's compliance work: subsidy reconciliation, staff-to-child ratio tracking, and audit-ready attendance records. If your licensing officer asks for documentation, PebbleDesk produces it; Brightwheel produces a parent photo feed.",
		},
		{
			q: "What should a childcare director look for when comparing center management software?",
			a: "Start with compliance: does the platform enforce your state's staff-to-child ratios in real time, track subsidy billing by funding source, and produce the attendance records a licensing auditor would request? Features like parent messaging and photo sharing are secondary if your center is at risk of failing a licensing inspection.",
		},
		{
			q: "Can we migrate from Brightwheel or Procare without losing enrollment and attendance history?",
			a: "Most childcare platforms support importing child enrollment records and staff information via CSV. Attendance history and subsidy billing records are more complex, ask the new vendor specifically about migrating those datasets and confirm the import format before committing to a switch.",
		},
		{
			q: "What happens after the center picks a plan?",
			a: "Pick a plan first, then enter your email to see availability and next steps. No setup fees apply when you subscribe.",
		},
	],
	"/resources": [
		{
			q: "What resources help a childcare director evaluate center management software?",
			a: "The guides section covers the compliance-first evaluation questions: which platforms support subsidy billing reconciliation, how real-time ratio tracking works for mixed-age classrooms, and what the real cost of a licensing audit failure looks like when your records aren't in order.",
		},
		{
			q: "How long does it take to get childcare management software configured for a licensed center?",
			a: "A well-structured platform should allow your staff to set up child enrollment, classroom assignments, and subsidy billing sources in a day or two. If a platform requires a week of onboarding, it's built for large multi-site operators, not a single-center director managing everything themselves.",
		},
		{
			q: "Are there guides on passing a state childcare licensing inspection?",
			a: "Yes. The guides section covers what state licensing officers typically look for, attendance records, ratio logs, staff certification documentation, and which of those items your management software should be able to produce on demand. Content is organized by documentation type, not by platform.",
		},
	],
	"/compare/alternatives": [
		{
			q: "What are the main Brightwheel alternatives for licensed childcare centers?",
			a: "For licensed childcare centers prioritizing compliance, the realistic alternatives are PebbleDesk, Procare, Lillio (formerly HiMama), and Playground. Procare is legacy software with strong billing but an outdated interface. Lillio is parent-communication-focused like Brightwheel. Playground is a newer entrant missing subsidy reconciliation. PebbleDesk is built compliance-first.",
		},
		{
			q: "Is Procare a good fit for a licensed in-home daycare provider?",
			a: "Procare is well-suited for larger licensed centers with dedicated admin staff, it has strong billing and CACFP meal reimbursement tracking. For an in-home daycare provider managing everything alone, the interface complexity and legacy desktop architecture can be more overhead than the compliance features justify.",
		},
		{
			q: "What should I verify before reading a 'Brightwheel alternative' comparison?",
			a: "Confirm the comparison addresses your primary compliance requirements, specifically whether the alternative includes subsidy billing reconciliation and real-time ratio tracking, or whether it's also positioned as a parent engagement tool with compliance as an afterthought.",
		},
	],
	"/compare/versus": [
		{
			q: "How do head-to-head childcare software comparisons help directors decide?",
			a: "A side-by-side comparison forces specific questions: which platform produces the exact attendance report your state licensing officer requests, which one handles CCDF subsidy billing natively, and how the pricing compares once you add the compliance features you actually need. These comparisons are written for center directors, not corporate childcare chains.",
		},
		{
			q: "What compliance features matter most when comparing childcare management platforms?",
			a: "The short list: real-time staff-to-child ratio tracking, subsidy billing reconciliation by funding source, audit-ready attendance export, staff certification expiration tracking, and incident report logging. Platforms missing any of these create manual recordkeeping work that compounds as enrollment grows.",
		},
		{
			q: "Do pricing comparisons on these pages stay current?",
			a: "Each comparison shows a last-updated date. Childcare software pricing has shifted as Brightwheel has moved upmarket. Always verify current pricing directly with vendors before making a purchase decision, especially if you're evaluating per-child pricing models.",
		},
	],
	"/compare/pricing": [
		{
			q: "Why is childcare software pricing so hard to compare?",
			a: "Brightwheel uses per-child pricing that scales with enrollment, making the monthly cost unpredictable as census fluctuates. Procare sells desktop software with annual license fees plus add-ons. These pricing breakdowns surface the actual all-in cost for a center at your enrollment level and flag where compliance features require upgrading to a higher tier.",
		},
		{
			q: "What hidden costs show up in childcare management software pricing?",
			a: "Common extras: per-child fees that scale with enrollment rather than staying flat, payment processing fees layered on parent billing, compliance report exports gated to premium tiers, CACFP meal tracking sold as a separate module, and setup fees for data migration from an existing system.",
		},
		{
			q: "How does PebbleDesk's pricing compare to Brightwheel for a 40-child center?",
			a: `Brightwheel needs a written quote. Ask about the plan, fees, setup, and renewal price. PebbleDesk Center Starter is a flat plan for ${formatPlanCapacityClaim("center_starter")}. With ${PEBBLEDESK_OFFERING.promotion.code}, it is ${getPromotionalPriceLabel("center_starter")}. The bill does not rise inside that child limit.`,
		},
	],
	"/resources/best": [
		{
			q: "How are 'best childcare software' roundups on this site put together?",
			a: "Each roundup evaluates platforms on the compliance features that matter for licensed centers, subsidy billing, ratio tracking, audit documentation, as well as pricing structure and ease of use for directors managing their own admin work. Rankings are not paid placements and are updated when platforms change their pricing or compliance features.",
		},
		{
			q: "Are these lists useful for both in-home daycare providers and larger licensed centers?",
			a: "Yes. Each roundup specifies whether the platforms reviewed are suited for small in-home programs, single-site licensed centers, or multi-site operations. A home daycare provider and a 60-child licensed center have fundamentally different compliance workflows and price tolerance.",
		},
		{
			q: "What's the difference between childcare management software and parent communication apps?",
			a: "Childcare management software covers enrollment, billing, attendance, compliance reporting, and staff management, the back-office operations of running a licensed program. Parent communication apps (like Brightwheel's core feature set) focus on daily updates, photos, and messaging to families. These are different tools for different jobs; some platforms do both, but usually with one side stronger than the other.",
		},
	],
	"/resources/guides": [
		{
			q: "What guides are most useful for a director preparing for a state licensing renewal?",
			a: "The guides section covers what documentation state licensing officers typically request during renewal inspections, attendance records, staff-to-child ratio logs, staff certification records, and incident report files. Each guide identifies which of these your management software should produce automatically versus which require manual preparation.",
		},
		{
			q: "Are there guides on setting up CCDF subsidy billing in childcare software?",
			a: "Yes. The guides cover configuring your software to track attendance by funding source, reconcile CCDF vouchers against enrollment records, and generate the billing documentation your subsidy agency requires. Subsidy billing setup varies by state agency, so the guides are organized by state program type.",
		},
		{
			q: "How do I choose between staying on Brightwheel and switching to a compliance-first platform?",
			a: "The switching guide covers a direct comparison of the compliance gap between parent-engagement-first platforms and compliance-first platforms, organized by the specific audit scenarios that trigger licensing problems. If your primary risk is a state licensing inspection, the guide outlines which documentation gaps create the most exposure.",
		},
	],
};
