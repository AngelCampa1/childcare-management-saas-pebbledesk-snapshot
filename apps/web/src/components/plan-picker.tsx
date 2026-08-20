import type { BillingCadence, PayablePlan } from "@pebbledesk/shared";
import {
	ALL_PLAN_FEATURES,
	DEFAULT_BILLING_CADENCE,
	getPromotionalPlanPrice,
	getSubscriptionPromotionForCadence,
	minPlanCovering,
	PAYABLE_PLANS,
	PLAN_ENTITLEMENTS,
	PLAN_FEATURE_LABELS,
	SUBSCRIPTION_PLAN_CONFIG,
} from "@pebbledesk/shared/constants";
import { Button } from "@pebbledesk/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@pebbledesk/ui/components/dialog";
import { AlertTriangle, Check, X } from "lucide-react";
import { useState } from "react";
import { useStartCheckout, useTrialFeatureUsage } from "../hooks/use-subscription";
import { extractErrorMessage } from "../lib/extract-error-message";

interface PlanPickerProps {
	trialEndsAt?: string | null;
	promoCode?: string;
	/** Active center IANA timezone; trial-end date is shown in this zone. */
	centerTimezone?: string;
}

export function PlanPicker({ trialEndsAt, promoCode, centerTimezone }: PlanPickerProps) {
	const startCheckout = useStartCheckout();
	const [cadence, setCadence] = useState<BillingCadence>(DEFAULT_BILLING_CADENCE);
	const [confirmPlan, setConfirmPlan] = useState<PayablePlan | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleConfirm(plan: PayablePlan) {
		setError(null);
		try {
			await startCheckout.mutateAsync({
				plan,
				cadence,
				promoCode: promoCode?.trim() || undefined,
			});
			setConfirmPlan(null);
		} catch (err) {
			setError(extractErrorMessage(err, "Could not start checkout."));
		}
	}

	return (
		<div className="space-y-4" data-testid="plan-picker-root">
			<fieldset className="flex w-fit rounded-full border bg-background p-1">
				<legend className="sr-only">Billing cadence</legend>
				{(["annual", "monthly"] as const).map((option) => (
					<button
						key={option}
						type="button"
						className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
							cadence === option
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => setCadence(option)}
					>
						{option === "annual" ? "Annual" : "Monthly"}
					</button>
				))}
			</fieldset>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{PAYABLE_PLANS.map((plan) => {
					const config = SUBSCRIPTION_PLAN_CONFIG[plan];
					const entitlements = PLAN_ENTITLEMENTS[plan];
					const price = getPromotionalPlanPrice(plan, cadence);

					return (
						<div key={plan} className="flex flex-col rounded-lg border bg-card p-4 space-y-3">
							<div>
								<p className="font-semibold text-foreground">{config.label}</p>
								<p className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
									{price.badgeLabel}
								</p>
								<p className="text-sm font-medium text-foreground mt-2">
									{price.discountedPriceLabel}
								</p>
								<p className="text-xs text-muted-foreground">{price.renewalPriceLabel}</p>
								{cadence === "annual" ? (
									<p className="text-xs text-muted-foreground">
										{price.discountedAnnualTotalLabel}
									</p>
								) : null}
							</div>

							<ul className="flex-1 space-y-1.5 text-xs">
								{ALL_PLAN_FEATURES.map((feature) => {
									const included = entitlements.features.includes(feature);
									return (
										<li
											key={feature}
											className={`flex items-center gap-1.5 ${
												included ? "text-foreground" : "text-muted-foreground/40"
											}`}
										>
											{included ? (
												<Check className="h-3 w-3 shrink-0 text-emerald-600" />
											) : (
												<X className="h-3 w-3 shrink-0" />
											)}
											{PLAN_FEATURE_LABELS[feature]}
										</li>
									);
								})}
							</ul>

							<Button
								type="button"
								size="sm"
								className="w-full"
								variant="outline"
								onClick={() => setConfirmPlan(plan)}
								disabled={startCheckout.isPending}
							>
								Choose {config.label}
							</Button>
						</div>
					);
				})}
			</div>

			{confirmPlan !== null ? (
				<PlanConfirmDialog
					plan={confirmPlan}
					cadence={cadence}
					trialEndsAt={trialEndsAt ?? null}
					centerTimezone={centerTimezone}
					isPending={startCheckout.isPending}
					error={error}
					onConfirm={handleConfirm}
					onUpgrade={setConfirmPlan}
					onCancel={() => setConfirmPlan(null)}
				/>
			) : null}
		</div>
	);
}

