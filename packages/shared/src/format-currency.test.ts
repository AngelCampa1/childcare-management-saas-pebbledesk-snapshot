import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format-currency.js";

describe("formatCurrency", () => {
	it("formats a whole-dollar number", () => {
		expect(formatCurrency(100)).toBe("$100.00");
	});

	it("formats a decimal number", () => {
		expect(formatCurrency(9.99)).toBe("$9.99");
	});

	it("formats zero", () => {
		expect(formatCurrency(0)).toBe("$0.00");
	});

	it("formats a large value", () => {
		expect(formatCurrency(1234567.89)).toBe("$1,234,567.89");
	});

	it("accepts a numeric string", () => {
		expect(formatCurrency("49.50")).toBe("$49.50");
	});

	it("accepts a whole-dollar string", () => {
		expect(formatCurrency("200")).toBe("$200.00");
	});

	it("formats a string representing zero", () => {
		expect(formatCurrency("0")).toBe("$0.00");
	});

	it("formats a string with cents", () => {
		expect(formatCurrency("0.01")).toBe("$0.01");
	});

	it("formats negative amounts (refunds/credits)", () => {
		expect(formatCurrency(-49.5)).toBe("-$49.50");
	});
});
