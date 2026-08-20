import type { ClassroomWithCounts, UpdateClassroomInput } from "@pebbledesk/shared";
import { AGE_GROUPS } from "@pebbledesk/shared/constants";
import { Button } from "@pebbledesk/ui/components/button";
import { Card } from "@pebbledesk/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
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
import { Separator } from "@pebbledesk/ui/components/separator";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@pebbledesk/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pebbledesk/ui/components/tabs";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Pencil, Plus, School, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CapacityBar } from "../../../components/capacity-bar";
import { ComplianceSummary, ConfirmDestructiveDialog } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { StatusBadge } from "../../../components/status-badge";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { useChildren } from "../../../hooks/use-children";
import {
	useArchiveClassroom,
	useAssignChild,
	useAssignStaff,
	useClassroom,
	useClassroomChildren,
	useClassroomStaff,
	useUnarchiveClassroom,
	useUnassignChild,
	useUnassignStaff,
	useUpdateClassroom,
} from "../../../hooks/use-classrooms";
import { useMembers } from "../../../hooks/use-members";
import { useRatios } from "../../../hooks/use-ratios";
import { formatLocalDate as formatLocalDateTz } from "../../../lib/dates";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { formatDate as formatCenterDate } from "../../../lib/format-date";
import { requireDirectorOrOwner } from "../../../lib/role-guards";
import { formatAgeGroup, getComplianceStatus } from "./index";

export const Route = createFileRoute("/_auth/classrooms/$id")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: ClassroomDetailPage,
});

function formatLocalDate(value: string, timezone?: string): string {
	// Fall back to "America/Los_Angeles" if center has no timezone configured.
	return formatCenterDate(value, { centerTimezone: timezone ?? "America/Los_Angeles" });
}

