import type { RoomRatioStatus } from "@pebbledesk/shared";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle } from "lucide-react";
import { BrandMark } from "../../components/brand-mark";
import { HelpTip, PageHelpPanel } from "../../components/help-tip";
import { useAuthSession } from "../../hooks/use-auth-session";
import { useChildren } from "../../hooks/use-children";
import { useClassrooms } from "../../hooks/use-classrooms";
import { useInvoiceSummary } from "../../hooks/use-finance";
import { useGuardians } from "../../hooks/use-guardians";
import { useRatios } from "../../hooks/use-ratios";
import { getRequiredAppInlineHelpById } from "../../lib/guidance-content";
import { computeSetupProgress } from "../../lib/setup-progress";
import { getBillingState } from "./-billing-state";

export { getBillingState } from "./-billing-state";

export const Route = createFileRoute("/_auth/dashboard")({
	component: DashboardPage,
});

const dashboardChildrenPresentHelp = getRequiredAppInlineHelpById("dashboard.children-present");
const dashboardRoomsWithinRatioHelp = getRequiredAppInlineHelpById("dashboard.rooms-within-ratio");

/**
 * A room counts as "within ratio" only when it is in compliance AND has no
 * lingering unresolved violation. This mirrors the Ratios page, where a room
 * with `openViolationId` set is shown as a violation even if `inCompliance`
 * is momentarily true — so the dashboard headline cannot disagree with it.
 */
function isRoomWithinRatio(room: RoomRatioStatus): boolean {
	return room.inCompliance && !room.openViolationId;
}

export type { SetupStep } from "../../lib/setup-progress";
export { computeSetupProgress } from "../../lib/setup-progress";

