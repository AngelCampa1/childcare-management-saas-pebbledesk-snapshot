import {
	DEFAULT_BILLING_CADENCE,
	getPromotionalPlanPrice,
	PAYABLE_PLANS,
	SUBSCRIPTION_PLAN_CONFIG,
	SUBSCRIPTION_PROMOTIONS,
	TRIAL_DAYS,
} from "../constants/billing.js";
import { PUBLIC_BRAND_KNOWLEDGE } from "./brand.js";
import { PUBLIC_OFFER_CLAIMS } from "./offers.js";

export function buildPublicPricingMarkdown(): string {
	const lines = [
		`# ${PUBLIC_BRAND_KNOWLEDGE.name} pricing`,
		"",
		`${PUBLIC_BRAND_KNOWLEDGE.name} is childcare administration software built around audit readiness, ratios, billing, records, and reporting. ${PUBLIC_OFFER_CLAIMS.noSetupFees} No hidden offline promises. No contracts.`,
		"",
		`Default billing cadence: ${DEFAULT_BILLING_CADENCE}.`,
		"",
		"## Limited subscription offer",
		"",
		`- Monthly code: ${SUBSCRIPTION_PROMOTIONS[0].code}`,
		`- Monthly offer: ${SUBSCRIPTION_PROMOTIONS[0].label}`,
		`- Annual code: ${SUBSCRIPTION_PROMOTIONS[1].code}`,
		`- Annual offer: ${SUBSCRIPTION_PROMOTIONS[1].label}`,
		"- Offer applies only to subscriptions.",
		"",
		"## Published self-serve plans",
		"",
	];

	for (const plan of PAYABLE_PLANS) {
		const promo = getPromotionalPlanPrice(plan);
		lines.push(
			`### ${SUBSCRIPTION_PLAN_CONFIG[plan].label}`,
			"",
			`- Price: ${promo.discountedPriceLabel} (${promo.discountedAnnualTotalLabel})`,
			`- After the first year: ${promo.renewalPriceLabel.replace(/^Then /, "")}`,
			`- Offer: ${promo.badgeLabel} with ${promo.cadence === "annual" ? SUBSCRIPTION_PROMOTIONS[1].code : SUBSCRIPTION_PROMOTIONS[0].code}`,
			"",
		);
	}

	lines.push(
		"## Enterprise note",
		"",
		"- Enterprise is for 10+ sites or custom setup. Talk with sales first.",
		"",
		"## Trial and policy notes",
		"",
		`- ${TRIAL_DAYS}-day free trial for self-serve plans`,
		`- ${PUBLIC_OFFER_CLAIMS.noCreditCardRequired}`,
		`- ${PUBLIC_OFFER_CLAIMS.moneyBackGuaranteeLabel}`,
		`- ${PUBLIC_OFFER_CLAIMS.noSetupFees}`,
		"",
	);

	return `${lines.join("\n")}`;
}
