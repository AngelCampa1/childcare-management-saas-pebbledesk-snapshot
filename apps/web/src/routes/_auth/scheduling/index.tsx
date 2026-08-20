import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@pebbledesk/ui/components/select";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { DateInput } from "../../../components/date-input";
import { ComplianceSummary, ConfirmDestructiveDialog } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { FieldHelp, PageHelpPanel } from "../../../components/help-tip";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { useClassrooms } from "../../../hooks/use-classrooms";
import type { CenterMember } from "../../../hooks/use-members";
import { useMembers } from "../../../hooks/use-members";
import {
	useCreateSchedule,
	useCreateShift,
	useDeleteSchedule,
	useDeleteShift,
	useSchedules,
	useShifts,
	useUpdateSchedule,
	useUpdateShift,
} from "../../../hooks/use-phase5";
import { extractErrorMessage } from "../../../lib/extract-error-message";

export const Route = createFileRoute("/_auth/scheduling/")({
	component: SchedulingPage,
});

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface ScheduleRowProps {
	schedule: {
		id: string;
		name: string;
		effectiveFrom: string;
		effectiveUntil?: string;
	};
	isStaff: boolean;
	members: CenterMember[];
	activeClassrooms: { id: string; name: string }[];
	createShiftIsPending: boolean;
	onCreateShift: (input: {
		scheduleId: string;
		membershipId: string;
		classroomId: string;
		dayOfWeek: number;
		startTime: string;
		endTime: string;
	}) => Promise<unknown>;
}