function DashboardPage() {
	const { data: session, error: sessionError, isLoading: sessionLoading } = useAuthSession();
	const role = session?.membership.role ?? "owner";
	const canUseCenterSetupLists = Boolean(session && role !== "staff");
	const {
		data: classrooms,
		error: classroomsError,
		isLoading: classroomsLoading,
	} = useClassrooms(undefined, { enabled: canUseCenterSetupLists });
	const {
		data: children,
		error: childrenError,
		isLoading: childrenLoading,
	} = useChildren(undefined, { enabled: canUseCenterSetupLists });
	const { data: guardians } = useGuardians(undefined, { enabled: canUseCenterSetupLists });
	const canLoadInvoiceSummary =
		canUseCenterSetupLists &&
		(classrooms ?? []).some((classroom) => !classroom.archivedAt) &&
		(children ?? []).some(
			(child) => child.enrollmentStatus === "active" || child.enrollmentStatus === "waitlist",
		) &&
		(guardians?.length ?? 0) > 0 &&
		getBillingState(session?.center.subscriptionStatus);
	const {
		data: invoiceSummary,
		isLoading: invoiceSummaryLoading,
		isError: invoiceSummaryError,
	} = useInvoiceSummary({ enabled: canLoadInvoiceSummary });
	const canUseRatios = Boolean(session && role !== "staff");
	const {
		data: ratios,
		error: ratiosError,
		isLoading: ratiosLoading,
		refetch: refetchRatios,
	} = useRatios({ enabled: canUseRatios });

	const isPermissionError = (err: unknown) => {
		if (err instanceof Error) {
			return (
				// err.status is set by the ApiError class in src/api.ts
				("status" in err && (err as { status?: number }).status === 403) ||
				err.message.includes("Insufficient permissions")
			);
		}
		return false;
	};

	const isAuthError = (err: unknown) => {
		if (err instanceof Error) {
			return err.message === "Unauthorized" || err.message.includes("403");
		}
		return false;
	};

	const classroomsRealError = classroomsError && !isPermissionError(classroomsError);
	const childrenRealError = childrenError && !isPermissionError(childrenError);

	if (sessionError || classroomsRealError || childrenRealError) {
		return <DashboardRecoveryState />;
	}

	if (sessionLoading || classroomsLoading || childrenLoading || ratiosLoading) {
		return <DashboardSkeleton />;
	}

	const ratiosFetchFailed = Boolean(ratiosError) && !isAuthError(ratiosError);

	if (!session) {
		return <DashboardRecoveryState />;
	}

	const activeClassrooms = (classrooms ?? []).filter((classroom) => !classroom.archivedAt);
	const activeChildren = (children ?? []).filter((child) => child.enrollmentStatus === "active");
	const enrolledChildren = (children ?? []).filter(
		(child) => child.enrollmentStatus === "active" || child.enrollmentStatus === "waitlist",
	);
	const childrenPresent = ratios?.reduce((n, r) => n + (r.currentChildCount ?? 0), 0);
	const expectedButNotYetIn =
		childrenPresent === undefined
			? undefined
			: Math.max(activeChildren.length - childrenPresent, 0);
	const overdueInvoiceCount = invoiceSummary?.overdueInvoiceCount;
	const overdueInvoiceMetric =
		invoiceSummaryLoading || invoiceSummaryError ? "-" : (overdueInvoiceCount ?? "-");

	const hasClassrooms = activeClassrooms.length > 0;
	const hasChildren = enrolledChildren.length > 0;
	const hasGuardians = (guardians?.length ?? 0) > 0;
	const hasBilling = getBillingState(session.center.subscriptionStatus);
	const { steps, currentStep, allDone } = computeSetupProgress({
		hasClassrooms,
		hasChildren,
		hasGuardians,
		hasBilling,
	});

	return (
		<div className="space-y-6">
			<h1 className="sr-only">Dashboard</h1>
			{ratiosFetchFailed && (
				<div
					role="alert"
					className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning"
				>
					<span>Live ratio data is temporarily unavailable.</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void refetchRatios()}
						className="ml-4 shrink-0 text-warning hover:text-warning"
					>
						Retry
					</Button>
				</div>
			)}

			{/* Compliance-first: ratios + audit-readiness metrics */}
			<div className="rounded-lg border border-border bg-card px-4 py-4">
				<p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					Compliance
				</p>
				<div className="flex flex-wrap gap-6">
					<div>
						<div className="flex items-center gap-1">
							<p
								className={[
									"text-2xl font-bold",
									ratios?.every(isRoomWithinRatio) ? "text-success" : "text-warning",
								].join(" ")}
							>
								{ratios?.filter(isRoomWithinRatio).length ?? "-"}/{ratios?.length ?? "-"}
							</p>
							<HelpTip label={dashboardRoomsWithinRatioHelp.label}>
								{dashboardRoomsWithinRatioHelp.text}
							</HelpTip>
						</div>
						<p className="text-xs text-muted-foreground">rooms within ratio</p>
					</div>
					<div data-testid="children-present">
						<div className="flex items-center gap-1">
							<p className="text-2xl font-bold text-foreground">{childrenPresent ?? "-"}</p>
							<HelpTip label={dashboardChildrenPresentHelp.label}>
								{dashboardChildrenPresentHelp.text}
							</HelpTip>
						</div>
						<p className="text-xs text-muted-foreground">children present</p>
					</div>
					<div data-testid="expected-not-yet-in">
						<p className="text-2xl font-bold text-foreground">{expectedButNotYetIn ?? "-"}</p>
						<p className="text-xs text-muted-foreground">expected but not yet in</p>
					</div>
				</div>
			</div>

			{/* Operations + billing metrics */}
			{allDone && (
				<div className="rounded-lg border border-border bg-card px-4 py-4">
					<p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						Today
					</p>
					<div className="flex flex-wrap gap-6">
						<div data-testid="overdue-invoices">
							<p
								className={[
									"text-2xl font-bold",
									overdueInvoiceCount !== undefined && overdueInvoiceCount > 0
										? "text-destructive"
										: "text-foreground",
								].join(" ")}
							>
								{overdueInvoiceMetric}
							</p>
							<p className="text-xs text-muted-foreground">overdue invoices</p>
						</div>
					</div>
				</div>
			)}

			{/* Setup complete celebration */}
			{allDone && (
				<div className="rounded-lg border border-success/20 bg-success/10 px-4 py-5 text-center">
					<p className="text-base font-semibold text-success">You&apos;re ready — let&apos;s go</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Your center is set up. Head to attendance to start your day.
					</p>
					<Link to="/attendance">
						<Button className="mt-3" size="sm">
							Open attendance <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
						</Button>
					</Link>
				</div>
			)}

			{/* Setup checklist — only shown when incomplete */}
			{!allDone && (
				<>
					{/* Setup progress strip */}
					<div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
						<p className="text-sm font-semibold text-warning-foreground">
							Getting your center ready
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Step {currentStep?.index ?? 1} of 5 · {currentStep?.label}
						</p>
						<div
							className="mt-2 flex gap-1.5"
							role="progressbar"
							aria-valuenow={(currentStep?.index ?? 1) - 1}
							aria-valuemin={0}
							aria-valuemax={5}
							aria-label="Setup progress"
						>
							{steps.map((s) => (
								<div
									key={s.index}
									className={[
										"h-1.5 w-5 rounded-full",
										s.done
											? "bg-warning"
											: s.index === currentStep?.index
												? "border border-warning bg-warning/30"
												: "bg-muted",
									].join(" ")}
								/>
							))}
						</div>
					</div>

					{/* Do this next */}
					{currentStep && currentStep.href !== "" && (
						<Card className="border-primary/20 bg-card">
							<CardHeader className="pb-2">
								<CardTitle className="text-base">{currentStep.label}</CardTitle>
							</CardHeader>
							<CardContent>
								<Link to={currentStep.href}>
									<Button size="sm">
										{currentStep.ctaLabel} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
									</Button>
								</Link>
							</CardContent>
						</Card>
					)}

					{/* Always-visible checklist */}
					<div className="space-y-2">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
							Setup checklist
						</h2>
						{steps.map((s) => {
							const isNext = s.index === currentStep?.index;
							const isDone = s.done;
							return (
								<div
									key={s.index}
									className={[
										"flex items-center gap-3 rounded-lg border px-4 py-3",
										isDone
											? "border-success/20 bg-success/5"
											: isNext
												? "border-primary/30 bg-card"
												: "border-border bg-muted/30",
									].join(" ")}
								>
									<div
										className={[
											"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
											isDone
												? "bg-success/15 text-success"
												: isNext
													? "bg-primary text-primary-foreground"
													: "bg-muted text-muted-foreground",
										].join(" ")}
									>
										{isDone ? <CheckCircle className="h-4 w-4" aria-hidden="true" /> : s.index}
									</div>
									<span
										className={[
											"text-sm",
											isDone
												? "text-muted-foreground line-through"
												: isNext
													? "font-semibold text-foreground"
													: "text-muted-foreground",
										].join(" ")}
									>
										{s.label}
									</span>
								</div>
							);
						})}
					</div>
				</>
			)}

			<PageHelpPanel route="/dashboard" />
		</div>
	);
}

