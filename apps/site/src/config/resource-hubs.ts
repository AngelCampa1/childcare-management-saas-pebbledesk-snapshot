export type ResourceHubId =
	| "audit-licensing"
	| "subsidy-billing"
	| "attendance-ratios"
	| "staff-operations"
	| "software-buying"
	| "compare-pricing"
	| "state-local"
	| "free-tools";

export type HubResourceType =
	| "guide"
	| "best"
	| "free-tool"
	| "feature"
	| "state"
	| "city"
	| "alternative"
	| "comparison"
	| "pricing";

export interface ResourceHub {
	id: ResourceHubId;
	slug: string;
	title: string;
	navLabel: string;
	description: string;
	intro: string;
	href: `/resources/${string}/`;
	startHere: string[];
	adjacentHubIds: ResourceHubId[];
	faqs: Array<{ q: string; a: string }>;
}

export interface HubResourceInput {
	type: HubResourceType;
	slug: string;
	title: string;
	href: string;
}

export const resourceHubs: ResourceHub[] = [
	{
		id: "audit-licensing",
		slug: "audit-licensing",
		title: "Audit & Licensing Resources",
		navLabel: "Audit & Licensing",
		description:
			"Guides and tools for licensing prep, audit records, compliance checklists, and inspection-ready childcare paperwork.",
		intro: "Start here when a licensing visit, file review, or audit deadline is driving the work.",
		href: "/resources/audit-licensing/",
		startHere: [
			"/resources/guides/childcare-licensing-audit-prep-guide/",
			"/free/licensing-compliance-checklist/",
			"/free/state-audit-preparation-toolkit/",
		],
		adjacentHubIds: ["attendance-ratios", "state-local", "subsidy-billing"],
		faqs: [
			{
				q: "What belongs in an audit-ready childcare record?",
				a: "Attendance, ratio coverage, staff records, guardian paperwork, billing support, and licensing notes should connect to the same operating record.",
			},
			{
				q: "Do these pages replace state licensing guidance?",
				a: "No. They help directors organize the work around official licensing rules and keep the documentation easier to defend.",
			},
		],
	},
	{
		id: "subsidy-billing",
		slug: "subsidy-billing",
		title: "Subsidy & Billing Resources",
		navLabel: "Subsidy & Billing",
		description:
			"CCDF, subsidy reconciliation, tuition billing, payment tracking, and finance workflow resources for childcare operators.",
		intro:
			"Use this hub when attendance, claims, invoices, and payment records need to line up cleanly.",
		href: "/resources/subsidy-billing/",
		startHere: [
			"/resources/guides/ccdf-childcare-billing-guide/",
			"/resources/guides/subsidy-billing-automation-guide/",
			"/features/subsidy-billing/",
		],
		adjacentHubIds: ["audit-licensing", "compare-pricing", "free-tools"],
		faqs: [
			{
				q: "Why group subsidy and billing together?",
				a: "Subsidy claims depend on the same attendance and family records that support billing, so directors need both workflows connected.",
			},
		],
	},
	{
		id: "attendance-ratios",
		slug: "attendance-ratios",
		title: "Attendance & Ratios Resources",
		navLabel: "Attendance & Ratios",
		description:
			"Staff-to-child ratio, classroom movement, check-in, attendance, and daily coverage resources.",
		intro:
			"Start here when the center needs a clearer daily record of who was present, where children were, and whether coverage held.",
		href: "/resources/attendance-ratios/",
		startHere: [
			"/resources/guides/staff-to-child-ratio-by-state/",
			"/features/ratio-tracking/",
			"/resources/best/best-childcare-attendance-software/",
		],
		adjacentHubIds: ["audit-licensing", "staff-operations", "state-local"],
		faqs: [
			{
				q: "Are ratio pages state-specific?",
				a: "Some pages address state-level rules, while others focus on the daily workflow that helps staff spot and fix coverage gaps.",
			},
		],
	},
	{
		id: "staff-operations",
		slug: "staff-operations",
		title: "Staff & Operations Resources",
		navLabel: "Staff & Operations",
		description:
			"Staff scheduling, classroom operations, parent communication, enrollment, waitlist, and daily admin workflow resources.",
		intro:
			"Use this hub when the operational problem is less about a single report and more about keeping the day organized.",
		href: "/resources/staff-operations/",
		startHere: [
			"/features/staff-scheduling/",
			"/features/parent-portal/",
			"/resources/best/best-childcare-software-waitlist-management/",
		],
		adjacentHubIds: ["attendance-ratios", "software-buying", "free-tools"],
		faqs: [
			{
				q: "What operations pages are included here?",
				a: "Pages about staffing, enrollment, messaging, parent workflow, classroom administration, and center routines are grouped here.",
			},
		],
	},
	{
		id: "software-buying",
		slug: "software-buying",
		title: "Software Buying Resources",
		navLabel: "Software Buying",
		description:
			"Selection checklists, implementation guides, migration planning, demos, trials, security, integrations, and buyer education.",
		intro:
			"Start here when the team is choosing software, planning rollout, or trying to avoid a messy migration.",
		href: "/resources/software-buying/",
		startHere: [
			"/resources/guides/how-to-choose-childcare-management-software/",
			"/resources/guides/childcare-software-selection-checklist/",
			"/resources/guides/childcare-software-implementation-guide/",
		],
		adjacentHubIds: ["compare-pricing", "staff-operations", "free-tools"],
		faqs: [
			{
				q: "Who should use the software buying hub?",
				a: "Directors, owners, and administrators comparing systems, planning demos, checking security, or preparing migration can start here.",
			},
		],
	},
	{
		id: "compare-pricing",
		slug: "compare-pricing",
		title: "Compare & Pricing Resources",
		navLabel: "Compare & Pricing",
		description:
			"Alternative pages, head-to-head comparisons, pricing breakdowns, cost calculators, and shortlist decision resources.",
		intro:
			"Use this hub when the buying decision is active and the team needs to compare vendors, costs, and contract shape.",
		href: "/resources/compare-pricing/",
		startHere: ["/compare/", "/pricing/", "/free/childcare-software-pricing-comparison/"],
		adjacentHubIds: ["software-buying", "subsidy-billing", "free-tools"],
		faqs: [
			{
				q: "Why include pricing pages with comparisons?",
				a: "Directors usually compare vendors and contract shape together, so pricing breakdowns sit beside alternatives and versus pages.",
			},
		],
	},
	{
		id: "state-local",
		slug: "state-local",
		title: "State & Local Resources",
		navLabel: "State & Local",
		description:
			"State and city pages for childcare software, licensing context, subsidy needs, and local operator workflows.",
		intro:
			"Start here when rules, reimbursement, or operating conditions depend on where the center is located.",
		href: "/resources/state-local/",
		startHere: [
			"/childcare-software/",
			"/childcare-software/texas/",
			"/childcare-software/california/",
		],
		adjacentHubIds: ["audit-licensing", "attendance-ratios", "subsidy-billing"],
		faqs: [
			{
				q: "Are city pages included in this hub?",
				a: "Yes. City pages and state pages both live here so local software and licensing guidance is not orphaned.",
			},
		],
	},
	{
		id: "free-tools",
		slug: "free-tools",
		title: "Free Tools Resources",
		navLabel: "Free Tools",
		description:
			"Downloadable checklists, calculators, scorecards, templates, and toolkits for childcare directors and administrators.",
		intro:
			"Use this hub when the next step is a worksheet, checklist, calculator, or template the team can use today.",
		href: "/resources/free-tools/",
		startHere: [
			"/free/",
			"/free/licensing-compliance-checklist/",
			"/free/childcare-software-scorecard/",
		],
		adjacentHubIds: ["audit-licensing", "subsidy-billing", "software-buying"],
		faqs: [
			{
				q: "Are the free tools still available at their old URLs?",
				a: "Yes. This hub organizes the tools, but every existing free resource URL remains unchanged.",
			},
		],
	},
];

