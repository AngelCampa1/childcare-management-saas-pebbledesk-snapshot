import type { SubsidyCase, SubsidyCaseStatus, SubsidyClaim } from "@pebbledesk/shared";
import { formatCurrency, SUBSIDY_STATUS_TRANSITIONS } from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, Info, Pencil, Plus, Send, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";
import { ConfirmDestructiveDialog } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { GuidancePanel } from "../../../components/guidance";
import { HelpTip, PageHelpPanel } from "../../../components/help-tip";
import { StatusBadge } from "../../../components/status-badge";
import { SubsidyCaseDialog } from "../../../components/subsidy/subsidy-case-dialog";
import { SubsidyClaimDialog } from "../../../components/subsidy/subsidy-claim-dialog";
import { subsidyProgramLabel } from "../../../components/subsidy-summary-card";
import {
	useDeleteSubsidyClaim,
	useSubmitSubsidyClaim,
	useSubsidyCases,
	useSubsidyClaims,
	useUpdateSubsidyCase,
	useUpdateSubsidyClaim,
} from "../../../hooks/use-finance";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { formatDate, useCenterTimezone } from "../../../lib/format-date";
import { usePlanCheck } from "../../../lib/plan-gate";
import { requireDirectorOrOwner } from "../../../lib/role-guards";
import { toast } from "../../../lib/toast";

export const Route = createFileRoute("/_auth/subsidies/")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: SubsidiesPage,
});

const DESTRUCTIVE_STATUSES: SubsidyCaseStatus[] = ["expired", "terminated"];

function isDestructiveStatus(status: SubsidyCaseStatus): boolean {
	return DESTRUCTIVE_STATUSES.includes(status);
}

const STATUS_LABELS: Record<SubsidyCaseStatus, string> = {
	active: "Active",
	pending: "Pending",
	expired: "Expired",
	terminated: "Terminated",
};