function ClassroomDetailPage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { data: session } = useAuthSession();
	// Fall back to "America/Los_Angeles" if center has no timezone configured
	const centerTimezone = session?.center.timezone ?? "America/Los_Angeles";
	const { data: classroom, isLoading } = useClassroom(id);
	const { data: ratios } = useRatios();
	const { data: children, isLoading: childrenLoading } = useClassroomChildren(id);
	const { data: staff, isLoading: staffLoading } = useClassroomStaff(id);
	const updateClassroom = useUpdateClassroom(id);
	const archiveClassroom = useArchiveClassroom(id);
	const unarchiveClassroom = useUnarchiveClassroom(id);

	const [editOpen, setEditOpen] = useState(false);
	const [editError, setEditError] = useState<string | null>(null);
	const [archiveOpen, setArchiveOpen] = useState(false);
	const [archiveError, setArchiveError] = useState<string | null>(null);
	const [assignChildOpen, setAssignChildOpen] = useState(false);
	const [assignStaffOpen, setAssignStaffOpen] = useState(false);

	// #24: useMemo must be called unconditionally (before any early return) to satisfy Rules of Hooks.
	// Guard if ratios is undefined/empty to avoid crashes.
	const liveRatio = useMemo(() => {
		if (!ratios || ratios.length === 0 || !classroom) return undefined;
		return ratios.find((ratio) => ratio.classroomId === classroom.id);
	}, [ratios, classroom]);

	if (isLoading) {
		return <DetailSkeleton />;
	}

	if (!classroom) {
		return (
			<EmptyState
				tone="operations"
				icon={<School className="h-6 w-6" aria-hidden="true" />}
				title="Classroom not found"
				description="The classroom you're looking for doesn't exist or has been removed."
				actionLabel="Back to classrooms"
				onAction={() => navigate({ to: "/classrooms" })}
			/>
		);
	}

	const status = getComplianceStatus(classroom, liveRatio);
	const openSlots = Math.max(classroom.maxCapacity - classroom.childCount, 0);
	// Use the backend-resolved effective ratio (which already applies the stricter
	// of the classroom-configured and state-mandated minimums) so the "Staff needed"
	// count and the displayed ratio match the Ratios page and Attendance banner.
	// Fall back to the raw classroom value when live ratio data isn't loaded yet.
	const effectiveMinRatioChildren = liveRatio?.minRatioChildren ?? classroom.minRatioChildren;
	const effectiveMinRatioStaff = liveRatio?.minRatioStaff ?? classroom.minRatioStaff;
	const requiredStaff = Math.ceil(
		classroom.childCount / Math.max(effectiveMinRatioChildren / effectiveMinRatioStaff, 1),
	);
	const ratioLabel = `${effectiveMinRatioStaff}:${effectiveMinRatioChildren}`;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold text-foreground">{classroom.name}</h1>
						<StatusBadge status={status} />
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{formatAgeGroup(classroom.ageGroup)} · {ratioLabel} ratio
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={() => setEditOpen(true)}>
						<Pencil className="mr-2 h-4 w-4" />
						Edit
					</Button>
					{classroom.archivedAt ? (
						<Button
							variant="outline"
							onClick={async () => {
								await unarchiveClassroom.mutateAsync();
							}}
							disabled={unarchiveClassroom.isPending}
						>
							<ArchiveRestore className="mr-2 h-4 w-4" />
							{unarchiveClassroom.isPending ? "Restoring..." : "Restore"}
						</Button>
					) : (
						<Button variant="outline" onClick={() => setArchiveOpen(true)}>
							<Archive className="mr-2 h-4 w-4" />
							Archive
						</Button>
					)}
				</div>
			</div>

			<ComplianceSummary
				title="Compliance summary"
				tone={status === "violation" || status === "near-capacity" ? "warning" : "success"}
				items={[
					{ label: "Status", value: status === "violation" ? "Needs review" : status },
					{ label: "Capacity", value: `${openSlots} open` },
					{ label: "Staff", value: `${classroom.staffCount}/${requiredStaff} needed` },
					{ label: "Ratio", value: ratioLabel },
				]}
			/>

			<CapacityBar current={classroom.childCount} max={classroom.maxCapacity} />

			<Separator />

			<Tabs defaultValue="children" className="space-y-4">
				<TabsList>
					<TabsTrigger value="children">Children ({children?.length ?? 0})</TabsTrigger>
					<TabsTrigger value="staff">Staff ({staff?.length ?? 0})</TabsTrigger>
				</TabsList>

				<TabsContent value="children" className="space-y-4">
					{!classroom.archivedAt && (
						<div className="flex justify-end">
							<Button onClick={() => setAssignChildOpen(true)}>
								<Plus className="mr-2 h-4 w-4" />
								Assign Child
							</Button>
						</div>
					)}
					{childrenLoading ? (
						<TableSkeleton rows={3} cols={5} />
					) : !children || children.length === 0 ? (
						<EmptyState
							tone="people"
							title="Time to place children in this room"
							description="Assign children so attendance and ratios start tracking for this room."
							actionLabel={classroom.archivedAt ? undefined : "Assign Child"}
							onAction={classroom.archivedAt ? undefined : () => setAssignChildOpen(true)}
						/>
					) : (
						<ChildrenTable classroomId={id} childRows={children} timezone={centerTimezone} />
					)}
				</TabsContent>

				<TabsContent value="staff" className="space-y-4">
					{!classroom.archivedAt && (
						<div className="flex justify-end">
							<Button onClick={() => setAssignStaffOpen(true)}>
								<Plus className="mr-2 h-4 w-4" />
								Assign Staff
							</Button>
						</div>
					)}
					{staffLoading ? (
						<TableSkeleton rows={3} cols={4} />
					) : !staff || staff.length === 0 ? (
						<EmptyState
							tone="operations"
							title="Add a team member to this room"
							description="Assign team members so this room stays in ratio throughout the day."
							actionLabel={classroom.archivedAt ? undefined : "Assign Staff"}
							onAction={classroom.archivedAt ? undefined : () => setAssignStaffOpen(true)}
						/>
					) : (
						<StaffTable classroomId={id} staff={staff} timezone={centerTimezone} />
					)}
				</TabsContent>
			</Tabs>

			<EditClassroomDialog
				classroom={classroom}
				open={editOpen}
				onOpenChange={(next) => {
					setEditOpen(next);
					if (!next) setEditError(null);
				}}
				onSubmit={async (input) => {
					try {
						await updateClassroom.mutateAsync(input);
						setEditOpen(false);
						setEditError(null);
					} catch (err) {
						setEditError(extractErrorMessage(err, "Could not save changes."));
					}
				}}
				isSubmitting={updateClassroom.isPending}
				error={editError}
			/>

			<ArchiveConfirmDialog
				open={archiveOpen}
				onOpenChange={(next) => {
					setArchiveOpen(next);
					if (!next) setArchiveError(null);
				}}
				onConfirm={async () => {
					try {
						await archiveClassroom.mutateAsync();
						setArchiveOpen(false);
						setArchiveError(null);
						navigate({ to: "/classrooms" });
					} catch (err) {
						setArchiveError(extractErrorMessage(err, "Could not archive classroom."));
					}
				}}
				isSubmitting={archiveClassroom.isPending}
				error={archiveError}
			/>

			<AssignChildDialog
				classroomId={id}
				open={assignChildOpen}
				onOpenChange={setAssignChildOpen}
			/>

			<AssignStaffDialog
				classroomId={id}
				assignedMembershipIds={staff?.map((member) => member.membershipId) ?? []}
				open={assignStaffOpen}
				onOpenChange={setAssignStaffOpen}
			/>
		</div>
	);
}

