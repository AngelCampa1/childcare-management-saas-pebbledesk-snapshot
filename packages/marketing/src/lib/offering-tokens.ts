import {
	formatPlanCapacityClaim,
	getPromotionalPlanPrice,
	getPromotionalPriceLabel,
	type PayablePlan,
	PEBBLEDESK_OFFERING,
} from "@pebbledesk/shared/constants";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";

/**
 * Token vocabulary for interpolating PEBBLEDESK_OFFERING values into markdown content.
 *
 * Tokens use the form {{namespace.key}} and are resolved at build time via the
 * remark plugin (prose) and Zod schema transforms (frontmatter strings).
 *
 * Supported tokens:
 *   {{plan.<id>.label}}       : plan display name, e.g. "Center Starter"
 *   {{plan.<id>.tagline}}     : plan one-line description
 *   {{plan.<id>.priceLabel}}  : promotional price plus renewal price
 *   {{plan.<id>.promoPriceLabel}} : promotional price only (annual, default)
 *   {{plan.<id>.renewalPriceLabel}} : regular price after the first year
 *   {{plan.<id>.capacityLabel}} : plan capacity label from shared entitlements
 *   {{promo.code}}            : promotion code
 *   {{promo.label}}           : promotion description
 *   {{promo.urgencyLabel}}    : promo prefix
 *   {{promo.durationLabel}}   : duration description
 *   {{trial.label}}           : trial label
 *   {{trial.days}}            : number of trial days as a string
 *   {{trial.reminderLabel}}   : trial reminder sentence
 *   {{trial.disclosure}}      : trial disclosure sentence
 *   {{trial.startDisclosure}} : trial disclosure sentence with CTA prefix
 *   {{claim.onlineOnlyV1}}    : online-only V1 scope claim
 *   {{claim.stateSupport}}    : verified state-support scope claim
 *   {{claim.migrationSupport}} : migration support claim
 *   {{claim.quickBooksSupport}} : QuickBooks support claim
 *   {{brand.publicOrigin}}  : public marketing origin
 *   {{brand.appOrigin}}     : product app origin
 *   {{brand.domain}}        : public marketing hostname
 *   {{guarantee.label}}       : guarantee label
 *   {{guarantee.days}}        : number of guarantee days as a string
 *   {{positioning.tagline}}   : top-level product tagline
 *   {{positioning.targetAudience}} : target audience sentence
 */

const PAYABLE_IDS: readonly PayablePlan[] = ["home", "center_starter", "center_pro", "group"];

function buildTokenMap(): Record<string, string> {
	const map: Record<string, string> = {};

	for (const id of PAYABLE_IDS) {
		const plan = PEBBLEDESK_OFFERING.plans.find((p) => p.id === id);
		if (!plan) continue;
		map[`{{plan.${id}.label}}`] = plan.label;
		map[`{{plan.${id}.tagline}}`] = plan.tagline;
		const promoPrice = getPromotionalPlanPrice(id as PayablePlan);
		map[`{{plan.${id}.priceLabel}}`] =
			`${promoPrice.discountedPriceLabel}, ${promoPrice.renewalPriceLabel.toLowerCase()}`;
		map[`{{plan.${id}.promoPriceLabel}}`] = getPromotionalPriceLabel(id as PayablePlan);
		map[`{{plan.${id}.renewalPriceLabel}}`] = promoPrice.renewalPriceLabel;
		map[`{{plan.${id}.capacityLabel}}`] = formatPlanCapacityClaim(id);
	}

	// Enterprise (non-payable)
	const enterprise = PEBBLEDESK_OFFERING.plans.find((p) => p.id === "enterprise");
	if (enterprise) {
		map["{{plan.enterprise.label}}"] = enterprise.label;
		map["{{plan.enterprise.tagline}}"] = enterprise.tagline;
		map["{{plan.enterprise.priceLabel}}"] = "Custom";
	}

	const { promotion, trial, guarantee, positioning } = PEBBLEDESK_OFFERING;
	map["{{promo.code}}"] = promotion.code;
	map["{{promo.label}}"] = promotion.label;
	map["{{promo.urgencyLabel}}"] = promotion.urgencyLabel;
	map["{{promo.durationLabel}}"] = promotion.durationLabel;
	map["{{trial.label}}"] = trial.label;
	map["{{trial.days}}"] = String(trial.days);
	map["{{trial.reminderLabel}}"] = PEBBLEDESK_OFFERING.claims.trialReminderLabel;
	map["{{trial.disclosure}}"] = PEBBLEDESK_OFFERING.claims.trialDisclosure;
	map["{{trial.startDisclosure}}"] = PEBBLEDESK_OFFERING.claims.trialStartDisclosure;
	map["{{claim.onlineOnlyV1}}"] = PEBBLEDESK_OFFERING.claims.onlineOnlyV1;
	map["{{claim.stateSupport}}"] = PEBBLEDESK_OFFERING.claims.stateSupport;
	map["{{claim.migrationSupport}}"] = PEBBLEDESK_OFFERING.claims.migrationSupport;
	map["{{claim.quickBooksSupport}}"] = PEBBLEDESK_OFFERING.claims.quickBooksSupport;
	map["{{brand.publicOrigin}}"] = PUBLIC_BRAND_KNOWLEDGE.publicOrigin;
	map["{{brand.appOrigin}}"] = PUBLIC_BRAND_KNOWLEDGE.appOrigin;
	map["{{brand.domain}}"] = new URL(PUBLIC_BRAND_KNOWLEDGE.publicOrigin).hostname;
	map["{{guarantee.label}}"] = guarantee.label;
	map["{{guarantee.days}}"] = String(guarantee.days);
	map["{{positioning.tagline}}"] = positioning.tagline;
	map["{{positioning.targetAudience}}"] = positioning.targetAudience;

	return map;
}

const TOKEN_MAP = buildTokenMap();

const TOKEN_PATTERN = /\{\{[^}]+\}\}/g;

/**
 * Replace all `{{token}}` placeholders in `input` with values from PEBBLEDESK_OFFERING.
 * Throws an error if an unknown token is encountered so build fails loudly.
 */
export function resolveOfferingTokens(input: string): string {
	return input.replace(TOKEN_PATTERN, (token) => {
		if (token in TOKEN_MAP) return TOKEN_MAP[token];
		throw new Error(
			`Unknown offering token "${token}". Supported tokens: ${Object.keys(TOKEN_MAP).join(", ")}`,
		);
	});
}

/**
 * Return all supported token keys (for testing and tooling).
 */
export function getSupportedOfferingTokens(): readonly string[] {
	return Object.keys(TOKEN_MAP);
}
