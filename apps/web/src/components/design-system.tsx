import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@pebbledesk/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@pebbledesk/ui/components/dialog";
import { cn } from "@pebbledesk/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { StatusBadge } from "./status-badge";

type Tone = "neutral" | "primary" | "success" | "warning" | "destructive";

const SURFACE_BY_TONE: Record<Tone, string> = {
	neutral: "border-border bg-card",
	primary: "border-primary/20 bg-primary/5",
	success: "border-success/20 bg-success/5",
	warning: "border-warning/25 bg-warning/10",
	destructive: "border-destructive/25 bg-destructive/10",
};

const TEXT_BY_TONE: Record<Tone, string> = {
	neutral: "text-foreground",
	primary: "text-primary",
	success: "text-success",
	warning: "text-warning",
	destructive: "text-destructive",
};

interface PageHeaderProps {
	title: string;
	description?: string;
	status?: ReactNode;
	primaryAction?: ReactNode;
	secondaryActions?: ReactNode;
	className?: string;
}

export function PageHeader({
	title,
	description,
	status,
	primaryAction,
	secondaryActions,
	className,
}: PageHeaderProps) {
	return (
		<header
			className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
		>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
					{status}
				</div>
				{description ? (
					<p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
				) : null}
			</div>
			{primaryAction || secondaryActions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{secondaryActions ? (
						<section
							aria-label="Secondary page actions"
							className="flex flex-wrap items-center gap-2"
						>
							{secondaryActions}
						</section>
					) : null}
					{primaryAction ? (
						<section aria-label="Primary page action" className="flex flex-wrap items-center gap-2">
							{primaryAction}
						</section>
					) : null}
				</div>
			) : null}
		</header>
	);
}

interface SummaryMetricProps {
	label: string;
	value: ReactNode;
	detail?: ReactNode;
	tone?: Tone;
	className?: string;
}

export function SummaryMetric({
	label,
	value,
	detail,
	tone = "neutral",
	className,
}: SummaryMetricProps) {
	return (
		<div className={cn("rounded-lg border px-4 py-3", SURFACE_BY_TONE[tone], className)}>
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className={cn("mt-1 text-2xl font-semibold tabular-nums", TEXT_BY_TONE[tone])}>{value}</p>
			{detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
		</div>
	);
}

interface StatusPanelProps {
	tone?: Tone;
	title: string;
	description?: string;
	action?: ReactNode;
	className?: string;
	children?: ReactNode;
}

export function StatusPanel({
	tone = "neutral",
	title,
	description,
	action,
	className,
	children,
}: StatusPanelProps) {
	return (
		<section
			aria-label={title}
			data-tone={tone}
			className={cn(
				"flex flex-col gap-3 rounded-lg border px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
				SURFACE_BY_TONE[tone],
				className,
			)}
		>
			<div className="min-w-0">
				<h2 className={cn("text-sm font-semibold", TEXT_BY_TONE[tone])}>{title}</h2>
				{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
				{children}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</section>
	);
}

interface SectionPanelProps {
	title: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	contentClassName?: string;
}

export function SectionPanel({
	title,
	description,
	action,
	children,
	className,
	contentClassName,
}: SectionPanelProps) {
	return (
		<Card className={className}>
			<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<CardTitle>
						<h2 className="text-lg font-semibold text-foreground">{title}</h2>
					</CardTitle>
					{description ? <CardDescription>{description}</CardDescription> : null}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</CardHeader>
			<CardContent className={contentClassName}>{children}</CardContent>
		</Card>
	);
}

type ReadinessStatus = "ok" | "attention" | "missing" | "neutral";

const READINESS_STATUS_TO_BADGE: Record<ReadinessStatus, string> = {
	ok: "compliant",
	attention: "near-limit",
	missing: "violation",
	neutral: "secondary",
};

interface ReadinessItem {
	label: string;
	status: ReadinessStatus;
	detail?: ReactNode;
}

interface ReadinessStripProps {
	title: string;
	items: ReadinessItem[];
	action?: ReactNode;
	className?: string;
}

export function ReadinessStrip({ title, items, action, className }: ReadinessStripProps) {
	return (
		<section
			aria-label={title}
			className={cn("rounded-lg border border-border bg-card px-4 py-4", className)}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold text-foreground">{title}</h2>
					<div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						{items.map((item) => (
							<div
								key={item.label}
								className="min-w-0 rounded-md border border-border bg-muted/30 p-3"
							>
								<div className="flex items-center justify-between gap-2">
									<p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
										{item.label}
									</p>
									<StatusBadge status={READINESS_STATUS_TO_BADGE[item.status]} />
								</div>
								{item.detail ? (
									<p className="mt-1 text-sm font-medium text-foreground">{item.detail}</p>
								) : null}
							</div>
						))}
					</div>
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
		</section>
	);
}

interface DataTableActionProps {
	href: string;
	label?: string;
	ariaLabel: string;
	className?: string;
}

export function DataTableAction({
	href,
	label = "View",
	ariaLabel,
	className,
}: DataTableActionProps) {
	return (
		<Button asChild variant="outline" size="sm" className={className}>
			<a href={href} aria-label={ariaLabel}>
				{label}
			</a>
		</Button>
	);
}

interface ComplianceSummaryItem {
	label: string;
	value: ReactNode;
}

interface ComplianceSummaryProps {
	title: string;
	tone?: Tone;
	items: ComplianceSummaryItem[];
	action?: ReactNode;
	className?: string;
}

export function ComplianceSummary({
	title,
	tone = "neutral",
	items,
	action,
	className,
}: ComplianceSummaryProps) {
	return (
		<section
			aria-label={title}
			className={cn("rounded-lg border px-4 py-4", SURFACE_BY_TONE[tone], className)}
		>
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold text-foreground">{title}</h2>
					<dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{items.map((item) => (
							<div key={item.label} className="min-w-0">
								<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									{item.label}
								</dt>
								<dd className={cn("mt-1 text-lg font-semibold tabular-nums", TEXT_BY_TONE[tone])}>
									{item.value}
								</dd>
							</div>
						))}
					</dl>
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
		</section>
	);
}

interface RecordRowProps {
	title: ReactNode;
	description?: ReactNode;
	status?: ReactNode;
	action?: ReactNode;
	children?: ReactNode;
	className?: string;
}

export function RecordRow({
	title,
	description,
	status,
	action,
	children,
	className,
}: RecordRowProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
				className,
			)}
		>
			<div className="min-w-0">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<p className="min-w-0 truncate text-sm font-medium text-foreground">{title}</p>
					{status}
				</div>
				{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
				{children}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}

interface ConfirmDestructiveDialogProps {
	trigger: ReactNode;
	title: string;
	description: string;
	confirmLabel: string;
	onConfirm: () => void | Promise<void>;
	cancelLabel?: string;
}

export function ConfirmDestructiveDialog({
	trigger,
	title,
	description,
	confirmLabel,
	onConfirm,
	cancelLabel = "Cancel",
}: ConfirmDestructiveDialogProps) {
	const [open, setOpen] = useState(false);
	const [isConfirming, setIsConfirming] = useState(false);

	async function handleConfirm() {
		setIsConfirming(true);
		try {
			await onConfirm();
			setOpen(false);
		} finally {
			setIsConfirming(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent role="alertdialog">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => setOpen(false)}>
						{cancelLabel}
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={handleConfirm}
						disabled={isConfirming}
					>
						{isConfirming ? "Working..." : confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { Badge };
