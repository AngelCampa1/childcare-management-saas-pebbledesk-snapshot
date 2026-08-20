import type { ClassroomWithCounts, CreateClassroomInput } from "@pebbledesk/shared";
import { AGE_GROUPS } from "@pebbledesk/shared/constants";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader } from "@pebbledesk/ui/components/card";
import { Checkbox } from "@pebbledesk/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@pebbledesk/ui/components/select";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, School, Users } from "lucide-react";
import { useState } from "react";
import { CapacityBar } from "../../../components/capacity-bar";
import { ComplianceSummary } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { GuidancePanel } from "../../../components/guidance";
import { FieldHelp, HelpTip, PageHelpPanel } from "../../../components/help-tip";
import { StatusBadge } from "../../../components/status-badge";
import { useClassrooms, useCreateClassroom } from "../../../hooks/use-classrooms";
import { useRatios } from "../../../hooks/use-ratios";
import { useSetupProgress } from "../../../hooks/use-setup-progress";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { getRequiredAppInlineHelpById } from "../../../lib/guidance-content";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/classrooms/")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: ClassroomsPage,
});

const classroomCardRatioHelp = getRequiredAppInlineHelpById("classrooms.card-ratio");
const classroomNameHelp = getRequiredAppInlineHelpById("classrooms.name");

function formatAgeGroup(ageGroup: string): string {
	return ageGroup.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getComplianceStatus(
	classroom: ClassroomWithCounts,
	liveRatio?: {
		inCompliance: boolean;
		nearLimit: boolean;
		openViolationId?: string;
	},
): string {
	if (classroom.archivedAt) return "archived";
	if (classroom.childCount === 0 && classroom.staffCount === 0) return "empty";
	if (liveRatio) {
		if (!liveRatio.inCompliance || liveRatio.openViolationId) return "violation";
		if (liveRatio.nearLimit) return "near-capacity";
		return "compliant";
	}
	const ratio = classroom.maxCapacity > 0 ? classroom.childCount / classroom.maxCapacity : 0;
	if (ratio >= 1) return "near-capacity";
	if (ratio >= 0.85) return "near-capacity";
	return "compliant";
}

function formatChildCount(count: number): string {
	return `${count} ${count === 1 ? "child" : "children"}`;
}

export function ClassroomsPage() {
	const { allDone: setupAllDone, isLoading: setupLoading } = useSetupProgress();
	const [showArchived, setShowArchived] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const {
		data: classrooms,
		isLoading,
		isError,
		refetch,
	} = useClassrooms({
		includeArchived: showArchived,
	});
	const { data: ratios } = useRatios();
	const createClassroom = useCreateClassroom();
	const ratioByClassroomId = new Map((ratios ?? []).map((ratio) => [ratio.classroomId, ratio]));

	const activeCount = classrooms?.filter((c) => !c.archivedAt).length ?? 0;
	const archivedCount = classrooms?.filter((c) => c.archivedAt).length ?? 0;
	const compliantCount =
		classrooms?.filter((classroom) => {
			const status = getComplianceStatus(classroom, ratioByClassroomId.get(classroom.id));
			return status === "compliant";
		}).length ?? 0;
	const needsReviewCount =
		classrooms?.filter((classroom) => {
			const status = getComplianceStatus(classroom, ratioByClassroomId.get(classroom.id));
			return status === "violation" || status === "near-capacity";
		}).length ?? 0;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Classrooms</h1>
					{!isLoading && classrooms && (
						<p className="mt-1 text-sm text-muted-foreground">
							{activeCount} active room{activeCount !== 1 ? "s" : ""}
							{archivedCount > 0 && ` \u00b7 ${archivedCount} archived`}
						</p>
					)}
				</div>
				<div className="flex items-center gap-4 self-start sm:self-auto">
					<label
						htmlFor="show-archived"
						className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"
					>
						<Checkbox
							id="show-archived"
							aria-label="Show archived"
							checked={showArchived}
							onCheckedChange={(checked) => setShowArchived(checked === true)}
						/>
						Show archived
					</label>
					<Dialog
						open={dialogOpen}
						onOpenChange={(open) => {
							setDialogOpen(open);
							if (!open) setCreateError(null);
						}}
					>
						<DialogTrigger asChild>
							<Button>
								<Plus className="mr-2 h-4 w-4" />
								Add Classroom
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Add Classroom</DialogTitle>
								<DialogDescription>
									Classrooms control ratios and attendance tracking. Set a capacity and minimum
									staff ratio to get started.
								</DialogDescription>
							</DialogHeader>
							<CreateClassroomForm
								onSubmit={async (input) => {
									try {
										await createClassroom.mutateAsync(input);
										setDialogOpen(false);
										setCreateError(null);
									} catch (err) {
										setCreateError(extractErrorMessage(err, "Could not create classroom."));
									}
								}}
								isSubmitting={createClassroom.isPending}
							/>
							{createError ? (
								<p role="alert" className="text-sm text-destructive">
									{createError}
								</p>
							) : null}
						</DialogContent>
					</Dialog>
				</div>
			</div>

			{isLoading ? (
				<ClassroomsSkeleton />
			) : isError ? (
				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
					<p className="text-sm text-destructive">Failed to load classrooms.</p>
					<button
						type="button"
						onClick={() => void refetch()}
						className="mt-3 text-sm font-medium text-primary hover:underline"
					>
						Try again
					</button>
				</div>
			) : !classrooms || classrooms.length === 0 ? (
				<EmptyState
					tone="operations"
					icon={<School className="h-6 w-6" aria-hidden="true" />}
					title="Your first classroom is next"
					description="Set up a room so ratios start tracking and enrollment can flow."
					actionLabel="Add your first classroom"
					onAction={() => setDialogOpen(true)}
				/>
			) : (
				<>
					<ComplianceSummary
						title="Compliance summary"
						tone={needsReviewCount > 0 ? "warning" : "success"}
						items={[
							{ label: "Rooms OK", value: String(compliantCount) },
							{ label: "Needs review", value: String(needsReviewCount) },
							{ label: "Active rooms", value: String(activeCount) },
							{ label: "Archived rooms", value: String(archivedCount) },
						]}
					/>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{classrooms.map((classroom) => (
							<ClassroomCard
								key={classroom.id}
								classroom={classroom}
								liveRatio={ratioByClassroomId.get(classroom.id)}
							/>
						))}
					</div>
				</>
			)}

			{!setupLoading && !setupAllDone && (
				<GuidancePanel
					guideId="owner-start-here"
					userRole="director"
					title="Need help with setup order?"
				/>
			)}
			<PageHelpPanel route="/classrooms" />
		</div>
	);
}

