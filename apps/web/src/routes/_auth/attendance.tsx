import {
	type ClassroomWithCounts,
	resolveEffectiveRatioRule,
	type StaffCheckIn,
} from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pebbledesk/ui/components/tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, LogIn, LogOut, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AttendanceRoster } from "../../components/attendance-roster";
import { AttendanceSearch } from "../../components/attendance-search";
import { EmptyState } from "../../components/empty-state";
import { GuidancePanel } from "../../components/guidance";
import { HelpTip, PageHelpPanel } from "../../components/help-tip";
import {
	useCheckIn,
	useCheckIns,
	useStaffCheckIns,
	useStaffClockIn,
	useStaffClockOut,
} from "../../hooks/use-attendance";
import { useAuthSession } from "../../hooks/use-auth-session";
import { useClassroomStaff, useClassrooms } from "../../hooks/use-classrooms";
import { formatTime as formatCenterTime } from "../../lib/format-date";

export const Route = createFileRoute("/_auth/attendance")({
	validateSearch: z.object({ room: z.string().optional() }),
	component: AttendancePage,
});

function formatDate(date: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	}).formatToParts(date);

	const weekday = parts.find((part) => part.type === "weekday")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;
	const year = parts.find((part) => part.type === "year")?.value;

	if (!weekday || !month || !day || !year) {
		return date.toLocaleDateString("en-US", {
			timeZone: timezone,
			weekday: "long",
			month: "long",
			day: "numeric",
			year: "numeric",
		});
	}

	return `${weekday}, ${month} ${day}, ${year}`;
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

function formatTime(isoString: string, timezone: string): string {
	return formatCenterTime(isoString, { centerTimezone: timezone });
}

const uuidSchema = z.string().uuid();

