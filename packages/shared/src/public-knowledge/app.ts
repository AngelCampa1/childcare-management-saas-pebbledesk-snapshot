import type { Role } from "../constants/index.js";

export type GuideTone = "start" | "daily" | "compliance" | "finance" | "data";

export interface GuideStep {
	id: string;
	title: string;
	description: string;
	href?: string;
	ctaLabel?: string;
	roles?: Role[];
}

export interface Guide {
	id: string;
	title: string;
	description: string;
	tone: GuideTone;
	roles: Role[];
	keywords: string[];
	steps: GuideStep[];
}

export interface HelpTopic {
	id: string;
	title: string;
	description: string;
	keywords: string[];
	roles: Role[];
	guideId?: string;
	href?: string;
}

export interface AppPageHelp {
	id: string;
	route: string;
	title: string;
	what: string;
	first: string;
	watch: string;
	roles: Role[];
	guideId?: string;
	topicIds: string[];
}

export interface AppInlineHelp {
	id: string;
	route: string;
	kind: "field" | "tip";
	label: string;
	text: string;
}

const ADMIN_ROLES: Role[] = ["owner", "director"];
const ALL_ROLES: Role[] = ["owner", "director", "staff"];

export const GUIDES: Guide[] = [
	{
		id: "dashboard-basics",
		title: "Dashboard basics",
		description:
			"Use the dashboard as your morning desk: finish setup, see what needs attention, then open the next page.",
		tone: "start",
		roles: ALL_ROLES,
		keywords: ["dashboard", "home", "lost", "start", "next"],
		steps: [
			{
				id: "dashboard-basics.next",
				title: "Do the highlighted next step first",
				description:
					"If PebbleDesk shows a setup step, finish that before jumping into daily work.",
				href: "/dashboard",
				ctaLabel: "Open dashboard",
			},
			{
				id: "dashboard-basics.today",
				title: "Check today before reports",
				description:
					"Attendance and ratios depend on today's room records, so keep them current first.",
				href: "/attendance",
				ctaLabel: "Open attendance",
			},
			{
				id: "dashboard-basics.help",
				title: "Use Help when a word feels unfamiliar",
				description: "Search plain words like child, red, PDF, billing, or lost.",
				href: "/help",
				ctaLabel: "Open help",
			},
		],
	},
	{
		id: "owner-start-here",
		title: "Start here: set up the center",
		description:
			"Build the basics in the right order so attendance, ratios, billing, and reports all work together.",
		tone: "start",
		roles: ADMIN_ROLES,
		keywords: ["start", "setup", "first", "onboarding", "new center"],
		steps: [
			{
				id: "owner-start.classrooms",
				title: "Add your classrooms",
				description: "Create each room and enter the staff-to-child ratio your license requires.",
				href: "/classrooms",
				ctaLabel: "Open classrooms",
			},
			{
				id: "owner-start.children",
				title: "Enroll children and guardians",
				description: "Add the child, guardian, emergency contact, and enrollment status.",
				href: "/children/enroll",
				ctaLabel: "Enroll a child",
			},
			{
				id: "owner-start.attendance",
				title: "Open attendance for today",
				description: "Check children and staff into rooms so ratios update automatically.",
				href: "/attendance",
				ctaLabel: "Open attendance",
			},
			{
				id: "owner-start.reports",
				title: "Generate your first report",
				description: "Pick a date range, generate the report, then download the file.",
				href: "/reports",
				ctaLabel: "Open reports",
			},
		],
	},
	{
		id: "attendance-basics",
		title: "Attendance without guessing",
		description:
			"Keep the live roster accurate so ratios, subsidy claims, and reports are trustworthy.",
		tone: "daily",
		roles: ALL_ROLES,
		keywords: ["attendance", "check in", "checkout", "clock", "daily"],
		steps: [
			{
				id: "attendance-basics.staff",
				title: "Clock staff into the right room",
				description: "Staff must be in the room before PebbleDesk can count them for ratios.",
				href: "/attendance",
				ctaLabel: "Open attendance",
			},
			{
				id: "attendance-basics.children",
				title: "Check children in as they arrive",
				description: "Search by name, confirm the room, and check them out when they leave.",
				href: "/attendance",
				ctaLabel: "Check in children",
			},
			{
				id: "attendance-basics.red",
				title: "Fix red rooms right away",
				description: "Red means the room is out of ratio or the roster needs correction.",
				href: "/ratios",
				ctaLabel: "Review ratios",
			},
		],
	},
	{
		id: "classroom-setup",
		title: "Classroom setup basics",
		description: "Classrooms control capacity, age groups, attendance rosters, and ratio rules.",
		tone: "start",
		roles: ADMIN_ROLES,
		keywords: ["classroom", "room", "capacity", "age group", "ratio"],
		steps: [
			{
				id: "classroom-setup.room",
				title: "Create one room for each licensed classroom",
				description: "Use the names staff already say during the day.",
				href: "/classrooms",
				ctaLabel: "Open classrooms",
			},
			{
				id: "classroom-setup.capacity",
				title: "Enter license capacity and ratio",
				description: "These numbers tell PebbleDesk when a room is getting too full.",
				href: "/classrooms",
				ctaLabel: "Add classroom",
			},
			{
				id: "classroom-setup.children",
				title: "Assign children to rooms",
				description: "Attendance is easier when each child already has the right classroom.",
				href: "/children/enroll",
				ctaLabel: "Enroll a child",
			},
		],
	},
	{
		id: "enrollment-basics",
		title: "Enroll a child step by step",
		description:
			"Add the child, family contacts, and classroom assignment in the order PebbleDesk needs.",
		tone: "start",
		roles: ADMIN_ROLES,
		keywords: ["child", "children", "enroll", "guardian", "pickup", "waitlist"],
		steps: [
			{
				id: "enrollment-basics.child",
				title: "Start with the child's basic details",
				description: "Date of birth helps suggest the age group for classroom placement.",
				href: "/children/enroll",
				ctaLabel: "Enroll a child",
			},
			{
				id: "enrollment-basics.guardian",
				title: "Add at least one guardian",
				description: "Guardians are the family contacts for messages, pickup, and billing.",
				href: "/children/enroll",
				ctaLabel: "Add guardian",
			},
			{
				id: "enrollment-basics.review",
				title: "Review before saving",
				description:
					"Check spelling, pickup permission, subsidy status, and classroom before submitting.",
				href: "/children/enroll",
				ctaLabel: "Review enrollment",
			},
		],
	},
	{
		id: "guardian-basics",
		title: "Guardian records basics",
		description:
			"Use guardian records for family contacts, pickup permission, messages, and billing links.",
		tone: "daily",
		roles: ADMIN_ROLES,
		keywords: ["guardian", "parent", "pickup", "contact", "family"],
		steps: [
			{
				id: "guardian-basics.primary",
				title: "Mark the main contact clearly",
				description: "The primary guardian is usually who receives routine calls and billing.",
				href: "/guardians",
				ctaLabel: "Open guardians",
			},
			{
				id: "guardian-basics.pickup",
				title: "Check pickup permission",
				description: "Only authorized pickup contacts should be used for release decisions.",
				href: "/guardians",
				ctaLabel: "Review contacts",
			},
		],
	},
	{
		id: "scheduling-basics",
		title: "Scheduling basics",
		description: "Use schedules to plan staff coverage before the room gets busy.",
		tone: "daily",
		roles: ALL_ROLES,
		keywords: ["schedule", "shift", "coverage", "time", "approve"],
		steps: [
			{
				id: "scheduling-basics.plan",
				title: "Create the recurring plan",
				description: "A schedule is the plan for who should be in each room.",
				href: "/scheduling",
				ctaLabel: "Open scheduling",
			},
			{
				id: "scheduling-basics.attendance",
				title: "Use attendance for what actually happened",
				description: "Schedules plan coverage; attendance proves who was present.",
				href: "/attendance",
				ctaLabel: "Open attendance",
			},
		],
	},
	{
		id: "staff-daily-basics",
		title: "Staff daily basics",
		description:
			"The simple daily routine: clock in, check children in, and ask for help when a room is off.",
		tone: "daily",
		roles: ALL_ROLES,
		keywords: ["staff", "attendance", "clock in", "check in", "daily"],
		steps: [
			{
				id: "staff-daily.clock-in",
				title: "Clock yourself into the room",
				description: "Choose your room and use Clock In before children arrive.",
				href: "/attendance",
				ctaLabel: "Open attendance",
			},
			{
				id: "staff-daily.check-in-child",
				title: "Check in each child",
				description: "Search for a child, confirm the room, and check them in.",
				href: "/attendance",
				ctaLabel: "Check in children",
			},
			{
				id: "staff-daily.ratio-help",
				title: "Watch the room status",
				description:
					"If the screen shows a warning or violation, tell your director before the room gets busier.",
				href: "/attendance",
				ctaLabel: "Review attendance",
			},
		],
	},
	{
		id: "ratio-colors",
		title: "Understand ratio colors",
		description: "Know what green, amber, and red mean before an inspector or parent asks.",
		tone: "compliance",
		roles: ALL_ROLES,
		keywords: ["ratio", "green", "amber", "red", "violation", "warning"],
		steps: [
			{
				id: "ratio-colors.green",
				title: "Green means the room is okay",
				description: "Children and staff are currently within the room's required ratio.",
				href: "/ratios",
				ctaLabel: "Open ratios",
				roles: ADMIN_ROLES,
			},
			{
				id: "ratio-colors.amber",
				title: "Amber means watch this room",
				description: "The room is close to its limit. Add staff or avoid moving more children in.",
				href: "/attendance",
				ctaLabel: "Open attendance",
			},
			{
				id: "ratio-colors.red",
				title: "Red means fix it now",
				description:
					"Move staff, check a child out, or correct the roster so the room returns to compliance.",
				href: "/attendance",
				ctaLabel: "Fix attendance",
			},
		],
	},
	{
		id: "download-pdf-report",
		title: "Generate and find a PDF report",
		description:
			"Use reports when someone asks for attendance, ratio, subsidy, or licensing proof.",
		tone: "compliance",
		roles: ADMIN_ROLES,
		keywords: ["pdf", "download", "report", "audit", "licensing", "file"],
		steps: [
			{
				id: "download-pdf.choose-type",
				title: "Choose the report type",
				description:
					"Pick attendance, ratio, subsidy, or licensing based on what you were asked for.",
				href: "/reports",
				ctaLabel: "Open reports",
			},
			{
				id: "download-pdf.dates",
				title: "Choose start and end dates",
				description: "Use the exact dates the state, family, or subsidy agency requested.",
				href: "/reports",
				ctaLabel: "Set dates",
			},
			{
				id: "download-pdf.find-file",
				title: "Click Download and check Downloads",
				description:
					"Most browsers save the file in the Downloads folder. Look for the newest PebbleDesk file.",
				href: "/reports",
				ctaLabel: "View report history",
			},
		],
	},
	{
		id: "csv-import-basics",
		title: "Import a CSV without stress",
		description:
			"Bring records from another system into PebbleDesk and review rows before anything is saved.",
		tone: "data",
		roles: ADMIN_ROLES,
		keywords: ["csv", "import", "brightwheel", "procare", "spreadsheet", "upload"],
		steps: [
			{
				id: "csv-import.pick-format",
				title: "Choose what you are importing",
				description: "Select children, guardians, invoices, or full enrollment.",
				href: "/import",
				ctaLabel: "Open import",
			},
			{
				id: "csv-import.upload",
				title: "Select the CSV file",
				description:
					"A CSV is a spreadsheet saved as a simple text file. PebbleDesk previews it first.",
				href: "/import",
				ctaLabel: "Upload CSV",
			},
			{
				id: "csv-import.review",
				title: "Review the preview",
				description:
					"Rows with issues are skipped. Fix the file and upload again if something looks wrong.",
				href: "/import",
				ctaLabel: "Review import",
			},
		],
	},
	{
		id: "billing-subsidy-flow",
		title: "Billing and subsidy basics",
		description: "Know the difference between family invoices and agency subsidy claims.",
		tone: "finance",
		roles: ADMIN_ROLES,
		keywords: ["billing", "invoice", "payment", "subsidy", "claim", "money"],
		steps: [
			{
				id: "billing-subsidy.invoice",
				title: "Use Billing for family payments",
				description: "Create or send invoices, then record payments when money comes in.",
				href: "/billing",
				ctaLabel: "Open billing",
				roles: ["owner"],
			},
			{
				id: "billing-subsidy.case",
				title: "Use Subsidies for agency cases",
				description:
					"Track eligibility, claim periods, and amounts expected from the subsidy agency.",
				href: "/subsidies",
				ctaLabel: "Open subsidies",
			},
			{
				id: "billing-subsidy.records",
				title: "Keep attendance current",
				description: "Subsidy claims depend on attendance records, so daily check-ins matter.",
				href: "/attendance",
				ctaLabel: "Open attendance",
			},
		],
	},
	{
		id: "messages-basics",
		title: "Messaging basics",
		description:
			"Send simple updates to a whole classroom or selected guardians, then review delivery status.",
		tone: "daily",
		roles: ALL_ROLES,
		keywords: ["message", "announcement", "guardian", "classroom", "alert"],
		steps: [
			{
				id: "messages-basics.recipients",
				title: "Choose who should receive it",
				description:
					"Pick a classroom for a group update or selected guardians for a smaller message.",
				href: "/messages",
				ctaLabel: "Open messages",
			},
			{
				id: "messages-basics.type",
				title: "Choose the message type",
				description:
					"Use announcement for routine updates, alert for urgent items, and direct for selected families.",
				href: "/messages",
				ctaLabel: "Compose message",
			},
		],
	},
];

