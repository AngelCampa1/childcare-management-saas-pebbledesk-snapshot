import type { PriceTierInput } from "./schema-types";

export function buildPricingTxt(opts: {
	productName: string;
	tiers: PriceTierInput[];
	updatedAt: string;
	trialText?: string;
}): string {
	const lines: string[] = [];

	lines.push(`# ${opts.productName} Pricing`);
	lines.push(`Updated: ${opts.updatedAt}`);
	lines.push("Currency: USD");

	if (opts.trialText) {
		lines.push(`Trial: ${opts.trialText}`);
	}

	for (const tier of opts.tiers) {
		lines.push("");
		lines.push(`## ${tier.name}`);
		lines.push(`Monthly: ${tier.price}`);

		if (tier.annualPriceOverride) {
			lines.push(`Annual: ${tier.annualPriceOverride}`);
		}

		if (tier.description) {
			lines.push(`Description: ${tier.description}`);
		}

		lines.push("Features:");
		for (const feature of tier.features) {
			lines.push(`- ${feature}`);
		}
	}

	return lines.join("\n");
}
