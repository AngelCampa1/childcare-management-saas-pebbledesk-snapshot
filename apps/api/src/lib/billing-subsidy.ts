import { toLocalDay } from "@pebbledesk/shared";

type AttendanceEntry = {
	checkedInAt: Date;
	checkedOutAt: Date | null;
};

type ReconciliationCase = {
	rateDaily: number | null;
	rateWeekly: number | null;
	authorizedHoursWeekly: number | null;
};

export function computeInvoiceTotals(
	lineItems: Array<{ amount: number | string }>,
	subsidyCredit: number | string,
) {
	const subtotalCents = lineItems.reduce(
		(sum, item) => sum + Math.round(Number(item.amount) * 100),
		0,
	);
	const amountDueCents = Math.max(0, subtotalCents - Math.round(Number(subsidyCredit) * 100));

	return { subtotal: subtotalCents / 100, amountDue: amountDueCents / 100 };
}

export function summarizeAttendance(entries: AttendanceEntry[], timezone: string) {
	const dayKeys = new Set<string>();
	const hoursAttended = entries.reduce((sum, entry) => {
		dayKeys.add(toLocalDay(entry.checkedInAt, timezone));

		if (!entry.checkedOutAt) {
			return sum;
		}

		const durationMs = entry.checkedOutAt.getTime() - entry.checkedInAt.getTime();
		if (durationMs <= 0) {
			return sum;
		}

		return sum + durationMs / 3_600_000;
	}, 0);

	return {
		daysAttended: dayKeys.size,
		hoursAttended: Number(hoursAttended.toFixed(2)),
	};
}

export function filterAttendanceEntriesForPeriod(
	entries: AttendanceEntry[],
	periodStart: string,
	periodEnd: string,
	timezone: string,
) {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

	return entries.filter((entry) => {
		const localDate = formatter.format(entry.checkedInAt);
		return localDate >= periodStart && localDate <= periodEnd;
	});
}

export function computeClaimAmount(
	subsidyCase: ReconciliationCase,
	attendance: { daysAttended: number; hoursAttended: number },
) {
	if (typeof subsidyCase.rateDaily === "number") {
		return {
			amountClaimed: Number((attendance.daysAttended * subsidyCase.rateDaily).toFixed(2)),
			requiresManualAmount: false,
			rateType: "daily" as const,
		};
	}

	if (
		typeof subsidyCase.rateWeekly === "number" &&
		typeof subsidyCase.authorizedHoursWeekly === "number" &&
		subsidyCase.authorizedHoursWeekly > 0
	) {
		return {
			amountClaimed: Number(
				(
					(attendance.hoursAttended / subsidyCase.authorizedHoursWeekly) *
					subsidyCase.rateWeekly
				).toFixed(2),
			),
			requiresManualAmount: false,
			rateType: "weekly" as const,
		};
	}

	return {
		amountClaimed: 0,
		requiresManualAmount: true,
		rateType: "manual" as const,
	};
}