export const HELP_TOPICS: HelpTopic[] = [
	{
		id: "what-first",
		title: "What should I do first?",
		description: "Start with classrooms, then enroll children, then use attendance each day.",
		keywords: ["first", "start", "setup", "onboarding"],
		roles: ALL_ROLES,
		guideId: "owner-start-here",
	},
	{
		id: "lost",
		title: "I feel lost. What should I do?",
		description:
			"Open Dashboard, complete the highlighted next step, then use Attendance for today's records.",
		keywords: ["lost", "confused", "start", "next"],
		roles: ALL_ROLES,
		guideId: "dashboard-basics",
		href: "/dashboard",
	},
	{
		id: "dashboard-meaning",
		title: "What is the dashboard for?",
		description: "It shows setup progress and today's basics so you know where to go next.",
		keywords: ["dashboard", "home", "today", "setup"],
		roles: ALL_ROLES,
		guideId: "dashboard-basics",
	},
	{
		id: "capacity-meaning",
		title: "What does capacity mean?",
		description:
			"Capacity is the most children your license allows in a room. PebbleDesk warns you before a room is too full.",
		keywords: ["capacity", "slots", "room", "classroom"],
		roles: ADMIN_ROLES,
		guideId: "classroom-setup",
	},
	{
		id: "guardian-primary",
		title: "What is a primary guardian?",
		description:
			"The primary guardian is the main family contact for routine updates, billing, and questions.",
		keywords: ["guardian", "primary", "parent", "contact"],
		roles: ADMIN_ROLES,
		guideId: "guardian-basics",
	},
	{
		id: "find-pdf",
		title: "Where did my PDF go?",
		description:
			"After you click Download, check your browser's Downloads folder for the newest file.",
		keywords: ["pdf", "download", "file", "folder", "report"],
		roles: ADMIN_ROLES,
		guideId: "download-pdf-report",
	},
	{
		id: "attendance-check-in",
		title: "How do I check in a child?",
		description:
			"Open Attendance, search for the child, choose the room, and confirm the check-in.",
		keywords: ["attendance", "check in", "child", "room"],
		roles: ALL_ROLES,
		guideId: "staff-daily-basics",
		href: "/attendance",
	},
	{
		id: "attendance-clock-in",
		title: "Why do staff clock in?",
		description:
			"PebbleDesk counts clocked-in staff toward ratios. If staff are not clocked in, a room may look out of ratio.",
		keywords: ["clock", "staff", "ratio", "attendance"],
		roles: ALL_ROLES,
		guideId: "attendance-basics",
		href: "/attendance",
	},
	{
		id: "ratio-red",
		title: "What does a red ratio mean?",
		description: "The room needs attention now. Add staff, correct attendance, or move children.",
		keywords: ["ratio", "red", "violation", "staff"],
		roles: ALL_ROLES,
		guideId: "ratio-colors",
	},
	{
		id: "csv-meaning",
		title: "What is a CSV file?",
		description:
			"It is a spreadsheet file saved in a simple format. PebbleDesk lets you preview it before saving.",
		keywords: ["csv", "spreadsheet", "import", "upload"],
		roles: ADMIN_ROLES,
		guideId: "csv-import-basics",
	},
	{
		id: "billing-vs-subsidy",
		title: "Billing or subsidy?",
		description: "Billing is for families. Subsidies are for agency cases and claims.",
		keywords: ["billing", "payment", "subsidy", "claim", "invoice"],
		roles: ADMIN_ROLES,
		guideId: "billing-subsidy-flow",
	},
	{
		id: "schedule-vs-attendance",
		title: "Schedule or attendance?",
		description: "Scheduling is the plan. Attendance is the record of who was actually there.",
		keywords: ["schedule", "attendance", "shift", "time"],
		roles: ALL_ROLES,
		guideId: "scheduling-basics",
	},
	{
		id: "send-message",
		title: "How do I send a message?",
		description: "Open Messages, choose a classroom or guardians, write the note, then send it.",
		keywords: ["message", "send", "guardian", "classroom"],
		roles: ALL_ROLES,
		guideId: "messages-basics",
		href: "/messages",
	},
	{
		id: "still-stuck",
		title: "I still need help",
		description:
			"Start in Help, then choose the closest plain-language guide for the job in front of you.",
		keywords: ["help", "stuck", "lost", "support"],
		roles: ALL_ROLES,
	},
];

