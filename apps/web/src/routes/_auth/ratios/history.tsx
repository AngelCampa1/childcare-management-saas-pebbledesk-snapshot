import { Button } from "@pebbledesk/ui/components/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pebbledesk/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { DateInput } from "../../../components/date-input";
import { EmptyState } from "../../../components/empty-state";
import { StatusBadge } from "../../../components/status-badge";
import { ViolationCard } from "../../../components/violation-card";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { useClassrooms } from "../../../hooks/use-classrooms";
import {
	useRatioSnapshots,
	useRatioViolations,
	useUpdateViolationNotes,
} from "../../../hooks/use-ratios";
import { formatDateTime } from "../../../lib/format-date";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/ratios/history")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: RatioHistoryPage,
});

interface Filters {
	classroomId: string;
	from: string;
	to: string;
	status: "all" | "open" | "resolved";
}

function RatioHistoryPage() {
	const [filters, setFilters] = useState<Filters>({
		classroomId: "all",
		from: "",
		to: "",
		status: "all",
	});

	const { data: classrooms } = useClassrooms();
	const { data: session } = useAuthSession();
	const centerTimezone = session?.center.timezone ?? undefined;

	function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
		setFilters((prev) => ({ ...prev, [key]: value }));
	}

	return (
		<div className="space-y-6">
			{/* Page header */}
			<div>
				<h1 className="text-2xl font-bold text-foreground">Ratio History</h1>
				<p className="text-sm text-muted-foreground mt-0.5">Violations and compliance snapshots</p>
			</div>

			{/* Filters row */}
			<div
				data-testid="ratio-history-filters"
				className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[11rem_21rem_9rem_auto] lg:items-center"
			>
				<Select value={filters.classroomId} onValueChange={(v) => updateFilter("classroomId", v)}>
					<SelectTrigger className="w-full" aria-label="Filter by classroom">
						<SelectValue placeholder="All Rooms" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Rooms</SelectItem>
						{(classrooms ?? []).map((c) => (
							<SelectItem key={c.id} value={c.id}>
								{c.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div
					data-testid="ratio-history-date-filters"
					className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
				>
					<DateInput
						value={filters.from}
						onChange={(e) => updateFilter("from", e.target.value)}
						className="w-full min-w-0 text-sm"
						aria-label="From date"
					/>
					<span className="text-muted-foreground text-sm">to</span>
					<DateInput
						value={filters.to}
						onChange={(e) => updateFilter("to", e.target.value)}
						className="w-full min-w-0 text-sm"
						aria-label="To date"
					/>
				</div>

				<Select
					value={filters.status}
					onValueChange={(v) => updateFilter("status", v as Filters["status"])}
				>
					<SelectTrigger className="w-full" aria-label="Filter by status">
						<SelectValue placeholder="All Statuses" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Statuses</SelectItem>
						<SelectItem value="open">Open</SelectItem>
						<SelectItem value="resolved">Resolved</SelectItem>
					</SelectContent>
				</Select>

				{(filters.classroomId !== "all" ||
					filters.from ||
					filters.to ||
					filters.status !== "all") && (
					<Button
						variant="ghost"
						size="sm"
						className="justify-self-start text-xs text-muted-foreground hover:text-foreground"
						onClick={() => setFilters({ classroomId: "all", from: "", to: "", status: "all" })}
					>
						Clear filters
					</Button>
				)}
			</div>

			{/* Tabs */}
			<Tabs defaultValue="violations">
				<TabsList aria-label="Ratio history views">
					<TabsTrigger value="violations">Violations</TabsTrigger>
					<TabsTrigger value="snapshots">Snapshots</TabsTrigger>
				</TabsList>

				<TabsContent value="violations" className="mt-4">
					<ViolationsTab
						filters={filters}
						classrooms={classrooms ?? []}
						centerTimezone={centerTimezone}
					/>
				</TabsContent>

				<TabsContent value="snapshots" className="mt-4" forceMount>
					<SnapshotsTab
						filters={filters}
						classrooms={classrooms ?? []}
						centerTimezone={centerTimezone}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

interface ClassroomRef {
	id: string;
	name: string;
	ageGroup: string | null;
}

interface ViolationsTabProps {
	filters: Filters;
	classrooms: ClassroomRef[];
	centerTimezone?: string;
}

function ViolationsTab({ filters, classrooms, centerTimezone }: ViolationsTabProps) {
	const apiFilters = {
		classroomId: filters.classroomId !== "all" ? filters.classroomId : undefined,
		from: filters.from || undefined,
		to: filters.to || undefined,
		status: filters.status !== "all" ? (filters.status as "open" | "resolved") : undefined,
	};

	const { data: violations, isLoading, isError, refetch } = useRatioViolations(apiFilters);
	const updateNotes = useUpdateViolationNotes();

	const classroomMap = new Map(classrooms.map((c) => [c.id, c]));

	function handleAddNotes(id: string, notes: string) {
		updateNotes.mutate({ id, resolutionNotes: notes });
	}

	if (isLoading) {
		return <ViolationsSkeleton />;
	}

	if (isError) {
		return (
			<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p className="text-sm text-destructive">Failed to load violations.</p>
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

	const sorted = [...(violations ?? [])].sort(
		(a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
	);

	if (sorted.length === 0) {
		return (
			<EmptyState
				tone="compliance"
				icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
				title="No violations in this view"
				description="Audit-ready so far. Adjust the filters above to widen the search."
			/>
		);
	}

	return (
		<div className="space-y-3 transition-opacity duration-150">
			{sorted.map((violation, index) => {
				const classroom = classroomMap.get(violation.classroomId);
				return (
					<div key={violation.id} style={{ animationDelay: `${index * 80}ms` }}>
						<ViolationCard
							violation={violation}
							classroomName={classroom?.name}
							ageGroup={classroom?.ageGroup ?? undefined}
							onAddNotes={handleAddNotes}
							centerTimezone={centerTimezone}
						/>
					</div>
				);
			})}
		</div>
	);
}

interface SnapshotsTabProps {
	filters: Filters;
	classrooms: ClassroomRef[];
	centerTimezone?: string;
}

function SnapshotsTab({ filters, classrooms, centerTimezone }: SnapshotsTabProps) {
	const apiFilters = {
		classroomId: filters.classroomId !== "all" ? filters.classroomId : undefined,
		from: filters.from || undefined,
		to: filters.to || undefined,
	};

	const { data: snapshots, isLoading, isError, refetch } = useRatioSnapshots(apiFilters);
	const classroomMap = new Map(classrooms.map((c) => [c.id, c]));

	if (isLoading) {
		return <SnapshotsSkeleton />;
	}

	if (isError) {
		return (
			<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p className="text-sm text-destructive">Failed to load snapshots.</p>
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

	const rows = snapshots ?? [];

	if (rows.length === 0) {
		return (
			<EmptyState
				tone="compliance"
				icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
				title="No snapshots in this view"
				description="Snapshots will appear here as soon as the dashboard records one. Try widening the filters."
			/>
		);
	}

	return (
		<div
			data-testid="ratio-snapshots-table"
			className="overflow-x-auto rounded-lg border border-border"
		>
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40">
						<TableHead>Timestamp</TableHead>
						<TableHead>Room</TableHead>
						<TableHead className="text-right">Staff</TableHead>
						<TableHead className="text-right">Children</TableHead>
						<TableHead>Required Ratio</TableHead>
						<TableHead>Actual Ratio</TableHead>
						<TableHead>Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((snapshot) => {
						const classroom = classroomMap.get(snapshot.classroomId);
						const requiredLabel = `1:${Math.round(1 / snapshot.ratioRequired)}`;
						const actualLabel =
							snapshot.staffCount === 0
								? "N/A"
								: `1:${(snapshot.childrenCount / snapshot.staffCount).toFixed(1)}`;

						return (
							<TableRow
								key={snapshot.id}
								className="hover:bg-muted/40 transition-colors duration-100"
							>
								<TableCell className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
									{formatDateTime(snapshot.snapshotAt, { centerTimezone })}
								</TableCell>
								<TableCell className="font-medium text-foreground">
									{classroom?.name ?? "Unknown Room"}
								</TableCell>
								<TableCell className="text-right tabular-nums">{snapshot.staffCount}</TableCell>
								<TableCell className="text-right tabular-nums">{snapshot.childrenCount}</TableCell>
								<TableCell className="tabular-nums text-muted-foreground">
									{requiredLabel}
								</TableCell>
								<TableCell
									className={`tabular-nums font-medium ${
										snapshot.inCompliance ? "text-success" : "text-destructive"
									}`}
								>
									{actualLabel}
								</TableCell>
								<TableCell>
									<StatusBadge
										status={snapshot.inCompliance ? "compliant" : "violation"}
										label={snapshot.inCompliance ? "Compliant" : "Violation"}
									/>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

function ViolationsSkeleton() {
	return (
		<div className="space-y-3">
			{["sk-1", "sk-2", "sk-3"].map((k) => (
				<div key={k} className="rounded-lg border border-border bg-background p-4 space-y-3">
					<div className="flex justify-between items-center">
						<Skeleton className="h-5 w-36" />
						<Skeleton className="h-5 w-16 rounded-full" />
					</div>
					<div className="space-y-1.5">
						<Skeleton className="h-4 w-52" />
						<Skeleton className="h-4 w-40" />
					</div>
				</div>
			))}
		</div>
	);
}

function SnapshotsSkeleton() {
	return (
		<div className="rounded-lg border border-border overflow-hidden">
			<div className="bg-muted/40 px-4 py-3 flex gap-6">
				{["h1", "h2", "h3", "h4", "h5", "h6", "h7"].map((k) => (
					<Skeleton key={k} className="h-4 w-20" />
				))}
			</div>
			<div className="divide-y">
				{["r1", "r2", "r3", "r4", "r5"].map((k) => (
					<div key={k} className="px-4 py-3 flex gap-6 items-center">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-4 w-8" />
						<Skeleton className="h-4 w-10" />
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
				))}
			</div>
		</div>
	);
}
