import { SUBSCRIPTION_TRIAL_EMAIL_COPY } from "@pebbledesk/shared/public-knowledge/emails";
import { Heading, Text } from "@react-email/components";
import type { SubscriptionEmailVars } from "../render.js";
import { SubscriptionLayout } from "../subscription-layout.js";

export default function SubscriptionTrialEndingSoonEmail({
	firstName,
	planLabel,
	monthlyPriceLabel,
	trialStartedAt,
	trialEndsAt,
	billingUrl,
}: SubscriptionEmailVars) {
	return (
		<SubscriptionLayout
			previewText={SUBSCRIPTION_TRIAL_EMAIL_COPY.endingSoonPreview}
			ctaHref={billingUrl}
			ctaLabel="Manage billing"
		>
			<Heading as="h1" style={headingStyle}>
				{SUBSCRIPTION_TRIAL_EMAIL_COPY.endingSoonHeading}
			</Heading>
			<Text style={bodyStyle}>{firstName ? `Hi ${firstName},` : "Hi,"}</Text>
			<Text style={bodyStyle}>
				Your {planLabel} trial started on {trialStartedAt}. On {trialEndsAt}, PebbleDesk will charge{" "}
				{monthlyPriceLabel} automatically unless you cancel first.
			</Text>
			<Text style={bodyStyle}>
				If you want to update the card on file or make a billing change before the charge date, use
				the billing link below.
			</Text>
		</SubscriptionLayout>
	);
}

export function subject({ planLabel }: SubscriptionEmailVars) {
	return `${SUBSCRIPTION_TRIAL_EMAIL_COPY.endingSoonSubjectPrefix} in your ${planLabel} PebbleDesk trial`;
}

const headingStyle = {
	fontSize: "28px",
	lineHeight: "34px",
	color: "#1d2a23",
	margin: "0 0 16px",
};

const bodyStyle = {
	fontSize: "15px",
	lineHeight: "24px",
	color: "#4d433b",
	margin: "0 0 16px",
};
