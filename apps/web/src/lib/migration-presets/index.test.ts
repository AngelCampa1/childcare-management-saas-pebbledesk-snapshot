import { describe, expect, it } from "vitest";
import { brightwheelChildrenPreset, brightwheelGuardiansPreset } from "./brightwheel";
import { applyPreset, findPreset, MIGRATION_PRESETS } from "./index";
import { procareChildrenPreset, procareGuardiansPreset } from "./procare";

// ---------------------------------------------------------------------------
// findPreset
// ---------------------------------------------------------------------------

describe("findPreset", () => {
	it("returns brightwheel children preset", () => {
		const preset = findPreset("brightwheel", "children");
		expect(preset).not.toBeNull();
		expect(preset?.sourceName).toBe("Brightwheel");
		expect(preset?.entity).toBe("children");
	});

	it("returns brightwheel guardians preset", () => {
		const preset = findPreset("brightwheel", "guardians");
		expect(preset).not.toBeNull();
		expect(preset?.entity).toBe("guardians");
	});

	it("returns procare children preset", () => {
		const preset = findPreset("procare", "children");
		expect(preset).not.toBeNull();
		expect(preset?.sourceName).toBe("Procare");
		expect(preset?.entity).toBe("children");
	});

	it("returns procare guardians preset", () => {
		const preset = findPreset("procare", "guardians");
		expect(preset).not.toBeNull();
		expect(preset?.entity).toBe("guardians");
	});

	it("returns null for unknown vendor", () => {
		expect(findPreset("unknown-vendor", "children")).toBeNull();
	});

	it("returns null for known vendor but no preset for entity", () => {
		// Neither brightwheel nor procare has an invoices preset
		expect(findPreset("brightwheel", "invoices")).toBeNull();
	});

	it("returns null for procare + enroll", () => {
		expect(findPreset("procare", "enroll")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// MIGRATION_PRESETS structure
// ---------------------------------------------------------------------------

describe("MIGRATION_PRESETS", () => {
	it("has brightwheel and procare keys", () => {
		expect(Object.keys(MIGRATION_PRESETS)).toEqual(
			expect.arrayContaining(["brightwheel", "procare"]),
		);
	});

	it("brightwheel has 2 presets", () => {
		expect(MIGRATION_PRESETS.brightwheel).toHaveLength(2);
	});

	it("procare has 2 presets", () => {
		expect(MIGRATION_PRESETS.procare).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// applyPreset — Brightwheel children
// ---------------------------------------------------------------------------

describe("applyPreset — Brightwheel children", () => {
	it("maps all columns correctly", () => {
		const row = {
			"First Name": "Emma",
			"Last Name": "Torres",
			"Date of Birth": "04/14/2026",
			Classroom: "Sunflower",
			Status: "Active",
			"Subsidy Eligible": "Yes",
		};
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.firstName).toBe("Emma");
		expect(result.lastName).toBe("Torres");
		expect(result.dateOfBirth).toBe("2026-04-14");
		// Classroom is intentionally not mapped (no columnMap entry for it)
		expect(result.enrollmentStatus).toBe("active");
		expect(result.subsidyEligible).toBe("true");
	});

	it("ignores Classroom column (not in columnMap)", () => {
		const row = {
			"First Name": "Lena",
			"Last Name": "Park",
			"Date of Birth": "01/01/2020",
			Classroom: "BluebirdRoom",
			Status: "Inactive",
			"Subsidy Eligible": "No",
		};
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result).not.toHaveProperty("Classroom");
		expect(result).not.toHaveProperty("classroom");
	});

	it("skips missing source columns gracefully", () => {
		const row = {
			"First Name": "Sam",
			// Last Name is missing
			"Date of Birth": "03/15/2021",
			Status: "Waitlist",
			"Subsidy Eligible": "No",
		};
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.firstName).toBe("Sam");
		expect(result).not.toHaveProperty("lastName");
		expect(result.enrollmentStatus).toBe("waitlist");
	});

	it("transforms date from MM/DD/YYYY to YYYY-MM-DD", () => {
		const row = { "Date of Birth": "04/14/2026" };
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.dateOfBirth).toBe("2026-04-14");
	});

	it("transforms Status: Active → active", () => {
		const row = { Status: "Active" };
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.enrollmentStatus).toBe("active");
	});

	it("transforms Status: Inactive → inactive", () => {
		const row = { Status: "Inactive" };
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.enrollmentStatus).toBe("inactive");
	});

	it("transforms Status: Waitlist → waitlist", () => {
		const row = { Status: "Waitlist" };
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.enrollmentStatus).toBe("waitlist");
	});

	it("passes unknown status through lowercased", () => {
		const row = { Status: "SomethingElse" };
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.enrollmentStatus).toBe("somethingelse");
	});

	it("transforms Subsidy Eligible: Yes → true", () => {
		const row = { "Subsidy Eligible": "Yes" };
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.subsidyEligible).toBe("true");
	});

	it("transforms Subsidy Eligible: No → false", () => {
		const row = { "Subsidy Eligible": "No" };
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.subsidyEligible).toBe("false");
	});

	it("passes unknown subsidy value through", () => {
		const row = { "Subsidy Eligible": "Maybe" };
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(result.subsidyEligible).toBe("Maybe");
	});
});

