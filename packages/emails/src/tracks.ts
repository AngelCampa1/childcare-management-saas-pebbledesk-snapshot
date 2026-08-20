import {
	getLeadMagnetTrack,
	LEAD_MAGNET_TRACKS,
	type LeadMagnetTrack,
} from "@pebbledesk/shared/public-knowledge/lead-magnets";

export const MAGNET_TRACKS = LEAD_MAGNET_TRACKS;

export type MagnetSlug = keyof typeof MAGNET_TRACKS;
export type MagnetTrack = LeadMagnetTrack;

/**
 * Return the nurture track assigned to a magnet slug.
 *
 * Defensive fallback: if the slug is not in the map (for example a legacy or
 * test slug), default to "compliance". Compliance is the safest default because
 * it matches the brand's core positioning and the majority of our magnets.
 */
export function getTrackForMagnet(slug: string): MagnetTrack {
	return getLeadMagnetTrack(slug);
}
