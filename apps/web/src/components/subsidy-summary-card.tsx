import { formatCurrency as formatCurrencyShared } from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import type { ChildSubsidySummary } from "../hooks/use-finance";
import { formatDate, useCenterTimezone } from "../lib/format-date";
import { StatusBadge } from "./status-badge";

interface SubsidySummaryCardProps {
	childName: string;
	summary: ChildSubsidySummary | null;
	isLoading?: boolean;
}

export function SubsidySummaryCard({
	childName,
	summary,
	isLoading = false,
}: SubsidySummaryCardProps) {
	const centerTimezone = useCenterTimezone();
	const formatShortDate = (value: string) => formatDate(value, { centerTimezone });
	return (
		<Card>
			<CardHeader className="space-y-1">
				<CardTitle>Subsidy</CardTitle>
				<p className="text-sm text-muted-foreground">{childName}</p>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-4 w-1/2" />
						<Skeleton className="h-16 w-full" />
					</div>
				) : summary?.activeCase ? (
					<div className="space-y-4">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="secondary" className="bg-primary/10 text-primary">
									{subsidyProgramLabel(summary.activeCase.program)}
								</Badge>
								<StatusBadge status={summary.activeCase.status} />
							</div>
							<div className="space-y-1 text-sm">
								<p className="font-medium text-foreground">{summary.activeCase.caseNumber}</p>
								<p className="text-muted-foreground">{summary.activeCase.agencyName}</p>
							</div>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<Detail
								label="Authorized hours"
								value={formatNumber(summary.activeCase.authorizedHoursWeekly)}
							/>
							<Detail label="Daily rate" value={formatCurrency(summary.activeCase.rateDaily)} />
							<Detail label="Weekly rate" value={formatCurrency(summary.activeCase.rateWeekly)} />
							<Detail
								label="Effective date"
								value={formatShortDate(summary.activeCase.effectiveDate)}
							/>
						</div>

						{summary.latestClaim ? (
							<div className="rounded-lg border border-border bg-muted p-4">
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-foreground">Latest claim</p>
										<p className="text-xs text-muted-foreground">
											{formatShortDate(summary.latestClaim.periodStart)} -{" "}
											{formatShortDate(summary.latestClaim.periodEnd)}
										</p>
									</div>
									<StatusBadge status={summary.latestClaim.status} />
								</div>
								<div className="mt-3 grid gap-3 sm:grid-cols-3">
									<Detail
										label="Claimed"
										value={formatCurrency(summary.latestClaim.amountClaimed)}
									/>
									<Detail label="Days" value={String(summary.latestClaim.daysAttended)} />
									<Detail label="Hours" value={formatNumber(summary.latestClaim.hoursAttended)} />
								</div>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">No claims submitted yet.</p>
						)}
					</div>
				) : (
					<div className="rounded-lg border border-dashed border-border bg-muted p-5 text-sm text-muted-foreground">
						No subsidy case yet for {childName}. Add one when this child is enrolled in a subsidy
						program.
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function Detail({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-border bg-background p-3">
			<p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className="mt-1 text-sm font-medium text-foreground">{value}</p>
		</div>
	);
}

function formatCurrency(value: number | undefined) {
	if (typeof value !== "number") return "Not set";
	return formatCurrencyShared(value);
}

function formatNumber(value: number | undefined) {
	if (typeof value !== "number") return "Not set";
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: 2,
	}).format(value);
}

const SUBSIDY_PROGRAM_LABELS: Record<string, string> = {
	ccdf: "CCDF",
	head_start: "Head Start",
	early_head_start: "Early Head Start",
};

export function subsidyProgramLabel(program: string) {
	return (
		SUBSIDY_PROGRAM_LABELS[program] ??
		program.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
	);
}
