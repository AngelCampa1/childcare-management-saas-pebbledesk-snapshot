import type { BuyerStage, CtaAnalyticsContext, SiteConfig } from "../types";
import { resolvePublicSignupCta } from "./public-signup-cta";

export interface SidebarCtaProps {
	ctaText: string;
	ctaTarget: string;
	subtitle?: string;
	bullets?: string[];
	trustNote?: string;
	analytics: CtaAnalyticsContext;
}

export function buildSidebarCtaProps(
	config: SiteConfig,
	stage: BuyerStage,
	sourcePage: string,
): SidebarCtaProps {
	const funnelStage = config.funnel[stage];
	const cta = resolvePublicSignupCta({
		sourcePage,
		explicitTarget: funnelStage.ctaTarget,
		explicitText: funnelStage.ctaText,
	});

	return {
		ctaText: cta.text,
		ctaTarget: cta.target,
		subtitle: config.copy?.funnelCta?.subtitle,
		bullets: config.copy?.funnelCta?.benefitBullets,
		trustNote: config.copy?.funnelCta?.trustNote,
		analytics: {
			buyerStage: stage,
			intent: funnelStage.ctaMode,
			placement: "sidebar",
		},
	};
}
