export interface ComparisonRow {
	feature: string;
	values: string[];
}

interface VersusCompetitor {
	name: string;
	slug: string;
	pricing: string;
}

export interface ComparisonTableModel {
	headers: string[];
	rows: ComparisonRow[];
	highlightColumn: number;
}

export function buildAlternativeComparisonRows(
	competitorPricing: string,
	competitorSetupFee: string | undefined,
	ownPrice: string,
): ComparisonRow[] {
	return [
		{
			feature: "Monthly cost (small center)",
			values: [competitorPricing, ownPrice],
		},
		{ feature: "Setup fee", values: [competitorSetupFee ?? "Varies", "$0"] },
		{ feature: "Time to set up", values: ["Days to weeks", "15 minutes"] },
		{ feature: "Contract", values: ["Varies", "Month-to-month"] },
		{ feature: "Subsidy reporting", values: ["Limited/Manual", "Automated"] },
		{
			feature: "Built for",
			values: ["Parent engagement", "Compliance & admin"],
		},
	];
}

function buildTwoProductVersusRows(
	competitorA: VersusCompetitor,
	competitorB: VersusCompetitor,
): ComparisonRow[] {
	const valueFor = (
		competitor: VersusCompetitor,
		pebbleDeskValue: string,
		competitorValue: string,
	) => (competitor.slug === "pebbledesk" ? pebbleDeskValue : competitorValue);

	return [
		{
			feature: "Monthly cost (small center)",
			values: [competitorA.pricing, competitorB.pricing],
		},
		{
			feature: "Compliance automation",
			values: [
				valueFor(competitorA, "Built-in", "Varies by setup"),
				valueFor(competitorB, "Built-in", "Varies by setup"),
			],
		},
		{
			feature: "Audit-ready records",
			values: [
				valueFor(competitorA, "State-formatted exports", "Requires configuration"),
				valueFor(competitorB, "State-formatted exports", "Requires configuration"),
			],
		},
		{
			feature: "Subsidy billing",
			values: [
				valueFor(competitorA, "Built-in workflows", "Often requires setup"),
				valueFor(competitorB, "Built-in workflows", "Often requires setup"),
			],
		},
		{
			feature: "Ratio tracking",
			values: [
				valueFor(competitorA, "Real-time alerts", "Basic"),
				valueFor(competitorB, "Real-time alerts", "Basic"),
			],
		},
		{
			feature: "Migration support",
			values: [
				valueFor(competitorA, "CSV plus presets", "Varies"),
				valueFor(competitorB, "CSV plus presets", "Varies"),
			],
		},
	];
}

export function buildVersusComparisonRows(
	pricingA: string,
	pricingB: string,
	ownPrice: string,
): ComparisonRow[] {
	return [
		{
			feature: "Monthly cost (small center)",
			values: [pricingA, pricingB, ownPrice],
		},
		{
			feature: "Compliance automation",
			values: ["Varies by setup", "Varies by setup", "Built-in"],
		},
		{
			feature: "Audit-ready records",
			values: ["Requires configuration", "Requires configuration", "State-formatted exports"],
		},
		{
			feature: "Subsidy billing",
			values: ["Often requires setup", "Often requires setup", "Built-in workflows"],
		},
		{
			feature: "Migration support",
			values: ["Varies", "Varies", "CSV plus presets"],
		},
	];
}

export function buildVersusComparisonTable(
	competitorA: VersusCompetitor,
	competitorB: VersusCompetitor,
	productName: string,
	productPrice: string,
): ComparisonTableModel {
	const competitorAIsProduct = competitorA.slug === "pebbledesk";
	const competitorBIsProduct = competitorB.slug === "pebbledesk";

	if (competitorAIsProduct || competitorBIsProduct) {
		return {
			headers: ["Feature", competitorA.name, competitorB.name],
			rows: buildTwoProductVersusRows(competitorA, competitorB),
			highlightColumn: competitorAIsProduct ? 1 : 2,
		};
	}

	return {
		headers: ["Feature", competitorA.name, competitorB.name, productName],
		rows: buildVersusComparisonRows(competitorA.pricing, competitorB.pricing, productPrice),
		highlightColumn: 3,
	};
}

export function buildPricingComparisonRows(
	competitorPricing: string,
	ownPrice: string,
	competitorSetupFee?: string,
): ComparisonRow[] {
	return [
		{
			feature: "Monthly cost (small center)",
			values: [competitorPricing, ownPrice],
		},
		{ feature: "Setup fee", values: [competitorSetupFee ?? "Varies", "$0"] },
		{ feature: "Contract", values: ["Varies", "Month-to-month"] },
		{
			feature: "Subsidy reporting included",
			values: ["Add-on/Limited", "Yes"],
		},
	];
}
