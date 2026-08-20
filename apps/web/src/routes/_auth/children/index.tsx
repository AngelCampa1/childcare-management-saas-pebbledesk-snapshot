import { AGE_GROUPS } from "@pebbledesk/shared/constants";
import { Button } from "@pebbledesk/ui/components/button";
import { Card } from "@pebbledesk/ui/components/card";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@pebbledesk/ui/components/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Baby, Plus, Search } from "lucide-react";
import { useState } from "react";
import { ComplianceSummary } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { GuidancePanel } from "../../../components/guidance";
import { HelpTip, PageHelpPanel } from "../../../components/help-tip";
import { StatusBadge } from "../../../components/status-badge";
import { useChildren } from "../../../hooks/use-children";
import { useSetupProgress } from "../../../hooks/use-setup-progress";
import { formatDate, useCenterTimezone } from "../../../lib/format-date";

export const Route = createFileRoute("/_auth/children/")({
	component: ChildrenPage,
});

function formatAgeGroup(ageGroup: string): string {
	return ageGroup.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ChildrenPage() {
	const { allDone: setupAllDone, isLoading: setupLoading } = useSetupProgress();
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("active_waitlist");
	const [ageGroupFilter, setAgeGroupFilter] = useState("all");
	const centerTimezone = useCenterTimezone();
	const trimmedSearch = search.trim();

	const statusParam =
		statusFilter === "active_waitlist"
			? undefined
			: statusFilter === "all"
				? undefined
				: statusFilter;

	const {
		data: children,
		isLoading,
		isError,
		refetch,
	} = useChildren({
		search: trimmedSearch || undefined,
		status: statusParam,
		ageGroup: ageGroupFilter === "all" ? undefined : ageGroupFilter,
	});

	const filteredChildren =
		statusFilter === "active_waitlist"
			? children?.filter(
					(c) => c.enrollmentStatus === "active" || c.enrollmentStatus === "waitlist",
				)
			: children;
	const hasNonDefaultStatusFilter = statusFilter !== "active_waitlist" && statusFilter !== "all";
	const hasActiveFilters =
		trimmedSearch !== "" || hasNonDefaultStatusFilter || ageGroupFilter !== "all";

	const activeCount = children?.filter((c) => c.enrollmentStatus === "active").length ?? 0;
	const waitlistCount = children?.filter((c) => c.enrollmentStatus === "waitlist").length ?? 0;
	const withdrawnCount = children?.filter((c) => c.enrollmentStatus === "withdrawn").length ?? 0;
	const totalCount = children?.length ?? 0;

	const clearFilters = () => {
		setSearch("");
		setStatusFilter("active_waitlist");
		setAgeGroupFilter("all");
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Children</h1>
					{!isLoading && children && (
						<p className="mt-1 text-sm text-muted-foreground">
							{hasActiveFilters ? (
								"Filters applied"
							) : (
								<>
									{activeCount} active
									{waitlistCount > 0 && ` \u00b7 ${waitlistCount} waitlist`}
									{withdrawnCount > 0 && ` \u00b7 ${withdrawnCount} withdrawn`}
								</>
							)}
						</p>
					)}
				</div>
				<Button asChild className="self-start sm:self-auto">
					<Link to="/children/enroll">
						<Plus className="mr-2 h-4 w-4" />
						Enroll Child
					</Link>
				</Button>
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<div className="relative flex-1 max-w-sm">
					<Label htmlFor="children-search" className="sr-only">
						Search children
					</Label>
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						id="children-search"
						aria-label="Search children"
						placeholder="Search children..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger className="w-[180px]" aria-label="Filter by enrollment status">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="active_waitlist">Active + Waitlist</SelectItem>
						<SelectItem value="all">All</SelectItem>
						<SelectItem value="active">Active</SelectItem>
						<SelectItem value="waitlist">Waitlist</SelectItem>
						<SelectItem value="withdrawn">Withdrawn</SelectItem>
					</SelectContent>
				</Select>
				<Select value={ageGroupFilter} onValueChange={setAgeGroupFilter}>
					<SelectTrigger className="w-[180px]" aria-label="Filter by age group">
						<SelectValue placeholder="Age Group" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Age Groups</SelectItem>
						{AGE_GROUPS.map((ag) => (
							<SelectItem key={ag} value={ag}>
								{formatAgeGroup(ag)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{!setupLoading && !setupAllDone && (
				<GuidancePanel
					guideId="owner-start-here"
					userRole="director"
					title="Need help setting up children?"
				/>
			)}
			<PageHelpPanel route="/children" />

			{!isLoading && children ? (
				<ComplianceSummary
					title="Record readiness"
					tone={waitlistCount > 0 || withdrawnCount > 0 ? "warning" : "success"}
					items={[
						{ label: "Total records", value: String(totalCount) },
						{ label: "Active records", value: String(activeCount) },
						{ label: "Waitlist records", value: String(waitlistCount) },
						{ label: "Withdrawn records", value: String(withdrawnCount) },
					]}
				/>
			) : null}

			{isLoading ? (
				<ChildrenTableSkeleton />
			) : isError ? (
				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
					<p className="text-sm text-destructive">Failed to load children.</p>
					<button
						type="button"
						onClick={() => void refetch()}
						className="mt-3 text-sm font-medium text-primary hover:underline"
					>
						Try again
					</button>
				</div>
			) : !filteredChildren || filteredChildren.length === 0 ? (
				<EmptyState
					tone="people"
					icon={<Baby className="h-6 w-6" aria-hidden="true" />}
					title={
						hasActiveFilters
							? "No children match your search"
							: "Your roster is empty — let's start enrolling"
					}
					description={
						hasActiveFilters
							? "Try a different search or clear your filters to see enrolled children."
							: "Enroll your first child so pickup, billing, and emergency contacts route correctly."
					}
					action={
						hasActiveFilters ? (
							<button
								type="button"
								className="mt-3 text-sm text-primary hover:underline"
								onClick={clearFilters}
							>
								Clear filters
							</button>
						) : (
							<Button asChild className="mt-4">
								<Link to="/children/enroll">Enroll Child</Link>
							</Button>
						)
					}
				/>
			) : (
				<Card>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<div className="flex items-center gap-1">
										Name
										<HelpTip label="Help: child name">
											Open a child to review their profile.
										</HelpTip>
									</div>
								</TableHead>
								<TableHead>
									<div className="flex items-center gap-1">
										Age Group
										<HelpTip label="Help: age group">
											Age group helps match the child to an appropriate classroom.
										</HelpTip>
									</div>
								</TableHead>
								<TableHead>
									<div className="flex items-center gap-1">
										Status
										<HelpTip label="Help: child status">
											Active and waitlist children stay visible for daily planning.
										</HelpTip>
									</div>
								</TableHead>
								<TableHead className="w-[220px] text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredChildren.map((child) => (
								<TableRow key={child.id} className="hover:bg-muted/40">
									<TableCell>
										<div>
											<Link
												to="/children/$id"
												params={{ id: child.id }}
												className="font-medium text-primary hover:underline"
											>
												{child.firstName} {child.lastName}
											</Link>
											<p className="text-xs text-muted-foreground">
												DOB: {formatDate(child.dateOfBirth, { centerTimezone })}
											</p>
										</div>
									</TableCell>
									<TableCell>{formatAgeGroup(child.ageGroup)}</TableCell>
									<TableCell>
										<StatusBadge status={child.enrollmentStatus} />
									</TableCell>
									<TableCell className="text-right">
										<Button asChild variant="ghost" size="sm">
											<Link
												to="/children/$id"
												params={{ id: child.id }}
												aria-label={`View details for ${child.firstName} ${child.lastName}`}
											>
												View
											</Link>
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Card>
			)}
		</div>
	);
}

function ChildrenTableSkeleton() {
	return (
		<Card>
			<div className="p-4 space-y-3">
				{[0, 1, 2, 3, 4].map((i) => (
					<div key={`skeleton-${i}`} className="flex gap-4">
						<div className="flex-1 space-y-1">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-24" />
						</div>
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-5 w-16 rounded-full" />
					</div>
				))}
			</div>
		</Card>
	);
}

export { formatAgeGroup, formatDate };
