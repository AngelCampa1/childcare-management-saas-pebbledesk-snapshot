import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import { ComplianceSummary } from "../../components/design-system";
import { useSwitchCenter } from "../../hooks/use-memberships";
import type { CenterOverview } from "../../hooks/use-overview";
import { useMultiCenterOverview } from "../../hooks/use-overview";
import { extractErrorMessage } from "../../lib/extract-error-message";

export const Route = createFileRoute("/_auth/overview")({
	component: OverviewPage,
});

const SUPPORT_MAILTO_HREF = `mailto:${PUBLIC_BRAND_KNOWLEDGE.supportEmail}`;

export function OverviewPage() {
	const { data: centers, isLoading, isError } = useMultiCenterOverview();

	if (isLoading) {
		return <OverviewSkeleton />;
	}

	if (isError || !centers) {
		return <OverviewErrorState />;
	}

	if (centers.length <= 1) {
		return <SingleLocationState />;
	}

	const sortedCenters = [...centers].sort(
		(a, b) => getExceptionPriority(a) - getExceptionPriority(b),
	);
	const violationLocations = centers.filter((center) => center.ratioStatus === "violation").length;
	const warningLocations = centers.filter((center) => center.ratioStatus === "warning").length;
	const unreadAlerts = centers.reduce((total, center) => total + center.unreadAlertCount, 0);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">All Locations</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					A bird's-eye view across all your centers.
				</p>
			</div>
			<ComplianceSummary
				title="Location exceptions"
				tone={violationLocations > 0 ? "destructive" : warningLocations > 0 ? "warning" : "success"}
				items={[
					{ label: "Active violations", value: String(violationLocations) },
					{ label: "Needs attention", value: String(warningLocations) },
					{ label: "Unread alerts", value: String(unreadAlerts) },
				]}
			/>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{sortedCenters.map((center) => (
					<CenterCard key={center.centerId} center={center} />
				))}
			</div>
		</div>
	);
}

function getExceptionPriority(center: CenterOverview) {
	if (center.ratioStatus === "violation") return 0;
	if (center.ratioStatus === "warning") return 1;
	if (center.unreadAlertCount > 0 || center.openViolationCount > 0) return 2;
	if (center.ratioStatus === "unknown") return 3;
	return 4;
}

function CenterCard({ center }: { center: CenterOverview }) {
	const { mutateAsync: switchCenter } = useSwitchCenter();
	const navigate = useNavigate();
	const [switchError, setSwitchError] = useState<string | null>(null);

	async function handleClick() {
		try {
			await switchCenter(center.centerId);
			setSwitchError(null);
			void navigate({ to: "/dashboard" });
		} catch (err) {
			setSwitchError(extractErrorMessage(err, "Could not switch center."));
		}
	}

	return (
		<Card
			role="button"
			tabIndex={0}
			aria-label={`Switch to ${center.centerName}`}
			className="cursor-pointer hover:shadow-md motion-safe:hover:scale-[1.01] transition-all duration-200"
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					void handleClick();
				}
			}}
		>
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between gap-2">
					<CardTitle className="text-base font-semibold text-foreground">
						{center.centerName}
					</CardTitle>
					<Badge variant="secondary" className="shrink-0 text-xs capitalize">
						{center.role}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Users className="h-4 w-4 shrink-0" />
					<span>
						{center.activeChildCount} active {center.activeChildCount === 1 ? "child" : "children"}
					</span>
				</div>
				<RatioStatusPill status={center.ratioStatus} />
				{switchError ? (
					<p role="alert" className="text-sm text-destructive">
						{switchError}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

const ratioStatusConfig = {
	ok: {
		label: "All Ratios OK",
		className:
			"border border-success/20 bg-success/15 text-success inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
	},
	warning: {
		label: "Ratio Warning",
		className:
			"border border-warning/20 bg-warning/15 text-warning inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
	},
	violation: {
		label: "Active Violation",
		className:
			"border border-destructive/20 bg-destructive/15 text-destructive inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
	},
	unknown: {
		label: "Unknown",
		className:
			"border border-border bg-muted text-muted-foreground inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
	},
} as const;

function RatioStatusPill({ status }: { status: CenterOverview["ratioStatus"] }) {
	const config = ratioStatusConfig[status];
	return <span className={config.className}>{config.label}</span>;
}

function OverviewSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-64" />
			</div>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{["sk-a", "sk-b", "sk-c"].map((key) => (
					<Card key={key} className="p-6">
						<div className="space-y-3">
							<Skeleton className="h-5 w-36" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-5 w-28 rounded-full" />
						</div>
					</Card>
				))}
			</div>
		</div>
	);
}

function SingleLocationState() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center p-6">
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-8 text-center shadow-sm">
				<h1 className="text-xl font-semibold text-foreground">You have one location.</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					The multi-center overview becomes available when you have two or more centers.
				</p>
				<div className="mt-6">
					<Link to="/dashboard" className="text-sm font-medium text-primary hover:underline">
						Go to your dashboard
					</Link>
				</div>
			</div>
		</div>
	);
}

function OverviewErrorState() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center p-6">
			<div role="alert" className="rounded-xl border border-primary/20 bg-card p-6 text-center">
				<p className="font-semibold text-foreground">We couldn't load your locations</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Your data is safe — this is a temporary display issue. Refresh to try again.
				</p>
				<div className="mt-4 flex justify-center gap-3">
					<Button variant="default" onClick={() => window.location.reload()}>
						Refresh page
					</Button>
					<Button variant="outline" asChild>
						<a href={SUPPORT_MAILTO_HREF}>Contact support</a>
					</Button>
				</div>
			</div>
		</div>
	);
}
