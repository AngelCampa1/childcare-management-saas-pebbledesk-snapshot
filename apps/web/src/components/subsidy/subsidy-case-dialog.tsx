import type { CreateSubsidyCaseInput, SubsidyCase, SubsidyProgram } from "@pebbledesk/shared";
import { SUBSIDY_PROGRAMS } from "@pebbledesk/shared/constants";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@pebbledesk/ui/components/select";
import { useState } from "react";
import { useChildren } from "../../hooks/use-children";
import { useCreateSubsidyCase, useUpdateSubsidyCase } from "../../hooks/use-finance";
import { DateInput } from "../date-input";

interface SubsidyCaseDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	lockedChildId?: string;
	initialCase?: SubsidyCase;
}

function formatProgramLabel(program: SubsidyProgram): string {
	return program.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function SubsidyCaseDialog({
	open,
	onOpenChange,
	lockedChildId,
	initialCase,
}: SubsidyCaseDialogProps) {
	const isEditMode = initialCase !== undefined;

	const { data: childrenList } = useChildren();
	const createSubsidyCase = useCreateSubsidyCase();
	const updateSubsidyCase = useUpdateSubsidyCase();

	const [childId, setChildId] = useState(lockedChildId ?? "");
	const [program, setProgram] = useState<SubsidyProgram | "">(initialCase?.program ?? "");
	const [caseNumber, setCaseNumber] = useState(initialCase?.caseNumber ?? "");
	const [agencyName, setAgencyName] = useState(initialCase?.agencyName ?? "");
	const [effectiveDate, setEffectiveDate] = useState(initialCase?.effectiveDate ?? "");
	const [expirationDate, setExpirationDate] = useState(initialCase?.expirationDate ?? "");
	const [rateDaily, setRateDaily] = useState(
		initialCase?.rateDaily !== undefined ? String(initialCase.rateDaily) : "",
	);
	const [rateWeekly, setRateWeekly] = useState(
		initialCase?.rateWeekly !== undefined ? String(initialCase.rateWeekly) : "",
	);
	const [authorizedHoursWeekly, setAuthorizedHoursWeekly] = useState(
		initialCase?.authorizedHoursWeekly !== undefined
			? String(initialCase.authorizedHoursWeekly)
			: "",
	);
	const [formError, setFormError] = useState<string | null>(null);

	const activeChildId = lockedChildId ?? childId;
	const isPending = isEditMode ? updateSubsidyCase.isPending : createSubsidyCase.isPending;

	function resetForm() {
		setChildId(lockedChildId ?? "");
		setProgram(initialCase?.program ?? "");
		setCaseNumber(initialCase?.caseNumber ?? "");
		setAgencyName(initialCase?.agencyName ?? "");
		setEffectiveDate(initialCase?.effectiveDate ?? "");
		setExpirationDate(initialCase?.expirationDate ?? "");
		setRateDaily(initialCase?.rateDaily !== undefined ? String(initialCase.rateDaily) : "");
		setRateWeekly(initialCase?.rateWeekly !== undefined ? String(initialCase.rateWeekly) : "");
		setAuthorizedHoursWeekly(
			initialCase?.authorizedHoursWeekly !== undefined
				? String(initialCase.authorizedHoursWeekly)
				: "",
		);
		setFormError(null);
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setFormError(null);

		if (rateDaily !== "" && !Number.isFinite(Number(rateDaily))) {
			setFormError("Please enter a valid number for daily rate.");
			return;
		}
		if (rateWeekly !== "" && !Number.isFinite(Number(rateWeekly))) {
			setFormError("Please enter a valid number for weekly rate.");
			return;
		}
		if (authorizedHoursWeekly !== "" && !Number.isFinite(Number(authorizedHoursWeekly))) {
			setFormError("Please enter a valid number for authorized hours per week.");
			return;
		}

		// Cross-field rules mirroring the shared schema's subsidyCaseDateRefine
		// and the nonnegative() constraints on rate fields.
		if (expirationDate && effectiveDate && expirationDate < effectiveDate) {
			setFormError("Expiration date must be on or after the effective date.");
			return;
		}
		if (rateDaily !== "" && Number.isFinite(Number(rateDaily)) && Number(rateDaily) < 0) {
			setFormError("Rate fields must be zero or greater.");
			return;
		}
		if (rateWeekly !== "" && Number.isFinite(Number(rateWeekly)) && Number(rateWeekly) < 0) {
			setFormError("Rate fields must be zero or greater.");
			return;
		}
		if (
			authorizedHoursWeekly !== "" &&
			Number.isFinite(Number(authorizedHoursWeekly)) &&
			Number(authorizedHoursWeekly) < 0
		) {
			setFormError("Rate fields must be zero or greater.");
			return;
		}

		if (!activeChildId || !program) return;

		try {
			if (isEditMode) {
				const updateInput: Parameters<typeof updateSubsidyCase.mutateAsync>[0]["input"] = {
					program,
					caseNumber: caseNumber.trim(),
					agencyName: agencyName.trim(),
					effectiveDate,
				};
				if (expirationDate) updateInput.expirationDate = expirationDate;
				if (rateDaily !== "" && Number.isFinite(Number(rateDaily)))
					updateInput.rateDaily = Number(rateDaily);
				if (rateWeekly !== "" && Number.isFinite(Number(rateWeekly)))
					updateInput.rateWeekly = Number(rateWeekly);
				if (authorizedHoursWeekly !== "" && Number.isFinite(Number(authorizedHoursWeekly)))
					updateInput.authorizedHoursWeekly = Number(authorizedHoursWeekly);

				await updateSubsidyCase.mutateAsync({ id: initialCase.id, input: updateInput });
			} else {
				const input: CreateSubsidyCaseInput = {
					childId: activeChildId,
					program,
					caseNumber: caseNumber.trim(),
					agencyName: agencyName.trim(),
					effectiveDate,
					status: "active",
				};
				if (expirationDate) input.expirationDate = expirationDate;
				if (rateDaily !== "" && Number.isFinite(Number(rateDaily)))
					input.rateDaily = Number(rateDaily);
				if (rateWeekly !== "" && Number.isFinite(Number(rateWeekly)))
					input.rateWeekly = Number(rateWeekly);
				if (authorizedHoursWeekly !== "" && Number.isFinite(Number(authorizedHoursWeekly)))
					input.authorizedHoursWeekly = Number(authorizedHoursWeekly);

				await createSubsidyCase.mutateAsync(input);
			}
			onOpenChange(false);
			resetForm();
		} catch (error) {
			setFormError(
				error instanceof Error
					? error.message
					: isEditMode
						? "Could not update subsidy case."
						: "Could not create subsidy case.",
			);
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
					<DialogTitle>{isEditMode ? "Edit subsidy case" : "New subsidy case"}</DialogTitle>
					<DialogDescription>
						{isEditMode
							? "Update the details for this subsidy case."
							: "Track a new subsidy authorization so claims and payments stay tied to the right child."}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					{!lockedChildId && !isEditMode && (
						<div className="space-y-1.5">
							<Label htmlFor="case-child">Child</Label>
							<Select value={childId} onValueChange={setChildId}>
								<SelectTrigger id="case-child">
									<SelectValue placeholder="Select a child" />
								</SelectTrigger>
								<SelectContent>
									{(childrenList ?? []).map((child) => (
										<SelectItem key={child.id} value={child.id}>
											{child.firstName} {child.lastName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="space-y-1.5">
						<Label htmlFor="case-program">Program</Label>
						<Select value={program} onValueChange={(value) => setProgram(value as SubsidyProgram)}>
							<SelectTrigger id="case-program">
								<SelectValue placeholder="Select a program" />
							</SelectTrigger>
							<SelectContent>
								{SUBSIDY_PROGRAMS.map((programOption) => (
									<SelectItem key={programOption} value={programOption}>
										{formatProgramLabel(programOption)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="case-number">Case number</Label>
						<Input
							id="case-number"
							required
							value={caseNumber}
							onChange={(event) => setCaseNumber(event.target.value)}
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="case-agency">Agency name</Label>
						<Input
							id="case-agency"
							required
							value={agencyName}
							onChange={(event) => setAgencyName(event.target.value)}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="case-effective">Effective date</Label>
							<DateInput
								id="case-effective"
								required
								value={effectiveDate}
								onChange={(event) => setEffectiveDate(event.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="case-expiration">Expiration date</Label>
							<DateInput
								id="case-expiration"
								value={expirationDate}
								onChange={(event) => setExpirationDate(event.target.value)}
							/>
						</div>
					</div>

					<fieldset className="space-y-3 rounded-md border border-border p-3">
						<legend className="px-1 text-sm font-medium">Rates (optional)</legend>
						<div className="grid grid-cols-3 gap-2">
							<div className="space-y-1.5">
								<Label htmlFor="case-rate-daily">Daily rate</Label>
								<Input
									id="case-rate-daily"
									type="number"
									min={0}
									step="0.01"
									value={rateDaily}
									onChange={(event) => setRateDaily(event.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="case-rate-weekly">Weekly rate</Label>
								<Input
									id="case-rate-weekly"
									type="number"
									min={0}
									step="0.01"
									value={rateWeekly}
									onChange={(event) => setRateWeekly(event.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="case-hours-weekly">Hours / week</Label>
								<Input
									id="case-hours-weekly"
									type="number"
									min={0}
									step="0.25"
									value={authorizedHoursWeekly}
									onChange={(event) => setAuthorizedHoursWeekly(event.target.value)}
								/>
							</div>
						</div>
					</fieldset>

					{formError ? (
						<p role="alert" className="text-sm text-destructive">
							{formError}
						</p>
					) : null}

					<Button
						type="submit"
						className="w-full"
						disabled={isPending || (!isEditMode && (!activeChildId || !program))}
					>
						{isPending ? "Saving..." : isEditMode ? "Save changes" : "Create case"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