// ---------------------------------------------------------------------------
// applyPreset — Brightwheel guardians
// ---------------------------------------------------------------------------

describe("applyPreset — Brightwheel guardians", () => {
	it("maps all guardian columns", () => {
		const row = {
			"Contact First Name": "Maria",
			"Contact Last Name": "Torres",
			Email: "maria@example.com",
			Phone: "5551234567",
		};
		const result = applyPreset(row, brightwheelGuardiansPreset);
		expect(result.firstName).toBe("Maria");
		expect(result.lastName).toBe("Torres");
		expect(result.email).toBe("maria@example.com");
		expect(result.phone).toBe("(555) 123-4567");
	});

	it("phone: already formatted (555) 123-4567 passes through as-is", () => {
		const row = { Phone: "(555) 123-4567" };
		const result = applyPreset(row, brightwheelGuardiansPreset);
		expect(result.phone).toBe("(555) 123-4567");
	});

	it("phone: non-numeric input passes through", () => {
		const row = { Phone: "non-numeric" };
		const result = applyPreset(row, brightwheelGuardiansPreset);
		expect(result.phone).toBe("non-numeric");
	});

	it("phone: strips hyphens and formats 10-digit number", () => {
		const row = { Phone: "555-123-4567" };
		const result = applyPreset(row, brightwheelGuardiansPreset);
		expect(result.phone).toBe("(555) 123-4567");
	});
});

// ---------------------------------------------------------------------------
// applyPreset — Procare children
// ---------------------------------------------------------------------------

describe("applyPreset — Procare children", () => {
	it("maps all columns correctly", () => {
		const row = {
			"Child First Name": "Jake",
			"Child Last Name": "Chen",
			Birthdate: "06/22/2019",
			"Enrollment Status": "Enrolled",
		};
		const result = applyPreset(row, procareChildrenPreset);
		expect(result.firstName).toBe("Jake");
		expect(result.lastName).toBe("Chen");
		expect(result.dateOfBirth).toBe("2019-06-22");
		expect(result.enrollmentStatus).toBe("active");
	});

	it("transforms Enrollment Status: Inactive → inactive", () => {
		const row = { "Enrollment Status": "Inactive" };
		const result = applyPreset(row, procareChildrenPreset);
		expect(result.enrollmentStatus).toBe("inactive");
	});

	it("transforms Enrollment Status: Waitlist → waitlist", () => {
		const row = { "Enrollment Status": "Waitlist" };
		const result = applyPreset(row, procareChildrenPreset);
		expect(result.enrollmentStatus).toBe("waitlist");
	});

	it("transforms Enrollment Status: Withdrawn → withdrawn", () => {
		const row = { "Enrollment Status": "Withdrawn" };
		const result = applyPreset(row, procareChildrenPreset);
		expect(result.enrollmentStatus).toBe("withdrawn");
	});

	it("passes unknown status through lowercased", () => {
		const row = { "Enrollment Status": "Other" };
		const result = applyPreset(row, procareChildrenPreset);
		expect(result.enrollmentStatus).toBe("other");
	});

	it("skips missing columns", () => {
		const row = { "Child First Name": "Nina" };
		const result = applyPreset(row, procareChildrenPreset);
		expect(result.firstName).toBe("Nina");
		expect(result).not.toHaveProperty("lastName");
		expect(result).not.toHaveProperty("dateOfBirth");
	});
});