export const resourceHubById = new Map(resourceHubs.map((hub) => [hub.id, hub]));
export const resourceHubBySlug = new Map(resourceHubs.map((hub) => [hub.slug, hub]));

function textFor(resource: HubResourceInput): string {
	return `${resource.type} ${resource.slug} ${resource.title} ${resource.href}`.toLowerCase();
}

function includesAny(value: string, terms: string[]): boolean {
	return terms.some((term) => value.includes(term));
}

export function getHubIdsForResource(resource: HubResourceInput): ResourceHubId[] {
	const value = textFor(resource);
	const hubs = new Set<ResourceHubId>();

	if (resource.type === "free-tool") hubs.add("free-tools");
	if (resource.type === "state" || resource.type === "city") hubs.add("state-local");
	if (
		resource.type === "alternative" ||
		resource.type === "comparison" ||
		resource.type === "pricing"
	) {
		hubs.add("compare-pricing");
	}
	if (resource.type === "feature") hubs.add("staff-operations");
	if (resource.type === "best") hubs.add("software-buying");
	if (resource.type === "guide") hubs.add("software-buying");

	if (includesAny(value, ["audit", "licens", "compliance", "inspection", "record"])) {
		hubs.add("audit-licensing");
	}
	if (
		includesAny(value, ["subsidy", "ccdf", "billing", "invoice", "payment", "tuition", "cacfp"])
	) {
		hubs.add("subsidy-billing");
	}
	if (includesAny(value, ["attendance", "ratio", "check-in", "checkin", "classroom", "coverage"])) {
		hubs.add("attendance-ratios");
	}
	if (
		includesAny(value, [
			"staff",
			"schedule",
			"operation",
			"parent",
			"enrollment",
			"waitlist",
			"message",
		])
	) {
		hubs.add("staff-operations");
	}
	if (
		includesAny(value, [
			"software",
			"demo",
			"trial",
			"migration",
			"implementation",
			"select",
			"security",
			"integration",
			"buy",
		])
	) {
		hubs.add("software-buying");
	}
	if (includesAny(value, ["compare", "pricing", "alternative", "versus", "cost", "cheap", "fee"])) {
		hubs.add("compare-pricing");
	}
	if (
		includesAny(value, ["state", "city", "texas", "california", "florida", "new-york", "georgia"])
	) {
		hubs.add("state-local");
	}

	if (hubs.size === 0) hubs.add("software-buying");
	return [...hubs];
}
