export type LeadMagnetTrack = "compliance" | "billing" | "buying" | "hr";

export interface LeadMagnetKnowledge {
	slug: string;
	title: string;
	publicPath: string;
	downloadPath: string;
	coverPath: string | null;
	track: LeadMagnetTrack;
	nurtureTrack: LeadMagnetTrack;
	sourceRefs: readonly string[];
}

const magnets = [
	["licensing-compliance-checklist", "Licensing Compliance Checklist", "compliance"],
	["ratio-tracking-cheatsheet", "Ratio Tracking Cheatsheet", "compliance"],
	["state-audit-preparation-toolkit", "State Audit Preparation Toolkit", "compliance"],
	["parent-handbook-template", "Parent Handbook Template", "compliance"],
	["ccdf-billing-error-prevention", "CCDF Billing Error Prevention", "billing"],
	["state-subsidy-billing-guide", "State Subsidy Billing Guide", "billing"],
	["childcare-software-pricing-comparison", "Childcare Software Pricing Comparison", "buying"],
	["childcare-software-scorecard", "Childcare Software Scorecard", "buying"],
	["brightwheel-cost-calculator", "Brightwheel Cost Calculator", "buying"],
	["childcare-staff-handbook-template", "Childcare Staff Handbook Template", "hr"],
	["staff-credential-tracker", "Staff Credential Tracker", "hr"],
	["cacfp-compliance-checklist", "CACFP Compliance Checklist", "compliance"],
	[
		"childcare-enrollment-agreement-template",
		"Childcare Enrollment Agreement Template",
		"compliance",
	],
	["incident-report-log-template", "Incident Report Log Template", "compliance"],
	["childcare-fee-policy-template", "Childcare Fee Policy Template", "billing"],
	["head-start-self-assessment-checklist", "Head Start Self-Assessment Checklist", "compliance"],
] as const satisfies readonly (readonly [string, string, LeadMagnetTrack])[];

export const leadMagnetCatalog: readonly LeadMagnetKnowledge[] = magnets.map(
	([slug, title, track]) => ({
		slug,
		title,
		publicPath: `/free/${slug}/`,
		downloadPath: `/lead-magnets/${slug}.pdf`,
		coverPath: `/lead-magnets/${slug}-cover.png`,
		track,
		nurtureTrack: track,
		sourceRefs: [`/free/${slug}/`],
	}),
);

export type LeadMagnetSlug = (typeof leadMagnetCatalog)[number]["slug"];

export const LEAD_MAGNET_TRACKS = Object.fromEntries(
	leadMagnetCatalog.map((magnet) => [magnet.slug, magnet.track]),
) as Record<string, LeadMagnetTrack>;

export function getLeadMagnetBySlug(slug: string): LeadMagnetKnowledge | null {
	return leadMagnetCatalog.find((magnet) => magnet.slug === slug) ?? null;
}

export function getLeadMagnetTrack(slug: string): LeadMagnetTrack {
	return getLeadMagnetBySlug(slug)?.track ?? "compliance";
}

export function getLeadMagnetTitle(slug: string): string {
	return getLeadMagnetBySlug(slug)?.title ?? slugToTitle(slug);
}

export function getLeadMagnetSlugs(): string[] {
	return leadMagnetCatalog.map((magnet) => magnet.slug);
}

export function getLeadMagnetsPublicKnowledgeArtifact() {
	return {
		schemaVersion: 1,
		surface: "lead-magnets",
		magnets: leadMagnetCatalog,
	};
}

/** Default magnet slug per track. */
const DEFAULT_MAGNET_SLUGS: Record<LeadMagnetTrack, string> = {
	compliance: "licensing-compliance-checklist",
	billing: "ccdf-billing-error-prevention",
	buying: "childcare-software-pricing-comparison",
	hr: "childcare-staff-handbook-template",
};

/**
 * Returns the canonical default lead magnet for a given track.
 * Always returns a valid magnet from the catalog.
 */
export function getDefaultMagnetForTrack(track: LeadMagnetTrack): LeadMagnetKnowledge {
	const slug = DEFAULT_MAGNET_SLUGS[track];
	const magnet = getLeadMagnetBySlug(slug);
	if (!magnet) {
		throw new Error(`Default magnet slug "${slug}" for track "${track}" not found in catalog`);
	}
	return magnet;
}

/**
 * Per-track nurture sequence slugs. These sequences are defined in the sequencer
 * () and are expected to exist before enrollment calls are made.
 */
export const LEAD_MAGNET_NURTURE_SEQUENCES: Record<LeadMagnetTrack, string> = {
	compliance: "pebbledesk-nurture-compliance",
	billing: "pebbledesk-nurture-billing",
	buying: "pebbledesk-nurture-buying",
	hr: "pebbledesk-nurture-hr",
};

/**
 * Returns the nurture sequence slug for the given magnet slug.
 * Falls back to the compliance sequence if the magnet slug is not in the catalog.
 */
export function getNurtureSequenceForMagnet(magnetSlug: string): string {
	const track = getLeadMagnetTrack(magnetSlug);
	return LEAD_MAGNET_NURTURE_SEQUENCES[track];
}

function slugToTitle(slug: string): string {
	return slug
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}
