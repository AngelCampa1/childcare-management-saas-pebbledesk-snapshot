import { FREE_RESOURCE_POLICY_COPY } from "@pebbledesk/shared/public-knowledge/emails";

export interface LeadMagnetFaqItem {
	q: string;
	a: string;
}

export function getLeadMagnetFaqItems(): LeadMagnetFaqItem[] {
	return [
		{
			q: "Is this really free?",
			a: FREE_RESOURCE_POLICY_COPY.freeResourceAnswer,
		},
		{
			q: "What format is it in?",
			a: FREE_RESOURCE_POLICY_COPY.formatAnswer,
		},
		{
			q: "What emails will I receive?",
			a: FREE_RESOURCE_POLICY_COPY.deliveryAnswer,
		},
		{
			q: "Do I need to create an account?",
			a: FREE_RESOURCE_POLICY_COPY.noAccountRequired,
		},
	];
}
