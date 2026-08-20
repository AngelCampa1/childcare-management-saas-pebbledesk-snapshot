import type { CheckIn, Child } from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Checkbox } from "@pebbledesk/ui/components/checkbox";
import { Label } from "@pebbledesk/ui/components/label";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { LogIn, LogOut, PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCheckIn, useCheckIns, useCheckOut } from "../hooks/use-attendance";
import { useChildren } from "../hooks/use-children";
import { formatTime as formatCenterTime } from "../lib/format-date";
import { SignaturePad } from "./signature-pad";

interface RatioStatus {
	childCount: number;
	staffCount: number;
	requiredRatio: string;
	status: "ok" | "warning" | "violation";
}

interface AttendanceRosterProps {
	classroomId: string;
	timezone: string;
	ratioStatus?: RatioStatus;
}

type AttendanceStatus = "checked-in" | "not-here" | "checked-out";

interface ChildRow {
	child: Child;
	status: AttendanceStatus;
	checkIn: CheckIn | undefined;
}

function getInitials(firstName: string, lastName: string): string {
	return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function formatTime(isoString: string, timezone: string): string {
	return formatCenterTime(isoString, { centerTimezone: timezone });
}

function statusOrder(status: AttendanceStatus): number {
	if (status === "checked-in") return 0;
	if (status === "not-here") return 1;
	return 2;
}

function formatDateKey(date: Date, timezone: string): string {
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
		// Guard: Intl formatter returned incomplete parts. Fall back to local ISO date.
		console.warn(
			`formatDateKey: could not resolve date parts for timezone "${timezone}". Falling back to local time.`,
		);
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, "0");
		const d = String(date.getDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
	}

	return `${year}-${month}-${day}`;
}

const statusLabel: Record<"ok" | "warning" | "violation", string> = {
	ok: "Within ratio",
	warning: "Near limit",
	violation: "Violation",
};

