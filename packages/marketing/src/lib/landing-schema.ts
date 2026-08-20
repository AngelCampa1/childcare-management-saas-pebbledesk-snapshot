import type { SiteConfig } from "../types";

interface LandingSchemaInput {
	canonicalUrl: string;
	imageUrl: string;
}

interface LandingOffer {
	price: string;
	url: string;
}

function hasNumericDigits(price: string): boolean {
	return /\d/.test(price);
}

function getSchemaReadyPricingTiers(config: SiteConfig) {
	return (config.pricingTiers ?? []).filter((tier) => hasNumericDigits(tier.price));
}

export function buildLandingProductOffers(
	config: SiteConfig,
	pricingUrl: string,
): LandingOffer[] | LandingOffer {
	const schemaReadyTiers = getSchemaReadyPricingTiers(config);

	if (schemaReadyTiers.length > 0) {
		return schemaReadyTiers.map((tier) => ({
			price: tier.price,
			url: pricingUrl,
		}));
	}

	return {
		price: config.product.price,
		url: pricingUrl,
	};
}

export function buildLandingSoftwareApplicationProps(
	config: SiteConfig,
	{ canonicalUrl, imageUrl }: LandingSchemaInput,
): {
	name: string;
	description: string;
	url: string;
	image: string;
	brand: { name: string };
	featureList?: readonly string[];
	applicationCategory: "BusinessApplication";
	operatingSystem: "Web";
	offers: { price: string; url: string };
} {
	const pricingUrl = new URL("/pricing/", canonicalUrl).toString();
	const productOffers = buildLandingProductOffers(config, pricingUrl);

	return {
		name: config.name,
		description: config.tagline,
		url: canonicalUrl,
		image: imageUrl,
		brand: { name: config.name },
		featureList: getSchemaReadyPricingTiers(config)[0]?.features,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		offers: Array.isArray(productOffers) ? productOffers[0] : productOffers,
	};
}
