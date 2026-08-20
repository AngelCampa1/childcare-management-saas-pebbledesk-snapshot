import type { Database } from "@pebbledesk/db";
import { centers, checkIns, subsidyCases, subsidyClaims } from "@pebbledesk/db";
import { SERVICE_ALLOWED_SUBSCRIPTION_STATUSES } from "@pebbledesk/shared/constants";
import { and, eq, inArray } from "drizzle-orm";
import {
	computeClaimAmount,
	filterAttendanceEntriesForPeriod,
	summarizeAttendance,
} from "../lib/billing-subsidy.js";

const SUBSIDY_AUTO_DRAFT_SUBSCRIPTION_PLANS = [
	"trial",
	"center_starter",
	"center_pro",
	"group",
	"enterprise",
] as const;

/**
 * Returns the start (Monday) and end (Sunday) of the ISO week that preceded
 * the given date, as YYYY-MM-DD strings in UTC.
 *
 * ISO weeks start on Monday (day 1). We compute:
 *   - dayOfWeek: 0=Sun…6=Sat, normalized to ISO: Mon=1…Sun=7
 *   - daysToLastMonday = dayOfWeek (ISO) + 7  (previous week's Monday)
 */
export function getPriorISOWeekRange(now: Date): { periodStart: string; periodEnd: string } {
	// UTC day of week: 0=Sun, 1=Mon, … 6=Sat
	const utcDay = now.getUTCDay();
	// Convert to ISO: Mon=1, Tue=2, … Sun=7
	const isoDayOfWeek = utcDay === 0 ? 7 : utcDay;

	// Start of current week (this Monday, midnight UTC)
	const msPerDay = 86_400_000;
	const startOfCurrentWeek = new Date(now.getTime() - (isoDayOfWeek - 1) * msPerDay);
	startOfCurrentWeek.setUTCHours(0, 0, 0, 0);

	// Start of prior week = 7 days before current week's Monday
	const startOfPriorWeek = new Date(startOfCurrentWeek.getTime() - 7 * msPerDay);
	// End of prior week = Sunday = 6 days after start of prior week
	const endOfPriorWeek = new Date(startOfPriorWeek.getTime() + 6 * msPerDay);

	return {
		periodStart: startOfPriorWeek.toISOString().slice(0, 10),
		periodEnd: endOfPriorWeek.toISOString().slice(0, 10),
	};
}

type ActiveCaseRow = {
	id: string;
	centerId: string;
	childId: string;
	status: "active" | "pending" | "expired" | "terminated";
	rateDaily: number | null;
	rateWeekly: number | null;
	authorizedHoursWeekly: number | null;
	effectiveDate: string;
	expirationDate: string | null;
	subscriptionPlan: (typeof SUBSIDY_AUTO_DRAFT_SUBSCRIPTION_PLANS)[number] | null;
	subscriptionStatus: (typeof SERVICE_ALLOWED_SUBSCRIPTION_STATUSES)[number];
	timezone: string;
};

function isCaseEffectiveForPeriod(
	subsidyCase: Pick<ActiveCaseRow, "effectiveDate" | "expirationDate">,
	periodStart: string,
	periodEnd: string,
) {
	return (
		subsidyCase.effectiveDate <= periodEnd &&
		(!subsidyCase.expirationDate || subsidyCase.expirationDate >= periodStart)
	);
}

/**
 * Runs the weekly subsidy auto-draft job.
 *
 * Queries all active subsidy cases for centers on trial, center_starter, center_pro,
 * group, or enterprise plans, then for each case creates a draft subsidy claim for the prior ISO week if
 * one does not already exist and attendance was recorded.
 *
 * Errors are caught per-case so that a single failure does not prevent
 * subsequent cases from being processed.
 */
export async function runSubsidyAutoDraft(db: Database): Promise<void> {
	const { periodStart, periodEnd } = getPriorISOWeekRange(new Date());

	// Fetch all active subsidy cases joined to their center, filtered to
	// plans that include subsidy features, including full-access trials.
	const activeCases = (await db
		.select({
			id: subsidyCases.id,
			centerId: subsidyCases.centerId,
			childId: subsidyCases.childId,
			status: subsidyCases.status,
			rateDaily: subsidyCases.rateDaily,
			rateWeekly: subsidyCases.rateWeekly,
			authorizedHoursWeekly: subsidyCases.authorizedHoursWeekly,
			effectiveDate: subsidyCases.effectiveDate,
			expirationDate: subsidyCases.expirationDate,
			subscriptionPlan: centers.subscriptionPlan,
			subscriptionStatus: centers.subscriptionStatus,
			timezone: centers.timezone,
		})
		.from(subsidyCases)
		.innerJoin(centers, eq(subsidyCases.centerId, centers.id))
		.where(
			and(
				eq(subsidyCases.status, "active"),
				inArray(centers.subscriptionPlan, SUBSIDY_AUTO_DRAFT_SUBSCRIPTION_PLANS),
				inArray(centers.subscriptionStatus, SERVICE_ALLOWED_SUBSCRIPTION_STATUSES),
			),
		)) as ActiveCaseRow[];

	for (const subsidyCase of activeCases) {
		if (!SERVICE_ALLOWED_SUBSCRIPTION_STATUSES.includes(subsidyCase.subscriptionStatus)) {
			continue;
		}
		if (!isCaseEffectiveForPeriod(subsidyCase, periodStart, periodEnd)) {
			continue;
		}

		try {
			// Idempotency check: skip if a claim already exists for this period
			const [existingClaim] = await db
				.select({ id: subsidyClaims.id })
				.from(subsidyClaims)
				.where(
					and(
						eq(subsidyClaims.subsidyCaseId, subsidyCase.id),
						eq(subsidyClaims.periodStart, periodStart),
						eq(subsidyClaims.periodEnd, periodEnd),
					),
				)
				.limit(1);

			if (existingClaim) {
				continue;
			}

			// Fetch all attendance entries for this child at this center
			const attendanceEntries = await db
				.select({
					checkedInAt: checkIns.checkedInAt,
					checkedOutAt: checkIns.checkedOutAt,
				})
				.from(checkIns)
				.where(
					and(
						eq(checkIns.centerId, subsidyCase.centerId),
						eq(checkIns.childId, subsidyCase.childId),
					),
				);

			// Filter to the prior week period in the center's local timezone
			const periodEntries = filterAttendanceEntriesForPeriod(
				attendanceEntries,
				periodStart,
				periodEnd,
				subsidyCase.timezone,
			);

			const attendance = summarizeAttendance(periodEntries, subsidyCase.timezone);

			// Skip zero-attendance weeks — no point creating an empty draft
			if (attendance.daysAttended === 0 && attendance.hoursAttended === 0) {
				continue;
			}

			const claim = computeClaimAmount(subsidyCase, attendance);

			await db
				.insert(subsidyClaims)
				.values({
					centerId: subsidyCase.centerId,
					subsidyCaseId: subsidyCase.id,
					periodStart,
					periodEnd,
					daysAttended: attendance.daysAttended,
					hoursAttended: attendance.hoursAttended,
					amountClaimed: claim.amountClaimed,
					status: "draft",
				})
				.returning();
		} catch (err) {
			console.error(`[subsidy-auto-draft] Failed to process case ${subsidyCase.id}:`, err);
		}
	}
}
