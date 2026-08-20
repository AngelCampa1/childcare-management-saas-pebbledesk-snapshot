import type { CheckIn } from "@pebbledesk/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCheckInHistory } from "../hooks/use-attendance";
import { formatTime as formatTimeShared } from "../lib/format-date";

interface AttendanceCalendarProps {
	childId: string;
	timezone: string;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_HOURS = 6;

function getDateParts(date: Date, timezone: string) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;

	if (!year || !month || !day) {
		throw new Error(`Unable to format date for timezone ${timezone}`);
	}

	return {
		year: Number(year),
		month: Number(month),
		day: Number(day),
	};
}

function formatTime(isoString: string, timezone: string): string {
	return formatTimeShared(isoString, { centerTimezone: timezone });
}

function getLocalDateTimeParts(date: Date, timezone: string) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
	const year = get("year");
	const month = get("month");
	const day = get("day");
	let hour = get("hour");
	const minute = get("minute");
	const second = get("second");
	if (!year || !month || !day || !hour || !minute || !second) {
		throw new Error(`Unable to format date/time for timezone ${timezone}`);
	}
	// Some ICU versions render midnight as "24" instead of "00".
	if (hour === "24") hour = "00";
	return {
		year: Number(year),
		month: Number(month),
		day: Number(day),
		hour: Number(hour),
		minute: Number(minute),
		second: Number(second),
	};
}

function computeMsUntilNextMidnight(now: Date, timezone: string): number {
	const parts = getLocalDateTimeParts(now, timezone);
	const secondsElapsedToday = parts.hour * 3600 + parts.minute * 60 + parts.second;
	const secondsUntilMidnight = 24 * 3600 - secondsElapsedToday;
	// Guard against pathological zero/negative values.
	if (secondsUntilMidnight <= 0) return 1000;
	return secondsUntilMidnight * 1000;
}

function formatDateKey(date: Date, timezone: string): string {
	const { year, month, day } = getDateParts(date, timezone);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthStart(year: number, month: number): Date {
	return new Date(year, month, 1);
}

function getMonthEnd(year: number, month: number): Date {
	return new Date(year, month + 1, 0);
}

function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6;
}

function countWeekdaysInRange(start: Date, end: Date): number {
	let count = 0;
	const cursor = new Date(start);
	while (cursor <= end) {
		if (!isWeekend(cursor)) count++;
		cursor.setDate(cursor.getDate() + 1);
	}
	return count;
}

function calculateHours(checkIn: CheckIn): number {
	if (!checkIn.checkedOutAt) return 0;
	const ms = new Date(checkIn.checkedOutAt).getTime() - new Date(checkIn.checkedInAt).getTime();
	return ms / (1000 * 60 * 60);
}

interface DayRecord {
	checkIns: CheckIn[];
	totalHours: number;
}

function groupByDate(checkIns: CheckIn[], timezone: string): Map<string, DayRecord> {
	const map = new Map<string, DayRecord>();
	for (const ci of checkIns) {
		const date = formatDateKey(new Date(ci.checkedInAt), timezone);
		const existing = map.get(date) ?? { checkIns: [], totalHours: 0 };
		existing.checkIns.push(ci);
		existing.totalHours += calculateHours(ci);
		map.set(date, existing);
	}
	return map;
}

interface CalendarCell {
	key: string;
	day: number | null;
}

function buildCalendarGrid(year: number, month: number): CalendarCell[] {
	const firstDay = getMonthStart(year, month).getDay();
	const lastDate = getMonthEnd(year, month).getDate();
	const cells: CalendarCell[] = [];
	for (let i = 0; i < firstDay; i++) {
		cells.push({ key: `pad-${year}-${month}-${i}`, day: null });
	}
	for (let d = 1; d <= lastDate; d++) {
		const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
		cells.push({ key: dateStr, day: d });
	}
	return cells;
}

interface DayCellProps {
	day: number;
	year: number;
	month: number;
	record: DayRecord | undefined;
	isToday: boolean;
	isSelected: boolean;
	onClick: () => void;
}

function DayCell({ day, year, month, record, isToday, isSelected, onClick }: DayCellProps) {
	const date = new Date(year, month, day);
	const weekend = isWeekend(date);

	let bgClass = "bg-muted/40 text-muted-foreground";
	if (!weekend && record) {
		if (record.totalHours >= FULL_DAY_HOURS) {
			bgClass = "bg-success/15 text-success";
		} else {
			bgClass = "bg-warning/15 text-warning";
		}
	} else if (weekend) {
		bgClass = "bg-muted/40 text-muted-foreground/70";
	}

	const ringClass = isToday ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "";
	const selectedClass = isSelected
		? "ring-2 ring-primary ring-offset-2 ring-offset-background"
		: "";
	const cursor = record ? "cursor-pointer" : "cursor-default";

	return (
		<button
			type="button"
			onClick={record ? onClick : undefined}
			className={`
				aspect-square rounded-lg flex flex-col items-center justify-center
				transition-transform duration-150 select-none
				${bgClass} ${ringClass} ${selectedClass} ${cursor}
				${record ? "motion-safe:hover:scale-105 hover:shadow-sm" : ""}
			`}
		>
			<span className="text-xs font-semibold leading-none">{day}</span>
			{record && record.totalHours > 0 && (
				<span className="text-[10px] leading-none mt-0.5 opacity-70">
					{record.totalHours.toFixed(1)}h
				</span>
			)}
		</button>
	);
}

