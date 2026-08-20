import type { RoomRatioStatus } from "@pebbledesk/shared";
import { cn } from "@pebbledesk/ui/lib/utils";
import { AlertTriangle, Users } from "lucide-react";
import { StatusBadge } from "./status-badge";

interface RatioCardProps {
	ratio: RoomRatioStatus;
	onClick: () => void;
	/**
	 * When true, applies a brief flash animation on the status badge to acknowledge
	 * a fresh poll. Reset to false ~400ms after the refresh.
	 */
	freshUpdate?: boolean;
}

function getComplianceState(ratio: RoomRatioStatus): "compliant" | "near-limit" | "violation" {
	if (!ratio.inCompliance || ratio.openViolationId) return "violation";
	if (ratio.nearLimit) return "near-limit";
	return "compliant";
}

function formatActualRatio(ratio: RoomRatioStatus): string {
	if (ratio.currentStaffCount === 0) return "N/A";
	const actual = ratio.currentChildCount / ratio.currentStaffCount;
	return `1:${actual.toFixed(1)}`;
}

function computeMarginChildren(ratio: RoomRatioStatus): number {
	const childrenAllowed = Math.floor(
		ratio.currentStaffCount * (ratio.minRatioChildren / ratio.minRatioStaff),
	);
	return Math.max(0, childrenAllowed - ratio.currentChildCount);
}

function computeNearLimitMessage(ratio: RoomRatioStatus): string {
	const margin = computeMarginChildren(ratio);
	if (margin <= 0) return "Adding any child triggers a violation";
	return margin === 1
		? "1 more child triggers a violation"
		: `${margin} more children trigger a violation`;
}

function computeStaffNeeded(ratio: RoomRatioStatus): number {
	const needed = Math.ceil(ratio.currentChildCount * ratio.ratioRequired);
	return Math.max(0, needed - ratio.currentStaffCount);
}

export function RatioCard({ ratio, onClick, freshUpdate = false }: RatioCardProps) {
	const state = getComplianceState(ratio);
	const capacityPct =
		ratio.maxCapacity > 0 ? Math.min((ratio.currentChildCount / ratio.maxCapacity) * 100, 100) : 0;

	const cardClass = cn(
		"rounded-lg p-5 border cursor-pointer select-none",
		"hover:-translate-y-0.5 hover:shadow-md transition-all duration-200",
		{
			"border-border bg-background": state === "compliant",
			"border-2 border-warning bg-background ring-2 ring-warning/20": state === "near-limit",
			"border-2 border-destructive ring-2 ring-destructive/30": state === "violation",
		},
	);

	const ratioTextClass = cn("text-2xl font-bold tabular-nums", {
		"text-success": state === "compliant",
		"text-warning": state === "near-limit",
		"text-destructive": state === "violation",
	});

	const barColorClass = {
		compliant: "bg-success",
		"near-limit": "bg-warning",
		violation: "bg-destructive",
	}[state];

	const staffNeeded = state === "violation" ? computeStaffNeeded(ratio) : 0;

	return (
		<button
			type="button"
			className={cn(
				cardClass,
				state === "violation" && "animate-pulse-subtle",
				"text-left w-full",
				"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
			)}
			onClick={onClick}
			aria-label={`${ratio.classroomName} ratio card — ${state}`}
		>
			{/* Header row */}
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="min-w-0">
					<h3 className="font-semibold text-foreground truncate">{ratio.classroomName}</h3>
					<p className="text-xs text-muted-foreground mt-0.5">
						{ratio.ageGroup} · Required{" "}
						{ratio.minRatioStaff > 1
							? `${ratio.minRatioStaff}:${ratio.minRatioChildren}`
							: `1:${ratio.minRatioChildren}`}
					</p>
				</div>
				<StatusBadge
					status={state}
					label={
						state === "compliant"
							? "Compliant"
							: state === "near-limit"
								? "Near Limit"
								: "Violation"
					}
					className={cn("shrink-0", freshUpdate && "motion-safe:animate-ratio-flash")}
				/>
			</div>

			{/* Big numbers row */}
			<div className="grid grid-cols-3 gap-3 mb-4">
				<div className="text-center">
					<div className="text-2xl font-bold text-foreground tabular-nums">
						{ratio.currentStaffCount}
					</div>
					<div className="text-xs text-muted-foreground mt-0.5">
						<Users className="inline w-3 h-3 mr-0.5 -mt-0.5" />
						Staff
					</div>
				</div>
				<div className="text-center">
					<div className="text-2xl font-bold text-foreground tabular-nums">
						{ratio.currentChildCount}
					</div>
					<div className="text-xs text-muted-foreground mt-0.5">Children</div>
				</div>
				<div className="text-center">
					<div className={ratioTextClass}>{formatActualRatio(ratio)}</div>
					<div className="mt-0.5 text-xs text-muted-foreground">Actual ratio</div>
				</div>
			</div>

			{/* Capacity bar */}
			<div className="space-y-1 mb-3">
				<div className="flex justify-between text-xs text-muted-foreground">
					<span>Capacity</span>
					<span>
						{ratio.currentChildCount} / {ratio.maxCapacity}
					</span>
				</div>
				<div className="h-1.5 rounded-full bg-muted overflow-hidden">
					<div
						className={cn(
							"h-full rounded-full transition-all duration-300 ease-out",
							barColorClass,
						)}
						style={{ width: `${capacityPct}%` }}
					/>
				</div>
			</div>

			{/* State-specific alerts */}
			{state === "near-limit" && (
				<div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning-foreground">
					<div className="flex items-center gap-1.5">
						<AlertTriangle className="w-3.5 h-3.5 shrink-0" />
						<span>{computeNearLimitMessage(ratio)}</span>
					</div>
					<span className="shrink-0 font-semibold text-warning">Check Attendance</span>
				</div>
			)}
			{state === "violation" && staffNeeded > 0 && (
				<div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
					<div className="flex items-center gap-1.5">
						<AlertTriangle className="w-3.5 h-3.5 shrink-0" />
						<span>
							Need {staffNeeded} more staff member{staffNeeded !== 1 ? "s" : ""}
						</span>
					</div>
					<span className="shrink-0 font-semibold">Fix in Attendance</span>
				</div>
			)}
			{state === "violation" && staffNeeded <= 0 && (
				<div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
					<div className="flex items-center gap-1.5">
						<AlertTriangle className="w-3.5 h-3.5 shrink-0" />
						<span>Ratio violation active</span>
					</div>
					<span className="shrink-0 font-semibold">Fix in Attendance</span>
				</div>
			)}
		</button>
	);
}
