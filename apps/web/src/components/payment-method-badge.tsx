import { Badge } from "@pebbledesk/ui/components/badge";
import { cn } from "@pebbledesk/ui/lib/utils";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
	cash: "Cash",
	check: "Check",
	ach: "ACH",
	credit_card: "Credit Card",
	other: "Other",
};

const PAYMENT_METHOD_STYLES: Record<string, string> = {
	cash: "bg-muted text-muted-foreground hover:bg-muted",
	check: "bg-muted text-muted-foreground hover:bg-muted",
	ach: "bg-primary/10 text-primary hover:bg-primary/15",
	credit_card: "bg-primary/10 text-primary hover:bg-primary/15",
	other: "bg-muted text-muted-foreground hover:bg-muted",
};

interface PaymentMethodBadgeProps {
	method: string;
	label?: string;
	className?: string;
}

export function PaymentMethodBadge({ method, label, className }: PaymentMethodBadgeProps) {
	const style = PAYMENT_METHOD_STYLES[method] ?? PAYMENT_METHOD_STYLES.other;
	const displayLabel = label ?? PAYMENT_METHOD_LABELS[method] ?? method;
	return (
		<Badge variant="secondary" className={cn("font-medium", style, className)}>
			{displayLabel}
		</Badge>
	);
}
