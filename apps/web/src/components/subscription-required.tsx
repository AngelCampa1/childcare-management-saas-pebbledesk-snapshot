import type { SubscriptionStatus } from "@pebbledesk/shared";
import {
	getSubscriptionPromotionForCadence,
	MONEY_BACK_GUARANTEE_DAYS,
	TRIAL_DAYS,
} from "@pebbledesk/shared/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { useState } from "react";
import { PlanPicker } from "./plan-picker";

const STATUS_COPY: Record<SubscriptionStatus, string> = {
	none: "Your subscription hasn't started yet. Pick a plan to unlock PebbleDesk.",
	trialing: "",
	active: "",
	past_due: "Pick a plan below to restart checkout and restore access for your center.",
	canceled: "Your subscription was canceled. Reactivate to continue using PebbleDesk.",
	unpaid: "Your subscription is unpaid. Restart checkout to reactivate access.",
	incomplete: "Your checkout didn't finish. Start again to activate your subscription.",
	incomplete_expired: "Your previous checkout expired. Pick a plan to try again.",
};

const RECOVERY_STATUS_LABELS: Partial<Record<SubscriptionStatus, string>> = {
	past_due: "Payment needs attention",
	canceled: "Subscription canceled",
	unpaid: "Payment needs attention",
	incomplete: "Checkout incomplete",
	incomplete_expired: "Checkout expired",
};

interface SubscriptionRequiredProps {
	userRole: "owner" | "director" | "staff";
	subscriptionStatus: SubscriptionStatus;
}

export function SubscriptionRequired({ userRole, subscriptionStatus }: SubscriptionRequiredProps) {
	const [promoCode, setPromoCode] = useState("");
	const monthlyPromotion = getSubscriptionPromotionForCadence("monthly");
	const annualPromotion = getSubscriptionPromotionForCadence("annual");

	const statusCopy = STATUS_COPY[subscriptionStatus];
	const recoveryStatus = RECOVERY_STATUS_LABELS[subscriptionStatus];
	const isRecoveryState = Boolean(recoveryStatus);

	if (userRole !== "owner") {
		return (
			<div className="flex min-h-[60vh] items-center justify-center p-6">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Billing setup required</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-sm text-muted-foreground">
						<p>Ask your owner to complete billing setup to unlock PebbleDesk for your team.</p>
						{statusCopy ? <p>{statusCopy}</p> : null}
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex min-h-[80vh] items-center justify-center p-6">
			<div className="w-full max-w-4xl space-y-6">
				<div className="text-center">
					{recoveryStatus ? (
						<p className="mb-3 inline-block rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
							{recoveryStatus}
						</p>
					) : null}
					<h1 className="text-2xl font-bold text-foreground">
						{isRecoveryState ? "Restore PebbleDesk access" : "Choose your PebbleDesk plan"}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Start your {TRIAL_DAYS}-day free trial. No credit card required, cancel anytime.
					</p>
					<p className="mt-2 text-sm font-medium text-foreground">
						Limited offer: {monthlyPromotion.code} for monthly. {annualPromotion.code} for yearly.
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{MONEY_BACK_GUARANTEE_DAYS}-day money-back guarantee after your first paid charge.
					</p>
					{statusCopy ? (
						<p className="mt-3 inline-block rounded-md bg-muted px-3 py-2 text-sm text-foreground">
							{statusCopy}
						</p>
					) : null}
				</div>

				<PlanPicker promoCode={promoCode} />

				<Card>
					<CardHeader>
						<CardTitle>Have a promo code?</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<Label htmlFor="promo-code">Promo code</Label>
						<Input
							id="promo-code"
							value={promoCode}
							onChange={(event) => setPromoCode(event.target.value)}
							placeholder={`${monthlyPromotion.code} or ${annualPromotion.code}`}
							autoComplete="off"
						/>
						<p className="text-xs text-muted-foreground">
							Applies automatically at checkout when you pick a plan above.
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
