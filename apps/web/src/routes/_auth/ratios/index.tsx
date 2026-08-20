import { Button } from "@pebbledesk/ui/components/button";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { GuidancePanel } from "../../../components/guidance";
import { HelpTip, PageHelpPanel } from "../../../components/help-tip";
import { RatioCard } from "../../../components/ratio-card";
import { useRatios, useRatioViolations } from "../../../hooks/use-ratios";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/ratios/")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: RatioDashboardPage,
});

type ReadinessCheck = {
	label: string;
	ok: boolean;
	href?: "/classrooms" | "/ratios/history" | "/children" | "/guardians" | "/subsidies";
};

function ComplianceReadinessCard({ checks }: { checks: ReadinessCheck[] }) {
	const score = checks.filter((c) => c.ok).length;
	const total = checks.length;
	const allOk = score === total;

	return (
		<div className="rounded-xl border border-primary/20 bg-card p-5">
			<div className="flex items-center gap-4 mb-4">
				<div className="relative h-14 w-14 shrink-0">
					<svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90" aria-hidden="true">
						<circle
							cx="18"
							cy="18"
							r="15.9"
							fill="none"
							stroke="currentColor"
							strokeWidth="3"
							className="text-muted/30"
						/>
						<circle
							cx="18"
							cy="18"
							r="15.9"
							fill="none"
							stroke="currentColor"
							strokeWidth="3"
							strokeDasharray={`${(score / total) * 100} 100`}
							className={
								allOk ? "text-success" : score >= total / 2 ? "text-warning" : "text-destructive"
							}
						/>
					</svg>
					<span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
						{score}/{total}
					</span>
				</div>
				<div>
					<p className="text-xs font-bold uppercase tracking-wider text-primary mb-0.5">
						Compliance Readiness
					</p>
					<p className="text-sm font-semibold text-foreground">
						{allOk
							? "Ready for inspection"
							: `${total - score} item${total - score === 1 ? "" : "s"} need attention`}
					</p>
				</div>
			</div>
			<div className="border-t border-border pt-3 space-y-2">
				{checks.map((check) => (
					<div key={check.label} className="flex items-center gap-2 text-sm">
						<span
							className={[
								"flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-bold",
								check.ok ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
							].join(" ")}
							aria-hidden="true"
						>
							{check.ok ? <Check className="h-3 w-3" aria-hidden="true" /> : "!"}
						</span>
						<span className="sr-only">{check.ok ? "Passed:" : "Failed:"}</span>
						{check.href && !check.ok ? (
							<Link to={check.href} className="text-warning hover:underline font-medium">
								{check.label}
							</Link>
						) : (
							<span className={check.ok ? "text-foreground" : "text-warning font-medium"}>
								{check.label}
							</span>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

function RatioDashboardPage() {
	const { data: ratios, isLoading, isFetching, isError, refetch } = useRatios();
	const {
		data: openViolations,
		isLoading: isLoadingOpenViolations,
		isError: isOpenViolationsError,
	} = useRatioViolations({ status: "open" });
	const navigate = useNavigate();
	const [pollFlash, setPollFlash] = useState(false);
	const prevFetching = useRef(false);

	// Flash the poll indicator briefly on each successful refetch (not on initial load)
	useEffect(() => {
		if (prevFetching.current && !isFetching) {
			setPollFlash(true);
			const timer = setTimeout(() => setPollFlash(false), 500);
			prevFetching.current = isFetching;
			return () => clearTimeout(timer);
		}
		prevFetching.current = isFetching;
	}, [isFetching]);

	if (isLoading) {
		return <RatioDashboardSkeleton />;
	}

	if (isError) {
		return (
			<div className="space-y-6">
				<PageHeader pollFlash={pollFlash} />
				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
					<p className="text-sm text-destructive">Failed to load ratios.</p>
					<button
						type="button"
						onClick={() => void refetch()}
						className="mt-3 text-sm font-medium text-primary hover:underline"
					>
						Try again
					</button>
				</div>
			</div>
		);
	}

	const rooms = ratios ?? [];

	if (rooms.length === 0) {
		return (
			<div className="space-y-6">
				<PageHeader pollFlash={pollFlash} />
				<EmptyState
					tone="compliance"
					icon={<LayoutGrid className="h-6 w-6" aria-hidden="true" />}
					title="You're audit-ready"
					description="Once you add your first classroom we'll start tracking staff-to-child ratios here automatically."
					action={
						<Button asChild className="mt-4">
							<Link to="/classrooms">Add a classroom</Link>
						</Button>
					}
				/>
			</div>
		);
	}

	const compliantCount = rooms.filter(
		(r) => r.inCompliance && !r.openViolationId && !r.nearLimit,
	).length;
	const nearLimitCount = rooms.filter(
		(r) => r.nearLimit && r.inCompliance && !r.openViolationId,
	).length;
	const violationCount = rooms.filter((r) => !r.inCompliance || r.openViolationId).length;

	const ratiosOk = violationCount === 0;
	const noActiveViolations =
		!isLoadingOpenViolations && !isOpenViolationsError && (openViolations ?? []).length === 0;

	const readinessChecks: ReadinessCheck[] = [
		{
			label: "All room ratios within state requirements",
			ok: ratiosOk,
			href: "/classrooms",
		},
		{
			label: "No active violations in the last 30 days",
			ok: noActiveViolations,
			href: "/ratios/history",
		},
	];
	const sortedRooms = [...rooms].sort((a, b) => getRoomPriority(a) - getRoomPriority(b));

	return (
		<div className="space-y-6">
			<PageHeader pollFlash={pollFlash} />

			{/* Summary pills */}
			<div className="flex flex-wrap items-center gap-3">
				<SummaryPill
					count={compliantCount}
					label="Compliant"
					colorClass="bg-success/15 text-success"
					help="Rooms currently meeting the state or classroom ratio rule."
				/>
				<SummaryPill
					count={nearLimitCount}
					label="Near Limit"
					colorClass="bg-warning/15 text-warning"
					help="Rooms still okay, but close enough that one change may cause a violation."
				/>
				<SummaryPill
					count={violationCount}
					label="Violation"
					colorClass="bg-destructive/10 text-destructive"
					help="Rooms that need staff, checkout, or roster correction now."
				/>
				<div className="ml-auto">
					<Link
						to="/ratios/history"
						className="text-sm text-primary hover:text-primary/80 hover:underline transition-colors duration-150"
					>
						View History
					</Link>
				</div>
			</div>

			{/* Card grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{sortedRooms.map((ratio) => (
					<RatioCard
						key={ratio.classroomId}
						ratio={ratio}
						freshUpdate={pollFlash}
						onClick={() => {
							navigate({ to: "/attendance", search: { room: ratio.classroomId } }).catch(() => {
								// swallow - navigation errors are non-fatal UX (we stay on current page)
							});
						}}
					/>
				))}
			</div>

			<ComplianceReadinessCard checks={readinessChecks} />

			<GuidancePanel
				guideId="ratio-colors"
				userRole="director"
				title="What do the ratio colors mean?"
			/>
			<PageHelpPanel route="/ratios" />
		</div>
	);
}

function getRoomPriority(ratio: {
	inCompliance?: boolean;
	nearLimit?: boolean;
	openViolationId?: string | null;
}) {
	if (!ratio.inCompliance || ratio.openViolationId) return 0;
	if (ratio.nearLimit) return 1;
	return 2;
}

interface PageHeaderProps {
	pollFlash: boolean;
}

function PageHeader({ pollFlash }: PageHeaderProps) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Staff-to-Child Ratios</h1>
				<div className="flex items-center gap-2 mt-0.5">
					<span
						className={`inline-block w-2 h-2 rounded-full transition-colors duration-300 ${
							pollFlash ? "bg-success" : "bg-muted-foreground/40"
						}`}
					/>
					<p className="text-sm text-muted-foreground">Live · Updates every 15 seconds</p>
				</div>
			</div>
		</div>
	);
}

interface SummaryPillProps {
	count: number;
	label: string;
	colorClass: string;
	help: string;
}

function SummaryPill({ count, label, colorClass, help }: SummaryPillProps) {
	return (
		<span
			className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}
		>
			<span className="tabular-nums font-bold">{count}</span>
			{label}
			<HelpTip label={`Help: ${label}`}>{help}</HelpTip>
		</span>
	);
}

function RatioDashboardSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-56" />
				<Skeleton className="h-4 w-48" />
			</div>
			<div className="flex gap-3">
				<Skeleton className="h-7 w-24 rounded-full" />
				<Skeleton className="h-7 w-24 rounded-full" />
				<Skeleton className="h-7 w-24 rounded-full" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{["sk-1", "sk-2", "sk-3", "sk-4"].map((k) => (
					<div key={k} className="rounded-lg border border-border bg-background p-5 space-y-4">
						<div className="flex justify-between items-start">
							<div className="space-y-1.5">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-3 w-24" />
							</div>
							<Skeleton className="h-6 w-20 rounded-full" />
						</div>
						<div className="grid grid-cols-3 gap-3">
							{["n1", "n2", "n3"].map((n) => (
								<div key={n} className="text-center space-y-1">
									<Skeleton className="h-8 w-12 mx-auto" />
									<Skeleton className="h-3 w-10 mx-auto" />
								</div>
							))}
						</div>
						<div className="space-y-1">
							<div className="flex justify-between">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-3 w-12" />
							</div>
							<Skeleton className="h-1.5 w-full rounded-full" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
