import { Label } from "@pebbledesk/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@pebbledesk/ui/components/popover";
import { cn } from "@pebbledesk/ui/lib/utils";
import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { getRequiredAppPageHelpByRoute } from "../lib/guidance-content";

interface HelpTipProps {
	children: ReactNode;
	label: string;
	side?: "top" | "right" | "bottom" | "left";
	className?: string;
}

export function HelpTip({ children, label, side = "top", className }: HelpTipProps) {
	const align = side === "right" ? "start" : side === "left" ? "end" : "center";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-haspopup="dialog"
					className={cn(
						"inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						className,
					)}
				>
					<HelpCircle className="h-4 w-4" aria-hidden="true" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side={side}
				align={align}
				sideOffset={6}
				aria-label={label}
				className="max-w-72 text-left text-sm leading-5"
			>
				{children}
			</PopoverContent>
		</Popover>
	);
}

interface FieldHelpProps {
	htmlFor?: string;
	label: string;
	help: ReactNode;
	required?: boolean;
	className?: string;
}

export function FieldHelp({ htmlFor, label, help, required = false, className }: FieldHelpProps) {
	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			<Label htmlFor={htmlFor}>
				{label}
				{required ? <span className="sr-only"> required</span> : null}
			</Label>
			<HelpTip label={`Help: ${label}`}>{help}</HelpTip>
		</div>
	);
}

type PageHelpPanelProps =
	| {
			route?: string;
			title: string;
			what: string;
			first: string;
			watch: string;
			className?: string;
	  }
	| {
			route: string;
			title?: string;
			what?: string;
			first?: string;
			watch?: string;
			className?: string;
	  };

export function PageHelpPanel(props: PageHelpPanelProps) {
	const content = props.route ? getRequiredAppPageHelpByRoute(props.route) : props;
	const title = props.title ?? content.title;
	const what = props.what ?? content.what;
	const first = props.first ?? content.first;
	const watch = props.watch ?? content.watch;
	const className = props.className;
	const items = [
		{ label: "What this page is for", text: what },
		{ label: "What to do first", text: first },
		{ label: "What to watch", text: watch },
	];

	return (
		<section
			aria-label="Page help"
			className={cn("rounded-lg border border-primary/20 bg-primary/5 p-4", className)}
		>
			<div className="flex items-start gap-3">
				<div className="rounded-full bg-background p-2 text-primary">
					<HelpCircle className="h-4 w-4" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<h2 className="text-sm font-semibold text-foreground">{title}</h2>
					<div className="mt-3 grid gap-3 md:grid-cols-3">
						{items.map((item) => (
							<div
								key={item.label}
								className="rounded-md border border-primary/10 bg-background p-3"
							>
								<p className="text-xs font-semibold uppercase tracking-wide text-primary">
									{item.label}
								</p>
								<p className="mt-1 text-sm leading-6 text-muted-foreground">{item.text}</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
