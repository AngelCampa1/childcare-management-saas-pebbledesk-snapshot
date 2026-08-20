import type { MigrationPreset } from "./types";

// ---------------------------------------------------------------------------
// Shared transforms
// ---------------------------------------------------------------------------

/** Parse MM/DD/YYYY → YYYY-MM-DD. Returns original value if format is unrecognized. */
function parseMDYtoISO(value: string): string {
	const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
	if (!match) return value;
	const [, month, day, year] = match;
	return `${year}-${month}-${day}`;
}

/** Strip non-digits and reformat to (XXX) XXX-XXXX if 10 digits, else pass through. */
function normalizePhone(value: string): string {
	const digits = value.replace(/\D/g, "");
	if (digits.length === 10) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Brightwheel children preset
// ---------------------------------------------------------------------------

export const brightwheelChildrenPreset: MigrationPreset = {
	sourceName: "Brightwheel",
	entity: "children",
	columnMap: {
		"First Name": "firstName",
		"Last Name": "lastName",
		"Date of Birth": "dateOfBirth",
		Status: "enrollmentStatus",
		"Subsidy Eligible": "subsidyEligible",
		// "Classroom" is intentionally omitted — no matching PebbleDesk field
	},
	valueTransforms: {
		dateOfBirth: parseMDYtoISO,
		enrollmentStatus: (value) => {
			const map: Record<string, string> = {
				Active: "active",
				Inactive: "inactive",
				Waitlist: "waitlist",
			};
			return map[value] ?? value.toLowerCase();
		},
		subsidyEligible: (value) => {
			if (value === "Yes") return "true";
			if (value === "No") return "false";
			return value;
		},
	},
};

// ---------------------------------------------------------------------------
// Brightwheel guardians preset
// ---------------------------------------------------------------------------

export const brightwheelGuardiansPreset: MigrationPreset = {
	sourceName: "Brightwheel",
	entity: "guardians",
	columnMap: {
		"Contact First Name": "firstName",
		"Contact Last Name": "lastName",
		Email: "email",
		Phone: "phone",
	},
	valueTransforms: {
		phone: normalizePhone,
	},
};
