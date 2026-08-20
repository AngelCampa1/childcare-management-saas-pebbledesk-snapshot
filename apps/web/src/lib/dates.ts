/**
 * Returns today's date in the given IANA timezone as a "YYYY-MM-DD" string,
 * using Intl.DateTimeFormat with the "en-CA" locale (which naturally produces
 * ISO date format). This avoids the UTC-shift bug that occurs when using
 * new Date().toISOString().split("T")[0].
 */
export function formatLocalDate(timeZone: string): string {
	try {
		return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
	} catch {
		return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
	}
}

/**
 * Returns the current date and time in the given IANA timezone as a
 * "YYYY-MM-DDTHH:MM" string suitable for a datetime-local input's value.
 * This avoids the UTC-bias bug from new Date().toISOString().slice(0, 16).
 */
export function formatLocalDatetime(timeZone: string): string {
	const now = new Date();
	try {
		const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
		const time = new Intl.DateTimeFormat("en-GB", {
			timeZone,
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).format(now);
		return `${date}T${time}`;
	} catch {
		const date = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(now);
		const time = new Intl.DateTimeFormat("en-GB", {
			timeZone: "UTC",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).format(now);
		return `${date}T${time}`;
	}
}
