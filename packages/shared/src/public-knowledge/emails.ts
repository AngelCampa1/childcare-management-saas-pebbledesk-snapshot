import { getPublicBrandUrl, PUBLIC_BRAND_KNOWLEDGE } from "./brand.js";
import { PUBLIC_OFFER_CLAIMS } from "./offers.js";

export const FREE_RESOURCE_POLICY_COPY = {
	freeResourceAnswer:
		"Yes, completely free. Enter your email and we'll email you a direct download link - no credit card, no trial, no strings.",
	formatAnswer: "It's a PDF you can save, print, or share with your team. Works on any device.",
	deliveryAnswer: "We'll send you the resource you requested.",
	noAccountRequired:
		"No account required. Just your email - we send the resource directly to your inbox.",
	noCreditCardRequired: PUBLIC_OFFER_CLAIMS.noCreditCardRequired,
} as const;

export const UNSUBSCRIBE_CONFIRMATION_COPY = {
	title: `Unsubscribed - ${PUBLIC_BRAND_KNOWLEDGE.name}`,
	heading: "You've been unsubscribed.",
	body: `You've been unsubscribed from ${PUBLIC_BRAND_KNOWLEDGE.name} emails.`,
	returnLabel: `Return to ${new URL(PUBLIC_BRAND_KNOWLEDGE.publicOrigin).hostname}`,
	returnHref: getPublicBrandUrl("/"),
} as const;

export const SUBSCRIPTION_TRIAL_EMAIL_COPY = {
	reminderDaysBeforeEnd: 3,
	endingSoonSubjectPrefix: "3 days left",
	endingSoonPreview: "Your PebbleDesk trial ends in 3 days.",
	endingSoonHeading: "Your trial ends in 3 days",
	startedSubject: "Your PebbleDesk trial has started",
} as const;

export function getEmailLifecyclePublicKnowledgeArtifact() {
	return {
		schemaVersion: 1,
		surface: "email-lifecycle",
		freeResourcePolicy: FREE_RESOURCE_POLICY_COPY,
		subscriptionTrial: SUBSCRIPTION_TRIAL_EMAIL_COPY,
		unsubscribe: UNSUBSCRIBE_CONFIRMATION_COPY,
	};
}
