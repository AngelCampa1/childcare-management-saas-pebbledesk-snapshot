import { Badge } from "@pebbledesk/ui/components/badge";
import { cn } from "@pebbledesk/ui/lib/utils";

const STATUS_STYLES: Record<string, string> = {
	active: "bg-success/15 text-success hover:bg-success/20",
	approved: "bg-success/15 text-success hover:bg-success/20",
	paid: "bg-success/15 text-success hover:bg-success/20",
	compliant: "bg-success/15 text-success hover:bg-success/20",
	waitlist: "bg-warning/15 text-warning hover:bg-warning/20",
	"near-capacity": "bg-warning/15 text-warning hover:bg-warning/20",
	"near-limit": "bg-warning/15 text-warning hover:bg-warning/20",
	pending: "bg-warning/15 text-warning hover:bg-warning/20",
	submitted: "bg-warning/15 text-warning hover:bg-warning/20",
	sent: "bg-primary/10 text-primary hover:bg-primary/15",
	violation: "bg-destructive/10 text-destructive hover:bg-destructive/15",
	overdue: "bg-destructive/10 text-destructive hover:bg-destructive/15",
	rejected: "bg-destructive/10 text-destructive hover:bg-destructive/15",
	terminated: "bg-destructive/10 text-destructive hover:bg-destructive/15",
	withdrawn: "bg-muted text-muted-foreground hover:bg-muted",
	archived: "bg-muted text-muted-foreground hover:bg-muted",
	empty: "bg-muted text-muted-foreground hover:bg-muted",
	inactive: "bg-muted text-muted-foreground hover:bg-muted",
	expired: "bg-muted text-muted-foreground hover:bg-muted",
	void: "bg-muted text-muted-foreground hover:bg-muted",
	authorized: "bg-success/15 text-success hover:bg-success/20",
	"not-authorized": "bg-warning/15 text-warning hover:bg-warning/20",
	primary: "bg-primary/10 text-primary hover:bg-primary/15",
	secondary: "bg-muted text-muted-foreground hover:bg-muted",
};

interface StatusBadgeProps {
	status: string;
	label?: string;
	className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
	const style = STATUS_STYLES[status] ?? STATUS_STYLES.inactive;
	const displayLabel = label ?? status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	return (
		<Badge variant="secondary" className={cn("font-medium capitalize", style, className)}>
			{displayLabel}
		</Badge>
	);
}