export const APP_PAGE_HELP: AppPageHelp[] = [
	{
		id: "dashboard",
		route: "/dashboard",
		title: "Need help with the dashboard?",
		what: "This is your starting place. It shows setup progress and today's center snapshot.",
		first: "Finish the highlighted setup step, then use Attendance for the live day.",
		watch:
			"If ratio data is unavailable or a room falls out of ratio, fix attendance before making reports.",
		roles: ALL_ROLES,
		guideId: "dashboard-basics",
		topicIds: ["dashboard-meaning", "lost"],
	},
	{
		id: "attendance",
		route: "/attendance",
		title: "Attendance plain-language guide",
		what: "Attendance is the live record of who is in each room right now.",
		first: "Clock staff into the room, then check children in as they arrive.",
		watch: "A red status means the room needs staff, checkout, or roster correction right away.",
		roles: ALL_ROLES,
		guideId: "attendance-basics",
		topicIds: ["attendance-check-in", "attendance-clock-in", "ratio-red"],
	},
	{
		id: "classrooms",
		route: "/classrooms",
		title: "Classrooms plain-language guide",
		what: "Classrooms are the rooms PebbleDesk uses for attendance, capacity, and ratio rules.",
		first: "Add each licensed room using the same room names your staff already use.",
		watch: "Capacity and ratio numbers should match your license, because they drive warnings.",
		roles: ADMIN_ROLES,
		guideId: "classroom-setup",
		topicIds: ["capacity-meaning"],
	},
	{
		id: "children",
		route: "/children",
		title: "Children plain-language guide",
		what: "This list shows enrolled, waitlisted, and withdrawn child records.",
		first: "Search for a child before adding a new one so you do not create duplicates.",
		watch: "Enrollment status affects attendance, reports, and billing eligibility.",
		roles: ADMIN_ROLES,
		guideId: "enrollment-basics",
		topicIds: ["what-first"],
	},
	{
		id: "children-enroll",
		route: "/children/enroll",
		title: "Enrollment plain-language guide",
		what: "Enrollment creates the child's record, family contacts, and room assignment.",
		first: "Add the child's details, then add or link at least one guardian.",
		watch: "Review pickup permission, subsidy status, and classroom before saving.",
		roles: ADMIN_ROLES,
		guideId: "enrollment-basics",
		topicIds: ["guardian-primary", "capacity-meaning"],
	},
	{
		id: "guardians",
		route: "/guardians",
		title: "Guardians plain-language guide",
		what: "Guardians are family contacts used for pickup, billing, messages, and emergencies.",
		first: "Search before adding a new guardian so one person does not get duplicate records.",
		watch: "Missing phone or email can slow down urgent communication.",
		roles: ADMIN_ROLES,
		guideId: "guardian-basics",
		topicIds: ["guardian-primary"],
	},
	{
		id: "scheduling",
		route: "/scheduling",
		title: "Scheduling plain-language guide",
		what: "Scheduling is the plan for staff coverage. Attendance is the record of what happened.",
		first: "Create a schedule, then add shifts for staff, rooms, days, and times.",
		watch: "A schedule does not count toward ratios until staff clock in on Attendance.",
		roles: ALL_ROLES,
		guideId: "scheduling-basics",
		topicIds: ["schedule-vs-attendance"],
	},
	{
		id: "ratios",
		route: "/ratios",
		title: "Ratios plain-language guide",
		what: "Ratios show whether each room has enough staff for the children present right now.",
		first: "Look for red rooms first, then amber rooms, then review green rooms if needed.",
		watch:
			"Ratios update from attendance, so wrong check-ins or staff clock-ins can create false alarms.",
		roles: ALL_ROLES,
		guideId: "ratio-colors",
		topicIds: ["ratio-red"],
	},
	{
		id: "reports",
		route: "/reports",
		title: "Reports plain-language guide",
		what: "Reports create files you can share with licensing, subsidy agencies, or families.",
		first: "Choose the report type, pick the exact date range requested, then generate.",
		watch: "If a report looks wrong, check Attendance first because reports use those records.",
		roles: ADMIN_ROLES,
		guideId: "download-pdf-report",
		topicIds: ["find-pdf"],
	},
	{
		id: "billing",
		route: "/billing",
		title: "Billing plain-language guide",
		what: "Billing is for family invoices and payments. Subsidies are handled on the Subsidies page.",
		first: "Create a draft invoice, review it, then send the payment link when it is correct.",
		watch: "Check the family, dates, due date, and line items before sending anything.",
		roles: ["owner"],
		guideId: "billing-subsidy-flow",
		topicIds: ["billing-vs-subsidy"],
	},
	{
		id: "subsidies",
		route: "/subsidies",
		title: "Subsidies plain-language guide",
		what: "Subsidies track agency cases and claims separate from family invoices.",
		first: "Start with a subsidy case, then create or review claims for that case.",
		watch:
			"Claims depend on attendance records, so fix attendance before submitting money requests.",
		roles: ADMIN_ROLES,
		guideId: "billing-subsidy-flow",
		topicIds: ["billing-vs-subsidy"],
	},
	{
		id: "import",
		route: "/import",
		title: "Import plain-language guide",
		what: "Import brings spreadsheet records into PebbleDesk after you preview them.",
		first: "Choose what is in the CSV, choose where it came from, then upload the file.",
		watch: "Rows with errors are skipped. Nothing should be saved until you review the preview.",
		roles: ADMIN_ROLES,
		guideId: "csv-import-basics",
		topicIds: ["csv-meaning"],
	},
	{
		id: "messages",
		route: "/messages",
		title: "Messages plain-language guide",
		what: "Messages help you send updates to guardians and see whether delivery worked.",
		first: "Choose the right recipients before writing the message.",
		watch: "Use alerts only for urgent items so families learn to pay attention to them.",
		roles: ALL_ROLES,
		guideId: "messages-basics",
		topicIds: ["send-message"],
	},
	{
		id: "settings",
		route: "/settings",
		title: "Settings plain-language guide",
		what: "Settings is where owners manage center details, team access, billing, and bookkeeping links.",
		first: "Review the warning banner first, then handle QuickBooks or team invitations.",
		watch: "Disconnecting services or changing center details can affect billing and reports.",
		roles: ["owner"],
		topicIds: ["billing-vs-subsidy"],
	},
];

