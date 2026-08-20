import { describe, expect, it } from "vitest";
import { resolveStateLabel, US_STATE_NAMES } from "./us-states";

describe("US_STATE_NAMES", () => {
	it("covers all 50 states, DC, and the five inhabited U.S. territories", () => {
		expect(Object.keys(US_STATE_NAMES).length).toBe(56);
	});

	it("resolves common codes to full names", () => {
		expect(resolveStateLabel("CA")).toBe("California");
		expect(resolveStateLabel("ny")).toBe("New York");
		expect(resolveStateLabel(" tx ")).toBe("Texas");
		expect(resolveStateLabel("DC")).toBe("District of Columbia");
	});

	it("resolves U.S. territories to their full names", () => {
		expect(resolveStateLabel("PR")).toBe("Puerto Rico");
		expect(resolveStateLabel("GU")).toBe("Guam");
		expect(resolveStateLabel("VI")).toBe("U.S. Virgin Islands");
		expect(resolveStateLabel("AS")).toBe("American Samoa");
		expect(resolveStateLabel("MP")).toBe("Northern Mariana Islands");
	});

	it("falls back to the raw code when the value is unknown or empty", () => {
		expect(resolveStateLabel("")).toBe("");
		expect(resolveStateLabel("XX")).toBe("XX");
	});
});
