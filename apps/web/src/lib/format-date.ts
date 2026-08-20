/**
 * Center-zone date/time formatting helpers.
 *
 * All formatters accept an optional `centerTimezone` (IANA zone, e.g.
 * "America/Los_Angeles"). When omitted, the browser's local zone is used —
 * but production callsites should always pass the active center's zone
 * (via {@link useCenterTimezone} or by threading it through props).
 *
 * Date-only ISO strings (e.g. "2020-12-31") are treated as wall-clock dates,
 * not UTC midnight. This avoids the off-by-one shift that happens in
 * negative-UTC zones when you naively pass "2020-12-31" to `new Date()`.
 *
 * Invalid input (empty string, null, undefined, unparseable ISO) returns the
 * {@link EMPTY_DATE} sentinel rather than "Invalid Date" or throwing.
 */

import { QueryClientContext } from "@tanstack/react-query";
import { useContext } from "react";
import { type AuthSessionData, authSessionQuery } from "../hooks/use-auth-session";

/** Sentinel returned for empty/null/invalid date inputs. */
export const EMPTY_DATE = "—";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface FormatDateOptions {
	/** IANA timezone (e.g. "America/Los_Angeles"). Defaults to browser zone. */
	centerTimezone?: string;
}

/**
 * Parse an ISO into a Date that represents the same wall-clock instant the
 * caller intended:
 *
 *   - For date-only ISOs ("YYYY-MM-DD") we anchor at 12:00 UTC so every
 *     reasonable IANA zone reports the same Y/M/D calendar parts.
 *   - For full ISOs we let the Date constructor parse as usual.
 *
 * Returns `null` if the input is unusable.
 */
function parseIso(value: string | null | undefined): Date | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed === "") return null;

	if (DATE_ONLY_RE.test(trimmed)) {
		// Anchor at noon UTC so the calendar date is stable across all common zones.
		const [y, m, d] = trimmed.split("-").map(Number);
		// Reject obviously bad calendar values (e.g. month 13, day 32).
		if (m < 1 || m > 12 || d < 1 || d > 31) return null;
		const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
		return Number.isNaN(date.getTime()) ? null : date;
	}

	const date = new Date(trimmed);
	return Number.isNaN(date.getTime()) ? null : date;
}

function isDateOnly(value: string | null | undefined): boolean {
	return typeof value === "string" && DATE_ONLY_RE.test(value.trim());
}

function safeTimeZone(tz: string | undefined): string | undefined {
	if (!tz) return undefined;
	try {
		// Validate by attempting to construct a formatter.
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return tz;
	} catch {
		return "UTC";
	}
}

/** Returns a short date like "Mar 14, 2026". */
export function formatDate(iso: string | null | undefined, opts: FormatDateOptions = {}): string {
	const date = parseIso(iso);
	if (!date) return EMPTY_DATE;
	const timeZone = isDateOnly(iso) ? "UTC" : safeTimeZone(opts.centerTimezone);
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

/** Returns a 12-hour time like "9:30 AM". */
export function formatTime(iso: string | null | undefined, opts: FormatDateOptions = {}): string {
	const date = parseIso(iso);
	if (!date) return EMPTY_DATE;
	const timeZone = isDateOnly(iso) ? "UTC" : safeTimeZone(opts.centerTimezone);
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(date);
}

/** Returns a combined date+time like "Mar 14, 2026 9:30 AM". */
export function formatDateTime(
	iso: string | null | undefined,
	opts: FormatDateOptions = {},
): string {
	const date = parseIso(iso);
	if (!date) return EMPTY_DATE;
	return `${formatDate(iso, opts)} ${formatTime(iso, opts)}`;
}

/**
 * Returns a "YYYY-MM-DD" key in the center timezone — suitable for grouping
 * events into local-calendar buckets without UTC drift. Returns "" (not
 * {@link EMPTY_DATE}) for invalid input because callers use this as a map key.
 */
export function formatDateKey(
	iso: string | null | undefined,
	opts: FormatDateOptions = {},
): string {
	const date = parseIso(iso);
	if (!date) return "";
	const timeZone = isDateOnly(iso) ? "UTC" : safeTimeZone(opts.centerTimezone);
	// en-CA produces ISO-style YYYY-MM-DD.
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

/**
 * React hook returning the active center's IANA timezone, or `undefined` if
 * the auth session is not yet loaded. Callers should pass this into the
 * `centerTimezone` option of the formatter helpers above.
 *
 * Example:
 * ```ts
 * const tz = useCenterTimezone();
 * const label = formatDate(event.startsAt, { centerTimezone: tz });
 * ```
 */
/**
 * React hook returning the active center's IANA timezone, or `undefined` if
 * the auth session is not yet loaded (or if no QueryClient is in context,
 * which is the common case in unit-test render trees that don't mount a
 * QueryClientProvider). Callers should pass the result into the
 * `centerTimezone` option of the formatter helpers above.
 */
export function useCenterTimezone(): string | undefined {
	// Read the QueryClient via context directly rather than `useQueryClient()`,
	// which throws without a provider. Tests that don't mount a
	// QueryClientProvider should still be able to render components that call
	// this hook — they just get `undefined` and fall back to browser zone.
	const client = useContext(QueryClientContext);
	if (!client) return undefined;
	const cached = client.getQueryData<AuthSessionData>(authSessionQuery.queryKey);
	return cached?.center.timezone;
}
