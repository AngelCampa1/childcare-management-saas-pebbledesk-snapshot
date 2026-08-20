import type { BuyerStage, CtaAnalyticsContext } from "../types";

export type CtaClickEventProperties = Record<string, unknown> & {
	href: string;
	section: string;
	page_path: string;
	page_family?: string;
	buyer_stage?: BuyerStage;
	placement?: string;
	intent?: string;
	target?: string;
};

interface CtaClickEventPropertyInput {
	href: string;
	section: string;
	pagePath: string;
}

const CTA_ANALYTICS_ATTRIBUTE_MAP = {
	pageFamily: "data-cta-page-family",
	buyerStage: "data-cta-buyer-stage",
	placement: "data-cta-placement",
	intent: "data-cta-intent",
	target: "data-cta-target",
} as const;

type CtaAnalyticsAttributeKey = keyof typeof CTA_ANALYTICS_ATTRIBUTE_MAP;

export function buildCtaAnalyticsAttributes(context?: CtaAnalyticsContext): Record<string, string> {
	const attributes: Record<string, string> = {
		"data-cta-button": "",
	};

	if (!context) {
		return attributes;
	}

	for (const [key, attributeName] of Object.entries(CTA_ANALYTICS_ATTRIBUTE_MAP) as Array<
		[CtaAnalyticsAttributeKey, string]
	>) {
		const value = context[key];
		if (value) {
			attributes[attributeName] = value;
		}
	}

	return attributes;
}

function readCtaAnalyticsAttribute(
	element: HTMLElement,
	attributeName: string,
): string | undefined {
	const ownValue = element.getAttribute(attributeName);
	if (ownValue) {
		return ownValue;
	}

	const parentWithValue = element.closest(`[${attributeName}]`);
	const inheritedValue = parentWithValue?.getAttribute(attributeName);
	return inheritedValue || undefined;
}

export function getCtaAnalyticsContext(element: HTMLElement): CtaAnalyticsContext {
	return {
		pageFamily: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.pageFamily),
		buyerStage: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.buyerStage) as
			| BuyerStage
			| undefined,
		placement: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.placement),
		intent: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.intent),
		target: readCtaAnalyticsAttribute(element, CTA_ANALYTICS_ATTRIBUTE_MAP.target),
	};
}

export function buildCtaClickEventProperties(
	element: HTMLElement,
	input: CtaClickEventPropertyInput,
): CtaClickEventProperties {
	const context = getCtaAnalyticsContext(element);

	return {
		href: input.href,
		section: input.section,
		page_path: input.pagePath,
		...(context.pageFamily ? { page_family: context.pageFamily } : {}),
		...(context.buyerStage ? { buyer_stage: context.buyerStage } : {}),
		...(context.placement ? { placement: context.placement } : {}),
		...(context.intent ? { intent: context.intent } : {}),
		...(context.target ? { target: context.target } : {}),
	};
}
