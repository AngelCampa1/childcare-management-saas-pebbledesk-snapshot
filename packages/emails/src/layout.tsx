import {
	PEBBLEDESK_BRAND_NAME,
	PEBBLEDESK_LOGO_EMAIL_URL,
	PEBBLEDESK_POSTAL_ADDRESS,
} from "@pebbledesk/shared";
import {
	Body,
	Container,
	Font,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import type React from "react";

interface LayoutProps {
	children?: React.ReactNode;
	unsubscribeUrl?: string;
	previewText?: string;
}

export function Layout({ children, unsubscribeUrl, previewText }: LayoutProps) {
	return (
		<Html lang="en">
			<Head>
				<Font
					fontFamily="Inter"
					fallbackFontFamily="Arial"
					webFont={{
						url: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2",
						format: "woff2",
					}}
					fontWeight={400}
					fontStyle="normal"
				/>
			</Head>
			{previewText ? <Preview>{previewText}</Preview> : null}
			<Body style={bodyStyle}>
				{/* Header */}
				<Section style={headerStyle}>
					<Container style={containerStyle}>
						<Img
							alt={PEBBLEDESK_BRAND_NAME}
							src={PEBBLEDESK_LOGO_EMAIL_URL}
							style={logoImageStyle}
							width="32"
						/>
						<Text style={logoTextStyle}>{PEBBLEDESK_BRAND_NAME}</Text>
						<Text style={taglineStyle}>The Audit-Ready Childcare Platform</Text>
					</Container>
				</Section>

				{/* Content */}
				<Container style={containerStyle}>
					<Section style={contentStyle}>{children}</Section>

					{/* Footer */}
					<Hr style={dividerStyle} />
					<Section style={footerStyle}>
						<Text style={footerTextStyle}>
							You&rsquo;re receiving this email because you downloaded a resource from{" "}
							{PEBBLEDESK_BRAND_NAME}.
							{unsubscribeUrl ? (
								<>
									{" "}
									<Link href={unsubscribeUrl} style={unsubscribeLinkStyle}>
										Unsubscribe
									</Link>
									.
								</>
							) : null}
						</Text>
						<Text style={footerAddressStyle}>{PEBBLEDESK_POSTAL_ADDRESS}</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

const bodyStyle: React.CSSProperties = {
	backgroundColor: "#f9fafb",
	fontFamily: "Inter, Arial, sans-serif",
	margin: 0,
	padding: 0,
};

const headerStyle: React.CSSProperties = {
	backgroundColor: "#ffffff",
	borderBottom: "1px solid #e5e7eb",
	padding: "20px 0",
};

const containerStyle: React.CSSProperties = {
	maxWidth: "600px",
	margin: "0 auto",
	padding: "0 24px",
};

const logoImageStyle: React.CSSProperties = {
	display: "block",
	width: "32px",
	height: "auto",
	margin: "0 0 6px 0",
};

const logoTextStyle: React.CSSProperties = {
	fontSize: "20px",
	fontWeight: "700",
	color: "#243446",
	margin: "0 0 2px 0",
};

const taglineStyle: React.CSSProperties = {
	fontSize: "12px",
	color: "#6b7280",
	margin: "0",
};

const contentStyle: React.CSSProperties = {
	backgroundColor: "#ffffff",
	borderRadius: "8px",
	padding: "32px",
	margin: "24px 0",
	border: "1px solid #e5e7eb",
};

const dividerStyle: React.CSSProperties = {
	borderColor: "#e5e7eb",
	margin: "0",
};

const footerStyle: React.CSSProperties = {
	padding: "20px 0 32px",
};

const footerTextStyle: React.CSSProperties = {
	fontSize: "12px",
	color: "#9ca3af",
	margin: "0 0 8px 0",
	lineHeight: "1.5",
};

const footerAddressStyle: React.CSSProperties = {
	fontSize: "11px",
	color: "#b3b8c2",
	margin: "0",
	lineHeight: "1.5",
};

const unsubscribeLinkStyle: React.CSSProperties = {
	color: "#6b7280",
	textDecoration: "underline",
};
