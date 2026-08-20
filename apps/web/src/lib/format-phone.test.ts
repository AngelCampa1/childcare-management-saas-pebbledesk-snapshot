import { describe, expect, it } from "vitest";
import { formatPhoneNumber } from "./format-phone";

describe("formatPhoneNumber", () => {
	it("formats 10-digit US phone numbers", () => {
		expect(formatPhoneNumber("5125550111")).toBe("(512) 555-0111");
	});

	it("formats leading-country-code US phone numbers", () => {
		expect(formatPhoneNumber("15125550111")).toBe("+1 (512) 555-0111");
	});

	it("preserves non-standard phone strings", () => {
		expect(formatPhoneNumber("555-0100 ext 2")).toBe("555-0100 ext 2");
	});
});
