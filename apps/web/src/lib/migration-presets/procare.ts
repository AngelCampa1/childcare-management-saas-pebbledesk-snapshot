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
// Procare children preset
// ---------------------------------------------------------------------------

export const procareChildrenPreset: MigrationPreset = {
	sourceName: "Procare",
	entity: "children",
	columnMap: {
		"Child First Name": "firstName",
		"Child Last Name": "lastName",
		Birthdate: "dateOfBirth",
		"Enrollment Status": "enrollmentStatus",
	},
	valueTransforms: {
		dateOfBirth: parseMDYtoISO,
		enrollmentStatus: (value) => {
			const map: Record<string, string> = {
				Enrolled: "active",
				Inactive: "inactive",
				Waitlist: "waitlist",
				Withdrawn: "withdrawn",
			};
			return map[value] ?? value.toLowerCase();
		},
	},
};

// ---------------------------------------------------------------------------
// Procare guardians preset
// ---------------------------------------------------------------------------

export const procareGuardiansPreset: MigrationPreset = {
	sourceName: "Procare",
	entity: "guardians",
	columnMap: {
		"Parent/Guardian First Name": "firstName",
		"Parent/Guardian Last Name": "lastName",
		"Email Address": "email",
		"Phone Number": "phone",
	},
	valueTransforms: {
		phone: normalizePhone,
	},
};
