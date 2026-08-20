/**
 * Short USPS state/territory abbreviations to their full human-readable names.
 * Used by the header to give `CA` (and friends) an accessible tooltip + aria
 * label so screen readers say "California" instead of "C A".
 *
 * Coverage: all 50 states, the District of Columbia, and the five inhabited
 * U.S. territories (PR, GU, VI, AS, MP) — 56 entries total.
 */
export const US_STATE_NAMES: Record<string, string> = {
	AL: "Alabama",
	AK: "Alaska",
	AZ: "Arizona",
	AR: "Arkansas",
	CA: "California",
	CO: "Colorado",
	CT: "Connecticut",
	DE: "Delaware",
	DC: "District of Columbia",
	FL: "Florida",
	GA: "Georgia",
	HI: "Hawaii",
	ID: "Idaho",
	IL: "Illinois",
	IN: "Indiana",
	IA: "Iowa",
	KS: "Kansas",
	KY: "Kentucky",
	LA: "Louisiana",
	ME: "Maine",
	MD: "Maryland",
	MA: "Massachusetts",
	MI: "Michigan",
	MN: "Minnesota",
	MS: "Mississippi",
	MO: "Missouri",
	MT: "Montana",
	NE: "Nebraska",
	NV: "Nevada",
	NH: "New Hampshire",
	NJ: "New Jersey",
	NM: "New Mexico",
	NY: "New York",
	NC: "North Carolina",
	ND: "North Dakota",
	OH: "Ohio",
	OK: "Oklahoma",
	OR: "Oregon",
	PA: "Pennsylvania",
	RI: "Rhode Island",
	SC: "South Carolina",
	SD: "South Dakota",
	TN: "Tennessee",
	TX: "Texas",
	UT: "Utah",
	VT: "Vermont",
	VA: "Virginia",
	WA: "Washington",
	WV: "West Virginia",
	WI: "Wisconsin",
	WY: "Wyoming",
	// U.S. territories (inhabited) — licensed childcare centers operate in each.
	AS: "American Samoa",
	GU: "Guam",
	MP: "Northern Mariana Islands",
	PR: "Puerto Rico",
	VI: "U.S. Virgin Islands",
};

export function resolveStateLabel(code: string): string {
	const trimmed = code.trim();
	if (!trimmed) return "";
	const upper = trimmed.toUpperCase();
	return US_STATE_NAMES[upper] ?? trimmed;
}
