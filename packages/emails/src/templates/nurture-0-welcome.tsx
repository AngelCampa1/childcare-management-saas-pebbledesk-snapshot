import { PEBBLEDESK_DEFAULT_SIGNUP_URL } from "@pebbledesk/shared";
import { Button, Link, Text } from "@react-email/components";
import type React from "react";
import { Layout } from "../layout.js";
import type { TemplateVars } from "../render.js";

export const subject = (vars: TemplateVars) => `Your ${vars.magnetTitle}`;

export default function NurtureWelcome({
	firstName,
	magnetTitle,
	downloadUrl,
	unsubscribeUrl,
	signupUrl,
}: TemplateVars) {
	const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
	const tourUrl = signupUrl ?? PEBBLEDESK_DEFAULT_SIGNUP_URL;

	return (
		<Layout unsubscribeUrl={unsubscribeUrl} previewText={`Your copy of ${magnetTitle} is ready.`}>
			<Text style={greetingStyle}>{greeting}</Text>

			<Text style={bodyStyle}>
				Your copy of <strong>{magnetTitle}</strong> is ready. I'm glad you grabbed it.
			</Text>

			<Text style={bodyStyle}>
				A lot of directors tell me they spend hours every week checking ratios, updating paper logs,
				and worrying about what an unexpected licensing visit would uncover. That's exactly the
				problem this guide addresses. Keep it handy. It's the kind of reference you'll reach for
				more than once.
			</Text>

			{downloadUrl ? (
				<Button href={downloadUrl} style={buttonStyle}>
					Download Your Guide
				</Button>
			) : null}

			<Text style={bodyStyle}>
				If you have questions about licensing requirements, documentation, or anything else, just
				reply to this email. I read every response.
			</Text>

			<Text style={signatureStyle}>
				Warm regards,
				<br />
				The PebbleDesk Team
			</Text>

			<Text style={secondaryCtaStyle}>
				Curious how PebbleDesk handles this for you?{" "}
				<Link href={tourUrl} style={secondaryCtaLinkStyle}>
					See it in action &rarr;
				</Link>
			</Text>

			{downloadUrl ? (
				<Text style={plainTextLinkStyle}>
					If the button above doesn't work, copy and paste this link into your browser:{" "}
					<Link href={downloadUrl}>{downloadUrl}</Link>
				</Text>
			) : null}
		</Layout>
	);
}

const greetingStyle: React.CSSProperties = {
	fontSize: "16px",
	color: "#111827",
	margin: "0 0 16px 0",
	fontWeight: "600",
};

const bodyStyle: React.CSSProperties = {
	fontSize: "15px",
	color: "#374151",
	lineHeight: "1.6",
	margin: "0 0 16px 0",
};

const buttonStyle: React.CSSProperties = {
	backgroundColor: "#1a3d6e",
	color: "#ffffff",
	borderRadius: "6px",
	padding: "12px 24px",
	fontSize: "15px",
	fontWeight: "600",
	textDecoration: "none",
	display: "inline-block",
	margin: "8px 0 24px",
};

const signatureStyle: React.CSSProperties = {
	fontSize: "15px",
	color: "#374151",
	lineHeight: "1.6",
	margin: "24px 0 0 0",
};

const secondaryCtaStyle: React.CSSProperties = {
	fontSize: "14px",
	color: "#6b7280",
	lineHeight: "1.6",
	margin: "24px 0 0 0",
	paddingTop: "20px",
	borderTop: "1px solid #f3f4f6",
};

const secondaryCtaLinkStyle: React.CSSProperties = {
	color: "#1a3d6e",
	fontWeight: "600",
	textDecoration: "underline",
};

const plainTextLinkStyle: React.CSSProperties = {
	fontSize: "12px",
	color: "#9ca3af",
	margin: "16px 0 0 0",
	wordBreak: "break-all",
};
