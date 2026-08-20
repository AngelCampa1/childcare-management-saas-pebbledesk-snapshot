/**
 * Given a monthly price in cents, compute the annual price.
 * Returns a formatted yearly price, with the unit label included when provided.
 * Cents are converted to dollars. The result rounds to the nearest cent.
 */
export function formatAnnualPrice(monthlyPriceCents: number, unitLabel?: string): string {
	const annualCents = monthlyPriceCents * 10;
	const dollars = annualCents / 100;
	const formatted = formatDollars(dollars);
	const unit = unitLabel ?? "";
	return `$${formatted}${unit}/yr`;
}

/**
 * Given a monthly price in cents, compute the per-month equivalent when billed annually.
 * (annual total / 12 months) formatted as a monthly equivalent.
 * Rounds to nearest cent.
 */
export function formatAnnualMonthlyEquivalent(
	monthlyPriceCents: number,
	unitLabel?: string,
): string {
	const annualCents = monthlyPriceCents * 10;
	const monthlyEquivalentCents = annualCents / 12;
	const dollars = Math.round(monthlyEquivalentCents) / 100;
	const formatted = formatDollars(dollars);
	const unit = unitLabel ?? "";
	return `~$${formatted}${unit}/mo`;
}

/**
 * Format a dollar amount, dropping trailing ".00" for whole dollars
 * but keeping cents when non-zero (e.g. "$24.90" not "$24.900").
 */
function formatDollars(dollars: number): string {
	const rounded = Math.round(dollars * 100) / 100;
	if (Number.isInteger(rounded)) {
		return String(rounded);
	}
	return rounded.toFixed(2);
}