export const APP_INLINE_HELP: AppInlineHelp[] = [
	{
		id: "dashboard.children-present",
		route: "/dashboard",
		kind: "tip",
		label: "Help: children present",
		text: "Children currently checked into rooms today.",
	},
	{
		id: "dashboard.rooms-within-ratio",
		route: "/dashboard",
		kind: "tip",
		label: "Help: rooms within ratio",
		text: "Rooms where the number of children and staff currently meets the required rule.",
	},
	{
		id: "billing.template",
		route: "/billing",
		kind: "field",
		label: "Start from template",
		text: "Templates fill in common charges so you do not retype them.",
	},
	{
		id: "billing.guardian",
		route: "/billing",
		kind: "field",
		label: "Guardian",
		text: "The family contact responsible for this invoice.",
	},
	{
		id: "classrooms.card-ratio",
		route: "/classrooms",
		kind: "tip",
		label: "Help: ratio",
		text: "The staff-to-child rule PebbleDesk uses to decide if this room is okay.",
	},
	{
		id: "classrooms.name",
		route: "/classrooms",
		kind: "field",
		label: "Name",
		text: "Use the room name your staff and families already recognize.",
	},
	{
		id: "messages.send-to",
		route: "/messages",
		kind: "field",
		label: "Send to",
		text: "Choose a classroom for a group update or selected guardians for a smaller message.",
	},
	{
		id: "messages.guardians",
		route: "/messages",
		kind: "tip",
		label: "Help: Guardians",
		text: "Pick the family contacts who should receive this message.",
	},
];

