import { cn } from "@pebbledesk/ui/lib/utils";

interface CapacityBarProps {
	current: number;
	max: number;
	className?: string;
}

export function CapacityBar({ current, max, className }: CapacityBarProps) {
	const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
	const color = pct >= 100 ? "bg-destructive" : pct >= 85 ? "bg-warning" : "bg-primary";
	const capacityLabel = pct >= 100 ? "Over capacity" : pct >= 85 ? "Near capacity" : undefined;
	return (
		<div className={cn("space-y-1", className)}>
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>Capacity</span>
				<span>
					{current} / {max} children
					{capacityLabel && <span className="sr-only"> — {capacityLabel}</span>}
				</span>
			</div>
			<div className="h-1.5 rounded-full bg-muted overflow-hidden">
				<div
					className={cn("h-full rounded-full transition-all duration-300", color)}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
