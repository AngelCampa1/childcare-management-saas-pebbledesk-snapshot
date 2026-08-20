import { Button } from "@pebbledesk/ui/components/button";

export type EmptyStateTone = "compliance" | "finance" | "people" | "operations";
export type EmptyStateShape = "default" | "checklist" | "inline";

export interface EmptyStateChecklistStep {
	/** Stable identity used as the React key. Falls back to title when absent. */
	id?: string;
	title: string;
	description?: string;
}

interface EmptyStateProps {
	icon?: React.ReactNode;
	title: string;
	description: string;
	actionLabel?: string;
	onAction?: () => void;
	action?: React.ReactNode;
	secondaryAction?: React.ReactNode;
	tone?: EmptyStateTone;
	shape?: EmptyStateShape;
	align?: "center" | "left";
	steps?: EmptyStateChecklistStep[];
}

const TONE_ICON_CLASSES: Record<EmptyStateTone, string> = {
	compliance: "bg-success/10 text-success",
	finance: "bg-primary/10 text-primary",
	people: "bg-primary/10 text-primary",
	operations: "bg-muted text-muted-foreground",
};

const TONE_SURFACE_CLASSES: Record<EmptyStateTone, string> = {
	compliance: "border border-success/15 bg-success/5",
	finance: "border border-primary/15 bg-primary/5",
	people: "border border-primary/15 bg-primary/5",
	operations: "border border-border bg-card",
};

const TONE_STEP_BADGE_CLASSES: Record<EmptyStateTone, string> = {
	compliance: "bg-success/15 text-success",
	finance: "bg-primary/15 text-primary",
	people: "bg-primary/15 text-primary",
	operations: "bg-muted text-muted-foreground",
};

export function EmptyState({
	icon,
	title,
	description,
	actionLabel,
	onAction,
	action,
	secondaryAction,
	tone = "operations",
	shape = "default",
	align = "center",
	steps,
}: EmptyStateProps) {
	if (shape === "inline") {
		return (
			<section
				aria-label={title}
				data-tone={tone}
				data-shape="inline"
				className={`flex flex-col gap-3 rounded-lg px-4 py-4 text-left sm:flex-row sm:items-center ${TONE_SURFACE_CLASSES[tone]}`}
			>
				{icon && (
					<div
						className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_ICON_CLASSES[tone]}`}
						aria-hidden="true"
					>
						{icon}
					</div>
				)}
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-semibold text-foreground">{title}</h3>
					<p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
				{secondaryAction ? <div className="shrink-0">{secondaryAction}</div> : null}
				{actionLabel && onAction && (
					<Button onClick={onAction} size="sm" className="shrink-0 sm:self-center">
						{actionLabel}
					</Button>
				)}
			</section>
		);
	}

	if (shape === "checklist") {
		return (
			<section
				aria-label={title}
				data-tone={tone}
				data-shape="checklist"
				className={`rounded-lg px-6 py-8 text-left ${TONE_SURFACE_CLASSES[tone]}`}
			>
				<div className="flex items-start gap-4">
					{icon && (
						<div
							className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${TONE_ICON_CLASSES[tone]}`}
							aria-hidden="true"
						>
							{icon}
						</div>
					)}
					<div className="min-w-0 flex-1">
						<h3 className="text-lg font-semibold text-foreground">{title}</h3>
						<p className="mt-1 text-sm text-muted-foreground">{description}</p>
					</div>
				</div>
				{steps && steps.length > 0 ? (
					<ol className="mt-5 space-y-3">
						{steps.map((step, index) => (
							<li key={step.id ?? `${step.title}-${index}`} className="flex gap-3">
								<span
									className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${TONE_STEP_BADGE_CLASSES[tone]}`}
								>
									{index + 1}
								</span>
								<div>
									<p className="text-sm font-medium text-foreground">{step.title}</p>
									{step.description ? (
										<p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
									) : null}
								</div>
							</li>
						))}
					</ol>
				) : null}
				<div className="mt-5 flex flex-wrap items-center gap-3">
					{action}
					{secondaryAction}
					{actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
				</div>
			</section>
		);
	}

	return (
		<section
			aria-label={title}
			data-tone={tone}
			data-shape="default"
			className={[
				"flex flex-col rounded-lg px-6 py-12",
				TONE_SURFACE_CLASSES[tone],
				align === "left"
					? "items-start justify-start text-left"
					: "items-center justify-center text-center",
			].join(" ")}
		>
			{icon && (
				<div
					className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full ${TONE_ICON_CLASSES[tone]}`}
					aria-hidden="true"
				>
					{icon}
				</div>
			)}
			<h3 className="text-lg font-semibold text-foreground">{title}</h3>
			<p
				className={`mt-1 text-sm text-muted-foreground ${align === "left" ? "max-w-2xl" : "max-w-sm"}`}
			>
				{description}
			</p>
			{action}
			{secondaryAction ? <div className="mt-3">{secondaryAction}</div> : null}
			{actionLabel && onAction && (
				<Button onClick={onAction} className="mt-4">
					{actionLabel}
				</Button>
			)}
		</section>
	);
}
