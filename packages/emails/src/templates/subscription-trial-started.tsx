import { Heading, Text } from "@react-email/components";
import type { SubscriptionEmailVars } from "../render.js";
import { SubscriptionLayout } from "../subscription-layout.js";

export default function SubscriptionTrialStartedEmail({
	firstName,
	planLabel,
	monthlyPriceLabel,
	trialStartedAt,
	trialEndsAt,
	billingUrl,
}: SubscriptionEmailVars) {
	return (
		<SubscriptionLayout
			previewText={`Your ${planLabel} free trial started today.`}
			ctaHref={billingUrl}
			ctaLabel="Review billing"
		>
			<Heading as="h1" style={headingStyle}>
				Your {planLabel} trial is live
			</Heading>
			<Text style={bodyStyle}>{firstName ? `Hi ${firstName},` : "Hi,"}</Text>
			<Text style={bodyStyle}>
				Your PebbleDesk free trial started on {trialStartedAt}. We&apos;ll automatically charge{" "}
				{monthlyPriceLabel} on {trialEndsAt} unless you cancel before then.
			</Text>
			<Text style={bodyStyle}>
				That means you can finish setup, bring in your center records, and see the workflow with
				your real team before billing begins.
			</Text>
		</SubscriptionLayout>
	);
}

export function subject({ planLabel }: SubscriptionEmailVars) {
	return `Your ${planLabel} PebbleDesk trial has started`;
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
