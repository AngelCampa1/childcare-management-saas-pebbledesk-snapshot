import { describe, expect, it } from "vitest";
import {
	buildAlternativeComparisonRows,
	buildPricingComparisonRows,
	buildVersusComparisonRows,
	buildVersusComparisonTable,
} from "./comparison-rows";

describe("buildAlternativeComparisonRows", () => {
	it("returns 6 rows with correct features", () => {
		const rows = buildAlternativeComparisonRows("$300/mo", undefined, "$49/mo");
		expect(rows).toHaveLength(6);
		expect(rows[0]).toEqual({
			feature: "Monthly cost (small center)",
			values: ["$300/mo", "$49/mo"],
		});
		expect(rows[1]).toEqual({
			feature: "Setup fee",
			values: ["Varies", "$0"],
		});
		expect(rows[2]).toEqual({
			feature: "Time to set up",
			values: ["Days to weeks", "15 minutes"],
		});
		expect(rows[3]).toEqual({
			feature: "Contract",
			values: ["Varies", "Month-to-month"],
		});
		expect(rows[4]).toEqual({
			feature: "Subsidy reporting",
			values: ["Limited/Manual", "Automated"],
		});
		expect(rows[5]).toEqual({
			feature: "Built for",
			values: ["Parent engagement", "Compliance & admin"],
		});
	});

	it("defaults setup fee to 'Varies' when undefined", () => {
		const rows = buildAlternativeComparisonRows("$300/mo", undefined, "$49/mo");
		expect(rows[1].values[0]).toBe("Varies");
	});

	it("uses actual setup fee when provided", () => {
		const rows = buildAlternativeComparisonRows("$300/mo", "$500", "$49/mo");
		expect(rows[1].values[0]).toBe("$500");
	});
});

describe("buildVersusComparisonRows", () => {
	it("returns winner-oriented rows with 3 values each", () => {
		const rows = buildVersusComparisonRows("$300", "$200", "$49");
		expect(rows).toHaveLength(5);
		expect(rows[0]).toEqual({
			feature: "Monthly cost (small center)",
			values: ["$300", "$200", "$49"],
		});
		expect(rows[1]).toEqual({
			feature: "Compliance automation",
			values: ["Varies by setup", "Varies by setup", "Built-in"],
		});
		expect(rows[2]).toEqual({
			feature: "Audit-ready records",
			values: ["Requires configuration", "Requires configuration", "State-formatted exports"],
		});
	});
});

describe("buildVersusComparisonTable", () => {
	it("renders only the compared products and highlights PebbleDesk when PebbleDesk is product A", () => {
		const table = buildVersusComparisonTable(
			{ name: "PebbleDesk", slug: "pebbledesk", pricing: "$49" },
			{ name: "Brightwheel", slug: "brightwheel", pricing: "$199" },
			"PebbleDesk",
			"$49",
		);

		expect(table.headers).toEqual(["Feature", "PebbleDesk", "Brightwheel"]);
		expect(table.highlightColumn).toBe(1);
		expect(table.rows[0]).toEqual({
			feature: "Monthly cost (small center)",
			values: ["$49", "$199"],
		});
	});

	it("renders only the compared products and highlights PebbleDesk when PebbleDesk is product B", () => {
		const table = buildVersusComparisonTable(
			{ name: "Sandbox", slug: "sandbox", pricing: "$169" },
			{ name: "PebbleDesk", slug: "pebbledesk", pricing: "$49" },
			"PebbleDesk",
			"$49",
		);

		expect(table.headers).toEqual(["Feature", "Sandbox", "PebbleDesk"]);
		expect(table.highlightColumn).toBe(2);
		expect(table.rows[1]).toEqual({
			feature: "Compliance automation",
			values: ["Varies by setup", "Built-in"],
		});
		expect(table.rows[3]).toEqual({
			feature: "Subsidy billing",
			values: ["Often requires setup", "Built-in workflows"],
		});
	});

	it("keeps PebbleDesk as a highlighted winner column for competitor-versus-competitor pages", () => {
		const table = buildVersusComparisonTable(
			{ name: "Brightwheel", slug: "brightwheel", pricing: "$199" },
			{ name: "Procare", slug: "procare", pricing: "$299" },
			"PebbleDesk",
			"$49",
		);

		expect(table.headers).toEqual(["Feature", "Brightwheel", "Procare", "PebbleDesk"]);
		expect(table.highlightColumn).toBe(3);
		expect(table.rows[3]).toEqual({
			feature: "Subsidy billing",
			values: ["Often requires setup", "Often requires setup", "Built-in workflows"],
		});
	});
});

describe("buildPricingComparisonRows", () => {
	it("returns 4 rows with 2 values each", () => {
		const rows = buildPricingComparisonRows("$300/mo", "$49/mo");
		expect(rows).toHaveLength(4);
		expect(rows[0]).toEqual({
			feature: "Monthly cost (small center)",
			values: ["$300/mo", "$49/mo"],
		});
		expect(rows[1]).toEqual({
			feature: "Setup fee",
			values: ["Varies", "$0"],
		});
		expect(rows[2]).toEqual({
			feature: "Contract",
			values: ["Varies", "Month-to-month"],
		});
		expect(rows[3]).toEqual({
			feature: "Subsidy reporting included",
			values: ["Add-on/Limited", "Yes"],
		});
	});

	it("defaults setup fee to 'Varies' when competitorSetupFee is undefined", () => {
		const rows = buildPricingComparisonRows("$300/mo", "$49/mo", undefined);
		expect(rows[1].values[0]).toBe("Varies");
	});

	it("uses the actual setup fee value when competitorSetupFee is provided", () => {
		const rows = buildPricingComparisonRows("$300/mo", "$49/mo", "$250");
		expect(rows[1].values[0]).toBe("$250");
	});
});