export function SubsidiesPage() {
	const { allowed: hasCenterPlan } = usePlanCheck({ features: ["subsidies"] });
	const {
		data: subsidyCases,
		isLoading: subsidyCasesLoading,
		isError: subsidyCasesError,
		refetch: refetchSubsidyCases,
	} = useSubsidyCases(undefined, { enabled: hasCenterPlan });
	const { data: subsidyClaims, isLoading: subsidyClaimsLoading } = useSubsidyClaims(undefined, {
		enabled: hasCenterPlan,
	});
	const updateSubsidyCase = useUpdateSubsidyCase();
	const submitSubsidyClaim = useSubmitSubsidyClaim();
	const deleteSubsidyClaim = useDeleteSubsidyClaim();
	const updateSubsidyClaim = useUpdateSubsidyClaim();
	const centerTimezone = useCenterTimezone();
	const formatShortDate = (value: string) => formatDate(value, { centerTimezone });

	const [newCaseOpen, setNewCaseOpen] = useState(false);
	const [claimCaseId, setClaimCaseId] = useState<string | null>(null);
	const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
	const [editingCase, setEditingCase] = useState<SubsidyCase | null>(null);
	const [updatingClaim, setUpdatingClaim] = useState<SubsidyClaim | null>(null);

	if (!hasCenterPlan) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Subsidies</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Track active subsidy cases and recent claim activity.
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>Upgrade required</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Subsidy tracking is available on Center plans. Upgrade to unlock subsidy case
							management, claim filing, and audit-ready reimbursement records.
						</p>
						<Button asChild className="mt-4" size="sm">
							<Link to="/billing">Upgrade plan</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (subsidyCasesLoading || subsidyClaimsLoading) {
		return <SubsidiesPageSkeleton />;
	}

	if (subsidyCasesError) {
		return (
			<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p className="text-sm text-destructive">Failed to load subsidies.</p>
				<button
					type="button"
					onClick={() => void refetchSubsidyCases()}
					className="mt-3 text-sm font-medium text-primary hover:underline"
				>
					Try again
				</button>
			</div>
		);
	}

	const cases = subsidyCases ?? [];
	const claims = subsidyClaims ?? [];
	const activeCases = cases.filter((subsidyCase) => subsidyCase.status === "active").length;
	const submittedClaims = claims.filter((claim) => claim.status === "submitted").length;
	const paidClaims = claims.filter((claim) => claim.status === "paid").length;
	const caseById = new Map(cases.map((subsidyCase) => [subsidyCase.id, subsidyCase]));
	const draftClaims = claims
		.filter((claim) => claim.status === "draft")
		.sort(
			(left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
		);
	const draftReviewCount = draftClaims.length;
	const estimatedReimbursement = draftClaims.reduce(
		(total, claim) => total + claim.amountClaimed,
		0,
	);

	async function handleStatusTransition(subsidyCase: SubsidyCase, newStatus: SubsidyCaseStatus) {
		try {
			await updateSubsidyCase.mutateAsync({ id: subsidyCase.id, input: { status: newStatus } });
		} catch (e) {
			toast.error(extractErrorMessage(e));
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Subsidies</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Track active subsidy cases and recent claim activity.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline">
						<Link to="/children">Review subsidy roster</Link>
					</Button>
					<Button onClick={() => setNewCaseOpen(true)}>
						<Plus className="mr-1 h-4 w-4" />
						New case
					</Button>
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<MetricCard label="Active cases" value={String(activeCases)} />
				<MetricCard
					label="Drafts to review"
					value={String(draftReviewCount)}
					attention={draftReviewCount > 0}
				/>
				<MetricCard
					label="Estimated reimbursement"
					value={formatCurrency(estimatedReimbursement)}
					attention={draftReviewCount > 0}
				/>
				<MetricCard label="Submitted claims" value={String(submittedClaims)} />
				<MetricCard label="Paid claims" value={String(paidClaims)} />
			</div>

			{hasCenterPlan ? (
				<div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
					<p className="text-sm text-primary">
						Claims are auto-drafted each Monday from attendance records. Review and submit when
						ready.
					</p>
				</div>
			) : (
				<div className="panel-warning flex items-start gap-3 rounded-lg border p-4">
					<Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
					<div className="space-y-2">
						<p className="text-sm font-semibold text-warning-foreground">
							Automated Reconciliation is a Center plan feature.
						</p>
						<p className="text-sm text-warning">
							PebbleDesk automatically drafts subsidy claims every Monday based on your attendance
							records. Upgrade to the Center plan to enable it.
						</p>
						<Button asChild size="sm" className="mt-1">
							<Link to="/billing">Upgrade to Center plan</Link>
						</Button>
					</div>
				</div>
			)}

			{draftClaims.length > 0 ? (
				<section
					aria-label="Draft claims needing review"
					className="rounded-lg border border-warning/20 bg-warning/10 p-4"
				>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm font-semibold text-warning-foreground">
								{draftClaims.length} draft claim{draftClaims.length === 1 ? "" : "s"} needs review
							</p>
							<p className="mt-1 text-sm text-warning">
								Check attendance totals before submitting agency reimbursement.
							</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setClaimCaseId(draftClaims[0].subsidyCaseId)}
						>
							Review next draft
						</Button>
					</div>
					<div className="mt-3 flex flex-wrap gap-2">
						{draftClaims.slice(0, 3).map((claim) => {
							const subsidyCase = caseById.get(claim.subsidyCaseId);
							return (
								<Badge
									key={claim.id}
									variant="secondary"
									className="bg-background text-warning-foreground"
								>
									{subsidyCase?.caseNumber ?? "Draft claim"} / {formatCurrency(claim.amountClaimed)}
								</Badge>
							);
						})}
					</div>
				</section>
			) : null}

			<GuidancePanel
				guideId="billing-subsidy-flow"
				userRole="director"
				title="Need help with subsidies?"
			/>
			<PageHelpPanel route="/subsidies" />

			<Card>
				<CardHeader className="flex-row items-center justify-between gap-4">
					<CardTitle className="flex items-center gap-1.5">
						Subsidy cases
						<HelpTip label="Help: subsidy cases">
							A case is the child's ongoing agency eligibility record. Claims are the money
							requests.
						</HelpTip>
					</CardTitle>
					<Badge variant="secondary" className="bg-warning/10 text-warning-foreground">
						<ClipboardList className="mr-1 h-3.5 w-3.5" />
						{cases.length} total
					</Badge>
				</CardHeader>
				<CardContent className="space-y-3">
					{cases.length === 0 ? (
						<EmptyState
							tone="finance"
							icon={<Wallet className="h-6 w-6" aria-hidden="true" />}
							title="No subsidy cases yet"
							description="Start your first subsidy case so claims, balances, and audit history live in one place. Begin by reviewing children who may qualify."
							action={
								<div className="mt-4 flex flex-wrap justify-center gap-2">
									<Button asChild variant="outline">
										<Link to="/children">Review subsidy roster</Link>
									</Button>
									<Button onClick={() => setNewCaseOpen(true)}>
										<Plus className="mr-1 h-4 w-4" />
										New case
									</Button>
								</div>
							}
						/>
					) : (
						cases.map((subsidyCase) => {
							const latestClaim = claims
								.filter((claim) => claim.subsidyCaseId === subsidyCase.id)
								.sort(
									(left, right) =>
										new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
								)[0];
							const isSelected = selectedCaseId === subsidyCase.id;

							return (
								<div
									key={subsidyCase.id}
									className={`rounded-lg border bg-muted p-4 transition-colors hover:border-primary/40 ${
										isSelected ? "border-primary" : "border-border"
									}`}
								>
									<button
										type="button"
										aria-pressed={isSelected}
										onClick={() =>
											setSelectedCaseId((current) =>
												current === subsidyCase.id ? null : subsidyCase.id,
											)
										}
										className="w-full text-left"
									>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div className="space-y-1">
												<p className="text-sm font-medium text-foreground">
													{subsidyCase.caseNumber}
												</p>
												<p className="text-sm text-muted-foreground">{subsidyCase.agencyName}</p>
												<p className="text-xs text-muted-foreground">
													{subsidyProgramLabel(subsidyCase.program)} / Effective{" "}
													{formatShortDate(subsidyCase.effectiveDate)}
												</p>
											</div>
											<StatusBadge status={subsidyCase.status} />
										</div>
										{latestClaim ? (
											<div className="mt-3 space-y-1">
												<p className="text-sm text-muted-foreground">
													Latest claim: {formatShortDate(latestClaim.periodStart)} -{" "}
													{formatShortDate(latestClaim.periodEnd)} /{" "}
													{formatCurrency(latestClaim.amountClaimed)}
												</p>
												{latestClaim.status === "draft" ? (
													<Badge
														variant="secondary"
														className="bg-warning/15 text-warning-foreground hover:bg-warning/20"
													>
														Auto-drafted — review before submitting
													</Badge>
												) : null}
											</div>
										) : (
											<p className="mt-3 text-sm text-muted-foreground">
												No claims filed for this case so far.
											</p>
										)}
									</button>
									{isSelected ? (
										<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
											<div className="flex flex-wrap gap-2">
												{(
													SUBSIDY_STATUS_TRANSITIONS[
														subsidyCase.status
													] as readonly SubsidyCaseStatus[]
												).map((status) =>
													isDestructiveStatus(status) ? (
														<ConfirmDestructiveDialog
															key={status}
															trigger={
																<Button
																	size="sm"
																	variant="outline"
																	className="text-destructive hover:text-destructive"
																>
																	Mark {STATUS_LABELS[status].toLowerCase()}
																</Button>
															}
															title={`Mark case as ${STATUS_LABELS[status].toLowerCase()}?`}
															description={`This will transition the case "${subsidyCase.caseNumber}" to ${STATUS_LABELS[status].toLowerCase()} status. This action is difficult to undo.`}
															confirmLabel={`Mark ${STATUS_LABELS[status].toLowerCase()}`}
															onConfirm={() => handleStatusTransition(subsidyCase, status)}
														/>
													) : (
														<Button
															key={status}
															size="sm"
															variant="outline"
															disabled={updateSubsidyCase.isPending}
															onClick={() => void handleStatusTransition(subsidyCase, status)}
														>
															Mark {STATUS_LABELS[status].toLowerCase()}
														</Button>
													),
												)}
											</div>
											<div className="flex gap-2">
												<Button
													size="sm"
													variant="outline"
													onClick={() => setEditingCase(subsidyCase)}
												>
													<Pencil className="mr-1 h-4 w-4" />
													Edit
												</Button>
												{latestClaim?.status === "draft" ? (
													<>
														<Button
															size="sm"
															disabled={submitSubsidyClaim.isPending}
															onClick={() => submitSubsidyClaim.mutate(latestClaim.id)}
														>
															<Send className="mr-1 h-4 w-4" />
															Submit to agency
														</Button>
														<ConfirmDestructiveDialog
															trigger={
																<Button
																	size="sm"
																	variant="outline"
																	className="text-destructive hover:text-destructive"
																>
																	Delete draft
																</Button>
															}
															title="Delete draft claim?"
															description={`This will permanently delete the draft claim for the period ${formatShortDate(latestClaim.periodStart)} – ${formatShortDate(latestClaim.periodEnd)}. This action cannot be undone.`}
															confirmLabel="Delete draft"
															onConfirm={() => deleteSubsidyClaim.mutate(latestClaim.id)}
														/>
													</>
												) : null}
												{latestClaim && latestClaim.status !== "draft" ? (
													<Button
														size="sm"
														variant="outline"
														onClick={() => setUpdatingClaim(latestClaim)}
													>
														Update claim
													</Button>
												) : null}
												<Button size="sm" onClick={() => setClaimCaseId(subsidyCase.id)}>
													<Plus className="mr-1 h-4 w-4" />
													New claim
												</Button>
											</div>
										</div>
									) : null}
								</div>
							);
						})
					)}
				</CardContent>
			</Card>

			<SubsidyCaseDialog open={newCaseOpen} onOpenChange={setNewCaseOpen} />
			<SubsidyCaseDialog
				key={editingCase?.id ?? "edit-dialog"}
				open={editingCase !== null}
				onOpenChange={(next) => {
					if (!next) setEditingCase(null);
				}}
				initialCase={editingCase ?? undefined}
				lockedChildId={editingCase?.childId}
			/>
			{claimCaseId ? (
				<SubsidyClaimDialog
					open={claimCaseId !== null}
					onOpenChange={(next) => {
						if (!next) setClaimCaseId(null);
					}}
					subsidyCaseId={claimCaseId}
				/>
			) : null}
			{updatingClaim ? (
				<UpdateSubsidyClaimDialog
					claim={updatingClaim}
					onOpenChange={(next) => {
						if (!next) setUpdatingClaim(null);
					}}
					onUpdate={async (id, input) => {
						await updateSubsidyClaim.mutateAsync({ id, input });
						setUpdatingClaim(null);
					}}
					formatShortDate={formatShortDate}
				/>
			) : null}
		</div>
	);
}
function MetricCard({
	label,
	value,
	attention,
}: {
	label: string;
	value: string;
	attention?: boolean;
}) {
	return (
		<Card className={attention ? "border-primary/25 bg-primary/5" : undefined}>
			<CardContent className="p-4">
				<div className="flex items-center gap-1">
					<p className="text-sm text-muted-foreground">{label}</p>
					<HelpTip label={`Help: ${label}`}>
						This count only appears when there is something to review.
					</HelpTip>
				</div>
				<p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
			</CardContent>
		</Card>
	);
}

interface UpdateSubsidyClaimDialogProps {
	claim: SubsidyClaim;
	onOpenChange: (open: boolean) => void;
	onUpdate: (
		id: string,
		input: { amountApproved?: number; amountPaid?: number; paidAt?: string },
	) => Promise<void>;
	formatShortDate: (value: string) => string;
}

function UpdateSubsidyClaimDialog({
	claim,
	onOpenChange,
	onUpdate,
	formatShortDate,
}: UpdateSubsidyClaimDialogProps) {
	const [amountApproved, setAmountApproved] = useState(
		claim.amountApproved != null ? String(claim.amountApproved) : "",
	);
	const [amountPaid, setAmountPaid] = useState(
		claim.amountPaid != null ? String(claim.amountPaid) : "",
	);
	const [paidAt, setPaidAt] = useState(claim.paidAt ? claim.paidAt.slice(0, 10) : "");
	const [formError, setFormError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setFormError(null);
		setIsPending(true);

		const input: { amountApproved?: number; amountPaid?: number; paidAt?: string } = {};
		if (amountApproved !== "") {
			const parsed = Number(amountApproved);
			if (!Number.isFinite(parsed) || parsed < 0) {
				setFormError("Amount approved must be a non-negative number.");
				setIsPending(false);
				return;
			}
			input.amountApproved = parsed;
		}
		if (amountPaid !== "") {
			const parsed = Number(amountPaid);
			if (!Number.isFinite(parsed) || parsed < 0) {
				setFormError("Amount paid must be a non-negative number.");
				setIsPending(false);
				return;
			}
			input.amountPaid = parsed;
		}
		if (paidAt !== "") {
			input.paidAt = `${paidAt}T00:00:00.000Z`;
		}

		try {
			await onUpdate(claim.id, input);
		} catch (error) {
			setFormError(extractErrorMessage(error, "Could not update subsidy claim."));
		} finally {
			setIsPending(false);
		}
	}

	const periodLabel = `${formatShortDate(claim.periodStart)} – ${formatShortDate(claim.periodEnd)}`;

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Update claim outcome</DialogTitle>
					<DialogDescription>
						Record the approved and paid amounts for the claim period {periodLabel}.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="update-amount-approved">Amount approved</Label>
							<Input
								id="update-amount-approved"
								type="number"
								min={0}
								step="0.01"
								value={amountApproved}
								onChange={(event) => setAmountApproved(event.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="update-amount-paid">Amount paid</Label>
							<Input
								id="update-amount-paid"
								type="number"
								min={0}
								step="0.01"
								value={amountPaid}
								onChange={(event) => setAmountPaid(event.target.value)}
							/>
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="update-paid-at">Date paid</Label>
						<Input
							id="update-paid-at"
							type="date"
							value={paidAt}
							onChange={(event) => setPaidAt(event.target.value)}
						/>
					</div>
					{formError ? (
						<p role="alert" className="text-sm text-destructive">
							{formError}
						</p>
					) : null}
					<Button type="submit" className="w-full" disabled={isPending}>
						{isPending ? "Saving..." : "Save outcome"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function SubsidiesPageSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-72" />
			</div>
			<div className="grid gap-4 sm:grid-cols-3">
				{["metric-1", "metric-2", "metric-3"].map((key) => (
					<Skeleton key={key} className="h-24 rounded-lg" />
				))}
			</div>
			<Skeleton className="h-72 rounded-lg" />
		</div>
	);
}
