import { PEBBLEDESK_OFFERING } from "../constants/offering.js";

export const PUBLIC_BRAND_KNOWLEDGE = {
	name: "PebbleDesk",
	tagline: "The Audit-Ready Childcare Platform",
	category: "Childcare Center Administration Software",
	primaryCta: `Start your ${PEBBLEDESK_OFFERING.claims.trialLabel}`,
	secondaryCta: "Compare plans",
	apiOrigin: "https://api.pebbledesk.app",
	appOrigin: "https://my.pebbledesk.app",
	publicOrigin: "https://pebbledesk.app",
	supportEmail: "angel.campa@pebbledesk.app",
	privacyEmail: "angel.campa@pebbledesk.app",
} as const;

export function getPublicBrandUrl(path = "/"): string {
	return new URL(path, PUBLIC_BRAND_KNOWLEDGE.publicOrigin).toString();
}

export function getProductAppUrl(path = "/"): string {
	return new URL(path, PUBLIC_BRAND_KNOWLEDGE.appOrigin).toString();
}

export function getProductAppOrigin(): string {
	return PUBLIC_BRAND_KNOWLEDGE.appOrigin;
}

export function getPublicApiUrl(path = "/"): string {
	return new URL(path, PUBLIC_BRAND_KNOWLEDGE.apiOrigin).toString();
}

export function getPublicApiOrigin(): string {
	return PUBLIC_BRAND_KNOWLEDGE.apiOrigin;
}

export function getPublicBrandCookieDomain(): string {
	return `.${new URL(PUBLIC_BRAND_KNOWLEDGE.publicOrigin).hostname}`;
}