function DashboardRecoveryState() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center bg-muted/20 p-6">
			<div className="w-full max-w-lg rounded-xl border border-border bg-background p-8 text-center shadow-sm">
				<BrandMark className="mb-6 justify-center" wordmarkClassName="text-foreground" />
				<h1 className="text-2xl font-bold text-foreground">We couldn't load your dashboard</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Refresh the page and try again. If the problem keeps happening, check your connection or
					sign in again.
				</p>
				<div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
					<Button asChild>
						<a href="/dashboard">Try again</a>
					</Button>
					<Button asChild variant="outline">
						<a href="/login">Return to sign in</a>
					</Button>
				</div>
			</div>
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			{/* Progress strip skeleton */}
			<div className="rounded-lg border border-border px-4 py-3 space-y-2">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-3 w-32" />
				<div className="flex gap-1.5 mt-2">
					{[1, 2, 3, 4, 5].map((i) => (
						<Skeleton key={i} className="h-1.5 w-5 rounded-full" />
					))}
				</div>
			</div>
			{/* Do this next skeleton */}
			<div className="rounded-lg border border-border p-5 space-y-3">
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-9 w-36" />
			</div>
			{/* Checklist skeleton */}
			<div className="space-y-2">
				<Skeleton className="h-4 w-28" />
				{[1, 2, 3, 4, 5].map((i) => (
					<div
						key={i}
						className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
					>
						<Skeleton className="h-6 w-6 rounded-full shrink-0" />
						<Skeleton className="h-4 w-40" />
					</div>
				))}
			</div>
			{/* Today at a glance skeleton (shown when allDone) */}
			<div className="rounded-lg border border-border px-4 py-4 space-y-3">
				<Skeleton className="h-3 w-12" />
				<div className="flex gap-6">
					<div className="space-y-1">
						<Skeleton className="h-8 w-10" />
						<Skeleton className="h-3 w-20" />
					</div>
					<div className="space-y-1">
						<Skeleton className="h-8 w-10" />
						<Skeleton className="h-3 w-16" />
					</div>
					<div className="space-y-1">
						<Skeleton className="h-8 w-12" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
			</div>
		</div>
	);
}