export function guideVisibleToRole(guide: Guide, role: Role): boolean {
	return guide.roles.includes(role);
}

export function stepVisibleToRole(step: GuideStep, role: Role): boolean {
	return !step.roles || step.roles.includes(role);
}

export function getGuidesForRole(role: Role): Guide[] {
	return GUIDES.filter((guide) => guideVisibleToRole(guide, role));
}

export function getGuideById(id: string): Guide | undefined {
	return GUIDES.find((guide) => guide.id === id);
}

export function getTopicsForRole(role: Role): HelpTopic[] {
	return HELP_TOPICS.filter((topic) => topic.roles.includes(role));
}

export function searchHelp(role: Role, query: string): HelpTopic[] {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

	const topics = getTopicsForRole(role);
	if (terms.length === 0) return topics;

	return topics.filter((topic) => {
		const haystack = [topic.title, topic.description, ...topic.keywords].join(" ").toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}

export function pageHelpVisibleToRole(pageHelp: AppPageHelp, role: Role): boolean {
	return pageHelp.roles.includes(role);
}

export function getAppPageHelpByRoute(route: string): AppPageHelp | undefined {
	return APP_PAGE_HELP.find((pageHelp) => pageHelp.route === route);
}

export function getRequiredAppPageHelpByRoute(route: string): AppPageHelp {
	const pageHelp = getAppPageHelpByRoute(route);
	if (!pageHelp) throw new Error(`Missing app page help for route ${route}`);
	return pageHelp;
}

export function getAppPageHelpForRole(role: Role): AppPageHelp[] {
	return APP_PAGE_HELP.filter((pageHelp) => pageHelpVisibleToRole(pageHelp, role));
}

export function getAppInlineHelpById(id: string): AppInlineHelp | undefined {
	return APP_INLINE_HELP.find((help) => help.id === id);
}

export function getRequiredAppInlineHelpById(id: string): AppInlineHelp {
	const help = getAppInlineHelpById(id);
	if (!help) throw new Error(`Missing app inline help for id ${id}`);
	return help;
}