function ClassroomCard({
	classroom,
	liveRatio,
}: {
	classroom: ClassroomWithCounts;
	liveRatio?: {
		inCompliance: boolean;
		nearLimit: boolean;
		openViolationId?: string;
		minRatioStaff?: number;
		minRatioChildren?: number;
	};
}) {
	const navigate = useNavigate();
	const ratio = classroom.maxCapacity > 0 ? classroom.childCount / classroom.maxCapacity : 0;
	const openSlots = Math.max(classroom.maxCapacity - classroom.childCount, 0);
	const isNearCapacity = (liveRatio?.nearLimit || ratio >= 0.85) && !classroom.archivedAt;
	const status = getComplianceStatus(classroom, liveRatio);
	// Show the backend-resolved effective ratio (stricter of classroom-configured and
	// state-mandated) so the card label matches the Ratios page and detail page.
	const ratioLabel = `${liveRatio?.minRatioStaff ?? classroom.minRatioStaff}:${
		liveRatio?.minRatioChildren ?? classroom.minRatioChildren
	}`;

	return (
		<Card
			className={`transition-shadow duration-200 hover:shadow-md ${isNearCapacity ? "border-warning" : ""}`}
		>
			<CardHeader className="p-5 pb-3">
				<div className="flex items-start justify-between">
					<div className="min-w-0">
						<h3 className="font-semibold text-foreground truncate">{classroom.name}</h3>
						<p className="text-sm text-muted-foreground">{formatAgeGroup(classroom.ageGroup)}</p>
					</div>
					<StatusBadge status={status} />
				</div>
			</CardHeader>
			<CardContent className="p-5 pt-0 space-y-3">
				<p className="text-sm font-medium text-muted-foreground">
					{ratioLabel} ratio
					<HelpTip label={`Help: ratio for ${classroom.name}`}>
						{classroomCardRatioHelp.text}
					</HelpTip>
				</p>
				<p className="text-sm font-medium text-foreground">
					{openSlots} open slot{openSlots === 1 ? "" : "s"}
				</p>
				<CapacityBar current={classroom.childCount} max={classroom.maxCapacity} />
				<div className="flex items-center gap-4 text-sm text-muted-foreground">
					<span className="flex items-center gap-1">
						<Users className="h-4 w-4" />
						{classroom.staffCount} staff
					</span>
					<span
						data-testid={`classroom-child-count-${classroom.name
							.toLowerCase()
							.replace(/\s+/g, "-")
							.replace(/[^a-z0-9-]/g, "")}`}
					>
						{formatChildCount(classroom.childCount)}
					</span>
				</div>
				<div className="pt-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label={`View details for ${classroom.name}`}
						onClick={() => navigate({ to: "/classrooms/$id", params: { id: classroom.id } })}
					>
						View
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function ClassroomsSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{["skel-a", "skel-b", "skel-c", "skel-d", "skel-e", "skel-f"].map((key) => (
				<Card key={key} className="p-5 space-y-3">
					<div className="flex justify-between">
						<div className="space-y-2">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-4 w-20" />
						</div>
						<Skeleton className="h-5 w-16 rounded-full" />
					</div>
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-1.5 w-full rounded-full" />
					<div className="flex gap-4">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-4 w-20" />
					</div>
				</Card>
			))}
		</div>
	);
}