interface PlanConfirmDialogProps {
	plan: PayablePlan;
	cadence: BillingCadence;
	trialEndsAt: string | null;
	centerTimezone?: string;
	isPending: boolean;
	error?: string | null;
	onConfirm: (plan: PayablePlan) => void;
	onUpgrade: (plan: PayablePlan) => void;
	onCancel: () => void;
}

function PlanConfirmDialog({
	plan,
	cadence,
	trialEndsAt,
	centerTimezone,
	isPending,
	error,
	onConfirm,
	onUpgrade,
	onCancel,
}: PlanConfirmDialogProps) {
	const { data: trialUsage } = useTrialFeatureUsage();
	const usedFeatures = trialUsage?.usedFeatures ?? [];
	const config = SUBSCRIPTION_PLAN_CONFIG[plan];
	const price = getPromotionalPlanPrice(plan, cadence);
	const promotion = getSubscriptionPromotionForCadence(cadence);
	const planFeatures = PLAN_ENTITLEMENTS[plan].features;
	const missingFeatures = usedFeatures.filter((f) => !planFeatures.includes(f));
	const recommendedPlan = missingFeatures.length > 0 ? minPlanCovering(usedFeatures) : null;
	const hasGap = missingFeatures.length > 0 && recommendedPlan !== plan;

	const formattedTrialEnd = trialEndsAt
		? new Intl.DateTimeFormat("en-US", {
				// Show the loss-of-access date in the center's timezone so it matches
				// the "Trial ends" value on the billing card. Falls back to UTC when no
				// center timezone is available (keeps the day stable across browsers).
				timeZone: centerTimezone ?? "UTC",
				month: "long",
				day: "numeric",
				year: "numeric",
			}).format(new Date(trialEndsAt))
		: null;

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Confirm {config.label} plan</DialogTitle>
					<DialogDescription>
						{cadence === "annual"
							? `${price.discountedAnnualTotalLabel} paid upfront annually`
							: `${price.discountedPriceLabel} paid monthly`}
					</DialogDescription>
				</DialogHeader>

				<p className="rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
					{promotion.urgencyLabel}: {promotion.code} gives {promotion.label}.
					<span className="block text-primary/80">{price.renewalPriceLabel}.</span>
				</p>

				{hasGap ? (
					<div className="rounded-md border border-warning/20 bg-warning/10 p-3 text-sm text-warning-foreground">
						<div className="flex items-start gap-2">
							<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
							<div className="space-y-1">
								<p className="font-medium">Features you&apos;ve used aren&apos;t included</p>
								<p>
									During your trial you used{" "}
									<strong>{missingFeatures.map((f) => PLAN_FEATURE_LABELS[f]).join(", ")}</strong>.
									{formattedTrialEnd ? ` You'd lose access on ${formattedTrialEnd}.` : ""}
								</p>
							</div>
						</div>
					</div>
				) : null}

				{error ? (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				) : null}

				<DialogFooter className="flex-col gap-2 sm:flex-row-reverse">
					{hasGap && recommendedPlan ? (
						<Button
							type="button"
							variant="default"
							onClick={() => onUpgrade(recommendedPlan)}
							disabled={isPending}
						>
							Upgrade to {SUBSCRIPTION_PLAN_CONFIG[recommendedPlan].label}
						</Button>
					) : null}
					<Button
						type="button"
						variant={hasGap ? "outline" : "default"}
						onClick={() => onConfirm(plan)}
						disabled={isPending}
					>
						{isPending ? "Starting checkout..." : `Continue with ${config.label}`}
					</Button>
					<Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