export function AttendanceRoster({ classroomId, timezone, ratioStatus }: AttendanceRosterProps) {
	const {
		data: children,
		isLoading: childrenLoading,
		isError: childrenError,
	} = useChildren({
		classroomId,
	});
	const {
		data: checkIns,
		isLoading: checkInsLoading,
		isError: checkInsError,
	} = useCheckIns({
		classroomId,
	});
	const checkInMutation = useCheckIn();
	const checkOutMutation = useCheckOut();
	const checkInInFlightRef = useRef(false);
	const checkOutInFlightRef = useRef(false);

	const isLoading = childrenLoading || checkInsLoading;

	useEffect(() => {
		if (!checkInMutation.isPending) {
			checkInInFlightRef.current = false;
		}
	}, [checkInMutation.isPending]);

	useEffect(() => {
		if (!checkOutMutation.isPending) {
			checkOutInFlightRef.current = false;
		}
	}, [checkOutMutation.isPending]);

	if (isLoading) {
		return <AttendanceRosterSkeleton />;
	}

	if (childrenError || checkInsError) {
		return (
			<div
				role="status"
				className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-6 text-center"
			>
				<p className="text-sm font-medium text-destructive">
					We couldn't load this room's attendance roster.
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Refresh the page or try again in a moment.
				</p>
			</div>
		);
	}

	if (!children || children.length === 0) {
		return (
			<div className="rounded-lg border border-border bg-muted/40 px-4 py-12 text-center text-muted-foreground">
				<p className="text-sm">No children assigned to this classroom.</p>
			</div>
		);
	}

	const today = formatDateKey(new Date(), timezone);

	const rows: ChildRow[] = children
		.filter((child) => child.enrollmentStatus === "active")
		.map((child) => {
			const todayCheckIns =
				checkIns?.filter(
					(ci) =>
						ci.childId === child.id && formatDateKey(new Date(ci.checkedInAt), timezone) === today,
				) ?? [];
			// Prefer the active check-in (no checkout yet); fall back to most recent
			const todayCheckIn =
				todayCheckIns.find((ci) => !ci.checkedOutAt) ??
				todayCheckIns.sort(
					(a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
				)[0];

			let status: AttendanceStatus;
			if (!todayCheckIn) {
				status = "not-here";
			} else if (todayCheckIn.checkedOutAt) {
				status = "checked-out";
			} else {
				status = "checked-in";
			}

			return { child, status, checkIn: todayCheckIn };
		})
		.sort((a, b) => statusOrder(a.status) - statusOrder(b.status));

	return (
		<div>
			{ratioStatus && (
				<div
					className={[
						"flex items-center gap-3 px-4 py-2 text-sm rounded-lg mb-3",
						ratioStatus.status === "ok"
							? "bg-success/10"
							: ratioStatus.status === "warning"
								? "bg-warning/10"
								: "bg-destructive/10",
					].join(" ")}
				>
					<span className="font-semibold text-foreground">
						{ratioStatus.childCount} children · {ratioStatus.staffCount} staff
					</span>
					<span className="text-xs text-muted-foreground">
						{ratioStatus.requiredRatio} required
					</span>
					<span
						className={[
							"ml-auto text-xs font-semibold rounded-full px-2.5 py-1",
							ratioStatus.status === "ok"
								? "bg-success/15 text-success"
								: ratioStatus.status === "warning"
									? "bg-warning/15 text-warning"
									: "bg-destructive/15 text-destructive",
						].join(" ")}
					>
						{statusLabel[ratioStatus.status]}
					</span>
				</div>
			)}
			<div className="space-y-2">
				{rows.map((row, index) => (
					<ChildRosterRow
						key={row.child.id}
						row={row}
						index={index}
						timezone={timezone}
						classroomId={classroomId}
						isCheckInPending={checkInMutation.isPending}
						isCheckOutPending={checkOutMutation.isPending}
						onCheckIn={(childId, options) => {
							if (checkInMutation.isPending || checkInInFlightRef.current) return;
							checkInInFlightRef.current = true;
							checkInMutation.mutate({
								childId,
								classroomId,
								isLate: options.isLate,
								signatureData: options.signatureData,
							});
						}}
						onCheckOut={(checkInId, signatureData) => {
							if (checkOutMutation.isPending || checkOutInFlightRef.current) return;
							checkOutInFlightRef.current = true;
							checkOutMutation.mutate({ id: checkInId, signatureData });
						}}
					/>
				))}
			</div>
		</div>
	);
}

interface ChildRosterRowProps {
	row: ChildRow;
	index: number;
	timezone: string;
	classroomId: string;
	isCheckInPending: boolean;
	isCheckOutPending: boolean;
	onCheckIn: (childId: string, options: { isLate: boolean; signatureData?: string }) => void;
	onCheckOut: (checkInId: string, signatureData?: string) => void;
}

function ChildRosterRow({
	row,
	index,
	timezone,
	isCheckInPending,
	isCheckOutPending,
	onCheckIn,
	onCheckOut,
}: ChildRosterRowProps) {
	const { child, status, checkIn } = row;

	const rowStyles: Record<AttendanceStatus, string> = {
		"checked-in": "bg-success/10 border border-success/20",
		"not-here": "bg-muted/40 border border-border",
		"checked-out": "bg-destructive/10 border border-destructive/20",
	};

	const statusText: Record<AttendanceStatus, string> = {
		"checked-in": checkIn ? `In at ${formatTime(checkIn.checkedInAt, timezone)}` : "Checked in",
		"not-here": "Not here",
		"checked-out": checkIn?.checkedOutAt
			? `Out at ${formatTime(checkIn.checkedOutAt, timezone)}`
			: "Checked out",
	};

	const statusTextStyles: Record<AttendanceStatus, string> = {
		"checked-in": "text-success",
		"not-here": "text-muted-foreground",
		"checked-out": "text-destructive",
	};

	const avatarStyles: Record<AttendanceStatus, string> = {
		"checked-in": "bg-success/15 text-success",
		"not-here": "bg-muted text-muted-foreground",
		"checked-out": "bg-destructive/15 text-destructive",
	};

	return (
		<CheckInRosterRow
			child={child}
			status={status}
			checkIn={checkIn}
			index={index}
			isCheckInPending={isCheckInPending}
			isCheckOutPending={isCheckOutPending}
			rowStyles={rowStyles}
			avatarStyles={avatarStyles}
			statusText={statusText}
			statusTextStyles={statusTextStyles}
			onCheckIn={onCheckIn}
			onCheckOut={onCheckOut}
		/>
	);
}

interface CheckInRosterRowProps {
	child: Child;
	status: AttendanceStatus;
	checkIn: CheckIn | undefined;
	index: number;
	isCheckInPending: boolean;
	isCheckOutPending: boolean;
	rowStyles: Record<AttendanceStatus, string>;
	avatarStyles: Record<AttendanceStatus, string>;
	statusText: Record<AttendanceStatus, string>;
	statusTextStyles: Record<AttendanceStatus, string>;
	onCheckIn: (childId: string, options: { isLate: boolean; signatureData?: string }) => void;
	onCheckOut: (checkInId: string, signatureData?: string) => void;
}

function CheckInRosterRow({
	child,
	status,
	checkIn,
	index,
	isCheckInPending,
	isCheckOutPending,
	rowStyles,
	avatarStyles,
	statusText,
	statusTextStyles,
	onCheckIn,
	onCheckOut,
}: CheckInRosterRowProps) {
	const [checkOutSignature, setCheckOutSignature] = useState<string | null>(null);
	const [showCheckOutSignature, setShowCheckOutSignature] = useState(false);
	const [showCheckInForm, setShowCheckInForm] = useState(false);
	const [checkInLate, setCheckInLate] = useState(false);
	const [checkInSignature, setCheckInSignature] = useState<string | null>(null);

	const hasCheckInSignature = Boolean(checkIn?.checkInSignature);
	const hasCheckOutSignature = Boolean(checkIn?.checkOutSignature);

	return (
		<div
			className={`flex flex-col gap-2 p-4 rounded-lg transition-colors duration-300 ease-in-out animate-fade-in ${rowStyles[status]}`}
			style={{ animationDelay: `${index * 50}ms` }}
		>
			<div className="flex items-center gap-4">
				{/* Avatar */}
				<div
					className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarStyles[status]}`}
				>
					{getInitials(child.firstName, child.lastName)}
				</div>

				{/* Name + status */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5 flex-wrap">
						<p
							className={`text-sm font-medium ${status === "not-here" ? "text-muted-foreground" : "text-foreground"}`}
						>
							{child.firstName} {child.lastName}
						</p>
						{checkIn?.isLate && (
							<Badge
								variant="secondary"
								className="text-xs font-medium bg-warning/15 text-warning px-1.5 py-0.5"
							>
								Late
							</Badge>
						)}
						{hasCheckInSignature && (
							<PenLine
								className="h-3 w-3 text-muted-foreground"
								aria-label="Check-in signature present"
							/>
						)}
						{hasCheckOutSignature && (
							<PenLine
								className="h-3 w-3 text-destructive/60"
								aria-label="Check-out signature present"
							/>
						)}
					</div>
					<p className={`text-xs ${statusTextStyles[status]}`}>{statusText[status]}</p>
				</div>

				{/* Action button */}
				{status === "not-here" && !showCheckInForm && (
					<Button
						size="sm"
						variant="outline"
						className="shrink-0 motion-safe:active:scale-[0.97] transition-transform border-primary/20 text-primary hover:bg-primary/10"
						disabled={isCheckInPending}
						onClick={() => setShowCheckInForm(true)}
					>
						<LogIn className="w-3 h-3 mr-1" />
						Check In
					</Button>
				)}
				{status === "checked-in" && checkIn && !showCheckOutSignature && (
					<Button
						size="sm"
						variant="outline"
						className="shrink-0 motion-safe:active:scale-[0.97] transition-transform border-destructive/20 text-destructive hover:bg-destructive/10"
						disabled={isCheckOutPending}
						onClick={() => setShowCheckOutSignature(true)}
					>
						<LogOut className="w-3 h-3 mr-1" />
						Check Out
					</Button>
				)}
			</div>
			{status === "checked-in" && showCheckOutSignature && checkIn && (
				<div className="flex flex-col gap-2 pt-1">
					<SignaturePad label="Check-out signature (optional)" onChange={setCheckOutSignature} />
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							className="border-destructive/20 text-destructive hover:bg-destructive/10"
							disabled={isCheckOutPending}
							onClick={() => {
								onCheckOut(checkIn.id, checkOutSignature ?? undefined);
								setShowCheckOutSignature(false);
								setCheckOutSignature(null);
							}}
						>
							<LogOut className="w-3 h-3 mr-1" />
							Confirm Check Out
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								setShowCheckOutSignature(false);
								setCheckOutSignature(null);
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}
			{status === "not-here" && showCheckInForm && (
				<div className="flex flex-col gap-2 pt-1">
					<div className="flex items-center gap-2">
						<Checkbox
							id={`check-in-late-${child.id}`}
							checked={checkInLate}
							onCheckedChange={(checked) => setCheckInLate(Boolean(checked))}
						/>
						<Label
							htmlFor={`check-in-late-${child.id}`}
							className="cursor-pointer select-none text-sm font-medium text-foreground"
						>
							Mark late
						</Label>
					</div>
					<SignaturePad label="Check-in signature (optional)" onChange={setCheckInSignature} />
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							className="border-primary/20 text-primary hover:bg-primary/10"
							disabled={isCheckInPending}
							onClick={() => {
								onCheckIn(child.id, {
									isLate: checkInLate,
									signatureData: checkInSignature ?? undefined,
								});
								setShowCheckInForm(false);
								setCheckInLate(false);
								setCheckInSignature(null);
							}}
						>
							<LogIn className="w-3 h-3 mr-1" />
							Confirm Check In
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								setShowCheckInForm(false);
								setCheckInLate(false);
								setCheckInSignature(null);
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function AttendanceRosterSkeleton() {
	return (
		<div className="space-y-2">
			{["sk-a", "sk-b", "sk-c", "sk-d", "sk-e"].map((key) => (
				<div
					key={key}
					className="flex items-center gap-4 rounded-lg border border-border bg-muted/40 p-4"
				>
					<Skeleton className="w-10 h-10 rounded-full" />
					<div className="flex-1 space-y-1.5">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-20" />
					</div>
					<Skeleton className="h-8 w-20 rounded-md" />
				</div>
			))}
		</div>
	);
}
