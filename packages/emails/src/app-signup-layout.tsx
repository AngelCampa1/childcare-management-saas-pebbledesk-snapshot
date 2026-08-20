import { PEBBLEDESK_BRAND_NAME, PEBBLEDESK_LOGO_EMAIL_URL } from "@pebbledesk/shared";
import {
	Body,
	Button,
	Container,
	Head,
	Html,
	Img,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import type React from "react";

interface AppSignupLayoutProps {
	children?: React.ReactNode;
	previewText: string;
	ctaHref: string;
	ctaLabel: string;
}

export function AppSignupLayout({
	children,
	previewText,
	ctaHref,
	ctaLabel,
}: AppSignupLayoutProps) {
	return (
		<Html lang="en">
			<Head />
			<Preview>{previewText}</Preview>
			<Body style={bodyStyle}>
				<Container style={containerStyle}>
					<Section style={panelStyle}>
						<Img
							alt={PEBBLEDESK_BRAND_NAME}
							src={PEBBLEDESK_LOGO_EMAIL_URL}
							style={logoImageStyle}
							width="32"
						/>
						<Text style={logoTextStyle}>{PEBBLEDESK_BRAND_NAME}</Text>
						<Text style={eyebrowStyle}>PebbleDesk trial setup</Text>
						{children}
						<Button href={ctaHref} style={buttonStyle}>
							{ctaLabel}
						</Button>
					</Section>
					<Text style={footerStyle}>
						You&apos;re receiving this email because you created a PebbleDesk account. You can
						unsubscribe from trial setup emails at any time.
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

const bodyStyle: React.CSSProperties = {
	backgroundColor: "#f6f3ef",
	margin: 0,
	padding: "24px 0",
	fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
};

const containerStyle: React.CSSProperties = {
	maxWidth: "600px",
	margin: "0 auto",
	padding: "0 16px",
};

const panelStyle: React.CSSProperties = {
	backgroundColor: "#ffffff",
	border: "1px solid #e7e0d7",
	borderRadius: "12px",
	padding: "32px",
};

const logoImageStyle: React.CSSProperties = {
	display: "block",
	width: "32px",
	height: "auto",
	margin: "0 0 6px 0",
};

const logoTextStyle: React.CSSProperties = {
	color: "#243446",
	fontSize: "20px",
	fontWeight: "700",
	margin: "0 0 12px 0",
};

const eyebrowStyle: React.CSSProperties = {
	color: "#8b5e34",
	fontSize: "12px",
	fontWeight: "700",
	letterSpacing: "0.08em",
	textTransform: "uppercase",
	margin: "0 0 12px 0",
};

const buttonStyle: React.CSSProperties = {
	backgroundColor: "#1f5f4a",
	borderRadius: "8px",
	color: "#ffffff",
	fontSize: "14px",
	fontWeight: "600",
	padding: "12px 20px",
	textDecoration: "none",
};

const footerStyle: React.CSSProperties = {
	color: "#7c6f63",
	fontSize: "12px",
	lineHeight: "18px",
	margin: "16px 8px 0",
	textAlign: "center",
};
