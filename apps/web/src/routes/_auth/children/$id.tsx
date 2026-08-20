import type { UpdateChildInput } from "@pebbledesk/shared";
import type { AgeGroup } from "@pebbledesk/shared/constants";
import { AGE_GROUPS } from "@pebbledesk/shared/constants";
import { createGuardianSchema } from "@pebbledesk/shared/validators";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Checkbox } from "@pebbledesk/ui/components/checkbox";
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
import { Textarea } from "@pebbledesk/ui/components/textarea";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Baby, Link2, Pencil, Plus, RotateCcw, Trash2, UserMinus } from "lucide-react";
import { useState } from "react";
import { AttendanceCalendar } from "../../../components/attendance-calendar";
import { DateInput } from "../../../components/date-input";
import {
	ComplianceSummary,
	ConfirmDestructiveDialog,
	ReadinessStrip,
} from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { StatusBadge } from "../../../components/status-badge";
import { SubsidyCaseDialog } from "../../../components/subsidy/subsidy-case-dialog";
import { SubsidyClaimDialog } from "../../../components/subsidy/subsidy-claim-dialog";
import { SubsidySummaryCard } from "../../../components/subsidy-summary-card";
import { useAuthSession } from "../../../hooks/use-auth-session";
import {
	useChild,
	useLinkGuardian,
	useReactivateChild,
	useUnlinkGuardian,
	useUpdateChild,
	useUpdateGuardianLink,
	useWithdrawChild,
} from "../../../hooks/use-children";
import { useAssignChild, useClassrooms } from "../../../hooks/use-classrooms";
import { useChildSubsidySummary } from "../../../hooks/use-finance";
import { useCreateGuardian, useDeleteGuardian, useGuardians } from "../../../hooks/use-guardians";
import { formatLocalDate } from "../../../lib/dates";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { formatPhoneNumber } from "../../../lib/format-phone";

export const Route = createFileRoute("/_auth/children/$id")({
	component: ChildProfilePage,
});

function formatAgeGroup(ageGroup: string): string {
	return ageGroup.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateString: string): string {
	const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
	const date = dateOnlyMatch
		? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 12)
		: new Date(dateString);

	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function calculateAge(dateOfBirth: string): string {
	const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
	const dob = dateOnlyMatch
		? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 12)
		: new Date(dateOfBirth);
	const now = new Date();
	let years = now.getFullYear() - dob.getFullYear();
	let months = now.getMonth() - dob.getMonth();
	if (months < 0) {
		years--;
		months += 12;
	}
	if (now.getDate() < dob.getDate()) {
		months--;
		if (months < 0) {
			years--;
			months += 12;
		}
	}
	if (years > 0) {
		return `${years} yr${years !== 1 ? "s" : ""}, ${months} mo${months !== 1 ? "s" : ""}`;
	}
	return `${months} mo${months !== 1 ? "s" : ""}`;
}