interface ChildRow {
	assignmentId: string;
	childId: string;
	effectiveDate: string;
	firstName: string | null;
	lastName: string | null;
	dateOfBirth: string | null;
	ageGroup: string | null;
}

function ChildrenTable({
	classroomId,
	childRows,
	timezone,
}: {
	classroomId: string;
	childRows: ChildRow[];
	timezone: string;
}) {
	const unassignChild = useUnassignChild(classroomId);

	return (
		<Card>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Age Group</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Since</TableHead>
						<TableHead className="w-16" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{childRows.map((child) => (
						<TableRow key={child.assignmentId}>
							<TableCell className="font-medium">
								{child.firstName} {child.lastName}
							</TableCell>
							<TableCell>{child.ageGroup ? formatAgeGroup(child.ageGroup) : "\u2014"}</TableCell>
							<TableCell>
								<StatusBadge status="active" />
							</TableCell>
							<TableCell className="text-sm text-muted-foreground">
								{formatLocalDate(child.effectiveDate, timezone)}
							</TableCell>
							<TableCell>
								<ConfirmDestructiveDialog
									trigger={
										<Button
											variant="ghost"
											size="sm"
											aria-label={`Unassign ${child.firstName ?? ""} ${child.lastName ?? ""}`.trim()}
											disabled={unassignChild.isPending}
										>
											<X className="h-4 w-4" />
										</Button>
									}
									title="Unassign child?"
									description={`This will remove ${child.firstName ?? "this child"} from the classroom. You can reassign them at any time.`}
									confirmLabel="Unassign"
									onConfirm={() => unassignChild.mutate(child.childId)}
								/>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
}

interface StaffRow {
	assignmentId: string;
	membershipId: string;
	effectiveDate: string;
	role: string | null;
	userName: string | null;
	userEmail: string | null;
}

function StaffTable({
	classroomId,
	staff,
	timezone,
}: {
	classroomId: string;
	staff: StaffRow[];
	timezone: string;
}) {
	const unassignStaff = useUnassignStaff(classroomId);

	return (
		<Card>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Role</TableHead>
						<TableHead>Since</TableHead>
						<TableHead className="w-16" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{staff.map((member) => (
						<TableRow key={member.assignmentId}>
							<TableCell className="font-medium">
								{member.userName ?? member.userEmail ?? "Unknown"}
							</TableCell>
							<TableCell>{member.role ? formatAgeGroup(member.role) : "\u2014"}</TableCell>
							<TableCell className="text-sm text-muted-foreground">
								{formatLocalDate(member.effectiveDate, timezone)}
							</TableCell>
							<TableCell>
								<ConfirmDestructiveDialog
									trigger={
										<Button
											variant="ghost"
											size="sm"
											aria-label={`Unassign ${member.userName ?? member.userEmail ?? "staff member"}`}
											disabled={unassignStaff.isPending}
										>
											<X className="h-4 w-4" />
										</Button>
									}
									title="Unassign staff?"
									description={`This will remove ${member.userName ?? member.userEmail ?? "this staff member"} from the classroom. You can reassign them at any time.`}
									confirmLabel="Unassign"
									onConfirm={() => unassignStaff.mutate(member.membershipId)}
								/>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
}

function EditClassroomDialog({
	classroom,
	open,
	onOpenChange,
	onSubmit,
	isSubmitting,
	error,
}: {
	classroom: ClassroomWithCounts;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (input: UpdateClassroomInput) => Promise<void>;
	isSubmitting: boolean;
	error?: string | null;
}) {
	const [name, setName] = useState(classroom.name);
	const [ageGroup, setAgeGroup] = useState<string>(classroom.ageGroup);
	const [maxCapacity, setMaxCapacity] = useState(classroom.maxCapacity.toString());
	const [minRatioStaff, setMinRatioStaff] = useState(classroom.minRatioStaff.toString());
	const [minRatioChildren, setMinRatioChildren] = useState(classroom.minRatioChildren.toString());

	const isPositiveInteger = (value: string) => {
		const n = Number(value);
		return Number.isInteger(n) && n > 0;
	};

	const isValid =
		name.trim() &&
		ageGroup &&
		isPositiveInteger(maxCapacity) &&
		isPositiveInteger(minRatioStaff) &&
		isPositiveInteger(minRatioChildren);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!isValid) return;
		await onSubmit({
			name: name.trim(),
			ageGroup: ageGroup as UpdateClassroomInput["ageGroup"],
			maxCapacity: Number(maxCapacity),
			minRatioStaff: Number(minRatioStaff),
			minRatioChildren: Number(minRatioChildren),
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Classroom</DialogTitle>
					<DialogDescription className="sr-only">
						Update the room details and staffing ratio.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="edit-name">Name</Label>
						<Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="edit-age-group">Age Group</Label>
						<Select value={ageGroup} onValueChange={setAgeGroup}>
							<SelectTrigger id="edit-age-group">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{AGE_GROUPS.map((ag) => (
									<SelectItem key={ag} value={ag}>
										{formatAgeGroup(ag)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="edit-capacity">Max Capacity</Label>
						<Input
							id="edit-capacity"
							type="number"
							min={1}
							step="1"
							value={maxCapacity}
							onChange={(e) => setMaxCapacity(e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="edit-ratio-staff">Staff (ratio)</Label>
							<Input
								id="edit-ratio-staff"
								type="number"
								min={1}
								step="1"
								value={minRatioStaff}
								onChange={(e) => setMinRatioStaff(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-ratio-children">Children (ratio)</Label>
							<Input
								id="edit-ratio-children"
								type="number"
								min={1}
								step="1"
								value={minRatioChildren}
								onChange={(e) => setMinRatioChildren(e.target.value)}
							/>
						</div>
					</div>
					{error ? (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					) : null}
					<Button type="submit" disabled={!isValid || isSubmitting} className="w-full">
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ArchiveConfirmDialog({
	open,
	onOpenChange,
	onConfirm,
	isSubmitting,
	error,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => Promise<void>;
	isSubmitting: boolean;
	error?: string | null;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Archive Classroom</DialogTitle>
				</DialogHeader>
				<DialogDescription className="text-sm text-muted-foreground">
					Archiving removes this classroom from the active list. You can still view it by toggling
					"Show archived."
				</DialogDescription>
				{error ? (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				) : null}
				<div className="flex justify-end gap-2 mt-4">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={onConfirm} disabled={isSubmitting}>
						{isSubmitting ? "Archiving..." : "Archive"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function AssignChildDialog({
	classroomId,
	open,
	onOpenChange,
}: {
	classroomId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: session } = useAuthSession();
	const { data: allChildren } = useChildren({ status: "active" });
	const { data: classroomChildren } = useClassroomChildren(classroomId);
	const assignChild = useAssignChild(classroomId);
	const [selectedChildId, setSelectedChildId] = useState("");
	const [assignChildError, setAssignChildError] = useState<string | null>(null);

	const assignedIds = new Set(classroomChildren?.map((c) => c.childId) ?? []);
	const availableChildren = allChildren?.filter((c) => !assignedIds.has(c.id)) ?? [];

	const handleAssign = async () => {
		if (!selectedChildId) return;
		try {
			await assignChild.mutateAsync({
				childId: selectedChildId,
				effectiveDate: formatLocalDateTz(session?.center.timezone ?? "UTC"),
			});
			setSelectedChildId("");
			setAssignChildError(null);
			onOpenChange(false);
		} catch (err) {
			setAssignChildError(extractErrorMessage(err, "Could not assign child."));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setAssignChildError(null);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Assign Child</DialogTitle>
					<DialogDescription className="sr-only">
						Choose an unassigned child to move into this classroom.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="assign-child-select">Select Child</Label>
						<Select value={selectedChildId} onValueChange={setSelectedChildId}>
							<SelectTrigger id="assign-child-select">
								<SelectValue placeholder="Choose a child" />
							</SelectTrigger>
							<SelectContent>
								{availableChildren.map((child) => (
									<SelectItem key={child.id} value={child.id}>
										{child.firstName} {child.lastName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{assignChildError ? (
						<p role="alert" className="text-sm text-destructive">
							{assignChildError}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleAssign} disabled={!selectedChildId || assignChild.isPending}>
							{assignChild.isPending ? "Assigning..." : "Assign"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function AssignStaffDialog({
	classroomId,
	assignedMembershipIds,
	open,
	onOpenChange,
}: {
	classroomId: string;
	assignedMembershipIds: string[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: session } = useAuthSession();
	const assignStaff = useAssignStaff(classroomId);
	const { data: members, isLoading: membersLoading } = useMembers();
	const [membershipId, setMembershipId] = useState("");
	const [assignStaffError, setAssignStaffError] = useState<string | null>(null);
	const eligibleMembers =
		members?.filter((member) => member.acceptedAt && !assignedMembershipIds.includes(member.id)) ??
		[];

	const handleAssign = async () => {
		if (!membershipId) return;
		try {
			await assignStaff.mutateAsync({
				membershipId,
				effectiveDate: formatLocalDateTz(session?.center.timezone ?? "UTC"),
			});
			setMembershipId("");
			setAssignStaffError(null);
			onOpenChange(false);
		} catch (err) {
			setAssignStaffError(extractErrorMessage(err, "Could not assign staff."));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setAssignStaffError(null);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Assign Staff</DialogTitle>
					<DialogDescription>
						Choose a team member who has already accepted their center access.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="assign-staff-member">Staff member</Label>
						<Select value={membershipId} onValueChange={setMembershipId}>
							<SelectTrigger id="assign-staff-member" aria-label="Staff member">
								<SelectValue
									placeholder={
										membersLoading
											? "Loading team members..."
											: eligibleMembers.length > 0
												? "Select a staff member"
												: "No accepted team members available"
									}
								/>
							</SelectTrigger>
							<SelectContent>
								{eligibleMembers.map((member) => (
									<SelectItem key={member.id} value={member.id}>
										{formatMemberOption(member)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{assignStaffError ? (
						<p role="alert" className="text-sm text-destructive">
							{assignStaffError}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleAssign}
							disabled={!membershipId || assignStaff.isPending || membersLoading}
						>
							{assignStaff.isPending ? "Assigning..." : "Assign"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function formatMemberOption(member: {
	userName: string | null;
	role: string | null;
	userEmail: string | null;
}) {
	const name = member.userName ?? member.userEmail ?? "Unnamed team member";
	const role = member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : "Team";
	return `${name} - ${role}${member.userEmail ? ` - ${member.userEmail}` : ""}`;
}

function DetailSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex justify-between">
				<div className="space-y-2">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-32" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-9 w-20" />
					<Skeleton className="h-9 w-24" />
				</div>
			</div>
			<Skeleton className="h-1.5 w-full rounded-full" />
			<Separator />
			<Skeleton className="h-10 w-48" />
			<TableSkeleton rows={3} cols={4} />
		</div>
	);
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
	const rowKeys = Array.from({ length: rows }, (_, r) => `row-${String(r)}`);
	const colKeys = Array.from({ length: cols }, (_, c) => `col-${String(c)}`);
	return (
		<Card>
			<div className="p-4 space-y-3">
				{rowKeys.map((rowKey) => (
					<div key={rowKey} className="flex gap-4">
						{colKeys.map((colKey) => (
							<Skeleton key={`${rowKey}-${colKey}`} className="h-4 flex-1" />
						))}
					</div>
				))}
			</div>
		</Card>
	);
}
