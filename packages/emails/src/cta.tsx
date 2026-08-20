import { PEBBLEDESK_DEFAULT_SIGNUP_URL } from "@pebbledesk/shared";
import { PUBLIC_OFFER_CLAIMS } from "@pebbledesk/shared/public-knowledge/offers";
import { Button, Section, Text } from "@react-email/components";
import type React from "react";

interface NurtureCtaProps {
	href?: string;
	label: string;
	microcopy?: string;
}

export function NurtureCta({
	href,
	label,
	microcopy = PUBLIC_OFFER_CLAIMS.noCreditCardRequired,
}: NurtureCtaProps) {
	const resolvedHref = href || PEBBLEDESK_DEFAULT_SIGNUP_URL;
	return (
		<Section style={sectionStyle}>
			<Button href={resolvedHref} style={buttonStyle}>
				{label}
			</Button>
			<Text style={microcopyStyle}>{microcopy}</Text>
		</Section>
	);
}

const sectionStyle: React.CSSProperties = {
	margin: "24px 0 8px",
	textAlign: "left",
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
};

const microcopyStyle: React.CSSProperties = {
	fontSize: "13px",
	color: "#6b7280",
	margin: "10px 0 0 0",
	lineHeight: "1.5",
};
