import { getLeadMagnetTrack, type LeadMagnetTrack } from "@pebbledesk/shared/public-knowledge";

/**
 * Resource hub IDs as defined in apps/site/src/config/resource-hubs.ts.
 * Inlined here to avoid a cross-package import from packages/marketing → apps/site.
 */
export type ResourceHubId =
	| "audit-licensing"
	| "subsidy-billing"
	| "attendance-ratios"
	| "staff-operations"
	| "software-buying"
	| "compare-pricing"
	| "state-local"
	| "free-tools";

/**
 * Page types that have deterministic track mappings regardless of hub association.
 * Precedence (highest → lowest):
 *   1. explicit `track` override from content frontmatter
 *   2. pageType signal (compare, childcare-software, free)
 *   3. hubId association
 *   4. fallback: "compliance"
 */
export type InferPageTrackInput = {
	/** Explicit author override from content frontmatter `track` field. */
	track?: LeadMagnetTrack;
	/** Logical page type derived from the URL route pattern. */
	pageType?: "compare" | "childcare-software" | "free" | "guide" | "feature" | "best";
	/** The magnet slug for /free/[slug] pages. */
	slug?: string;
	/** Resource hub id the page belongs to. */
	hubId?: ResourceHubId;
};

/** Hub id → track mapping. Documented precedence for overlapping hubs. */
const HUB_TRACK_MAP: Record<ResourceHubId, LeadMagnetTrack> = {
	"audit-licensing": "compliance",
	"attendance-ratios": "compliance",
	"state-local": "compliance",
	"free-tools": "compliance",
	"subsidy-billing": "billing",
	"compare-pricing": "buying",
	"software-buying": "buying",
	"staff-operations": "hr",
};

/**
 * Deterministically infers the lead magnet track for a page.
 *
 * Precedence:
 *   1. explicit `track` field (author override)
 *   2. pageType "free"  → magnet's own track via getLeadMagnetTrack(slug)
 *   3. pageType "compare" | "childcare-software" → "buying"
 *   4. hubId → HUB_TRACK_MAP lookup
 *   5. fallback → "compliance"
 */
export function inferPageTrack(input: InferPageTrackInput): LeadMagnetTrack {
	// 1. Explicit override wins unconditionally.
	if (input.track !== undefined) {
		return input.track;
	}

	// 2. /free/[slug] pages use the magnet's own track.
	if (input.pageType === "free") {
		return getLeadMagnetTrack(input.slug ?? "");
	}

	// 3. /compare/* and /childcare-software/* are always buying intent.
	if (input.pageType === "compare" || input.pageType === "childcare-software") {
		return "buying";
	}

	// 4. Hub association.
	if (input.hubId !== undefined) {
		return HUB_TRACK_MAP[input.hubId];
	}

	// 5. Fallback.
	return "compliance";
}
