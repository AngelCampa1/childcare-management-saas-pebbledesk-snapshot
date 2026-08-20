export const CENTER_TIMEZONE_VALUES = [
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Phoenix",
	"America/Los_Angeles",
	"America/Anchorage",
	"Pacific/Honolulu",
	"America/Indiana/Indianapolis",
	"America/Boise",
] as const;

export type CenterTimezone = (typeof CENTER_TIMEZONE_VALUES)[number];

export const DEFAULT_CENTER_TIMEZONE: CenterTimezone = "America/Chicago";

export const CENTER_TIMEZONE_OPTIONS = [
	{ value: "America/New_York", label: "Eastern Time (America/New_York)" },
	{ value: "America/Chicago", label: "Central Time (America/Chicago)" },
	{ value: "America/Denver", label: "Mountain Time (America/Denver)" },
	{ value: "America/Phoenix", label: "Mountain Time - Arizona (America/Phoenix)" },
	{ value: "America/Los_Angeles", label: "Pacific Time (America/Los_Angeles)" },
	{ value: "America/Anchorage", label: "Alaska Time (America/Anchorage)" },
	{ value: "Pacific/Honolulu", label: "Hawaii Time (Pacific/Honolulu)" },
	{
		value: "America/Indiana/Indianapolis",
		label: "Indiana Time (America/Indiana/Indianapolis)",
	},
	{ value: "America/Boise", label: "Mountain Time (America/Boise)" },
] as const satisfies ReadonlyArray<{
	value: CenterTimezone;
	label: string;
}>;

export function isSupportedCenterTimezone(timezone: string): timezone is CenterTimezone {
	return CENTER_TIMEZONE_VALUES.includes(timezone as CenterTimezone);
}