function ScheduleRow({
	schedule,
	isStaff,
	members,
	activeClassrooms,
	createShiftIsPending,
	onCreateShift,
}: ScheduleRowProps) {
	const deleteSchedule = useDeleteSchedule(schedule.id);
	const updateSchedule = useUpdateSchedule(schedule.id);

	const [addShiftOpen, setAddShiftOpen] = useState(false);
	const [membershipId, setMembershipId] = useState("");
	const [classroomId, setClassroomId] = useState("");
	const [dayOfWeek, setDayOfWeek] = useState("");
	const [startTime, setStartTime] = useState("");
	const [endTime, setEndTime] = useState("");
	const [shiftFormError, setShiftFormError] = useState<string | null>(null);

	const [editOpen, setEditOpen] = useState(false);
	const [editName, setEditName] = useState(schedule.name);
	const [editEffectiveFrom, setEditEffectiveFrom] = useState(schedule.effectiveFrom);
	const [editEffectiveUntil, setEditEffectiveUntil] = useState(schedule.effectiveUntil ?? "");
	const [editFormError, setEditFormError] = useState<string | null>(null);

	function handleEditScheduleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!editName.trim() || !editEffectiveFrom) return;
		updateSchedule.mutate(
			{
				name: editName.trim(),
				effectiveFrom: editEffectiveFrom,
				effectiveUntil: editEffectiveUntil || undefined,
			},
			{
				onSuccess: () => {
					setEditOpen(false);
					setEditFormError(null);
				},
				onError: (err) => {
					setEditFormError(extractErrorMessage(err, "Could not update schedule."));
				},
			},
		);
	}

	async function handleAddShiftSubmit(e: React.FormEvent) {
		e.preventDefault();
		setShiftFormError(null);
		if (!membershipId || !classroomId || !dayOfWeek || !startTime || !endTime) {
			setShiftFormError("All fields are required.");
			return;
		}
		const toMinutes = (t: string) => {
			const [h, m] = t.split(":").map(Number);
			return (h ?? 0) * 60 + (m ?? 0);
		};
		if (toMinutes(endTime) <= toMinutes(startTime)) {
			setShiftFormError("End time must be after start time.");
			return;
		}
		try {
			await onCreateShift({
				scheduleId: schedule.id,
				membershipId,
				classroomId,
				dayOfWeek: Number(dayOfWeek),
				startTime,
				endTime,
			});
			setAddShiftOpen(false);
			setMembershipId("");
			setClassroomId("");
			setDayOfWeek("");
			setStartTime("");
			setEndTime("");
			setShiftFormError(null);
		} catch {
			setShiftFormError("Failed to create shift. Please try again.");
		}
	}

	return (
		<div className="rounded-lg border border-border bg-muted/30 p-4">
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="font-medium text-foreground">{schedule.name}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Effective {formatDate(schedule.effectiveFrom)}
						{schedule.effectiveUntil ? ` to ${formatDate(schedule.effectiveUntil)}` : ""}
					</p>
				</div>
				{!isStaff && (
					<div className="flex shrink-0 items-center gap-2">
						<Dialog
							open={editOpen}
							onOpenChange={(open) => {
								setEditOpen(open);
								if (!open) {
									setEditName(schedule.name);
									setEditEffectiveFrom(schedule.effectiveFrom);
									setEditEffectiveUntil(schedule.effectiveUntil ?? "");
									setEditFormError(null);
								}
							}}
						>
							<DialogTrigger asChild>
								<Button size="sm" variant="outline" aria-label={`Edit schedule ${schedule.name}`}>
									<Pencil className="mr-1 h-4 w-4" />
									Edit
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Edit schedule</DialogTitle>
									<DialogDescription className="sr-only">
										Edit the schedule template details.
									</DialogDescription>
								</DialogHeader>
								<form onSubmit={handleEditScheduleSubmit} className="space-y-4">
									<div className="space-y-2">
										<FieldHelp
											htmlFor={`edit-schedule-name-${schedule.id}`}
											label="Name"
											help="Use a plain name like Spring plan or Summer staffing."
										/>
										<Input
											id={`edit-schedule-name-${schedule.id}`}
											value={editName}
											onChange={(e) => setEditName(e.target.value)}
											placeholder="e.g. Spring plan"
										/>
									</div>
									<div className="space-y-2">
										<FieldHelp
											htmlFor={`edit-schedule-effective-from-${schedule.id}`}
											label="Effective from"
											help="The first day this schedule should be used."
										/>
										<DateInput
											id={`edit-schedule-effective-from-${schedule.id}`}
											value={editEffectiveFrom}
											onChange={(e) => setEditEffectiveFrom(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<FieldHelp
											htmlFor={`edit-schedule-effective-until-${schedule.id}`}
											label="Effective until"
											help="Optional. Leave blank if this schedule does not have an end date yet."
										/>
										<DateInput
											id={`edit-schedule-effective-until-${schedule.id}`}
											value={editEffectiveUntil}
											onChange={(e) => setEditEffectiveUntil(e.target.value)}
										/>
									</div>
									{editFormError ? (
										<p role="alert" className="text-sm text-destructive">
											{editFormError}
										</p>
									) : null}
									<Button
										type="submit"
										disabled={
											updateSchedule.isPending ||
											!editName.trim() ||
											!editEffectiveFrom ||
											Boolean(
												editEffectiveUntil &&
													editEffectiveFrom &&
													editEffectiveUntil < editEffectiveFrom,
											)
										}
										className="w-full"
									>
										Save changes
									</Button>
								</form>
							</DialogContent>
						</Dialog>
						<Dialog
							open={addShiftOpen}
							onOpenChange={(open) => {
								setAddShiftOpen(open);
								if (!open) {
									setMembershipId("");
									setClassroomId("");
									setDayOfWeek("");
									setStartTime("");
									setEndTime("");
									setShiftFormError(null);
								}
							}}
						>
							<DialogTrigger asChild>
								<Button size="sm" variant="outline">
									<Plus className="mr-1 h-4 w-4" />
									Add shift
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Add shift</DialogTitle>
									<DialogDescription className="sr-only">
										Assign a recurring shift to a staff member for this schedule.
									</DialogDescription>
								</DialogHeader>
								<form onSubmit={handleAddShiftSubmit} className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor={`shift-member-${schedule.id}`}>Staff member</Label>
										<Select value={membershipId} onValueChange={setMembershipId}>
											<SelectTrigger id={`shift-member-${schedule.id}`}>
												<SelectValue placeholder="Select staff member" />
											</SelectTrigger>
											<SelectContent>
												{members.map((m) => (
													<SelectItem key={m.id} value={m.id}>
														{m.userName ?? m.userEmail ?? m.id}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`shift-classroom-${schedule.id}`}>Classroom</Label>
										<Select value={classroomId} onValueChange={setClassroomId}>
											<SelectTrigger id={`shift-classroom-${schedule.id}`}>
												<SelectValue placeholder="Select classroom" />
											</SelectTrigger>
											<SelectContent>
												{activeClassrooms.map((c) => (
													<SelectItem key={c.id} value={c.id}>
														{c.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`shift-day-${schedule.id}`}>Day</Label>
										<Select value={dayOfWeek} onValueChange={setDayOfWeek}>
											<SelectTrigger id={`shift-day-${schedule.id}`}>
												<SelectValue placeholder="Select day" />
											</SelectTrigger>
											<SelectContent>
												{WEEKDAY_FULL.map((label, idx) => (
													<SelectItem key={label} value={String(idx)}>
														{label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`shift-start-${schedule.id}`}>Start time</Label>
										<Input
											id={`shift-start-${schedule.id}`}
											type="time"
											value={startTime}
											onChange={(e) => setStartTime(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`shift-end-${schedule.id}`}>End time</Label>
										<Input
											id={`shift-end-${schedule.id}`}
											type="time"
											value={endTime}
											onChange={(e) => setEndTime(e.target.value)}
										/>
									</div>
									{shiftFormError && (
										<p aria-live="polite" className="text-sm text-destructive">
											{shiftFormError}
										</p>
									)}
									<Button type="submit" disabled={createShiftIsPending} className="w-full">
										Add shift
									</Button>
								</form>
							</DialogContent>
						</Dialog>
						<ConfirmDestructiveDialog
							trigger={
								<Button
									size="sm"
									variant="destructive"
									disabled={deleteSchedule.isPending}
									aria-label={`Delete schedule ${schedule.name}`}
								>
									<Trash2 className="mr-1 h-4 w-4" />
									Delete
								</Button>
							}
							title="Delete schedule"
							description={`Delete ${schedule.name}? This removes the schedule template.`}
							confirmLabel="Delete"
							onConfirm={() => deleteSchedule.mutateAsync()}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

interface ShiftRowProps {
	shift: {
		id: string;
		membershipId: string;
		dayOfWeek: number;
		startTime: string;
		endTime: string;
		classroomId: string;
	};
	classroomName: string;
	memberName?: string;
	isStaff: boolean;
	members: CenterMember[];
	activeClassrooms: { id: string; name: string }[];
}

function ShiftRow({
	shift,
	classroomName,
	memberName,
	isStaff,
	members,
	activeClassrooms,
}: ShiftRowProps) {
	const deleteShift = useDeleteShift(shift.id);
	const updateShift = useUpdateShift(shift.id);

	const [editOpen, setEditOpen] = useState(false);
	const [editMembershipId, setEditMembershipId] = useState(shift.membershipId);
	const [editClassroomId, setEditClassroomId] = useState(shift.classroomId);
	const [editDayOfWeek, setEditDayOfWeek] = useState(String(shift.dayOfWeek));
	const [editStartTime, setEditStartTime] = useState(shift.startTime);
	const [editEndTime, setEditEndTime] = useState(shift.endTime);
	const [editFormError, setEditFormError] = useState<string | null>(null);

	const dayLabel = WEEKDAY_LABELS[shift.dayOfWeek] ?? "Day";

	function handleEditShiftSubmit(e: React.FormEvent) {
		e.preventDefault();
		setEditFormError(null);
		if (!editMembershipId || !editClassroomId || !editDayOfWeek || !editStartTime || !editEndTime) {
			setEditFormError("All fields are required.");
			return;
		}
		const toMinutes = (t: string) => {
			const [h, m] = t.split(":").map(Number);
			return (h ?? 0) * 60 + (m ?? 0);
		};
		if (toMinutes(editEndTime) <= toMinutes(editStartTime)) {
			setEditFormError("End time must be after start time.");
			return;
		}
		updateShift.mutate(
			{
				membershipId: editMembershipId,
				classroomId: editClassroomId,
				dayOfWeek: Number(editDayOfWeek),
				startTime: editStartTime,
				endTime: editEndTime,
			},
			{
				onSuccess: () => {
					setEditOpen(false);
					setEditFormError(null);
				},
				onError: (err) => {
					setEditFormError(extractErrorMessage(err, "Could not update shift."));
				},
			},
		);
	}

	return (
		<div className="rounded-lg border border-border bg-background p-4">
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="font-medium text-foreground">
						{dayLabel} {shift.startTime} - {shift.endTime}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{classroomName}
						{!isStaff && memberName ? ` · ${memberName}` : ""}
					</p>
				</div>
				{!isStaff && (
					<div className="flex shrink-0 items-center gap-2">
						<Dialog
							open={editOpen}
							onOpenChange={(open) => {
								setEditOpen(open);
								if (!open) {
									setEditMembershipId(shift.membershipId);
									setEditClassroomId(shift.classroomId);
									setEditDayOfWeek(String(shift.dayOfWeek));
									setEditStartTime(shift.startTime);
									setEditEndTime(shift.endTime);
									setEditFormError(null);
								}
							}}
						>
							<DialogTrigger asChild>
								<Button
									size="sm"
									variant="outline"
									aria-label={`Edit shift ${dayLabel} ${shift.startTime}`}
								>
									<Pencil className="mr-1 h-4 w-4" />
									Edit
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Edit shift</DialogTitle>
									<DialogDescription className="sr-only">
										Edit the recurring shift details.
									</DialogDescription>
								</DialogHeader>
								<form onSubmit={handleEditShiftSubmit} className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor={`edit-shift-member-${shift.id}`}>Staff member</Label>
										<Select value={editMembershipId} onValueChange={setEditMembershipId}>
											<SelectTrigger id={`edit-shift-member-${shift.id}`}>
												<SelectValue placeholder="Select staff member" />
											</SelectTrigger>
											<SelectContent>
												{members.map((m) => (
													<SelectItem key={m.id} value={m.id}>
														{m.userName ?? m.userEmail ?? m.id}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`edit-shift-classroom-${shift.id}`}>Classroom</Label>
										<Select value={editClassroomId} onValueChange={setEditClassroomId}>
											<SelectTrigger id={`edit-shift-classroom-${shift.id}`}>
												<SelectValue placeholder="Select classroom" />
											</SelectTrigger>
											<SelectContent>
												{activeClassrooms.map((c) => (
													<SelectItem key={c.id} value={c.id}>
														{c.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`edit-shift-day-${shift.id}`}>Day</Label>
										<Select value={editDayOfWeek} onValueChange={setEditDayOfWeek}>
											<SelectTrigger id={`edit-shift-day-${shift.id}`}>
												<SelectValue placeholder="Select day" />
											</SelectTrigger>
											<SelectContent>
												{WEEKDAY_FULL.map((label, idx) => (
													<SelectItem key={label} value={String(idx)}>
														{label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`edit-shift-start-${shift.id}`}>Start time</Label>
										<Input
											id={`edit-shift-start-${shift.id}`}
											type="time"
											value={editStartTime}
											onChange={(e) => setEditStartTime(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`edit-shift-end-${shift.id}`}>End time</Label>
										<Input
											id={`edit-shift-end-${shift.id}`}
											type="time"
											value={editEndTime}
											onChange={(e) => setEditEndTime(e.target.value)}
										/>
									</div>
									{editFormError && (
										<p aria-live="polite" className="text-sm text-destructive">
											{editFormError}
										</p>
									)}
									<Button type="submit" disabled={updateShift.isPending} className="w-full">
										Save shift
									</Button>
								</form>
							</DialogContent>
						</Dialog>
						<ConfirmDestructiveDialog
							trigger={
								<Button
									size="sm"
									variant="destructive"
									disabled={deleteShift.isPending}
									aria-label={`Delete shift for ${dayLabel} ${shift.startTime}`}
								>
									<Trash2 className="mr-1 h-4 w-4" />
									Delete
								</Button>
							}
							title="Delete shift"
							description="Delete this recurring shift?"
							confirmLabel="Delete"
							onConfirm={() => deleteShift.mutateAsync()}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

export function SchedulingPage() {
	const { data: session } = useAuthSession();
	const isStaff = session?.membership.role === "staff";
	const {
		data: classrooms,
		isLoading: classroomsLoading,
		isError: classroomsError,
		refetch: refetchClassrooms,
	} = useClassrooms();
	const {
		data: schedules,
		isLoading: schedulesLoading,
		isError: schedulesError,
		refetch: refetchSchedules,
	} = useSchedules();
	const {
		data: shifts,
		isLoading: shiftsLoading,
		isError: shiftsError,
		refetch: refetchShifts,
	} = useShifts(
		session?.membership.role === "staff" ? { membershipId: session.membership.id } : undefined,
	);
	// GET /api/members is Owner/Director only. Staff never see member names in this
	// view (ShiftRow hides them) and the roster count is irrelevant to them, so
	// skip the query for staff to avoid a guaranteed 403 and a misleading count.
	const { data: members } = useMembers({ enabled: !isStaff });
	const createSchedule = useCreateSchedule();
	const createShift = useCreateShift();

	const [newScheduleOpen, setNewScheduleOpen] = useState(false);
	const [scheduleName, setScheduleName] = useState("");
	const [scheduleEffectiveFrom, setScheduleEffectiveFrom] = useState("");
	const [scheduleEffectiveUntil, setScheduleEffectiveUntil] = useState("");
	const [scheduleFormError, setScheduleFormError] = useState<string | null>(null);

	const visibleSchedules = schedules ?? [];
	const visibleShifts = shifts ?? [];
	const allClassrooms = classrooms ?? [];
	const allMembers = members ?? [];
	const activeClassrooms = allClassrooms.filter((c) => c.archivedAt === null);
	const classroomNameById = new Map(allClassrooms.map((c) => [c.id, c.name]));
	const memberNameById = new Map(
		allMembers.map((m) => [m.id, m.userName ?? m.userEmail ?? "Unknown"]),
	);
	const hasActiveClassrooms = activeClassrooms.length > 0;
	const coverageSummaryItems = [
		{
			label: "Templates",
			value: `${visibleSchedules.length} template${visibleSchedules.length === 1 ? "" : "s"}`,
		},
		{
			label: "Shifts",
			value: `${visibleShifts.length} shift${visibleShifts.length === 1 ? "" : "s"}`,
		},
		{
			label: "Rooms",
			value: `${activeClassrooms.length} active room${activeClassrooms.length === 1 ? "" : "s"}`,
		},
		// The roster count comes from the Owner/Director-only members query, so only
		// show it to those roles (staff skip the query entirely).
		...(isStaff
			? []
			: [
					{
						label: "Staff",
						value: `${allMembers.length} staff`,
					},
				]),
	];

	const pageDescription = isStaff
		? "View your assigned shifts and saved schedule templates."
		: "Review saved schedule templates and recurring staff shifts.";
	const scheduleEmptyState = hasActiveClassrooms
		? {
				actionLabel: "Open attendance",
				actionTo: "/attendance" as const,
				description: "Use Attendance for today's coverage while recurring plans are still empty.",
				title: "No saved schedule templates",
			}
		: {
				actionLabel: "Review classrooms",
				actionTo: "/classrooms" as const,
				description: "Create classrooms first so recurring staffing can be organized by room.",
				title: "Add classrooms before building a schedule",
			};

	function resetNewScheduleForm() {
		setScheduleName("");
		setScheduleEffectiveFrom("");
		setScheduleEffectiveUntil("");
	}

	function handleNewScheduleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!scheduleName.trim() || !scheduleEffectiveFrom) return;
		createSchedule.mutate(
			{
				name: scheduleName.trim(),
				effectiveFrom: scheduleEffectiveFrom,
				effectiveUntil: scheduleEffectiveUntil || undefined,
			},
			{
				onSuccess: () => {
					setNewScheduleOpen(false);
					setScheduleFormError(null);
					resetNewScheduleForm();
				},
				onError: (err) => {
					setScheduleFormError(extractErrorMessage(err, "Could not create schedule."));
				},
			},
		);
	}

	if (schedulesLoading || shiftsLoading || classroomsLoading) {
		return <SchedulingSkeleton />;
	}

	// Any of the three queries failing must surface an explicit error + retry rather than
	// degrading into a false "no schedules / no classrooms" empty state.
	if (schedulesError || shiftsError || classroomsError) {
		return (
			<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p className="text-sm text-destructive">Failed to load scheduling data.</p>
				<button
					type="button"
					onClick={() => {
						void refetchSchedules();
						void refetchShifts();
						void refetchClassrooms();
					}}
					className="mt-3 text-sm font-medium text-primary hover:underline"
				>
					Try again
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="rounded-xl border border-border bg-background p-6 shadow-sm">
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">Scheduling</h1>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{pageDescription}</p>
			</section>
			<PageHelpPanel route="/scheduling" />

			<ComplianceSummary title="Coverage summary" tone="primary" items={coverageSummaryItems} />

			<Card className="border-border shadow-sm">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-base text-foreground">Saved schedule templates</CardTitle>
					{!isStaff && (
						<Dialog
							open={newScheduleOpen}
							onOpenChange={(open) => {
								setNewScheduleOpen(open);
								if (!open) setScheduleFormError(null);
							}}
						>
							<DialogTrigger asChild>
								<Button size="sm">
									<Plus className="mr-1 h-4 w-4" />
									New schedule
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>New schedule</DialogTitle>
									<DialogDescription className="sr-only">
										Create a new recurring schedule template.
									</DialogDescription>
								</DialogHeader>
								<form onSubmit={handleNewScheduleSubmit} className="space-y-4">
									<div className="space-y-2">
										<FieldHelp
											htmlFor="schedule-name"
											label="Name"
											help="Use a plain name like Spring plan or Summer staffing."
										/>
										<Input
											id="schedule-name"
											value={scheduleName}
											onChange={(e) => setScheduleName(e.target.value)}
											placeholder="e.g. Spring plan"
										/>
									</div>
									<div className="space-y-2">
										<FieldHelp
											htmlFor="schedule-effective-from"
											label="Effective from"
											help="The first day this schedule should be used."
										/>
										<DateInput
											id="schedule-effective-from"
											value={scheduleEffectiveFrom}
											onChange={(e) => setScheduleEffectiveFrom(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<FieldHelp
											htmlFor="schedule-effective-until"
											label="Effective until"
											help="Optional. Leave blank if this schedule does not have an end date yet."
										/>
										<DateInput
											id="schedule-effective-until"
											value={scheduleEffectiveUntil}
											onChange={(e) => setScheduleEffectiveUntil(e.target.value)}
										/>
									</div>
									{scheduleFormError ? (
										<p role="alert" className="text-sm text-destructive">
											{scheduleFormError}
										</p>
									) : null}
									<Button
										type="submit"
										disabled={
											createSchedule.isPending ||
											!scheduleName.trim() ||
											!scheduleEffectiveFrom ||
											Boolean(
												scheduleEffectiveUntil &&
													scheduleEffectiveFrom &&
													scheduleEffectiveUntil < scheduleEffectiveFrom,
											)
										}
										className="w-full"
									>
										Create schedule
									</Button>
								</form>
							</DialogContent>
						</Dialog>
					)}
				</CardHeader>
				<CardContent className="space-y-3">
					{visibleSchedules.length === 0 ? (
						<EmptyState
							tone="operations"
							shape="inline"
							icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
							title={scheduleEmptyState.title}
							description={scheduleEmptyState.description}
							action={
								<Button asChild size="sm" variant="outline">
									<Link to={scheduleEmptyState.actionTo}>{scheduleEmptyState.actionLabel}</Link>
								</Button>
							}
						/>
					) : (
						visibleSchedules.map((schedule) => (
							<ScheduleRow
								key={schedule.id}
								schedule={schedule}
								isStaff={isStaff}
								members={allMembers}
								activeClassrooms={activeClassrooms}
								createShiftIsPending={createShift.isPending}
								onCreateShift={createShift.mutateAsync}
							/>
						))
					)}
				</CardContent>
			</Card>

			<Card className="border-border shadow-sm">
				<CardHeader>
					<CardTitle className="text-base text-foreground">
						{isStaff ? "Your shifts" : "Recurring shifts"}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{visibleShifts.length === 0 ? (
						<EmptyState
							tone="operations"
							shape="inline"
							icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
							title="No recurring shifts assigned"
							description="This page only shows shifts that already exist in the system."
							action={
								<Button asChild size="sm" variant="outline">
									<Link to="/attendance">Open attendance</Link>
								</Button>
							}
						/>
					) : (
						visibleShifts.map((shift) => (
							<ShiftRow
								key={shift.id}
								shift={shift}
								classroomName={classroomNameById.get(shift.classroomId) ?? shift.classroomId}
								memberName={memberNameById.get(shift.membershipId)}
								isStaff={isStaff}
								members={allMembers}
								activeClassrooms={activeClassrooms}
							/>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function SchedulingSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-72" />
			</div>
			<Skeleton className="h-48 rounded-lg" />
			<Skeleton className="h-64 rounded-lg" />
		</div>
	);
}

function formatDate(value: string) {
	// Parse YYYY-MM-DD as local midnight to avoid UTC→local shift
	const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	const date = dateOnlyMatch
		? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
		: new Date(value);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
