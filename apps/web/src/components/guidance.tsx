import type { Role } from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent } from "@pebbledesk/ui/components/card";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, HelpCircle } from "lucide-react";
import { useGuidanceProgress, usePatchGuidanceProgress } from "../hooks/use-guidance-progress";
import {
	type Guide,
	type GuideStep,
	getGuideById,
	stepVisibleToRole,
} from "../lib/guidance-content";

const toneClasses = {
	start: "border-primary/20 bg-primary/5 text-primary",
	daily: "border-border bg-muted text-muted-foreground",
	compliance: "border-success/20 bg-success/5 text-success",
	finance: "border-warning/20 bg-warning/10 text-warning-foreground",
	data: "border-primary/20 bg-primary/5 text-primary",
};

export function GuideChecklist({ guide, role }: { guide: Guide; role: Role }) {
	const { data: progress } = useGuidanceProgress();
	const patchProgress = usePatchGuidanceProgress();
	const completed = new Set(progress?.completedStepIds ?? []);
	const visibleSteps = guide.steps.filter((step) => stepVisibleToRole(step, role));

	function toggleStep(stepId: string) {
		patchProgress.mutate({
			...(completed.has(stepId) ? { uncompleteStepId: stepId } : { completeStepId: stepId }),
			lastOpenedGuideId: guide.id,
		});
	}

	return (
		<ol className="space-y-3">
			{visibleSteps.map((step) => (
				<GuideStepRow
					key={step.id}
					step={step}
					completed={completed.has(step.id)}
					onToggle={() => toggleStep(step.id)}
					interactive
				/>
			))}
		</ol>
	);
}

function StaticGuideChecklist({ guide, role }: { guide: Guide; role: Role }) {
	const visibleSteps = guide.steps.filter((step) => stepVisibleToRole(step, role));

	return (
		<ol className="space-y-3">
			{visibleSteps.map((step) => (
				<GuideStepRow key={step.id} step={step} completed={false} interactive={false} />
			))}
		</ol>
	);
}

function GuideStepRow({
	step,
	completed,
	onToggle,
	interactive,
}: {
	step: GuideStep;
	completed: boolean;
	onToggle?: () => void;
	interactive: boolean;
}) {
	const Icon = completed ? CheckCircle2 : Circle;

	return (
		<li className="rounded-lg border border-border bg-background p-4">
			<div className="flex items-start gap-3">
				{interactive ? (
					<button
						type="button"
						onClick={onToggle}
						className="mt-0.5 rounded-full text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						aria-label={completed ? `Mark ${step.title} incomplete` : `Mark ${step.title} done`}
					>
						<Icon className={completed ? "h-5 w-5 text-success" : "h-5 w-5"} />
					</button>
				) : (
					<span
						className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
						aria-hidden="true"
					/>
				)}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold text-foreground">{step.title}</p>
					<p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
					{interactive && step.href && step.ctaLabel ? (
						<Button asChild variant="outline" size="sm" className="mt-3">
							<Link to={step.href}>{step.ctaLabel}</Link>
						</Button>
					) : null}
				</div>
			</div>
		</li>
	);
}

export function GuideCard({ guide, role }: { guide: Guide; role: Role }) {
	const { data: progress } = useGuidanceProgress();
	const visibleSteps = guide.steps.filter((step) => stepVisibleToRole(step, role));
	const completed = new Set(progress?.completedStepIds ?? []);
	const completedCount = visibleSteps.filter((step) => completed.has(step.id)).length;

	return (
		<Card className="border-border shadow-sm">
			<CardContent className="space-y-4 p-5">
				<div className="flex items-start justify-between gap-3">
					<div>
						<Badge variant="secondary" className={toneClasses[guide.tone]}>
							{guide.tone === "start"
								? "Start here"
								: guide.tone === "daily"
									? "Daily use"
									: guide.tone === "compliance"
										? "Compliance"
										: guide.tone === "finance"
											? "Money"
											: "Data"}
						</Badge>
						<h2 className="mt-3 text-lg font-semibold text-foreground">{guide.title}</h2>
						<p className="mt-1 text-sm leading-6 text-muted-foreground">{guide.description}</p>
					</div>
					<p className="shrink-0 text-sm font-medium text-muted-foreground">
						{completedCount}/{visibleSteps.length}
					</p>
				</div>
				<GuideChecklist guide={guide} role={role} />
			</CardContent>
		</Card>
	);
}

export function GuidancePanel({
	guideId,
	userRole,
	title = "Need help?",
}: {
	guideId: string;
	userRole: Role;
	title?: string;
}) {
	const guide = getGuideById(guideId);
	if (!guide?.roles.includes(userRole)) {
		return null;
	}

	return (
		<section className="rounded-lg border border-border bg-background p-4 shadow-sm">
			<div className="flex items-start gap-3">
				<div className="rounded-full bg-primary/10 p-2 text-primary">
					<HelpCircle className="h-4 w-4" aria-hidden="true" />
				</div>
				<div>
					<h2 className="text-sm font-semibold text-foreground">{title}</h2>
					<p className="mt-1 text-sm leading-6 text-muted-foreground">{guide.description}</p>
				</div>
			</div>
			<div className="mt-4">
				<StaticGuideChecklist guide={guide} role={userRole} />
			</div>
		</section>
	);
}