function CreateClassroomForm({
	onSubmit,
	isSubmitting,
	initialValues,
}: {
	onSubmit: (input: CreateClassroomInput) => Promise<void>;
	isSubmitting: boolean;
	initialValues?: Partial<CreateClassroomInput>;
}) {
	const [name, setName] = useState(initialValues?.name ?? "");
	const [ageGroup, setAgeGroup] = useState(initialValues?.ageGroup ?? "");
	const [maxCapacity, setMaxCapacity] = useState(initialValues?.maxCapacity?.toString() ?? "");
	const [minRatioStaff, setMinRatioStaff] = useState(
		initialValues?.minRatioStaff?.toString() ?? "",
	);
	const [minRatioChildren, setMinRatioChildren] = useState(
		initialValues?.minRatioChildren?.toString() ?? "",
	);

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
			ageGroup: ageGroup as CreateClassroomInput["ageGroup"],
			maxCapacity: Number(maxCapacity),
			minRatioStaff: Number(minRatioStaff),
			minRatioChildren: Number(minRatioChildren),
		});
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-2">
				<FieldHelp
					htmlFor="classroom-name"
					label={classroomNameHelp.label}
					help={classroomNameHelp.text}
				/>
				<Input
					id="classroom-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. Sunshine Room"
				/>
			</div>
			<div className="space-y-2">
				<FieldHelp
					htmlFor="classroom-age-group"
					label="Age group"
					help="The age range this room is licensed and staffed for."
				/>
				<Select value={ageGroup} onValueChange={setAgeGroup}>
					<SelectTrigger id="classroom-age-group">
						<SelectValue placeholder="Select age group" />
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
				<FieldHelp
					htmlFor="classroom-capacity"
					label="Max Capacity"
					help="The most children your license allows in this room."
				/>
				<Input
					id="classroom-capacity"
					type="number"
					min={1}
					step="1"
					value={maxCapacity}
					onChange={(e) => setMaxCapacity(e.target.value)}
					placeholder="e.g. 12"
				/>
			</div>
			<div className="space-y-2">
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<FieldHelp
							htmlFor="classroom-ratio-staff"
							label="Staff (ratio)"
							help="Usually 1. This is the staff side of the required ratio."
						/>
						<Input
							id="classroom-ratio-staff"
							type="number"
							min={1}
							step="1"
							value={minRatioStaff}
							onChange={(e) => setMinRatioStaff(e.target.value)}
							placeholder="e.g. 1"
						/>
					</div>
					<div className="space-y-2">
						<FieldHelp
							htmlFor="classroom-ratio-children"
							label="Children (ratio)"
							help="How many children one staff member may supervise in this room."
						/>
						<Input
							id="classroom-ratio-children"
							type="number"
							min={1}
							step="1"
							value={minRatioChildren}
							onChange={(e) => setMinRatioChildren(e.target.value)}
							placeholder="e.g. 4"
						/>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">
					Most states require 1 staff per 4 toddlers. Check your state&apos;s licensing rules.
				</p>
			</div>
			<Button type="submit" disabled={!isValid || isSubmitting} className="w-full">
				{isSubmitting ? "Creating..." : "Create Classroom"}
			</Button>
		</form>
	);
}

export { CreateClassroomForm, formatAgeGroup, formatChildCount, getComplianceStatus };