// ---------------------------------------------------------------------------
// applyPreset — Procare guardians
// ---------------------------------------------------------------------------

describe("applyPreset — Procare guardians", () => {
	it("maps all guardian columns", () => {
		const row = {
			"Parent/Guardian First Name": "John",
			"Parent/Guardian Last Name": "Smith",
			"Email Address": "john@example.com",
			"Phone Number": "5559876543",
		};
		const result = applyPreset(row, procareGuardiansPreset);
		expect(result.firstName).toBe("John");
		expect(result.lastName).toBe("Smith");
		expect(result.email).toBe("john@example.com");
		expect(result.phone).toBe("(555) 987-6543");
	});

	it("phone: already formatted passes through", () => {
		const row = { "Phone Number": "(555) 987-6543" };
		const result = applyPreset(row, procareGuardiansPreset);
		expect(result.phone).toBe("(555) 987-6543");
	});

	it("phone: non-numeric passes through", () => {
		const row = { "Phone Number": "call me maybe" };
		const result = applyPreset(row, procareGuardiansPreset);
		expect(result.phone).toBe("call me maybe");
	});
});

// ---------------------------------------------------------------------------
// Date transform edge cases
// ---------------------------------------------------------------------------

describe("date transform", () => {
	it("04/14/2026 → 2026-04-14 (brightwheel)", () => {
		const result = applyPreset({ "Date of Birth": "04/14/2026" }, brightwheelChildrenPreset);
		expect(result.dateOfBirth).toBe("2026-04-14");
	});

	it("01/01/2020 → 2020-01-01 (brightwheel)", () => {
		const result = applyPreset({ "Date of Birth": "01/01/2020" }, brightwheelChildrenPreset);
		expect(result.dateOfBirth).toBe("2020-01-01");
	});

	it("06/22/2019 → 2019-06-22 (procare)", () => {
		const result = applyPreset({ Birthdate: "06/22/2019" }, procareChildrenPreset);
		expect(result.dateOfBirth).toBe("2019-06-22");
	});

	it("passes through invalid date format unchanged (brightwheel)", () => {
		const result = applyPreset({ "Date of Birth": "not-a-date" }, brightwheelChildrenPreset);
		expect(result.dateOfBirth).toBe("not-a-date");
	});

	it("passes through invalid date format unchanged (procare)", () => {
		const result = applyPreset({ Birthdate: "not-a-date" }, procareChildrenPreset);
		expect(result.dateOfBirth).toBe("not-a-date");
	});
});

// ---------------------------------------------------------------------------
// Phone transform edge cases
// ---------------------------------------------------------------------------

describe("phone transform", () => {
	it("5551234567 → (555) 123-4567", () => {
		const result = applyPreset({ Phone: "5551234567" }, brightwheelGuardiansPreset);
		expect(result.phone).toBe("(555) 123-4567");
	});

	it("(555) 123-4567 → (555) 123-4567 (already formatted)", () => {
		const result = applyPreset({ Phone: "(555) 123-4567" }, brightwheelGuardiansPreset);
		expect(result.phone).toBe("(555) 123-4567");
	});

	it("non-numeric passes through", () => {
		const result = applyPreset({ Phone: "non-numeric" }, brightwheelGuardiansPreset);
		expect(result.phone).toBe("non-numeric");
	});
});

// ---------------------------------------------------------------------------
// applyPreset — empty row
// ---------------------------------------------------------------------------

describe("applyPreset edge cases", () => {
	it("returns empty object for empty row", () => {
		const result = applyPreset({}, brightwheelChildrenPreset);
		expect(result).toEqual({});
	});

	it("ignores columns not in the preset columnMap", () => {
		const row = {
			"Unknown Column": "value",
			"Another Unknown": "value2",
			"First Name": "Alice",
		};
		const result = applyPreset(row, brightwheelChildrenPreset);
		expect(Object.keys(result)).toEqual(["firstName"]);
	});
});
