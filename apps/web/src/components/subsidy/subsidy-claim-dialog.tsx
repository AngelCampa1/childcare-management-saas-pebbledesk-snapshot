import type { CreateSubsidyClaimInput } from "@pebbledesk/shared";
import { Button } from "@pebbledesk/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { useState } from "react";
import { useCreateSubsidyClaim } from "../../hooks/use-finance";
import { extractErrorMessage } from "../../lib/extract-error-message";
import { DateInput } from "../date-input";

interface SubsidyClaimDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	subsidyCaseId: string;
}

export function SubsidyClaimDialog({ open, onOpenChange, subsidyCaseId }: SubsidyClaimDialogProps) {
	const createSubsidyClaim = useCreateSubsidyClaim();

	const [periodStart, setPeriodStart] = useState("");
	const [periodEnd, setPeriodEnd] = useState("");
	const [daysAttended, setDaysAttended] = useState("");
	const [hoursAttended, setHoursAttended] = useState("");
	const [amountClaimed, setAmountClaimed] = useState("");
	const [amountApproved, setAmountApproved] = useState("");
	const [amountPaid, setAmountPaid] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	function resetForm() {
		setPeriodStart("");
		setPeriodEnd("");
		setDaysAttended("");
		setHoursAttended("");
		setAmountClaimed("");
		setAmountApproved("");
		setAmountPaid("");
		setFormError(null);
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setFormError(null);

		const days = Number(daysAttended);
		const hours = Number(hoursAttended);
		const claimed = Number(amountClaimed);

		if (
			!Number.isFinite(days) ||
			days <= 0 ||
			!Number.isFinite(hours) ||
			hours <= 0 ||
			!Number.isFinite(claimed) ||
			claimed <= 0
		) {
			setFormError("Please enter valid numbers for all required fields.");
			return;
		}

		// Cross-field rules mirroring subsidyClaimPeriodRefine and
		// addSubsidyClaimStateIssues from the shared schema.
		if (periodStart && periodEnd && periodEnd < periodStart) {
			setFormError("Period end must be on or after the period start date.");
			return;
		}
		const approved =
			amountApproved !== "" && Number.isFinite(Number(amountApproved))
				? Number(amountApproved)
				: undefined;
		const paid =
			amountPaid !== "" && Number.isFinite(Number(amountPaid)) ? Number(amountPaid) : undefined;
		if (approved !== undefined && approved > claimed) {
			setFormError("Amount approved must not exceed amount claimed.");
			return;
		}
		if (paid !== undefined && approved !== undefined && paid > approved) {
			setFormError("Amount paid must not exceed amount approved.");
			return;
		}

		const input: CreateSubsidyClaimInput = {
			subsidyCaseId,
			periodStart,
			periodEnd,
			daysAttended: days,
			hoursAttended: hours,
			amountClaimed: claimed,
			status: "draft",
		};
		if (approved !== undefined) input.amountApproved = approved;
		if (paid !== undefined) input.amountPaid = paid;

		try {
			await createSubsidyClaim.mutateAsync(input);
			onOpenChange(false);
			resetForm();
		} catch (error) {
			setFormError(extractErrorMessage(error, "Could not create subsidy claim."));
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) resetForm();
			}}
		>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>New subsidy claim</DialogTitle>
					<DialogDescription>
						Record a claim period against this subsidy case so audit history stays aligned with
						agency reimbursements.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="claim-period-start">Period start</Label>
							<DateInput
								id="claim-period-start"
								required
								value={periodStart}
								onChange={(event) => setPeriodStart(event.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="claim-period-end">Period end</Label>
							<DateInput
								id="claim-period-end"
								required
								value={periodEnd}
								onChange={(event) => setPeriodEnd(event.target.value)}
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<div className="flex items-center gap-0.5">
								<Label htmlFor="claim-days">Days attended</Label>
								<span aria-hidden="true" className="text-destructive text-sm leading-none">
									*
								</span>
							</div>
							<Input
								id="claim-days"
								type="number"
								min={0}
								step="1"
								required
								aria-required="true"
								value={daysAttended}
								onChange={(event) => setDaysAttended(event.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<div className="flex items-center gap-0.5">
								<Label htmlFor="claim-hours">Hours attended</Label>
								<span aria-hidden="true" className="text-destructive text-sm leading-none">
									*
								</span>
							</div>
							<Input
								id="claim-hours"
								type="number"
								min={0}
								step="0.25"
								required
								aria-required="true"
								value={hoursAttended}
								onChange={(event) => setHoursAttended(event.target.value)}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center gap-0.5">
							<Label htmlFor="claim-amount-claimed">Amount claimed</Label>
							<span aria-hidden="true" className="text-destructive text-sm leading-none">
								*
							</span>
						</div>
						<Input
							id="claim-amount-claimed"
							type="number"
							min={0}
							step="0.01"
							required
							aria-required="true"
							value={amountClaimed}
							onChange={(event) => setAmountClaimed(event.target.value)}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="claim-amount-approved">Amount approved</Label>
							<Input
								id="claim-amount-approved"
								type="number"
								min={0}
								step="0.01"
								value={amountApproved}
								onChange={(event) => setAmountApproved(event.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="claim-amount-paid">Amount paid</Label>
							<Input
								id="claim-amount-paid"
								type="number"
								min={0}
								step="0.01"
								value={amountPaid}
								onChange={(event) => setAmountPaid(event.target.value)}
							/>
						</div>
					</div>

					{formError ? (
						<p role="alert" className="text-sm text-destructive">
							{formError}
						</p>
					) : null}

					<Button type="submit" className="w-full" disabled={createSubsidyClaim.isPending}>
						{createSubsidyClaim.isPending ? "Saving..." : "Create claim"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
