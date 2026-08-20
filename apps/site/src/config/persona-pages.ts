import {
	formatPlanCapacityClaim,
	formatPlanFitSummary,
	PEBBLEDESK_OFFERING,
} from "@pebbledesk/shared/constants";
import type { PersonaSlug } from "./personas";

export interface PersonaHelp {
	title: string;
	body: string;
	links: { label: string; href: string }[];
}

export interface PersonaCrossLink {
	title: string;
	href: string;
	description: string;
}

export interface PersonaFaq {
	q: string;
	a: string;
}

export interface PersonaPage {
	slug: string;
	route: string;
	canonicalPath: string;
	personaSlug: PersonaSlug;
	navLabel: string;
	title: string;
	description: string;
	eyebrow: string;
	headline: string;
	subheadline: string;
	trustSignal: string;
	plan: string;
	pains: string[];
	helps: PersonaHelp[];
	takeaways: string[];
	planFit: string;
	crossLinks: PersonaCrossLink[];
	faqs: PersonaFaq[];
	relatedPersonaSlugs: string[];
}

export const personaPages: PersonaPage[] = [
	{
		slug: "childcare-center-directors",
		route: "/for/childcare-center-directors/",
		canonicalPath: "/for/childcare-center-directors",
		personaSlug: "center-director",
		navLabel: "Center Directors",
		title: "Childcare Software for Center Directors | PebbleDesk",
		description:
			"Keep attendance, ratios, and audit records ready for every licensing visit. PebbleDesk gives center directors one audit-ready record.",
		eyebrow: "For licensed center directors",
		headline: "Walk into your next licensing visit already ready.",
		subheadline:
			"PebbleDesk keeps attendance, ratios, and records in one place. No more late-night audit prep.",
		trustSignal: "Built for licensed centers serving 20 to 75 children.",
		plan: "center_starter",
		pains: [
			"Ratios change all day. The proof lives on a paper sheet you rebuild later.",
			"A licensing visit means digging through binders, spreadsheets, and email.",
			"One missing record can put your license at risk.",
		],
		helps: [
			{
				title: "See your ratios as the day happens",
				body: "Watch room coverage live. Keep the history you need for proof.",
				links: [
					{ label: "Ratio Tracking", href: "/features/ratio-tracking/" },
					{ label: "Attendance Tracking", href: "/features/attendance-tracking/" },
				],
			},
			{
				title: "Prove every day in minutes",
				body: "Audit exports come from the daily record. You do not rebuild the week.",
				links: [{ label: "Audit Reports", href: "/features/audit-reports/" }],
			},
			{
				title: "Keep staff and child records together",
				body: "Keep enrollment, files, and staff credentials in one place. An inspector can trust it.",
				links: [
					{ label: "Enrollment & Records", href: "/features/enrollment-records/" },
					{ label: "Staff Credentials", href: "/features/staff-credentials/" },
				],
			},
			{
				title: "Switch without starting over",
				body: PEBBLEDESK_OFFERING.claims.migrationSupport,
				links: [{ label: "Imports & Migration", href: "/features/imports-migration/" }],
			},
		],
		takeaways: [
			"PebbleDesk keeps attendance, ratios, and audit records in one place.",
			"Audit exports come from the record you use every day.",
			"Most centers start on Center Starter. Larger teams use Center Pro.",
		],
		planFit: `Most single-site centers start on Center Starter (${formatPlanCapacityClaim("center_starter")}). Larger teams pick Center Pro (${formatPlanCapacityClaim("center_pro")}).`,
		crossLinks: [
			{
				title: "PebbleDesk vs Brightwheel for center directors",
				href: "/compare/alternatives/brightwheel-center-directors/",
				description: "See how PebbleDesk compares for licensed centers.",
			},
			{
				title: "Ratio tracking",
				href: "/features/ratio-tracking/",
				description: "Live room coverage and ratio history.",
			},
			{
				title: "Audit reports",
				href: "/features/audit-reports/",
				description: "Pull inspection-ready exports from the daily record.",
			},
			{
				title: "Compare childcare software",
				href: "/compare/",
				description: "Line PebbleDesk up against other tools.",
			},
			{
				title: "See pricing",
				href: "/pricing/",
				description: "Plans and the free trial.",
			},
		],
		faqs: [
			{
				q: "Will PebbleDesk work for my state's licensing rules?",
				a: PEBBLEDESK_OFFERING.claims.stateSupport,
			},
			{
				q: "How fast can I switch from my current software?",
				a: PEBBLEDESK_OFFERING.claims.migrationSupport,
			},
			{
				q: "What do I show an inspector?",
				a: "Audit exports, attendance reports, and history all come from the same daily record. The proof matches what really happened.",
			},
			{
				q: "Do I need a credit card to try it?",
				a: PEBBLEDESK_OFFERING.claims.trialStartDisclosure,
			},
		],
		relatedPersonaSlugs: ["in-home-daycare-providers", "multi-site-childcare-operators"],
	},
	{
		slug: "in-home-daycare-providers",
		route: "/for/in-home-daycare-providers/",
		canonicalPath: "/for/in-home-daycare-providers",
		personaSlug: "in-home-daycare-operator",
		navLabel: "In-Home Providers",
		title: "Daycare Software for In-Home Providers | PebbleDesk",
		description:
			"Run your home daycare without the paperwork pileup. PebbleDesk handles attendance, billing, and records. It fits one classroom.",
		eyebrow: "For in-home daycare providers",
		headline: "Run your home daycare without the paperwork pileup.",
		subheadline:
			"PebbleDesk handles attendance, billing, and records for small programs. The price fits one classroom.",
		trustSignal: `Built for home programs with ${formatPlanCapacityClaim("home")}.`,
		plan: "home",
		pains: [
			"You wear every hat. Paperwork eats the time you would rather spend with kids.",
			"Big-center software costs too much and does too much.",
			"Subsidy and licensing records still have to be right.",
		],
		helps: [
			{
				title: "One simple place for attendance and records",
				body: "See who is here. Keep child files in order without a binder.",
				links: [
					{ label: "Attendance Tracking", href: "/features/attendance-tracking/" },
					{ label: "Enrollment & Records", href: "/features/enrollment-records/" },
				],
			},
			{
				title: "Send invoices and get paid",
				body: "Bill families and track payments without a second app.",
				links: [{ label: "Billing & Payments", href: "/features/billing-payments/" }],
			},
			{
				title: "Keep subsidy paperwork in order",
				body: "Track what you billed. Keep the records that back up the claim.",
				links: [{ label: "Subsidy Billing", href: "/features/subsidy-billing/" }],
			},
			{
				title: "Message families in one thread",
				body: "Send updates and get replies in one inbox.",
				links: [{ label: "Messaging & Alerts", href: "/features/messaging-alerts/" }],
			},
		],
		takeaways: [
			formatPlanFitSummary("home"),
			"Attendance, billing, and records live in one simple place.",
			"Start the free trial with no credit card.",
		],
		planFit: `${formatPlanFitSummary("home")} Flat price, no setup fee.`,
		crossLinks: [
			{
				title: "Affordable Lillio alternative",
				href: "/compare/alternatives/lillio-affordable/",
				description: "A lower-cost option for small programs.",
			},
			{
				title: "Billing & payments",
				href: "/features/billing-payments/",
				description: "Invoice families and track payments.",
			},
			{
				title: "Subsidy billing",
				href: "/features/subsidy-billing/",
				description: "Keep claims and records together.",
			},
			{
				title: "See pricing",
				href: "/pricing/",
				description: "The Home plan and the free trial.",
			},
			{
				title: "Compare childcare software",
				href: "/compare/",
				description: "See how PebbleDesk stacks up.",
			},
		],
		faqs: [
			{
				q: "Is PebbleDesk affordable for a home daycare?",
				a: `Yes. ${formatPlanFitSummary("home")} It has a flat price and no setup fee. ${PEBBLEDESK_OFFERING.claims.trialStartDisclosure}`,
			},
			{
				q: "Is this too much software for a small program?",
				a: "No. Start with attendance, records, and billing. Leave the rest off until you need it.",
			},
			{
				q: "Can it handle subsidy billing?",
				a: "Yes. PebbleDesk tracks what you billed and what is still owed. It keeps the records that support each claim.",
			},
			{
				q: "Do I need a credit card to start?",
				a: PEBBLEDESK_OFFERING.claims.trialStartDisclosure,
			},
		],
		relatedPersonaSlugs: ["childcare-center-directors", "multi-site-childcare-operators"],
	},
	{
		slug: "multi-site-childcare-operators",
		route: "/for/multi-site-childcare-operators/",
		canonicalPath: "/for/multi-site-childcare-operators",
		personaSlug: "multi-site-operator",
		navLabel: "Multi-Site Operators",
		title: "Childcare Software for Multi-Site Operators",
		description:
			"Run every site from one clear view. Get the same records and billing across all your sites.",
		eyebrow: "For multi-site operators and Head Start grantees",
		headline: "Run every site from one clear view.",
		subheadline:
			"PebbleDesk gives every site the same records and subsidy billing. It works for multi-site operators and Head Start grantees.",
		trustSignal: "Built for groups running more than one location.",
		plan: "group",
		pains: [
			"Every site tracks things its own way. The reports do not line up.",
			"Subsidy billing across sites leaves money on the table.",
			"Rolling out new software across sites feels risky.",
		],
		helps: [
			{
				title: "See every site in one place",
				body: "Bring attendance, ratios, and records from every site together.",
				links: [{ label: "Multi-Location Oversight", href: "/features/multi-location-oversight/" }],
			},
			{
				title: "Bill subsidy the same way at every site",
				body: "Use the same subsidy steps at every site. Keep the records that back each claim.",
				links: [{ label: "Subsidy Billing", href: "/features/subsidy-billing/" }],
			},
			{
				title: "Keep audit records the same",
				body: "Every site exports the same audit-ready proof.",
				links: [{ label: "Audit Reports", href: "/features/audit-reports/" }],
			},
			{
				title: "Roll out with a plan",
				body: "Plan your move before you switch each site over.",
				links: [{ label: "Imports & Migration", href: "/features/imports-migration/" }],
			},
		],
		takeaways: [
			"Group fits growing multi-site teams. Larger rollouts get guided setup with our team.",
			"Use the same subsidy and audit steps at every site.",
			"Centers can miss more than 8% of subsidy revenue. PebbleDesk helps catch it.",
		],
		planFit:
			"Group fits growing multi-site teams. Larger rollouts add guided setup, a move plan, and reports across every site.",
		crossLinks: [
			{
				title: "PebbleDesk vs Procare for multi-location",
				href: "/compare/alternatives/procare-multi-location/",
				description: "Compare PebbleDesk for groups.",
			},
			{
				title: "Multi-location oversight",
				href: "/features/multi-location-oversight/",
				description: "One view across every site.",
			},
			{
				title: "Subsidy billing",
				href: "/features/subsidy-billing/",
				description: "The same claims at every site.",
			},
			{
				title: "See pricing",
				href: "/pricing/",
				description: "Group plans and custom rollouts.",
			},
			{
				title: "Compare childcare software",
				href: "/compare/",
				description: "See how PebbleDesk compares.",
			},
		],
		faqs: [
			{
				q: "Can PebbleDesk handle billing across multiple sites?",
				a: "Yes. Group plans and custom multi-site rollouts handle subsidy and billing across sites. They keep the records that back each claim.",
			},
			{
				q: "How does rollout work for several locations?",
				a: "Our team guides multi-site setup. We plan each center, the move order, and your reports with you.",
			},
			{
				q: "Does it support Head Start and CCDF reporting?",
				a: "PebbleDesk keeps attendance, ratios, and subsidy claim records in one place. CACFP tracking and audit exports help with your reports.",
			},
			{
				q: "How much revenue can subsidy billing errors cost?",
				a: "Pie for Providers estimates that without automation, providers miss more than 8% of subsidy revenue each year to billing errors. On $200,000 in subsidy revenue, that is about $16,000 a year.",
			},
		],
		relatedPersonaSlugs: ["childcare-center-directors", "in-home-daycare-providers"],
	},
];

export const personaPagesBySlug = Object.fromEntries(personaPages.map((p) => [p.slug, p]));
