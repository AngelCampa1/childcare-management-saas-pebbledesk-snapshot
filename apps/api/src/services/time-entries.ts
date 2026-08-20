import { centers, schedules, shifts, timeEntries } from "@pebbledesk/db";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { AppEnv } from "../lib/context.js";

type DbClient = AppEnv["Variables"]["db"];
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

function getDateKey(value: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(value);

	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;

	if (!year || !month || !day) {
		throw new Error(`Unable to format date for timezone ${timezone}`);
	}

	return `${year}-${month}-${day}`;
}

function getDayOfWeek(value: Date, timezone: string): number {
	const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
	const weekday = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		weekday: "short",
	}).format(value);
	const dayOfWeek = dayNames.indexOf(weekday as (typeof dayNames)[number]);

	if (dayOfWeek === -1) {
		throw new Error(`Unable to determine day of week for timezone ${timezone}`);
	}

	return dayOfWeek;
}

async function getCenterTimezone(db: DbClient | DbTransaction, centerId: string): Promise<string> {
	const [center] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);

	return center?.timezone ?? "UTC";
}

function parseTimeToMinutes(value: string): number {
	const [hours, minutes] = value.split(":").map((part) => Number(part));
	return hours * 60 + minutes;
}

function roundHours(value: number): number {
	return Math.round(value * 100) / 100;
}

export function calculateWorkedHours(clockedInAt: Date, clockedOutAt: Date): number {
	const milliseconds = Math.max(0, clockedOutAt.getTime() - clockedInAt.getTime());
	return roundHours(milliseconds / (1000 * 60 * 60));
}

export async function getScheduledHoursForDate(
	db: DbClient | DbTransaction,
	centerId: string,
	membershipId: string,
	date: Date,
	timezone?: string,
): Promise<number> {
	const centerTimezone = timezone ?? (await getCenterTimezone(db, centerId));
	const dateKey = getDateKey(date, centerTimezone);
	const dayOfWeek = getDayOfWeek(date, centerTimezone);

	const rows = await db
		.select({
			startTime: shifts.startTime,
			endTime: shifts.endTime,
		})
		.from(shifts)
		.innerJoin(
			schedules,
			and(eq(shifts.scheduleId, schedules.id), eq(schedules.centerId, centerId)),
		)
		.where(
			and(
				eq(shifts.centerId, centerId),
				eq(shifts.membershipId, membershipId),
				eq(shifts.dayOfWeek, dayOfWeek),
				lte(schedules.effectiveFrom, dateKey),
				or(isNull(schedules.effectiveUntil), sql`${schedules.effectiveUntil} >= ${dateKey}`),
			),
		);

	return roundHours(
		rows.reduce((total, row) => {
			return total + (parseTimeToMinutes(row.endTime) - parseTimeToMinutes(row.startTime)) / 60;
		}, 0),
	);
}

export async function upsertTimeEntryFromClockOut(
	db: DbClient | DbTransaction,
	input: {
		centerId: string;
		membershipId: string;
		clockedInAt: Date;
		clockedOutAt: Date;
		timezone?: string;
	},
) {
	const timezone = input.timezone ?? (await getCenterTimezone(db, input.centerId));
	const date = getDateKey(input.clockedInAt, timezone);
	const hoursWorked = calculateWorkedHours(input.clockedInAt, input.clockedOutAt);
	const hoursScheduled = await getScheduledHoursForDate(
		db,
		input.centerId,
		input.membershipId,
		input.clockedInAt,
		timezone,
	);
	const overtimeHours = roundHours(Math.max(0, hoursWorked - hoursScheduled));

	return db
		.insert(timeEntries)
		.values({
			centerId: input.centerId,
			membershipId: input.membershipId,
			date,
			hoursWorked,
			hoursScheduled,
			overtimeHours,
			status: "auto",
		})
		.onConflictDoUpdate({
			target: [timeEntries.centerId, timeEntries.membershipId, timeEntries.date],
			set: {
				hoursWorked,
				hoursScheduled,
				overtimeHours,
				status: "auto",
				updatedAt: new Date(),
			},
			setWhere: sql`${timeEntries.hoursWorked} IS DISTINCT FROM ${hoursWorked}
				OR ${timeEntries.hoursScheduled} IS DISTINCT FROM ${hoursScheduled}
				OR ${timeEntries.overtimeHours} IS DISTINCT FROM ${overtimeHours}`,
		});
}