export function AttendancePage() {
	const { data: session, isLoading: sessionLoading } = useAuthSession();
	const search = Route.useSearch();
	const checkInMutation = useCheckIn();
	const role = session?.membership.role ?? "owner";
	const centerTimezone = session?.center.timezone ?? "UTC";
	const assignedClassroomIds = session?.classroomIds ?? [];
	const isDirectorOrAbove = role === "owner" || role === "director";
	const {
		data: classrooms,
		isLoading: classroomsLoading,
		isError: classroomsError,
		refetch: refetchClassrooms,
	} = useClassrooms(undefined, {
		enabled: Boolean(session),
	});

	const activeClassrooms = classrooms?.filter((c) => !c.archivedAt) ?? [];

	const [activeTab, setActiveTab] = useState<string>("");
	const [roomNotFoundNotice, setRoomNotFoundNotice] = useState(false);

	// #27: Validate room param as UUID; ignore if invalid
	const rawRoom = typeof search.room === "string" ? search.room : "";
	const validatedRoom = uuidSchema.safeParse(rawRoom).success ? rawRoom : "";

	const visibleClassrooms = isDirectorOrAbove
		? activeClassrooms
		: activeClassrooms.filter((classroom) => assignedClassroomIds.includes(classroom.id));

	// #35: Check whether the validated room param matches a visible classroom
	const requestedRoomExists =
		validatedRoom !== "" && visibleClassrooms.some((classroom) => classroom.id === validatedRoom);
	const requestedRoomTab = requestedRoomExists ? validatedRoom : "";
	const defaultTab =
		isDirectorOrAbove || visibleClassrooms.length <= 1 ? (visibleClassrooms[0]?.id ?? "") : "";
	const effectiveTab = activeTab || requestedRoomTab || defaultTab;
	const actionClassroomId = effectiveTab === "staff" ? defaultTab : effectiveTab;

	// #35: Surface a notice when a valid UUID room param doesn't match any visible classroom
	useEffect(() => {
		if (
			validatedRoom !== "" &&
			!requestedRoomExists &&
			visibleClassrooms.length > 0 &&
			!classroomsLoading
		) {
			setRoomNotFoundNotice(true);
		}
	}, [validatedRoom, requestedRoomExists, visibleClassrooms.length, classroomsLoading]);

	// #3: Gate page on session presence while still loading
	if (sessionLoading) {
		return <Skeleton className="h-48 w-full rounded-lg" />;
	}

	if (classroomsLoading) {
		return (
			<div className="space-y-6">
				<PageHeader timezone={centerTimezone} />
				<AttendancePageSkeleton />
			</div>
		);
	}

	if (!isDirectorOrAbove && visibleClassrooms.length === 0) {
		return (
			<div className="space-y-6">
				<PageHeader timezone={centerTimezone} />
				<EmptyState
					tone="people"
					icon={<Users className="h-6 w-6" aria-hidden="true" />}
					title="No classroom assigned yet"
					description="Refresh once your director places you on a room, then check-ins will start flowing here."
					action={
						<div className="mt-4 flex flex-col items-center gap-2">
							<Button onClick={() => window.location.reload()}>Refresh attendance</Button>
							<span className="text-sm text-muted-foreground">
								Ask your director to assign you a room.
							</span>
						</div>
					}
				/>
			</div>
		);
	}

	if (classroomsError) {
		return (
			<div className="space-y-6">
				<PageHeader timezone={centerTimezone} />
				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
					<p className="text-sm text-destructive">Failed to load classrooms.</p>
					<button
						type="button"
						onClick={() => void refetchClassrooms()}
						className="mt-3 text-sm font-medium text-primary hover:underline"
					>
						Try again
					</button>
				</div>
			</div>
		);
	}

	if (activeClassrooms.length === 0) {
		return (
			<div className="space-y-6">
				<PageHeader timezone={centerTimezone} />
				<EmptyState
					tone="operations"
					icon={<Users className="h-6 w-6" aria-hidden="true" />}
					title="Set up your classrooms first"
					description="Start the day by setting up your classrooms so attendance and ratios start tracking."
					action={
						<Button asChild className="mt-4">
							<Link to="/classrooms">Add a classroom</Link>
						</Button>
					}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* #35: Room-not-found notice */}
			{roomNotFoundNotice && (
				<div
					role="status"
					className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
				>
					Selected room not found, showing first available.
				</div>
			)}
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<PageHeader timezone={centerTimezone} />
				<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
					<AttendanceSearch
						defaultClassroomId={actionClassroomId}
						isCheckInPending={checkInMutation.isPending}
						checkInError={checkInMutation.error}
						onCheckIn={async (childId, classroomId) => {
							await checkInMutation.mutateAsync({ childId, classroomId });
						}}
					/>
					<StaffClockButton classroomId={actionClassroomId} membershipId={session?.membership.id} />
				</div>
			</div>

			{/* Classroom tabs */}
			<Tabs value={effectiveTab} onValueChange={(val) => setActiveTab(val)} className="space-y-0">
				<TabsList className="h-auto p-1 flex flex-wrap gap-1" aria-label="Attendance views">
					{visibleClassrooms.map((classroom) => (
						<TabsTrigger
							key={classroom.id}
							value={classroom.id}
							className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
						>
							{classroom.name}
						</TabsTrigger>
					))}
					{isDirectorOrAbove && (
						<TabsTrigger
							value="staff"
							className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
						>
							<Users className="w-3.5 h-3.5 mr-1.5" />
							Staff
						</TabsTrigger>
					)}
				</TabsList>

				{visibleClassrooms.map((classroom) => (
					<TabsContent
						key={classroom.id}
						value={classroom.id}
						className="mt-4 transition-opacity duration-150"
					>
						<ClassroomTabContent
							classroom={classroom}
							isVisible={effectiveTab === classroom.id}
							timezone={centerTimezone}
							centerState={session?.center.state ?? ""}
						/>
					</TabsContent>
				))}

				{isDirectorOrAbove && (
					<TabsContent value="staff" className="mt-4 transition-opacity duration-150">
						<StaffTabContent classrooms={visibleClassrooms} timezone={centerTimezone} />
					</TabsContent>
				)}
			</Tabs>

			<GuidancePanel
				guideId="staff-daily-basics"
				userRole={role}
				title="Need help with attendance?"
			/>
			<PageHelpPanel route="/attendance" />
		</div>
	);
}

function PageHeader({ timezone }: { timezone: string }) {
	return (
		<div>
			<h1 className="text-2xl font-bold text-foreground">Attendance</h1>
			<p className="mt-0.5 text-sm text-muted-foreground">{formatDate(new Date(), timezone)}</p>
		</div>
	);
}

interface ClassroomTabContentProps {
	classroom: ClassroomWithCounts;
	isVisible: boolean;
	timezone: string;
	/** Center IANA state code; used to apply stricter state-mandated ratios. */
	centerState: string;
}

function ClassroomTabContent({ classroom, timezone, centerState }: ClassroomTabContentProps) {
	const today = formatDateKey(new Date(), timezone);
	const { data: liveCheckIns, isLoading: liveChildrenLoading } = useCheckIns({
		classroomId: classroom.id,
		date: today,
	});
	const { data: liveStaffCheckIns, isLoading: liveStaffLoading } = useStaffCheckIns({
		classroomId: classroom.id,
		date: today,
	});

	if (classroom.childCount === 0) {
		return (
			<EmptyState
				tone="operations"
				title={`No children assigned to ${classroom.name}`}
				description="Enroll a child and assign them to this room to start tracking attendance and ratios."
				action={
					<Button asChild className="mt-4">
						<Link to="/children/enroll">Enroll a child</Link>
					</Button>
				}
				secondaryAction={
					<Button asChild variant="outline">
						<Link to="/children">Assign existing child</Link>
					</Button>
				}
			/>
		);
	}

	const currentChildCount = liveChildrenLoading
		? classroom.childCount
		: (liveCheckIns?.filter((checkIn) => !checkIn.checkedOutAt).length ?? 0);
	const currentStaffCount = liveStaffLoading
		? classroom.staffCount
		: (liveStaffCheckIns?.filter((checkIn) => !checkIn.clockedOutAt).length ?? 0);

	const capacityPercent =
		classroom.maxCapacity > 0 ? Math.round((currentChildCount / classroom.maxCapacity) * 100) : 0;
	// Apply the stricter of the classroom-configured ratio and any state-mandated
	// minimum so the Attendance banner matches the backend and the Ratios page.
	const hasConfiguredRatio = Boolean(classroom.minRatioStaff && classroom.minRatioChildren);
	const effectiveRule = hasConfiguredRatio
		? resolveEffectiveRatioRule({
				centerState,
				ageGroup: classroom.ageGroup,
				minRatioStaff: classroom.minRatioStaff,
				minRatioChildren: classroom.minRatioChildren,
			})
		: null;
	const requiredChildrenPerStaff = effectiveRule
		? effectiveRule.minRatioChildren / effectiveRule.minRatioStaff
		: Number.POSITIVE_INFINITY;
	const actualChildrenPerStaff =
		currentStaffCount > 0 ? currentChildCount / currentStaffCount : Number.POSITIVE_INFINITY;
	const isViolation =
		currentChildCount > 0 &&
		(currentStaffCount === 0 || actualChildrenPerStaff > requiredChildrenPerStaff);
	const isNearCapacity = !isViolation && capacityPercent >= 85;
	const isNearRatio =
		!isViolation &&
		currentStaffCount > 0 &&
		requiredChildrenPerStaff < Number.POSITIVE_INFINITY &&
		actualChildrenPerStaff > requiredChildrenPerStaff * 0.85;
	const complianceStatus: "compliant" | "warning" | "violation" | "empty" =
		currentChildCount === 0 && currentStaffCount === 0
			? "empty"
			: isViolation
				? "violation"
				: isNearCapacity || isNearRatio
					? "warning"
					: "compliant";

	const complianceBadgeStyles: Record<"compliant" | "warning" | "violation" | "empty", string> = {
		compliant: "bg-success/15 text-success",
		warning: "bg-warning/15 text-warning",
		violation: "bg-destructive/10 text-destructive",
		empty: "bg-muted text-muted-foreground",
	};

	return (
		<div className="space-y-4">
			{/* Room info bar */}
			<div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
				<div className="flex items-center gap-1.5 text-sm text-foreground">
					<span className="font-medium">{currentChildCount}</span>
					<span className="text-muted-foreground">/ {classroom.maxCapacity} children</span>
					<HelpTip label="Help: room capacity">
						The first number is children checked in now. The second is the room's licensed capacity.
					</HelpTip>
				</div>
				<div className="h-4 w-px bg-border" />
				<div className="flex items-center gap-1.5 text-sm text-foreground">
					<Users className="h-4 w-4 text-muted-foreground" />
					<span className="font-medium">{currentStaffCount}</span>
					<span className="text-muted-foreground">staff</span>
					<HelpTip label="Help: staff count">
						Only clocked-in staff count toward this room's ratio.
					</HelpTip>
				</div>
				<div className="h-4 w-px bg-border" />
				<div className="flex items-center gap-2">
					<Badge
						variant="secondary"
						className={`text-xs font-medium ${complianceBadgeStyles[complianceStatus]}`}
					>
						{complianceStatus === "compliant"
							? "Compliant"
							: complianceStatus === "warning"
								? isNearCapacity
									? "Near capacity"
									: "Near ratio"
								: complianceStatus === "violation"
									? "Violation"
									: "Empty"}
					</Badge>
					<HelpTip label="Help: attendance status">
						Green is okay, amber means watch the room, and red means fix the room now.
					</HelpTip>
				</div>
			</div>

			{/* Roster */}
			<AttendanceRoster
				classroomId={classroom.id}
				timezone={timezone}
				ratioStatus={
					(currentChildCount > 0 || currentStaffCount > 0) && effectiveRule
						? {
								childCount: currentChildCount,
								staffCount: currentStaffCount,
								requiredRatio: `${effectiveRule.minRatioStaff}:${effectiveRule.minRatioChildren}`,
								status: isViolation ? "violation" : isNearRatio ? "warning" : "ok",
							}
						: undefined
				}
			/>
		</div>
	);
}

function StaffClockButton({
	classroomId,
	membershipId,
}: {
	classroomId: string;
	membershipId?: string;
}) {
	const { data: staffCheckIns } = useStaffCheckIns({ classroomId });
	const clockInMutation = useStaffClockIn();
	const clockOutMutation = useStaffClockOut();

	const activeCheckIn = staffCheckIns?.find(
		(sci) => sci.membershipId === membershipId && !sci.clockedOutAt,
	);

	if (activeCheckIn) {
		return (
			<Button
				variant="outline"
				size="sm"
				className="gap-1.5 motion-safe:active:scale-[0.97] transition-transform border-destructive/20 text-destructive hover:bg-destructive/10"
				onClick={() => clockOutMutation.mutate(activeCheckIn.id)}
				disabled={clockOutMutation.isPending}
			>
				<LogOut className="w-4 h-4" />
				Clock Out
			</Button>
		);
	}

	return (
		<Button
			variant="outline"
			size="sm"
			className="w-full gap-1.5 justify-center motion-safe:active:scale-[0.97] transition-transform border-success/20 text-success hover:bg-success/10 sm:w-auto"
			onClick={() => clockInMutation.mutate({ classroomId })}
			disabled={clockInMutation.isPending || !classroomId}
		>
			<LogIn className="w-4 h-4" />
			Clock In
		</Button>
	);
}

interface StaffTabContentProps {
	classrooms: ClassroomWithCounts[];
	timezone: string;
}

function StaffTabContent({ classrooms, timezone }: StaffTabContentProps) {
	return (
		<div className="space-y-6">
			{classrooms.map((classroom) => (
				<StaffRoomSection key={classroom.id} classroom={classroom} timezone={timezone} />
			))}
		</div>
	);
}

function StaffRoomSection({
	classroom,
	timezone,
}: {
	classroom: ClassroomWithCounts;
	timezone: string;
}) {
	const { data: staffMembers, isLoading: staffLoading } = useClassroomStaff(classroom.id);
	const { data: staffCheckIns } = useStaffCheckIns({ classroomId: classroom.id });
	const clockInMutation = useStaffClockIn();
	const clockOutMutation = useStaffClockOut();

	if (staffLoading) {
		return (
			<div className="space-y-2">
				<h3 className="font-semibold text-foreground">{classroom.name}</h3>
				<div className="space-y-2">
					{["sk-1", "sk-2"].map((k) => (
						<div
							key={k}
							className="flex items-center gap-4 rounded-lg border border-border bg-muted/40 p-4"
						>
							<Skeleton className="w-10 h-10 rounded-full" />
							<div className="flex-1 space-y-1.5">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-20" />
							</div>
							<Skeleton className="h-8 w-24 rounded-md" />
						</div>
					))}
				</div>
			</div>
		);
	}

	const today = formatDateKey(new Date(), timezone);

	const assignedIds = new Set((staffMembers ?? []).map((m) => m.membershipId));
	const unassignedActiveCheckIns = (staffCheckIns ?? []).filter(
		(sci: StaffCheckIn) =>
			!assignedIds.has(sci.membershipId) &&
			!sci.clockedOutAt &&
			formatDateKey(new Date(sci.clockedInAt), timezone) === today,
	);

	if (!staffMembers || staffMembers.length === 0) {
		if (unassignedActiveCheckIns.length > 0) {
			return (
				<div>
					<h3 className="mb-2 font-semibold text-foreground">{classroom.name}</h3>
					<p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
						{unassignedActiveCheckIns.length === 1
							? "1 team member currently clocked in (not in staff assignments)."
							: `${unassignedActiveCheckIns.length} team members currently clocked in (not in staff assignments).`}
					</p>
				</div>
			);
		}
		return (
			<div>
				<h3 className="mb-2 font-semibold text-foreground">{classroom.name}</h3>
				<p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
					No staff currently clocked in to this room.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<h3 className="font-semibold text-foreground">{classroom.name}</h3>
			{staffMembers.map((member, index) => {
				const checkIn = staffCheckIns?.find(
					(sci: StaffCheckIn) =>
						sci.membershipId === member.membershipId &&
						formatDateKey(new Date(sci.clockedInAt), timezone) === today,
				);
				const isClockedIn = checkIn && !checkIn.clockedOutAt;
				const isClockedOut = checkIn?.clockedOutAt;

				const initials = (member.userName ?? "?")
					.split(" ")
					.map((n: string) => n.charAt(0))
					.slice(0, 2)
					.join("")
					.toUpperCase();

				const rowStyle = isClockedIn
					? "bg-success/10 border-success/20"
					: isClockedOut
						? "bg-destructive/10 border-destructive/20"
						: "bg-muted/40 border-border";

				const avatarStyle = isClockedIn
					? "bg-success/15 text-success"
					: isClockedOut
						? "bg-destructive/15 text-destructive"
						: "bg-muted text-muted-foreground";

				return (
					<div
						key={member.membershipId}
						className={`flex items-center gap-4 p-4 rounded-lg border transition-colors duration-300 ease-in-out animate-fade-in ${rowStyle}`}
						style={{ animationDelay: `${index * 50}ms` }}
					>
						<div
							className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarStyle}`}
						>
							{initials}
						</div>
						<div className="flex-1 min-w-0">
							<p className="font-medium text-sm text-foreground">
								{member.userName ?? member.userEmail ?? "Unknown Staff"}
							</p>
							<p
								className={`text-xs ${
									isClockedIn
										? "text-success"
										: isClockedOut
											? "text-destructive"
											: "text-muted-foreground"
								}`}
							>
								{isClockedIn
									? `Clocked in at ${formatTime(checkIn.clockedInAt, timezone)}`
									: isClockedOut
										? `Clocked out at ${checkIn.clockedOutAt ? formatTime(checkIn.clockedOutAt, timezone) : ""}`
										: "Not clocked in"}
							</p>
						</div>
						{!isClockedIn && !isClockedOut && (
							<Button
								size="sm"
								variant="outline"
								className="shrink-0 motion-safe:active:scale-[0.97] transition-transform border-primary/20 text-primary hover:bg-primary/10"
								onClick={() =>
									clockInMutation.mutate({
										classroomId: classroom.id,
										membershipId: member.membershipId,
									})
								}
								disabled={clockInMutation.isPending}
							>
								<Clock className="w-3 h-3 mr-1" />
								Clock In
							</Button>
						)}
						{isClockedIn && checkIn && (
							<Button
								size="sm"
								variant="outline"
								className="shrink-0 motion-safe:active:scale-[0.97] transition-transform border-destructive/20 text-destructive hover:bg-destructive/10"
								onClick={() => clockOutMutation.mutate(checkIn.id)}
								disabled={clockOutMutation.isPending}
							>
								<LogOut className="w-3 h-3 mr-1" />
								Clock Out
							</Button>
						)}
					</div>
				);
			})}
		</div>
	);
}

function AttendancePageSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between">
				<div className="flex gap-3">
					<Skeleton className="h-9 w-36" />
					<Skeleton className="h-9 w-24" />
				</div>
			</div>
			<div className="flex gap-2">
				{["tab-a", "tab-b", "tab-c"].map((k) => (
					<Skeleton key={k} className="h-9 w-28 rounded-md" />
				))}
			</div>
			<div className="space-y-2">
				{["row-1", "row-2", "row-3", "row-4", "row-5"].map((k) => (
					<div
						key={k}
						className="flex items-center gap-4 rounded-lg border border-border bg-muted/40 p-4"
					>
						<Skeleton className="h-10 w-10 rounded-full" />
						<div className="flex-1 space-y-1.5">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-20" />
						</div>
						<Skeleton className="h-8 w-20 rounded-md" />
					</div>
				))}
			</div>
		</div>
	);
}
