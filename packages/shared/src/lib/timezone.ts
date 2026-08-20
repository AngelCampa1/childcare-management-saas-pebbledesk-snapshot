/**
 * Returns the UTC offset of the given IANA timezone at the given instant, in
 * milliseconds (positive = ahead of UTC). Accurate to the second, so it handles
 * sub-hour offsets and DST transitions correctly — unlike sampling a single
 * fixed hour of the day, which breaks on DST-transition days.
 */
function tzOffsetMs(instant: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(instant);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour"),
		get("minute"),
		get("second"),
	);
	return asUtc - instant.getTime();
}

/**
 * Returns the UTC Date that corresponds to midnight in the given IANA timezone
 * on the given "YYYY-MM-DD" date string.
 */
export function toUtcMidnightForLocalDate(dateStr: string, timeZone: string): Date {
	// Wall-clock target: midnight on dateStr, read as if it were a UTC instant.
	const targetWallClock = new Date(`${dateStr}T00:00:00Z`).getTime();
	// First guess: subtract the offset sampled at the target instant.
	const guessOffset = tzOffsetMs(new Date(targetWallClock), timeZone);
	let result = targetWallClock - guessOffset;
	// Re-sample at the candidate instant. If the offset differs (the first
	// correction crossed a DST boundary), use the corrected offset.
	const resultOffset = tzOffsetMs(new Date(result), timeZone);
	if (resultOffset !== guessOffset) {
		result = targetWallClock - resultOffset;
	}
	return new Date(result);
}

/**
 * Returns "YYYY-MM-DD" string in the given timezone for a UTC Date.
 */
export function toLocalDay(date: Date, timeZone: string): string {
	return date.toLocaleDateString("sv-SE", { timeZone }); // "YYYY-MM-DD"
}
