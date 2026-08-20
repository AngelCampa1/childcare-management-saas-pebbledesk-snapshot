import type { LeadMagnetKnowledge } from "@pebbledesk/shared/public-knowledge";

export interface LeadMagnetPopupProps {
	title: string;
	slug: string;
	description: string;
}

/**
 * Converts a LeadMagnetKnowledge catalog entry into the shape expected by
 * ExitIntentPopup's `leadMagnet` prop.
 */
export function magnetToLeadMagnet(magnet: LeadMagnetKnowledge): LeadMagnetPopupProps {
	return {
		title: magnet.title,
		slug: magnet.slug,
		description: `Get your free ${magnet.title}. We made it for busy childcare directors.`,
	};
}
