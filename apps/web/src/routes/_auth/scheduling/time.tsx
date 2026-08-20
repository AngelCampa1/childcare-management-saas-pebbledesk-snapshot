import type { TimeEntry } from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent } from "@pebbledesk/ui/components/card";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, ClipboardList } from "lucide-react";
import { useState } from "react";
import { ComplianceSummary } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { type CenterMember, useMembers } from "../../../hooks/use-members";
import { useApproveTimeEntry, useTimeEntries } from "../../../hooks/use-phase5";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/scheduling/time")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: TimeEntriesPage,
});

function resolveStaffName(
	membershipId: string,
	members: CenterMember[] | undefined,
): string | undefined {
	if (!members) return undefined;
	const member = members.find((m) => m.id === membershipId);
	if (!member) return undefined;
	return member.userName?.trim() || member.userEmail || undefined;
}

export function TimeEntriesPage() {
	const { data: timeEntries, isLoading, isError, refetch } = useTimeEntries();
	const { data: members } = useMembers();
	const { data: session } = useAuthSession();
	const approve = useApproveTimeEntry();
	// Approval is an owner/director action (PATCH /time-entries/:id is requireRole). Staff can
	// reach this page and see their own entries, but must not be shown an Approve button that
	// would always 403 — so the control is hidden for them.
	const canApprove = session?.membership.role !== "staff";
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const visibleTimeEntries = timeEntries ?? [];

	if (isLoading) {
		return <TimeEntriesSkeleton />;
	}

	if (isError) {
		return (
			<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p className="text-sm text-destructive">Failed to load time entries.</p>
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

	const pendingEntries = visibleTimeEntries.filter((entry) => entry.status !== "approved");
	const approvedEntries = visibleTimeEntries.filter((entry) => entry.status === "approved");
	const totalWorkedHours = visibleTimeEntries.reduce(
		(total, entry) => total + entry.hoursWorked,
		0,
	);
	const overtimeHours = visibleTimeEntries.reduce((total, entry) => total + entry.overtimeHours, 0);

	async function handleApprove(entry: TimeEntry) {
		setPendingId(entry.id);
		setErrorMessage(null);
		try {
			await approve.mutateAsync(entry);
		} catch (err) {
			const message = extractErrorMessage(err, "Failed to approve time entry");
			setErrorMessage(message);
		} finally {
			setPendingId(null);
		}
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Time Entries</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Approve live attendance and review scheduled vs. worked hours and overtime.
				</p>
			</div>

			<ComplianceSummary
				title="Coverage summary"
				tone={pendingEntries.length > 0 || overtimeHours > 0 ? "warning" : "success"}
				items={[
					{
						label: "Pending",
						value: `${pendingEntries.length} pending`,
					},
					{
						label: "Approved",
						value: `${approvedEntries.length} approved`,
					},
					{
						label: "Worked",
						value: `${totalWorkedHours}h worked`,
					},
					{
						label: "Overtime",
						value: `${overtimeHours}h overtime`,
					},
				]}
			/>

			<Card className="border-primary/20 bg-primary/5">
				<CardContent className="space-y-4 pt-6">
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
							<ClipboardCheck className="h-5 w-5" aria-hidden="true" />
						</div>
						<div>
							<h2 className="text-lg font-semibold text-foreground">Entry review</h2>
							<p className="text-sm text-muted-foreground">
								Approve worked hours so payroll exports stay accurate.
							</p>
						</div>
					</div>

					{errorMessage ? (
						<div
							role="alert"
							className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
						>
							{errorMessage}
						</div>
					) : null}

					{visibleTimeEntries.length === 0 ? (
						<EmptyState
							tone="operations"
							icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
							title="No time entries found"
							description="Approve live attendance and staff clock-ins first, then return here to review hours."
							action={
								<Button asChild className="mt-4" variant="outline">
									<Link to="/attendance">Go to attendance</Link>
								</Button>
							}
						/>
					) : (
						<div className="space-y-6">
							<section className="space-y-3">
								<h3 className="text-sm font-semibold text-foreground">
									{canApprove ? "Pending review" : "Pending approval"}
								</h3>
								{pendingEntries.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Nothing waiting — approved entries are below.
									</p>
								) : (
									pendingEntries.map((entry) => (
										<TimeEntryRow
											key={entry.id}
											entry={entry}
											approvable={canApprove}
											isPending={pendingId === entry.id}
											onApprove={() => handleApprove(entry)}
											staffName={resolveStaffName(entry.membershipId, members)}
										/>
									))
								)}
							</section>

							<section className="space-y-3">
								<h3 className="text-sm font-semibold text-foreground">Approved</h3>
								{approvedEntries.length === 0 ? (
									<p className="text-sm text-muted-foreground">No approved entries yet.</p>
								) : (
									approvedEntries.map((entry) => (
										<TimeEntryRow
											key={entry.id}
											entry={entry}
											approvable={false}
											staffName={resolveStaffName(entry.membershipId, members)}
										/>
									))
								)}
							</section>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

interface TimeEntryRowProps {
	entry: TimeEntry;
	approvable: boolean;
	isPending?: boolean;
	onApprove?: () => void;
	staffName?: string;
}

function TimeEntryRow({ entry, approvable, isPending, onApprove, staffName }: TimeEntryRowProps) {
	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p className="font-medium text-foreground">{formatDate(entry.date)}</p>
				<p className="mt-0.5 text-sm text-muted-foreground">{staffName ?? entry.membershipId}</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Worked {entry.hoursWorked}h / Scheduled {entry.hoursScheduled}h / Overtime{" "}
					{entry.overtimeHours}h
				</p>
			</div>
			<div className="flex items-center gap-3 sm:justify-end">
				<Badge variant="secondary" className="w-fit capitalize">
					{entry.status}
				</Badge>
				{approvable && onApprove ? (
					<Button
						size="sm"
						onClick={onApprove}
						disabled={isPending}
						aria-label={`Approve time entry for ${formatDate(entry.date)}`}
					>
						{isPending ? "Approving..." : "Approve"}
					</Button>
				) : null}
			</div>
		</div>
	);
}

function TimeEntriesSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-72" />
			</div>
			<Skeleton className="h-72 rounded-lg" />
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