export function ChildProfilePage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { data: authSession } = useAuthSession();
	// Guardian management and subsidy tracking are Owner/Director only on the
	// backend. Staff can still read the child profile (scoped GET), so instead of
	// guarding the whole route we hide those owner/director-only affordances and
	// skip their role-gated GETs to avoid silent 403s on mount.
	const isStaff = authSession?.membership?.role === "staff";
	const { data, isLoading, isError, refetch } = useChild(id);
	const { data: subsidySummary, isLoading: subsidyLoading } = useChildSubsidySummary(id, {
		enabled: !isStaff,
	});
	const updateChild = useUpdateChild(id);
	const withdrawChild = useWithdrawChild(id);
	const reactivateChild = useReactivateChild(id);

	const [editMode, setEditMode] = useState(false);
	const [withdrawOpen, setWithdrawOpen] = useState(false);
	const [withdrawError, setWithdrawError] = useState<string | null>(null);
	const [assignOpen, setAssignOpen] = useState(false);
	const [linkGuardianOpen, setLinkGuardianOpen] = useState(false);
	const [addGuardianOpen, setAddGuardianOpen] = useState(false);
	const [subsidyCaseOpen, setSubsidyCaseOpen] = useState(false);
	const [subsidyClaimOpen, setSubsidyClaimOpen] = useState(false);

	if (isLoading) {
		return <ProfileSkeleton />;
	}

	if (isError) {
		return (
			<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p className="text-sm text-destructive">Failed to load this child&apos;s profile.</p>
				<button
					type="button"
					onClick={() => void refetch()}
					className="mt-3 text-sm font-medium text-primary hover:underline"
				>
					Try again
				</button>
			</div>
		);
	}

	if (!data) {
		return (
			<EmptyState
				tone="people"
				icon={<Baby className="h-6 w-6" aria-hidden="true" />}
				title="Child not found"
				description="The child profile you're looking for doesn't exist or has been removed."
				actionLabel="Back to children"
				onAction={() => navigate({ to: "/children" })}
			/>
		);
	}

	const { child, currentClassroom, guardians } = data;
	const hasPrimaryGuardian = guardians?.some((guardian) => guardian.isPrimary) ?? false;
	const authorizedPickupCount =
		guardians?.filter((guardian) => guardian.authorizedPickup).length ?? 0;
	const reachableGuardianCount =
		guardians?.filter((guardian) => guardian.email?.trim() || guardian.phone?.trim()).length ?? 0;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex items-center gap-3">
					<h1 className="text-2xl font-bold text-foreground">
						{child.firstName} {child.lastName}
					</h1>
					<StatusBadge status={child.enrollmentStatus} />
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={() => setEditMode(!editMode)}>
						<Pencil className="mr-2 h-4 w-4" />
						{editMode ? "Cancel" : "Edit"}
					</Button>
					{child.enrollmentStatus === "withdrawn" ? (
						<Button
							variant="outline"
							onClick={() => reactivateChild.mutate()}
							disabled={reactivateChild.isPending}
						>
							<RotateCcw className="mr-2 h-4 w-4" />
							{reactivateChild.isPending ? "Reactivating..." : "Reactivate"}
						</Button>
					) : (
						<Button variant="outline" onClick={() => setWithdrawOpen(true)}>
							<UserMinus className="mr-2 h-4 w-4" />
							Withdraw
						</Button>
					)}
				</div>
			</div>

			<ReadinessStrip
				title="Record readiness"
				items={[
					{
						label: "Family contact",
						status: guardians && guardians.length > 0 ? "ok" : "missing",
						detail:
							guardians && guardians.length > 0
								? `${guardians.length} guardian${guardians.length === 1 ? "" : "s"}`
								: "Missing guardian",
					},
					{
						label: "Primary contact",
						status: hasPrimaryGuardian ? "ok" : "attention",
						detail: hasPrimaryGuardian ? "Primary set" : "No primary set",
					},
					{
						label: "Pickup",
						status: authorizedPickupCount > 0 ? "ok" : "missing",
						detail: `${authorizedPickupCount} authorized`,
					},
					{
						label: "Classroom",
						status: currentClassroom ? "ok" : "attention",
						detail: currentClassroom ? currentClassroom.name : "Not assigned",
					},
				]}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{editMode ? (
					<EditChildDetailsCard
						child={child}
						timezone={authSession?.center.timezone ?? "UTC"}
						onSave={async (input) => {
							await updateChild.mutateAsync(input);
							setEditMode(false);
						}}
						onCancel={() => setEditMode(false)}
						isSaving={updateChild.isPending}
					/>
				) : (
					<Card>
						<CardHeader>
							<CardTitle>Child Details</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<DetailRow label="Date of Birth" value={formatDate(child.dateOfBirth)} />
							<DetailRow label="Age" value={calculateAge(child.dateOfBirth)} />
							<DetailRow label="Age Group" value={formatAgeGroup(child.ageGroup)} />
							<DetailRow label="Subsidy Eligible" value={child.subsidyEligible ? "Yes" : "No"} />
						</CardContent>
					</Card>
				)}

				<Card>
					<CardHeader>
						<CardTitle>Current Classroom</CardTitle>
					</CardHeader>
					<CardContent>
						{currentClassroom ? (
							<div className="space-y-3">
								<DetailRow label="Room" value={currentClassroom.name} />
								<DetailRow label="Age Group" value={formatAgeGroup(currentClassroom.ageGroup)} />
								<DetailRow
									label="Assigned Since"
									value={formatDate(currentClassroom.effectiveDate)}
								/>
								<Button
									variant="outline"
									size="sm"
									className="mt-2"
									onClick={() => setAssignOpen(true)}
								>
									Reassign
								</Button>
							</div>
						) : (
							<div className="flex flex-col items-center py-6 text-center">
								<p className="text-sm text-muted-foreground">Not assigned to a classroom</p>
								<Button size="sm" className="mt-3" onClick={() => setAssignOpen(true)}>
									Assign
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<CardTitle>Guardians</CardTitle>
						{!isStaff && (
							<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
								<Button
									variant="outline"
									size="sm"
									className="w-full sm:w-auto"
									onClick={() => setLinkGuardianOpen(true)}
								>
									<Link2 className="mr-2 h-4 w-4" />
									Link Existing
								</Button>
								<Button
									size="sm"
									className="w-full sm:w-auto"
									onClick={() => setAddGuardianOpen(true)}
								>
									<Plus className="mr-2 h-4 w-4" />
									Add New
								</Button>
							</div>
						)}
					</div>
				</CardHeader>
				<CardContent>
					<ComplianceSummary
						title="Guardian reachability and pickup"
						tone={reachableGuardianCount > 0 && authorizedPickupCount > 0 ? "success" : "warning"}
						items={[
							{ label: "Reachable", value: `${reachableGuardianCount} reachable` },
							{ label: "Pickup", value: `${authorizedPickupCount} pickup` },
							{ label: "Primary", value: hasPrimaryGuardian ? "Set" : "Missing" },
						]}
						className="mb-4"
					/>
					{!guardians || guardians.length === 0 ? (
						<EmptyState
							tone="people"
							title="Link this child to a family contact"
							description={`Link a guardian so pickup, billing, and emergency contacts for ${child.firstName} all route correctly.`}
							actionLabel={isStaff ? undefined : "Add Guardian"}
							onAction={isStaff ? undefined : () => setAddGuardianOpen(true)}
						/>
					) : (
						<div className="space-y-3">
							{guardians.map((guardian) => (
								<GuardianRow key={guardian.id} guardian={guardian} childId={id} />
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<ChildHealthSection
					title="Allergies"
					fieldId="health-allergies"
					value={child.allergies ?? null}
					placeholder="Enter known allergies and reactions…"
					onSave={async (text) => {
						// Send the raw text (including "") so clearing a stale entry
						// actually persists an empty value instead of being dropped.
						await updateChild.mutateAsync({ allergies: text });
					}}
					isSaving={updateChild.isPending}
				/>
				<ChildHealthSection
					title="Immunizations"
					fieldId="health-immunizations"
					value={child.immunizations ?? null}
					placeholder="Enter immunization records…"
					onSave={async (text) => {
						await updateChild.mutateAsync({ immunizations: text });
					}}
					isSaving={updateChild.isPending}
				/>
				<ChildHealthSection
					title="Notes"
					fieldId="health-notes"
					value={child.notes ?? null}
					placeholder="Enter notes about this child…"
					onSave={async (text) => {
						await updateChild.mutateAsync({ notes: text });
					}}
					isSaving={updateChild.isPending}
				/>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="md:col-span-2">
					<AttendanceCalendar childId={id} timezone={authSession?.center.timezone ?? "UTC"} />
				</div>
				{!isStaff && (
					<div className="space-y-3">
						<SubsidySummaryCard
							childName={`${child.firstName} ${child.lastName}`}
							summary={subsidySummary ?? null}
							isLoading={subsidyLoading}
						/>
						<div className="flex flex-wrap justify-end gap-2">
							<Button variant="outline" onClick={() => setSubsidyCaseOpen(true)}>
								<Plus className="mr-1 h-4 w-4" />
								New case
							</Button>
							{subsidySummary?.activeCase ? (
								<Button onClick={() => setSubsidyClaimOpen(true)}>
									<Plus className="mr-1 h-4 w-4" />
									New claim
								</Button>
							) : null}
						</div>
					</div>
				)}
			</div>

			<WithdrawDialog
				open={withdrawOpen}
				onOpenChange={(next) => {
					setWithdrawOpen(next);
					if (!next) setWithdrawError(null);
				}}
				onConfirm={async () => {
					try {
						await withdrawChild.mutateAsync();
						setWithdrawOpen(false);
						setWithdrawError(null);
					} catch (err) {
						setWithdrawError(extractErrorMessage(err, "Could not withdraw child."));
					}
				}}
				isSubmitting={withdrawChild.isPending}
				error={withdrawError}
			/>

			<AssignClassroomDialog childId={id} open={assignOpen} onOpenChange={setAssignOpen} />

			<LinkGuardianDialog
				childId={id}
				open={linkGuardianOpen}
				onOpenChange={setLinkGuardianOpen}
				existingGuardianIds={guardians?.map((g) => g.id) ?? []}
			/>

			<AddGuardianDialog childId={id} open={addGuardianOpen} onOpenChange={setAddGuardianOpen} />

			<SubsidyCaseDialog
				open={subsidyCaseOpen}
				onOpenChange={setSubsidyCaseOpen}
				lockedChildId={id}
			/>

			{subsidySummary?.activeCase ? (
				<SubsidyClaimDialog
					open={subsidyClaimOpen}
					onOpenChange={setSubsidyClaimOpen}
					subsidyCaseId={subsidySummary.activeCase.id}
				/>
			) : null}
		</div>
	);
}

export function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium text-foreground">{value}</span>
		</div>
	);
}

export interface GuardianInfo {
	id: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	isPrimary: boolean;
	authorizedPickup: boolean;
	relationship: string | null;
}

export function GuardianRow({ guardian, childId }: { guardian: GuardianInfo; childId: string }) {
	const unlinkGuardian = useUnlinkGuardian(childId);
	const guardianName = `${guardian.firstName} ${guardian.lastName}`;
	const [editOpen, setEditOpen] = useState(false);

	return (
		<div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="min-w-0 space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium text-foreground">{guardianName}</span>
					{guardian.isPrimary && <StatusBadge status="primary" label="Primary" />}
					{guardian.authorizedPickup && (
						<StatusBadge status="authorized" label="Authorized Pickup" />
					)}
				</div>
				{guardian.relationship && (
					<p className="text-xs text-muted-foreground">{guardian.relationship}</p>
				)}
				<div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-4">
					{guardian.email && <span>{guardian.email}</span>}
					{guardian.phone && <span>{formatPhoneNumber(guardian.phone)}</span>}
				</div>
			</div>
			<div className="flex gap-2 sm:flex-col sm:items-end">
				<Button
					variant="outline"
					size="sm"
					className="w-full sm:w-auto"
					aria-label={`Edit relationship ${guardianName}`}
					onClick={() => setEditOpen(true)}
				>
					<Pencil className="h-4 w-4" />
					Edit
				</Button>
				<ConfirmDestructiveDialog
					trigger={
						<Button
							variant="outline"
							size="sm"
							className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
							aria-label={`Remove ${guardianName}`}
							disabled={unlinkGuardian.isPending}
						>
							<Trash2 className="h-4 w-4" />
							Remove
						</Button>
					}
					title="Unlink guardian?"
					description={`This will remove ${guardianName} from this child's record only. The guardian's profile will not be deleted and can be re-linked at any time.`}
					confirmLabel="Unlink"
					onConfirm={() => unlinkGuardian.mutate(guardian.id)}
				/>
			</div>
			<EditGuardianLinkDialog
				childId={childId}
				guardian={guardian}
				open={editOpen}
				onOpenChange={setEditOpen}
			/>
		</div>
	);
}

export function EditGuardianLinkDialog({
	childId,
	guardian,
	open,
	onOpenChange,
}: {
	childId: string;
	guardian: GuardianInfo;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const updateLink = useUpdateGuardianLink(childId);
	const [relationship, setRelationship] = useState(guardian.relationship ?? "");
	const [isPrimary, setIsPrimary] = useState(guardian.isPrimary ? "yes" : "no");
	const [authorizedPickup, setAuthorizedPickup] = useState(
		guardian.authorizedPickup ? "yes" : "no",
	);
	const [editError, setEditError] = useState<string | null>(null);

	const handleSave = async () => {
		try {
			await updateLink.mutateAsync({
				guardianId: guardian.id,
				data: {
					relationship: relationship.trim() || undefined,
					isPrimary: isPrimary === "yes",
					authorizedPickup: authorizedPickup === "yes",
				},
			});
			setEditError(null);
			onOpenChange(false);
		} catch (err) {
			setEditError(extractErrorMessage(err, "Could not update guardian link."));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setRelationship(guardian.relationship ?? "");
					setIsPrimary(guardian.isPrimary ? "yes" : "no");
					setAuthorizedPickup(guardian.authorizedPickup ? "yes" : "no");
					setEditError(null);
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Relationship</DialogTitle>
					<DialogDescription className="sr-only">
						Update the relationship details for {guardian.firstName} {guardian.lastName}.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="edit-link-relationship">Relationship (optional)</Label>
						<Input
							id="edit-link-relationship"
							value={relationship}
							onChange={(e) => setRelationship(e.target.value)}
							placeholder="e.g. Father, Aunt, Grandparent"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="edit-link-primary">Primary Guardian?</Label>
						<Select value={isPrimary} onValueChange={setIsPrimary}>
							<SelectTrigger id="edit-link-primary">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="no">No</SelectItem>
								<SelectItem value="yes">Yes</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="edit-link-authorized-pickup">Authorized for pickup?</Label>
						<Select value={authorizedPickup} onValueChange={setAuthorizedPickup}>
							<SelectTrigger id="edit-link-authorized-pickup">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="no">No</SelectItem>
								<SelectItem value="yes">Yes</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{editError ? (
						<p role="alert" className="text-sm text-destructive">
							{editError}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleSave} disabled={updateLink.isPending}>
							{updateLink.isPending ? "Saving..." : "Save Changes"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function EditChildDetailsCard({
	child,
	timezone,
	onSave,
	onCancel,
	isSaving,
}: {
	child: {
		firstName: string;
		lastName: string;
		dateOfBirth: string;
		ageGroup: string;
		subsidyEligible: boolean;
	};
	timezone: string;
	onSave: (input: UpdateChildInput) => Promise<void>;
	onCancel: () => void;
	isSaving: boolean;
}) {
	const [firstName, setFirstName] = useState(child.firstName);
	const [lastName, setLastName] = useState(child.lastName);
	const [dateOfBirth, setDateOfBirth] = useState(child.dateOfBirth);
	const [ageGroup, setAgeGroup] = useState(child.ageGroup);
	const [subsidyEligible, setSubsidyEligible] = useState(child.subsidyEligible);

	const isValid = firstName.trim() && lastName.trim() && dateOfBirth && ageGroup;

	const handleSave = async () => {
		if (!isValid) return;
		await onSave({
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			dateOfBirth,
			ageGroup: ageGroup as AgeGroup,
			subsidyEligible,
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Edit Child Details</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="edit-first-name">First Name</Label>
						<Input
							id="edit-first-name"
							value={firstName}
							onChange={(e) => setFirstName(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="edit-last-name">Last Name</Label>
						<Input
							id="edit-last-name"
							value={lastName}
							onChange={(e) => setLastName(e.target.value)}
						/>
					</div>
				</div>
				<div className="space-y-2">
					<Label htmlFor="edit-dob">Date of Birth</Label>
					<DateInput
						id="edit-dob"
						value={dateOfBirth}
						onChange={(e) => setDateOfBirth(e.target.value)}
						maxDate={formatLocalDate(timezone)}
					/>
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
				<div className="flex items-center gap-2 pt-1">
					<Checkbox
						id="edit-subsidy"
						checked={subsidyEligible}
						onCheckedChange={(c) => setSubsidyEligible(c === true)}
					/>
					<Label htmlFor="edit-subsidy" className="cursor-pointer">
						Subsidy Eligible
					</Label>
				</div>
				<Separator />
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!isValid || isSaving}>
						{isSaving ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export function WithdrawDialog({
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
					<DialogTitle>Withdraw Child</DialogTitle>
					<DialogDescription className="text-sm text-muted-foreground">
						Withdrawing removes the child from their classroom and marks the profile as withdrawn.
					</DialogDescription>
				</DialogHeader>
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
						{isSubmitting ? "Withdrawing..." : "Withdraw"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function AssignClassroomDialog({
	childId,
	open,
	onOpenChange,
}: {
	childId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: authSession } = useAuthSession();
	const { data: classrooms } = useClassrooms();
	const [selectedClassroomId, setSelectedClassroomId] = useState("");
	const [assignClassroomError, setAssignClassroomError] = useState<string | null>(null);
	const assignChild = useAssignChild(selectedClassroomId);

	const activeClassrooms = classrooms?.filter((c) => !c.archivedAt) ?? [];

	const handleAssign = async () => {
		if (!selectedClassroomId) return;
		try {
			await assignChild.mutateAsync({
				childId,
				effectiveDate: formatLocalDate(authSession?.center.timezone ?? "UTC"),
			});
			setSelectedClassroomId("");
			setAssignClassroomError(null);
			onOpenChange(false);
		} catch (err) {
			setAssignClassroomError(extractErrorMessage(err, "Could not assign classroom."));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setSelectedClassroomId("");
					setAssignClassroomError(null);
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Assign to Classroom</DialogTitle>
					<DialogDescription className="sr-only">
						Select a classroom to move this child into.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="assign-classroom-select">Select Classroom</Label>
						<Select value={selectedClassroomId} onValueChange={setSelectedClassroomId}>
							<SelectTrigger id="assign-classroom-select">
								<SelectValue placeholder="Choose a classroom" />
							</SelectTrigger>
							<SelectContent>
								{activeClassrooms.map((classroom) => (
									<SelectItem key={classroom.id} value={classroom.id}>
										{classroom.name} ({formatAgeGroup(classroom.ageGroup)})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{assignClassroomError ? (
						<p role="alert" className="text-sm text-destructive">
							{assignClassroomError}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleAssign} disabled={!selectedClassroomId || assignChild.isPending}>
							{assignChild.isPending ? "Assigning..." : "Assign"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function LinkGuardianDialog({
	childId,
	open,
	onOpenChange,
	existingGuardianIds,
}: {
	childId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	existingGuardianIds: string[];
}) {
	// Only fetch the full guardian directory once the dialog is actually opened.
	// GET /api/guardians is Owner/Director only, and this dialog is always mounted
	// on the child profile — gating on `open` avoids a doomed 403 on every mount
	// (and a needless fetch for owners who never open the linker).
	const { data: allGuardians } = useGuardians(undefined, { enabled: open });
	const linkGuardian = useLinkGuardian(childId);
	const [selectedGuardianId, setSelectedGuardianId] = useState("");
	const [relationship, setRelationship] = useState("");
	const [isPrimary, setIsPrimary] = useState("no");
	const [authorizedPickup, setAuthorizedPickup] = useState("no");
	const [linkGuardianError, setLinkGuardianError] = useState<string | null>(null);

	const existingSet = new Set(existingGuardianIds);
	const availableGuardians = allGuardians?.filter((g) => !existingSet.has(g.id)) ?? [];
	const selectedGuardian = availableGuardians.find(
		(guardian) => guardian.id === selectedGuardianId,
	);

	const handleLink = async () => {
		if (!selectedGuardianId) return;
		try {
			await linkGuardian.mutateAsync({
				guardianId: selectedGuardianId,
				isPrimary: isPrimary === "yes",
				authorizedPickup: authorizedPickup === "yes",
				relationship: relationship.trim() || undefined,
			});
			setSelectedGuardianId("");
			setRelationship("");
			setIsPrimary("no");
			setAuthorizedPickup("no");
			setLinkGuardianError(null);
			onOpenChange(false);
		} catch (err) {
			setLinkGuardianError(extractErrorMessage(err, "Could not link guardian."));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setSelectedGuardianId("");
					setRelationship("");
					setIsPrimary("no");
					setAuthorizedPickup("no");
					setLinkGuardianError(null);
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Link Guardian</DialogTitle>
					<DialogDescription className="sr-only">
						Search for an existing guardian to link to this child.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="link-guardian-select">Select Guardian</Label>
						<Select
							value={selectedGuardianId}
							onValueChange={(value) => {
								setSelectedGuardianId(value);
								setRelationship("");
							}}
						>
							<SelectTrigger id="link-guardian-select">
								<SelectValue placeholder="Choose a guardian" />
							</SelectTrigger>
							<SelectContent>
								{availableGuardians.map((g) => (
									<SelectItem key={g.id} value={g.id}>
										{g.firstName} {g.lastName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{selectedGuardian && (
						<div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
							<p className="font-medium text-foreground">
								{selectedGuardian.firstName} {selectedGuardian.lastName}
							</p>
							{selectedGuardian.email && (
								<p className="text-muted-foreground">{selectedGuardian.email}</p>
							)}
							{selectedGuardian.phone && (
								<p className="text-muted-foreground">{formatPhoneNumber(selectedGuardian.phone)}</p>
							)}
						</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="link-relationship">Relationship (optional)</Label>
						<Input
							id="link-relationship"
							value={relationship}
							onChange={(event) => setRelationship(event.target.value)}
							placeholder="e.g. Father, Aunt, Grandparent"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="link-primary">Primary Guardian?</Label>
						<Select value={isPrimary} onValueChange={setIsPrimary}>
							<SelectTrigger id="link-primary">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="no">No</SelectItem>
								<SelectItem value="yes">Yes</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="link-authorized-pickup">Authorized for pickup?</Label>
						<Select value={authorizedPickup} onValueChange={setAuthorizedPickup}>
							<SelectTrigger id="link-authorized-pickup">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="no">No</SelectItem>
								<SelectItem value="yes">Yes</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{linkGuardianError ? (
						<p role="alert" className="text-sm text-destructive">
							{linkGuardianError}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleLink} disabled={!selectedGuardianId || linkGuardian.isPending}>
							{linkGuardian.isPending ? "Linking..." : "Link"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function AddGuardianDialog({
	childId,
	open,
	onOpenChange,
}: {
	childId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const createGuardian = useCreateGuardian();
	const linkGuardian = useLinkGuardian(childId);
	const deleteGuardian = useDeleteGuardian();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [relationship, setRelationship] = useState("");
	const [isPrimary, setIsPrimary] = useState("no");
	const [authorizedPickup, setAuthorizedPickup] = useState("no");
	const [addGuardianError, setAddGuardianError] = useState<string | null>(null);

	const parsedGuardian = createGuardianSchema.safeParse({
		firstName: firstName.trim(),
		lastName: lastName.trim(),
		email: email.trim() || undefined,
		phone: phone.trim() || undefined,
	});
	const fieldErrors = {
		email: parsedGuardian.success
			? undefined
			: parsedGuardian.error.issues.find((issue) => issue.path[0] === "email")
				? "Enter a valid email address."
				: undefined,
		phone: parsedGuardian.success
			? undefined
			: parsedGuardian.error.issues.find((issue) => issue.path[0] === "phone")
				? "Enter a valid phone number."
				: undefined,
	};
	const isValid = parsedGuardian.success;
	const isSubmitting = createGuardian.isPending || linkGuardian.isPending;

	const handleAdd = async () => {
		if (!isValid) return;
		try {
			const guardian = await createGuardian.mutateAsync({
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				email: email.trim() || undefined,
				phone: phone.trim() || undefined,
			});
			try {
				await linkGuardian.mutateAsync({
					guardianId: guardian.id,
					isPrimary: isPrimary === "yes",
					authorizedPickup: authorizedPickup === "yes",
					relationship: relationship.trim() || undefined,
				});
			} catch (linkErr) {
				// Roll back the just-created guardian so it doesn't orphan. Best-effort.
				try {
					await deleteGuardian.mutateAsync({ id: guardian.id });
				} catch {
					// Swallow rollback failure — surface the original link error below.
				}
				throw linkErr;
			}
			setFirstName("");
			setLastName("");
			setEmail("");
			setPhone("");
			setRelationship("");
			setIsPrimary("no");
			setAuthorizedPickup("no");
			setAddGuardianError(null);
			onOpenChange(false);
		} catch (err) {
			setAddGuardianError(extractErrorMessage(err, "Could not add guardian."));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setFirstName("");
					setLastName("");
					setEmail("");
					setPhone("");
					setRelationship("");
					setIsPrimary("no");
					setAuthorizedPickup("no");
					setAddGuardianError(null);
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add New Guardian</DialogTitle>
					<DialogDescription className="sr-only">
						Create a guardian record and link them to this child.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="new-guardian-first">First Name</Label>
							<Input
								id="new-guardian-first"
								value={firstName}
								onChange={(e) => setFirstName(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="new-guardian-last">Last Name</Label>
							<Input
								id="new-guardian-last"
								value={lastName}
								onChange={(e) => setLastName(e.target.value)}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="new-guardian-email">Email</Label>
						<Input
							id="new-guardian-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
						{fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
					</div>
					<div className="space-y-2">
						<Label htmlFor="new-guardian-phone">Phone</Label>
						<Input
							id="new-guardian-phone"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
						/>
						{fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
					</div>
					<div className="space-y-2">
						<Label htmlFor="new-guardian-relationship">Relationship (optional)</Label>
						<Input
							id="new-guardian-relationship"
							value={relationship}
							onChange={(e) => setRelationship(e.target.value)}
							placeholder="e.g. Mother, Father, Grandparent"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="new-guardian-primary">Primary Guardian?</Label>
						<Select value={isPrimary} onValueChange={setIsPrimary}>
							<SelectTrigger id="new-guardian-primary">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="no">No</SelectItem>
								<SelectItem value="yes">Yes</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="new-guardian-authorized-pickup">Authorized for pickup?</Label>
						<Select value={authorizedPickup} onValueChange={setAuthorizedPickup}>
							<SelectTrigger id="new-guardian-authorized-pickup">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="no">No</SelectItem>
								<SelectItem value="yes">Yes</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{addGuardianError ? (
						<p role="alert" className="text-sm text-destructive">
							{addGuardianError}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleAdd} disabled={!isValid || isSubmitting}>
							{isSubmitting ? "Adding..." : "Add Guardian"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function ProfileSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex justify-between">
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-5 w-16 rounded-full" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-9 w-20" />
					<Skeleton className="h-9 w-24" />
				</div>
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<Card>
					<CardHeader>
						<Skeleton className="h-5 w-28" />
					</CardHeader>
					<CardContent className="space-y-3">
						{["detail-a", "detail-b", "detail-c", "detail-d"].map((key) => (
							<div key={key} className="flex justify-between">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-4 w-32" />
							</div>
						))}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton className="h-5 w-36" />
					</CardHeader>
					<CardContent className="space-y-3">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</CardContent>
				</Card>
			</div>
			<Card>
				<CardHeader>
					<Skeleton className="h-5 w-24" />
				</CardHeader>
				<CardContent className="space-y-3">
					{["guardian-a", "guardian-b"].map((key) => (
						<Skeleton key={key} className="h-16 w-full rounded-lg" />
					))}
				</CardContent>
			</Card>
		</div>
	);
}

export function ChildHealthSection({
	title,
	fieldId,
	value,
	placeholder,
	onSave,
	isSaving,
}: {
	title: string;
	fieldId: string;
	value: string | null;
	placeholder?: string;
	onSave: (text: string) => Promise<void>;
	isSaving: boolean;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value ?? "");
	const [saving, setSaving] = useState(false);

	const handleSave = async () => {
		setSaving(true);
		try {
			await onSave(draft);
			setEditing(false);
		} finally {
			setSaving(false);
		}
	};

	const handleCancel = () => {
		setDraft(value ?? "");
		setEditing(false);
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>{title}</CardTitle>
					{!editing && (
						<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
							<Pencil className="mr-2 h-4 w-4" />
							Edit
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{editing ? (
					<div className="space-y-3">
						<Label htmlFor={fieldId} className="sr-only">
							{title}
						</Label>
						<Textarea
							id={fieldId}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={placeholder}
							rows={4}
							maxLength={5000}
						/>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={handleCancel}
								disabled={saving || isSaving}
							>
								Cancel
							</Button>
							<Button size="sm" onClick={handleSave} disabled={saving || isSaving}>
								{saving || isSaving ? "Saving..." : "Save"}
							</Button>
						</div>
					</div>
				) : (
					<p className="text-sm text-muted-foreground whitespace-pre-wrap">
						{value?.trim() ? value : <span className="italic">None recorded</span>}
					</p>
				)}
			</CardContent>
		</Card>
	);
}

export { calculateAge };
