import {
	getDefaultMagnetForTrack,
	getLeadMagnetTrack,
	type LeadMagnetTrack,
} from "@pebbledesk/shared/public-knowledge";
import type { LeadMagnet } from "../types.js";
import { magnetToLeadMagnet } from "./magnet-to-lead-magnet.js";

/**
 * Resolves the lead magnet to show in the exit-intent popup for a page.
 *
 * When a `track` is known, the popup serves that track's default magnet so the
 * offer matches the page the visitor is reading. When no track is available,
 * the page's own configured `fallback` magnet is used.
 *
 * Centralising this here keeps the resolution identical across every layout and
 * route so the two branches cannot drift apart.
 */
export function resolvePopupMagnet(
	track: LeadMagnetTrack | undefined,
	fallback: LeadMagnet | undefined,
): LeadMagnet | undefined {
	return track ? magnetToLeadMagnet(getDefaultMagnetForTrack(track)) : fallback;
}

/**
 * Resolves the popup magnet for a /free/[slug] lead magnet page, where the
 * relevant track is the captured magnet's own track.
 */
export function resolvePopupMagnetForSlug(magnetSlug: string): LeadMagnet {
	return magnetToLeadMagnet(getDefaultMagnetForTrack(getLeadMagnetTrack(magnetSlug)));
}
