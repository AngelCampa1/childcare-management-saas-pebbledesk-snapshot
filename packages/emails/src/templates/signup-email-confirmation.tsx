import { Button, Heading, Text } from "@react-email/components";
import type { SignupEmailConfirmationVars } from "../render.js";
import { SubscriptionLayout } from "../subscription-layout.js";

export default function SignupEmailConfirmation({
	name,
	verificationUrl,
}: SignupEmailConfirmationVars) {
	const firstName = name?.trim().split(/\s+/)[0];
	return (
		<SubscriptionLayout
			previewText="Confirm your PebbleDesk email address."
			ctaHref={verificationUrl}
			ctaLabel="Confirm your email"
		>
			<Heading as="h1" style={headingStyle}>
				Confirm your email
			</Heading>
			<Text style={bodyStyle}>{firstName ? `Hi ${firstName},` : "Hi,"}</Text>
			<Text style={bodyStyle}>
				Please confirm this email address so your PebbleDesk account is ready for your center.
			</Text>
			<Button href={verificationUrl} style={buttonStyle}>
				Confirm your email
			</Button>
		</SubscriptionLayout>
	);
}

export function subject() {
	return "Confirm your PebbleDesk email";
}

const headingStyle = { fontSize: "28px", lineHeight: "34px", color: "#1d2a23", margin: "0 0 16px" };
const bodyStyle = { fontSize: "15px", lineHeight: "24px", color: "#4d433b", margin: "0 0 16px" };
const buttonStyle = {
	backgroundColor: "#1d2a23",
	borderRadius: "8px",
	color: "#ffffff",
	fontSize: "15px",
	fontWeight: "600",
	padding: "12px 18px",
	textDecoration: "none",
};