interface DayDetailPanelProps {
	day: number;
	year: number;
	month: number;
	record: DayRecord;
	timezone: string;
}

function DayDetailPanel({ day, year, month, record, timezone }: DayDetailPanelProps) {
	const date = new Date(Date.UTC(year, month, day, 12));
	const dateLabel = date.toLocaleDateString("en-US", {
		timeZone: timezone,
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	return (
		<div className="overflow-hidden transition-all duration-250">
			<div className="space-y-3 rounded-lg border border-border bg-primary/5 p-4">
				<p className="text-sm font-semibold text-primary">{dateLabel}</p>
				{record.checkIns.map((ci) => {
					const hours = calculateHours(ci);
					return (
						<div key={ci.id} className="space-y-1.5 text-sm">
							<div className="grid grid-cols-2 gap-x-4 gap-y-1">
								<span className="font-medium text-primary">Check-in</span>
								<span className="text-foreground">{formatTime(ci.checkedInAt, timezone)}</span>
								{ci.checkedOutAt && (
									<>
										<span className="font-medium text-primary">Check-out</span>
										<span className="text-foreground">{formatTime(ci.checkedOutAt, timezone)}</span>
									</>
								)}
								<span className="font-medium text-primary">Total hours</span>
								<span className="text-foreground">
									{ci.checkedOutAt ? `${hours.toFixed(2)} hrs` : "Still checked in"}
								</span>
								<span className="font-medium text-primary">Checked in by</span>
								<span className="truncate text-foreground">{ci.checkedInBy}</span>
								{ci.checkedOutBy && (
									<>
										<span className="font-medium text-primary">Checked out by</span>
										<span className="truncate text-foreground">{ci.checkedOutBy}</span>
									</>
								)}
							</div>
							{ci.notes && (
								<p className="mt-1 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
									{ci.notes}
								</p>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface StatCardProps {
	label: string;
	value: string;
}

function StatCard({ label, value }: StatCardProps) {
	return (
		<Card>
			<CardContent className="p-4 text-center">
				<p className="text-2xl font-bold text-foreground">{value}</p>
				<p className="mt-1 text-xs text-muted-foreground">{label}</p>
			</CardContent>
		</Card>
	);
}

export function AttendanceCalendar({ childId, timezone }: AttendanceCalendarProps) {
	const [nowTick, setNowTick] = useState(() => Date.now());
	const today = new Date(nowTick);
	const localToday = getDateParts(today, timezone);
	const [year, setYear] = useState(localToday.year);
	const [month, setMonth] = useState(localToday.month - 1);
	const [selectedDay, setSelectedDay] = useState<number | null>(null);
	const [gridVisible, setGridVisible] = useState(true);
	const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (navTimeoutRef.current !== null) {
				clearTimeout(navTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const scheduleNext = () => {
			const msUntilMidnight = computeMsUntilNextMidnight(new Date(), timezone);
			timeoutId = setTimeout(() => {
				setNowTick(Date.now());
				scheduleNext();
			}, msUntilMidnight + 1000);
		};
		scheduleNext();
		return () => {
			if (timeoutId !== null) clearTimeout(timeoutId);
		};
	}, [timezone]);

	useEffect(() => {
		const nextLocalToday = getDateParts(new Date(), timezone);
		setYear(nextLocalToday.year);
		setMonth(nextLocalToday.month - 1);
		setSelectedDay(null);
	}, [timezone]);

	const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
	const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(
		getMonthEnd(year, month).getDate(),
	).padStart(2, "0")}`;

	const { data: checkIns, isLoading } = useCheckInHistory(childId, from, to);

	const byDate = groupByDate(checkIns ?? [], timezone);

	const daysAttended = byDate.size;
	const visibleMonthStart = getMonthStart(year, month);
	const visibleMonthEnd = getMonthEnd(year, month);
	const localTodayDate = new Date(localToday.year, localToday.month - 1, localToday.day);
	const currentMonthCutoff =
		year === localToday.year && month === localToday.month - 1 ? localTodayDate : visibleMonthEnd;
	const weekdaysInMonth = countWeekdaysInRange(
		visibleMonthStart,
		currentMonthCutoff < visibleMonthEnd ? currentMonthCutoff : visibleMonthEnd,
	);
	const attendanceRate =
		weekdaysInMonth > 0 ? Math.round((daysAttended / weekdaysInMonth) * 100) : 0;

	const totalHours = Array.from(byDate.values()).reduce((sum, r) => sum + r.totalHours, 0);
	const avgHours = daysAttended > 0 ? totalHours / daysAttended : 0;

	const partialDays = Array.from(byDate.values()).filter(
		(r) => r.totalHours > 0 && r.totalHours < FULL_DAY_HOURS,
	).length;

	const cells = buildCalendarGrid(year, month);

	const todayStr = formatDateKey(today, timezone);
	const monthLabel = new Date(Date.UTC(year, month, 1, 12)).toLocaleDateString("en-US", {
		timeZone: timezone,
		month: "long",
		year: "numeric",
	});

	function navigate(delta: number) {
		setGridVisible(false);
		setSelectedDay(null);
		navTimeoutRef.current = setTimeout(() => {
			let newMonth = month + delta;
			let newYear = year;
			if (newMonth > 11) {
				newMonth = 0;
				newYear++;
			} else if (newMonth < 0) {
				newMonth = 11;
				newYear--;
			}
			setMonth(newMonth);
			setYear(newYear);
			setGridVisible(true);
		}, 150);
	}

	function handleDayClick(day: number) {
		setSelectedDay((prev) => (prev === day ? null : day));
	}

	const selectedRecord =
		selectedDay !== null
			? byDate.get(
					`${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`,
				)
			: undefined;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Attendance History</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Stats */}
				{isLoading ? (
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						{["stat-a", "stat-b", "stat-c", "stat-d"].map((key) => (
							<Card key={key}>
								<CardContent className="p-4 text-center space-y-2">
									<Skeleton className="h-8 w-12 mx-auto" />
									<Skeleton className="h-3 w-20 mx-auto" />
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						<StatCard label="Days Attended" value={String(daysAttended)} />
						<StatCard label="Attendance Rate" value={`${attendanceRate}%`} />
						<StatCard
							label="Avg Hours/Day"
							value={daysAttended > 0 ? `${avgHours.toFixed(1)}h` : "N/A"}
						/>
						<StatCard label="Partial Days" value={String(partialDays)} />
					</div>
				)}

				{/* Month navigation */}
				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={() => navigate(-1)}
						className="rounded-full p-1.5 transition-colors duration-150 hover:bg-muted"
						aria-label="Previous month"
					>
						<ChevronLeft className="h-4 w-4 text-muted-foreground" />
					</button>
					<span className="text-sm font-semibold text-foreground">{monthLabel}</span>
					<button
						type="button"
						onClick={() => navigate(1)}
						className="rounded-full p-1.5 transition-colors duration-150 hover:bg-muted"
						aria-label="Next month"
					>
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					</button>
				</div>

				{/* Legend */}
				<div className="flex items-center gap-4 text-xs text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-3 w-3 rounded bg-success/15" />
						Full day (6+ hrs)
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-3 w-3 rounded bg-warning/15" />
						Partial day
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-3 w-3 rounded border border-border bg-muted" />
						Absent / weekend
					</span>
				</div>

				{/* Calendar grid */}
				{isLoading ? (
					<div className="grid grid-cols-7 gap-1">
						{DAY_HEADERS.map((h) => (
							<div key={h} className="py-1 text-center text-xs font-medium text-muted-foreground">
								{h}
							</div>
						))}
						{Array.from({ length: 35 }, (_, i) => `sk-${i}`).map((key) => (
							<Skeleton key={key} className="aspect-square rounded-lg bg-muted/40" />
						))}
					</div>
				) : (
					<div
						className="grid grid-cols-7 gap-1 transition-opacity duration-200"
						style={{ opacity: gridVisible ? 1 : 0 }}
					>
						{DAY_HEADERS.map((h) => (
							<div key={h} className="py-1 text-center text-xs font-medium text-muted-foreground">
								{h}
							</div>
						))}
						{cells.map((cell) => {
							if (cell.day === null) {
								return <div key={cell.key} />;
							}
							const record = byDate.get(cell.key);
							const isToday = cell.key === todayStr;
							return (
								<DayCell
									key={cell.key}
									day={cell.day}
									year={year}
									month={month}
									record={record}
									isToday={isToday}
									isSelected={selectedDay === cell.day}
									onClick={() => handleDayClick(cell.day as number)}
								/>
							);
						})}
					</div>
				)}

				{/* Day detail panel */}
				{selectedDay !== null && selectedRecord && (
					<DayDetailPanel
						day={selectedDay}
						year={year}
						month={month}
						record={selectedRecord}
						timezone={timezone}
					/>
				)}
			</CardContent>
		</Card>
	);
}
