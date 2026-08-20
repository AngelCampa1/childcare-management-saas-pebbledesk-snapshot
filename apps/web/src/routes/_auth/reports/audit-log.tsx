import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { AUDIT_ACTIONS } from "@pebbledesk/shared/constants";
import { Button } from "@pebbledesk/ui/components/button";
import { Label } from "@pebbledesk/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@pebbledesk/ui/components/select";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { useAuditLog } from "../../../hooks/use-reports";
import { track } from "../../../lib/analytics";
import {
	formatAuditAbsoluteTimestamp,
	formatAuditActor,
	formatAuditChangedFields,
	formatAuditHeadline,
	formatAuditRecordLabel,
	formatAuditTimestamp,
	getAuditActionTone,
} from "../../../lib/format-audit-log";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/reports/audit-log")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: AuditLogPage,
});

const ENTITY_FILTER_OPTIONS = [
	"children",
	"classrooms",
	"check-ins",
	"staff-check-ins",
	"reports",
	"guardians",
	"invoice",
	"payment",
	"time-entries",
] as const;

const ALL_VALUE = "all";
const ENTITY_FILTER_LABELS: Record<(typeof ENTITY_FILTER_OPTIONS)[number], string> = {
	children: "Children",
	classrooms: "Classrooms",
	"check-ins": "Child check-ins",
	"staff-check-ins": "Staff check-ins",
	reports: "Reports",
	guardians: "Guardians",
	invoice: "Invoices",
	payment: "Payments",
	"time-entries": "Time entries",
};

const TONE_PILL_CLASSNAMES: Record<ReturnType<typeof getAuditActionTone>, string> = {
	success: "bg-success/15 text-success",
	destructive: "bg-destructive/10 text-destructive",
	neutral: "bg-muted text-foreground",
};

export function AuditLogPage() {
	const [action, setAction] = useState<string>(ALL_VALUE);
	const [entityType, setEntityType] = useState<string>(ALL_VALUE);
	const isMountRef = useRef(true);
	const { data: session } = useAuthSession();
	const centerTimezone = session?.center.timezone ?? undefined;
	const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useAuditLog({
			action: action === ALL_VALUE ? undefined : action,
			entityType: entityType === ALL_VALUE ? undefined : entityType,
		});
	const entries = data?.pages.flatMap((p) => p.entries) ?? [];
	const resultCount = entries.length;

	useEffect(() => {
		if (isMountRef.current) {
			isMountRef.current = false;
			return;
		}
		const hasFilters = action !== ALL_VALUE || entityType !== ALL_VALUE;
		if (!hasFilters) return;
		const props: Record<string, unknown> = { has_filters: true };
		if (entityType !== ALL_VALUE) {
			props.entity_type = entityType;
		}
		track(ANALYTICS_EVENTS.auditLogFiltered, props);
	}, [action, entityType]);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Review exports and system changes for audit readiness.
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="audit-action-filter">Action</Label>
					<Select value={action} onValueChange={setAction}>
						<SelectTrigger id="audit-action-filter" aria-label="Action filter">
							<SelectValue placeholder="All actions" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_VALUE}>All actions</SelectItem>
							{AUDIT_ACTIONS.map((option) => (
								<SelectItem key={option} value={option}>
									{option.charAt(0).toUpperCase() + option.slice(1)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="audit-entity-filter">Entity</Label>
					<Select value={entityType} onValueChange={setEntityType}>
						<SelectTrigger id="audit-entity-filter" aria-label="Entity filter">
							<SelectValue placeholder="All entities" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_VALUE}>All entities</SelectItem>
							{ENTITY_FILTER_OPTIONS.map((option) => (
								<SelectItem key={option} value={option}>
									{ENTITY_FILTER_LABELS[option]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{isLoading ? (
				<div className="space-y-3">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
				</div>
			) : isError ? (
				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
					<p className="text-sm text-destructive">Failed to load the audit log.</p>
					<button
						type="button"
						onClick={() => void refetch()}
						className="mt-3 text-sm font-medium text-primary hover:underline"
					>
						Try again
					</button>
				</div>
			) : entries.length > 0 ? (
				<section className="space-y-3" aria-label="Audit log results">
					<p className="text-sm font-medium text-muted-foreground">
						{resultCount} audit {resultCount === 1 ? "entry" : "entries"} shown
					</p>
					<ul className="space-y-3">
						{entries.map((entry) => {
							const tone = getAuditActionTone(entry.action);
							const recordLabel = formatAuditRecordLabel({
								entityId: entry.entityId,
								hasChanges: Boolean(entry.changes?.changedFields?.length),
								action: entry.action,
							});
							const isMissingRecord =
								recordLabel === "No snapshot captured" ||
								recordLabel === "Record removed after this entry was logged";
							return (
								<li
									key={entry.id}
									className="rounded-lg border border-border bg-background px-4 py-3 space-y-2"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${TONE_PILL_CLASSNAMES[tone]}`}
										>
											{entry.action}
										</span>
										<p className="font-medium text-foreground">
											{formatAuditHeadline(entry.action, entry.entityType)}
										</p>
									</div>
									<p
										className={
											isMissingRecord
												? "text-sm italic text-muted-foreground/80"
												: "text-sm text-muted-foreground"
										}
									>
										{recordLabel}
									</p>
									<p className="text-sm text-muted-foreground">
										{formatAuditChangedFields(entry.changes?.changedFields)}
									</p>
									<div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
										<span className="font-medium text-foreground/80">
											{formatAuditActor(entry.userId, entry.userName)}
										</span>
										<span aria-hidden="true">·</span>
										<time
											dateTime={entry.createdAt}
											title={formatAuditAbsoluteTimestamp(entry.createdAt, centerTimezone)}
										>
											{formatAuditTimestamp(entry.createdAt, undefined, centerTimezone)}
										</time>
									</div>
								</li>
							);
						})}
					</ul>
					{hasNextPage && (
						<div className="flex justify-center pt-2">
							<Button
								variant="outline"
								disabled={isFetchingNextPage}
								onClick={() => fetchNextPage()}
							>
								{isFetchingNextPage ? "Loading…" : "Load more"}
							</Button>
						</div>
					)}
				</section>
			) : (
				<EmptyState
					tone="compliance"
					icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
					title="Nothing to audit so far"
					description="System changes and exports will land here so you can answer any inspector question. Widen the filters to see more."
				/>
			)}
		</div>
	);
}
