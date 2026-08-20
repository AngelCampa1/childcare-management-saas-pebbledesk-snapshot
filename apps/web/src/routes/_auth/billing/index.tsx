import type { Invoice, PaymentMethod, SubscriptionStatus } from "@pebbledesk/shared";
import { formatCurrency } from "@pebbledesk/shared";
import type { StripeAccountStatus } from "@pebbledesk/shared/constants";
import { SUBSCRIPTION_PLAN_CONFIG } from "@pebbledesk/shared/constants";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Checkbox } from "@pebbledesk/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle2,
	CreditCard,
	Pencil,
	Plus,
	Receipt,
	Send,
	Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DateInput } from "../../../components/date-input";
import { ConfirmDestructiveDialog } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { GuidancePanel } from "../../../components/guidance";
import { FieldHelp, HelpTip, PageHelpPanel } from "../../../components/help-tip";
import { PlanPicker } from "../../../components/plan-picker";
import { StatusBadge } from "../../../components/status-badge";
import { useAuthSession } from "../../../hooks/use-auth-session";
import {
	useCreateInvoice,
	useDeleteInvoice,
	useInvoices,
	useInvoiceTemplateDetail,
	useInvoiceTemplates,
	useRecordPayment,
	useSendInvoice,
	useUpdateInvoice,
} from "../../../hooks/use-finance";
import { useGuardians } from "../../../hooks/use-guardians";
import {
	useStartStripeConnectOnboarding,
	useStripeConnectStatus,
} from "../../../hooks/use-stripe-connect";
import { useOpenBillingPortal } from "../../../hooks/use-subscription";
import { formatLocalDate, formatLocalDatetime } from "../../../lib/dates";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { formatDate } from "../../../lib/format-date";
import { getRequiredAppInlineHelpById } from "../../../lib/guidance-content";
import { isUuid } from "../../../lib/is-uuid";
import { requireDirectorOrOwner } from "../../../lib/role-guards";
import { toast } from "../../../lib/toast";
import { generateId } from "../../../lib/uuid";

export const Route = createFileRoute("/_auth/billing/")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: BillingPage,
});

const SUPPORT_MAILTO_HREF = `mailto:${PUBLIC_BRAND_KNOWLEDGE.supportEmail}`;
const BLANK_TEMPLATE_VALUE = "__blank__";
const billingTemplateHelp = getRequiredAppInlineHelpById("billing.template");
const billingGuardianHelp = getRequiredAppInlineHelpById("billing.guardian");

interface LineItem {
	id: string;
	description: string;
	quantity: string;
	unitPrice: string;
}

interface BulkFailureMessage {
	invoiceId: string;
	message: string;
}

export function BillingPage() {
	const navigate = useNavigate();
	const { data: session } = useAuthSession();
	const centerTimezone = session?.center.timezone ?? "UTC";
	const { data: invoices, isLoading, isError } = useInvoices();
	const stripeConnectStatus = useStripeConnectStatus();
	const { data: guardians } = useGuardians();
	const { data: invoiceTemplates } = useInvoiceTemplates();
	const createInvoice = useCreateInvoice();
	const updateInvoice = useUpdateInvoice();
	const deleteInvoice = useDeleteInvoice();
	const bulkSendInvoice = useSendInvoice();
	const bulkRecordPayment = useRecordPayment();

	const [showCheckoutBanner, setShowCheckoutBanner] = useState(false);
	const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
	const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
	const [createError, setCreateError] = useState<string | null>(null);
	const [templateIdError, setTemplateIdError] = useState<string | null>(null);
	const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
	const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false);
	const [bulkPaymentMethod, setBulkPaymentMethod] = useState<PaymentMethod | "">("");
	const [bulkPaidAt, setBulkPaidAt] = useState(() => formatLocalDatetime(centerTimezone));
	const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);
	const [bulkFailureMessages, setBulkFailureMessages] = useState<BulkFailureMessage[]>([]);
	const [isBulkSending, setIsBulkSending] = useState(false);
	const [isBulkPaying, setIsBulkPaying] = useState(false);
	const openNewInvoiceDialog = () => setNewInvoiceOpen(true);

	useEffect(() => {
		if (sessionStorage.getItem("pebbledesk.checkoutJustCompleted")) {
			sessionStorage.removeItem("pebbledesk.checkoutJustCompleted");
			setShowCheckoutBanner(true);
			// Also clear any lingering ?checkout=success URL param that wasn't
			// removed by the parent route (e.g. if the user navigated directly).
			const url = new URL(window.location.href);
			if (url.searchParams.has("checkout")) {
				void navigate({ to: "/billing", replace: true });
			}
		}
	}, [navigate]);

	// Clear the banner on unmount so stale state isn't carried if the component
	// is remounted (e.g. when navigating away and back).
	useEffect(() => {
		return () => {
			setShowCheckoutBanner(false);
		};
	}, []);
	const [guardianId, setGuardianId] = useState("");
	const [periodStart, setPeriodStart] = useState("");
	const [periodEnd, setPeriodEnd] = useState("");
	const [dueDate, setDueDate] = useState("");
	const [templateId, setTemplateId] = useState("");
	const [lineItems, setLineItems] = useState<LineItem[]>([
		{ id: generateId(), description: "", quantity: "1", unitPrice: "0" },
	]);
	const { data: templateDetail } = useInvoiceTemplateDetail(templateId || undefined);
	const lastAppliedTemplateRef = useRef<string>("");
	const invoiceList = invoices ?? [];
	const selectableInvoiceIds = useMemo(
		() =>
			new Set(
				invoiceList.filter((invoice) => isSelectableInvoice(invoice)).map((invoice) => invoice.id),
			),
		[invoiceList],
	);

	useEffect(() => {
		if (!templateId) return;
		if (!templateDetail) return;
		if (templateDetail.invoiceTemplate.id !== templateId) return;
		// Only apply a template once per selection. Subsequent refetches (window
		// focus, invalidation) must not clobber the user's in-progress edits.
		if (lastAppliedTemplateRef.current === templateId) return;
		const items = templateDetail.lineItems;
		setLineItems(
			items.length > 0
				? items.map((item) => ({
						id: generateId(),
						description: item.description,
						quantity: String(item.quantity),
						unitPrice: String(item.unitPrice),
					}))
				: [{ id: generateId(), description: "", quantity: "1", unitPrice: "0" }],
		);
		// Anchor the default due date to the center's calendar "today" (not the
		// browser's), then add dueDays via UTC arithmetic so the offset can't drift
		// across a DST boundary.
		const [by, bm, bd] = formatLocalDate(centerTimezone).split("-").map(Number);
		const due = new Date(Date.UTC(by, bm - 1, bd));
		due.setUTCDate(due.getUTCDate() + templateDetail.invoiceTemplate.dueDays);
		const yyyy = due.getUTCFullYear();
		const mm = String(due.getUTCMonth() + 1).padStart(2, "0");
		const dd = String(due.getUTCDate()).padStart(2, "0");
		setDueDate(`${yyyy}-${mm}-${dd}`);
		lastAppliedTemplateRef.current = templateId;
	}, [templateId, templateDetail, centerTimezone]);

	useEffect(() => {
		setSelectedInvoiceIds((previous) => {
			const next = previous.filter((id) => selectableInvoiceIds.has(id));
			return next.length === previous.length ? previous : next;
		});
	}, [selectableInvoiceIds]);

	if (isLoading) {
		return <BillingPageSkeleton />;
	}

	if (isError) {
		return (
			<div role="alert" className="rounded-xl border border-primary/20 bg-card p-6 text-center">
				<p className="font-semibold text-foreground">We couldn't load your invoices</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Your data is safe — this is a temporary display issue. Refresh to try again.
				</p>
				<div className="mt-4 flex justify-center gap-3">
					<Button variant="default" onClick={() => window.location.reload()}>
						Refresh page
					</Button>
					<Button variant="outline" asChild>
						<a href={SUPPORT_MAILTO_HREF}>Contact support</a>
					</Button>
				</div>
			</div>
		);
	}

	const guardianList = guardians ?? [];
	const stripeAccountStatus =
		stripeConnectStatus.data?.stripeAccountStatus ?? ("not_connected" as StripeAccountStatus);
	const familyPaymentsReady = stripeAccountStatus === "connected";
	const guardianNameById = new Map(
		guardianList.map((guardian) => [
			guardian.id,
			`${guardian.firstName} ${guardian.lastName}`.trim(),
		]),
	);
	const actionableInvoices = invoiceList.filter(
		(invoice) =>
			invoice.status !== "draft" && invoice.status !== "paid" && invoice.status !== "void",
	);
	const openInvoices = actionableInvoices.length;
	const overdueInvoices = invoiceList.filter((invoice) => invoice.status === "overdue").length;
	const outstandingBalance = actionableInvoices.reduce(
		(total, invoice) => total + getInvoiceBalance(invoice),
		0,
	);
	const selectedInvoices = selectedInvoiceIds
		.map((id) => invoiceList.find((invoice) => invoice.id === id))
		.filter((invoice): invoice is Invoice => Boolean(invoice));
	const selectedCount = selectedInvoices.length;
	const selectedDraftInvoices = selectedInvoices.filter((invoice) => invoice.status === "draft");
	const selectedPayableInvoices = selectedInvoices.filter((invoice) =>
		isSelectableInvoice(invoice),
	);

	const computedSubtotal = lineItems.reduce((sum, li) => {
		const qty = Number(li.quantity);
		const price = Number(li.unitPrice);
		if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
		return sum + qty * price;
	}, 0);

	const lineItemsValid = lineItems.every((li) => {
		const qty = Number(li.quantity);
		const price = Number(li.unitPrice);
		return (
			li.quantity !== "" &&
			li.unitPrice !== "" &&
			Number.isFinite(qty) &&
			// Quantity must be a positive integer: the API validates it with z.number().int().positive(),
			// so a fractional quantity would otherwise pass the client gate and 400 server-side.
			Number.isInteger(qty) &&
			qty > 0 &&
			Number.isFinite(price) &&
			price >= 0
		);
	});

	function resetNewInvoiceForm() {
		setGuardianId("");
		setPeriodStart("");
		setPeriodEnd("");
		setDueDate("");
		setTemplateId("");
		setLineItems([{ id: generateId(), description: "", quantity: "1", unitPrice: "0" }]);
		setCreateError(null);
		setTemplateIdError(null);
		setEditingInvoice(null);
		lastAppliedTemplateRef.current = "";
	}

	function openEditInvoiceDialog(invoice: Invoice) {
		setEditingInvoice(invoice);
		setGuardianId(invoice.guardianId);
		setPeriodStart(invoice.periodStart);
		setPeriodEnd(invoice.periodEnd);
		setDueDate(invoice.dueDate ?? "");
		setTemplateId("");
		lastAppliedTemplateRef.current = "";
		const invoiceLineItems =
			"lineItems" in invoice && Array.isArray((invoice as { lineItems?: unknown }).lineItems)
				? (
						invoice as {
							lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
						}
					).lineItems
				: [];
		setLineItems(
			invoiceLineItems.length > 0
				? invoiceLineItems.map((li) => ({
						id: generateId(),
						description: li.description,
						quantity: String(li.quantity),
						unitPrice: String(li.unitPrice),
					}))
				: [{ id: generateId(), description: "", quantity: "1", unitPrice: "0" }],
		);
		setCreateError(null);
		setNewInvoiceOpen(true);
	}

	function isEditableStatus(status: string): boolean {
		return status === "draft" || status === "sent" || status === "overdue";
	}

	const editingLocked =
		editingInvoice !== null &&
		(editingInvoice.status === "sent" || editingInvoice.status === "overdue");

	function handleTemplateChange(value: string) {
		const next = value === BLANK_TEMPLATE_VALUE ? "" : value;
		setTemplateId(next);
		lastAppliedTemplateRef.current = "";
		if (!next) {
			setTemplateIdError(null);
			setDueDate("");
			setLineItems([{ id: generateId(), description: "", quantity: "1", unitPrice: "0" }]);
		} else if (!isUuid(next)) {
			setTemplateIdError("Invalid template. Please select a template from the list.");
		} else {
			// Valid UUID — ensure it exists in the loaded templates list
			const validTemplateIds = new Set((invoiceTemplates ?? []).map((t) => t.id));
			if (!validTemplateIds.has(next)) {
				setTemplateIdError("Invalid template. Please select a template from the list.");
			} else {
				setTemplateIdError(null);
			}
		}
	}

	async function handleCreateInvoice(e: React.FormEvent) {
		e.preventDefault();
		if (!lineItemsValid) return;
		// #4: Validate that the selected template ID (when provided) exists in the
		// loaded templates list and is a valid UUID.
		if (templateId) {
			const validTemplateIds = new Set((invoiceTemplates ?? []).map((t) => t.id));
			if (!isUuid(templateId) || !validTemplateIds.has(templateId)) {
				setTemplateIdError("Invalid template. Please select a template from the list.");
				return;
			}
		}
		setCreateError(null);
		const mappedLineItems = lineItems.map((li) => {
			const qty = Number(li.quantity);
			const price = Number(li.unitPrice);
			return {
				description: li.description,
				quantity: qty,
				unitPrice: price,
				amount: qty * price,
			};
		});
		try {
			if (editingInvoice) {
				const isLocked = editingInvoice.status === "sent" || editingInvoice.status === "overdue";
				await updateInvoice.mutateAsync({
					id: editingInvoice.id,
					input: isLocked
						? { dueDate: dueDate || undefined }
						: {
								guardianId,
								periodStart,
								periodEnd,
								dueDate: dueDate || undefined,
								lineItems: mappedLineItems,
								subtotal: computedSubtotal,
								subsidyCredit: 0,
								amountDue: computedSubtotal,
							},
				});
			} else {
				await createInvoice.mutateAsync(
					{
						guardianId,
						periodStart,
						periodEnd,
						dueDate: dueDate || undefined,
						status: "draft",
						lineItems: mappedLineItems,
						subtotal: computedSubtotal,
						subsidyCredit: 0,
						amountDue: computedSubtotal,
					},
					{
						onError: (err) => {
							setCreateError(
								extractErrorMessage(err, "Failed to create invoice. Please try again."),
							);
						},
					},
				);
			}
			toast.success(editingInvoice ? "Invoice updated." : "Invoice created.");
			setNewInvoiceOpen(false);
			resetNewInvoiceForm();
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: editingInvoice
						? "Failed to update invoice. Please try again."
						: "Failed to create invoice. Please try again.",
			);
			setCreateError(
				err instanceof Error
					? err.message
					: editingInvoice
						? "Failed to update invoice. Please try again."
						: "Failed to create invoice. Please try again.",
			);
		}
	}

	function updateLineItem(index: number, field: Exclude<keyof LineItem, "id">, value: string) {
		setLineItems((prev) =>
			prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
		);
	}

	function addLineItem() {
		if (lineItems.length < 10) {
			setLineItems((prev) => [
				...prev,
				{ id: generateId(), description: "", quantity: "1", unitPrice: "0" },
			]);
		}
	}

	function removeLineItem(index: number) {
		setLineItems((prev) => prev.filter((_, i) => i !== index));
	}

	function toggleInvoiceSelection(invoiceId: string, checked: boolean) {
		setBulkSuccessMessage(null);
		setBulkFailureMessages([]);
		setSelectedInvoiceIds((previous) => {
			if (checked) {
				return previous.includes(invoiceId) ? previous : [...previous, invoiceId];
			}
			return previous.filter((id) => id !== invoiceId);
		});
	}

	async function handleBulkSend() {
		if (!familyPaymentsReady || selectedDraftInvoices.length === 0 || isBulkSending) return;
		setIsBulkSending(true);
		setBulkSuccessMessage(null);
		setBulkFailureMessages([]);
		const successfulIds: string[] = [];
		const failures: BulkFailureMessage[] = [];

		try {
			for (const invoice of selectedDraftInvoices) {
				try {
					await bulkSendInvoice.mutateAsync(invoice.id);
					successfulIds.push(invoice.id);
				} catch (err) {
					const message = extractErrorMessage(err, "Could not send invoice.");
					failures.push({
						invoiceId: invoice.id,
						message: `${getInvoiceLabel(invoice, guardianNameById)}: ${message}`,
					});
				}
			}

			if (successfulIds.length > 0) {
				setBulkSuccessMessage(
					successfulIds.length === 1 ? "Sent 1 invoice." : `Sent ${successfulIds.length} invoices.`,
				);
			}
			setBulkFailureMessages(failures);
			setSelectedInvoiceIds((previous) => previous.filter((id) => !successfulIds.includes(id)));
		} finally {
			setIsBulkSending(false);
		}
	}

	function resetBulkPaymentForm() {
		setBulkPaymentMethod("");
		setBulkPaidAt(formatLocalDatetime(centerTimezone));
	}

	async function handleBulkRecordPayment(e: React.FormEvent) {
		e.preventDefault();
		if (!bulkPaymentMethod || selectedPayableInvoices.length === 0 || isBulkPaying) return;
		setIsBulkPaying(true);
		setBulkSuccessMessage(null);
		setBulkFailureMessages([]);
		const successfulIds: string[] = [];
		const failures: BulkFailureMessage[] = [];

		try {
			for (const invoice of selectedPayableInvoices) {
				try {
					await bulkRecordPayment.mutateAsync({
						invoiceId: invoice.id,
						amount: getInvoiceBalance(invoice),
						method: bulkPaymentMethod as PaymentMethod,
						provider: "manual",
						paidAt: localDatetimeToISO(bulkPaidAt, centerTimezone),
					});
					successfulIds.push(invoice.id);
				} catch (err) {
					const message = extractErrorMessage(err, "Could not record payment.");
					failures.push({
						invoiceId: invoice.id,
						message: `${getInvoiceLabel(invoice, guardianNameById)}: ${message}`,
					});
				}
			}

			if (successfulIds.length > 0) {
				setBulkSuccessMessage(
					successfulIds.length === 1
						? "Recorded payment for 1 invoice."
						: `Recorded payments for ${successfulIds.length} invoices.`,
				);
			}
			setBulkFailureMessages(failures);
			setSelectedInvoiceIds((previous) => previous.filter((id) => !successfulIds.includes(id)));
			setBulkPaymentOpen(false);
			if (failures.length === 0) {
				resetBulkPaymentForm();
			}
		} finally {
			setIsBulkPaying(false);
		}
	}

	return (
		<div className="space-y-6">
			{showCheckoutBanner ? (
				<div className="rounded-lg border border-success/20 bg-success/10 p-5">
					<p className="font-semibold text-success">Family billing is now active</p>
					<p className="mt-1 text-sm text-muted-foreground">
						You can now create invoices and share payment links with guardians.
					</p>
					<Button className="mt-3" size="sm" onClick={openNewInvoiceDialog}>
						Create your first invoice →
					</Button>
				</div>
			) : null}

			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Billing</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Review invoices and open the payment link for families who need it.
					</p>
				</div>
				<div className="flex items-center gap-2 self-start sm:self-auto">
					<Button asChild variant="outline" size="sm">
						<Link to="/billing/templates">Manage templates</Link>
					</Button>
					<Button onClick={openNewInvoiceDialog}>
						<Plus className="mr-2 h-4 w-4" />
						Create invoice
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link to={invoiceList.length === 0 ? "/settings" : "/billing/payments"}>
							{invoiceList.length === 0 ? "Open billing setup" : "View payments"}
						</Link>
					</Button>
				</div>
			</div>

			<GuidancePanel
				guideId="billing-subsidy-flow"
				userRole="owner"
				title="Need help with billing?"
			/>
			<PageHelpPanel route="/billing" />

			<section aria-label="PebbleDesk Subscription">
				<div className="rounded-xl border border-border overflow-hidden">
					<div className="bg-muted/40 px-4 py-2 border-b border-border">
						<h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
							PebbleDesk Subscription
						</h2>
					</div>
					<div className="p-4">
						<SubscriptionCard />
					</div>
				</div>
			</section>

			<section aria-label="Family payments setup">
				<FamilyPaymentsSetupCard
					role={session?.membership.role ?? "staff"}
					status={stripeAccountStatus}
					isLoading={stripeConnectStatus.isLoading}
					isError={stripeConnectStatus.isError}
					disabledReason={stripeConnectStatus.data?.stripeAccountDisabledReason ?? null}
				/>
			</section>

			{/* Metrics — always visible, zero is informative */}
			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard
					label="Open invoices"
					value={String(openInvoices)}
					help="Invoices that still need payment or follow-up."
				/>
				<MetricCard
					label="Overdue invoices"
					value={String(overdueInvoices)}
					danger={overdueInvoices > 0}
					help="Invoices past their due date."
				/>
				<MetricCard
					label="Outstanding balance"
					value={formatCurrency(outstandingBalance)}
					danger={outstandingBalance > 0}
					help="Total family balance still expected from open invoices."
				/>
			</div>

			<section aria-label="Family Billing">
				<div className="rounded-xl border border-border overflow-hidden">
					<div className="bg-muted/40 px-4 py-2 border-b border-border">
						<h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
							Family Billing
						</h2>
					</div>
					<div className="p-0">
						<Card className="border-0 rounded-none shadow-none">
							<CardHeader className="flex-row items-center justify-between gap-4">
								<CardTitle>Invoices</CardTitle>
								<div className="flex items-center gap-2">
									<Badge
										variant="secondary"
										className={
											invoiceList.length === 0 ? "bg-muted text-muted-foreground" : undefined
										}
									>
										<Receipt className="mr-1 h-3.5 w-3.5" />
										{invoiceList.length} total
									</Badge>
									<Dialog
										open={newInvoiceOpen}
										onOpenChange={(open) => {
											setNewInvoiceOpen(open);
											if (!open) resetNewInvoiceForm();
										}}
									>
										<DialogContent
											className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
											onOpenAutoFocus={(event) => {
												event.preventDefault();
												document.getElementById("guardian-select")?.focus();
											}}
										>
											<DialogHeader>
												<DialogTitle>{editingInvoice ? "Edit invoice" : "New invoice"}</DialogTitle>
												<DialogDescription>
													{editingInvoice
														? editingLocked
															? "Sent invoices: only due date and notes can be edited."
															: "Update the draft invoice details below."
														: "Create a new invoice for a family. Add line items and set billing dates."}
												</DialogDescription>
											</DialogHeader>
											<form onSubmit={handleCreateInvoice} className="space-y-4">
												{editingLocked ? (
													<p
														className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
														data-testid="locked-fields-notice"
													>
														Sent invoices: only due date and notes can be edited.
													</p>
												) : null}
												<div className="space-y-1.5">
													<FieldHelp
														htmlFor="template-select"
														label={billingTemplateHelp.label}
														help={billingTemplateHelp.text}
													/>
													<Select
														value={templateId || BLANK_TEMPLATE_VALUE}
														onValueChange={editingLocked ? undefined : handleTemplateChange}
														disabled={editingLocked}
													>
														<SelectTrigger id="template-select" disabled={editingLocked}>
															<SelectValue placeholder="Blank invoice" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value={BLANK_TEMPLATE_VALUE}>Blank invoice</SelectItem>
															{(invoiceTemplates ?? []).map((t) => (
																<SelectItem key={t.id} value={t.id}>
																	{t.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>

												<div className="space-y-1.5">
													<FieldHelp
														htmlFor="guardian-select"
														label={billingGuardianHelp.label}
														help={billingGuardianHelp.text}
													/>
													<Select
														value={guardianId}
														onValueChange={editingLocked ? undefined : (v) => setGuardianId(v)}
														disabled={editingLocked}
													>
														<SelectTrigger id="guardian-select" disabled={editingLocked}>
															<SelectValue placeholder="Select a guardian" />
														</SelectTrigger>
														<SelectContent>
															{guardianList.map((g) => (
																<SelectItem key={g.id} value={g.id}>
																	{g.firstName} {g.lastName}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>

												<div className="grid grid-cols-2 gap-3">
													<div className="space-y-1.5">
														<FieldHelp
															htmlFor="period-start"
															label="Period start"
															help="The first day this invoice covers."
														/>
														<DateInput
															id="period-start"
															required={!editingLocked}
															disabled={editingLocked}
															value={periodStart}
															onChange={(e) => setPeriodStart(e.target.value)}
														/>
													</div>
													<div className="space-y-1.5">
														<FieldHelp
															htmlFor="period-end"
															label="Period end"
															help="The last day this invoice covers."
														/>
														<DateInput
															id="period-end"
															required={!editingLocked}
															disabled={editingLocked}
															value={periodEnd}
															onChange={(e) => setPeriodEnd(e.target.value)}
														/>
													</div>
												</div>

												<div className="space-y-1.5">
													<FieldHelp
														htmlFor="due-date"
														label="Due date (optional)"
														help="The day payment should be received from the family."
													/>
													<DateInput
														id="due-date"
														value={dueDate}
														onChange={(e) => setDueDate(e.target.value)}
													/>
												</div>

												<div className="space-y-2">
													<p className="text-sm font-medium">Line items</p>
													<div className="hidden grid-cols-[3fr_1fr_1fr_1fr] gap-2 px-1 sm:grid">
														{["Description", "Qty", "Unit price", "Total"].map((col) => (
															<span
																key={col}
																className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
															>
																{col}
															</span>
														))}
													</div>
													{lineItems.map((item, index) => (
														<div
															key={item.id}
															className="space-y-2 rounded-md border border-border p-3"
														>
															<div className="space-y-1.5">
																<Label
																	className="sm:sr-only"
																	htmlFor={`line-${item.id}-description`}
																>
																	Line item {index + 1} description
																</Label>
																<Input
																	id={`line-${item.id}-description`}
																	placeholder="Description"
																	required={!editingLocked}
																	disabled={editingLocked}
																	value={item.description}
																	onChange={(e) =>
																		updateLineItem(index, "description", e.target.value)
																	}
																/>
															</div>
															<div className="grid gap-2 sm:grid-cols-3">
																<div className="space-y-1.5">
																	<Label
																		className="sm:sr-only"
																		htmlFor={`line-${item.id}-quantity`}
																	>
																		Line item {index + 1} quantity
																	</Label>
																	<Input
																		id={`line-${item.id}-quantity`}
																		type="number"
																		placeholder="Qty"
																		min={1}
																		step={1}
																		required={!editingLocked}
																		disabled={editingLocked}
																		value={item.quantity}
																		onChange={(e) =>
																			updateLineItem(index, "quantity", e.target.value)
																		}
																	/>
																</div>
																<div className="space-y-1.5">
																	<Label
																		className="sm:sr-only"
																		htmlFor={`line-${item.id}-unit-price`}
																	>
																		Line item {index + 1} unit price
																	</Label>
																	<Input
																		id={`line-${item.id}-unit-price`}
																		type="number"
																		placeholder="Unit price"
																		min={0}
																		step="0.01"
																		required={!editingLocked}
																		disabled={editingLocked}
																		value={item.unitPrice}
																		onChange={(e) =>
																			updateLineItem(index, "unitPrice", e.target.value)
																		}
																	/>
																</div>
																<div className="space-y-1.5">
																	<Label className="sm:sr-only" htmlFor={`line-${item.id}-total`}>
																		Line item {index + 1} total
																	</Label>
																	<Input
																		id={`line-${item.id}-total`}
																		readOnly
																		value={formatCurrency(
																			Number(item.quantity) * Number(item.unitPrice),
																		)}
																		tabIndex={-1}
																	/>
																</div>
															</div>
															{lineItems.length > 1 && (
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() => removeLineItem(index)}
																>
																	Remove
																</Button>
															)}
														</div>
													))}
													{lineItems.length < 10 && (
														<Button type="button" variant="outline" size="sm" onClick={addLineItem}>
															Add line item
														</Button>
													)}
												</div>

												<div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
													<span className="text-sm font-medium">Subtotal</span>
													<span className="text-sm font-semibold">
														{formatCurrency(computedSubtotal)}
													</span>
												</div>
												<div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
													<span className="text-sm font-medium">Amount due</span>
													<span className="text-sm font-semibold">
														{formatCurrency(computedSubtotal)}
													</span>
												</div>

												<Button
													type="submit"
													className="w-full"
													disabled={
														(editingInvoice ? updateInvoice.isPending : createInvoice.isPending) ||
														!lineItemsValid ||
														templateIdError !== null ||
														(!editingLocked && !guardianId) ||
														(!editingLocked &&
															periodStart !== "" &&
															periodEnd !== "" &&
															periodEnd < periodStart)
													}
												>
													{editingInvoice ? "Save changes" : "Create invoice"}
												</Button>
												{!editingLocked && !guardianId ? (
													<p role="alert" className="text-sm text-destructive">
														Select a guardian
													</p>
												) : null}
												{!editingLocked &&
												periodStart !== "" &&
												periodEnd !== "" &&
												periodEnd < periodStart ? (
													<p role="alert" className="text-sm text-destructive">
														Period end must be on or after period start
													</p>
												) : null}
												{templateIdError ? (
													<p role="alert" className="text-sm text-destructive">
														{templateIdError}
													</p>
												) : null}
												{createError ? (
													<p role="alert" className="text-sm text-destructive">
														{createError}
													</p>
												) : null}
											</form>
										</DialogContent>
									</Dialog>
								</div>
							</CardHeader>
							<CardContent className="space-y-3">
								{selectedCount > 0 || bulkSuccessMessage || bulkFailureMessages.length > 0 ? (
									<div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
										<div className="space-y-1">
											{selectedCount > 0 ? (
												<p className="text-sm font-semibold text-foreground">
													{selectedCount} selected
												</p>
											) : null}
											{bulkSuccessMessage ? (
												<p className="text-sm text-success">{bulkSuccessMessage}</p>
											) : null}
											{bulkFailureMessages.length > 0 ? (
												<div role="alert" className="text-sm text-destructive">
													{bulkFailureMessages.map((failure) => (
														<p key={failure.invoiceId}>{failure.message}</p>
													))}
												</div>
											) : null}
										</div>
										{selectedCount > 0 ? (
											<div className="flex flex-wrap gap-2">
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={
														isBulkSending ||
														isBulkPaying ||
														!familyPaymentsReady ||
														selectedDraftInvoices.length === 0
													}
													onClick={handleBulkSend}
												>
													<Send className="mr-1 h-4 w-4" />
													Send selected
												</Button>
												<Dialog
													open={bulkPaymentOpen}
													onOpenChange={(open) => {
														setBulkPaymentOpen(open);
														if (!open) resetBulkPaymentForm();
													}}
												>
													<DialogTrigger asChild>
														<Button
															type="button"
															variant="outline"
															size="sm"
															disabled={
																isBulkSending ||
																isBulkPaying ||
																selectedPayableInvoices.length === 0
															}
														>
															Record selected as paid
														</Button>
													</DialogTrigger>
													<DialogContent>
														<DialogHeader>
															<DialogTitle>Record selected invoices as paid</DialogTitle>
															<DialogDescription>
																Use one payment method and date for the selected invoice balances.
															</DialogDescription>
														</DialogHeader>
														<form onSubmit={handleBulkRecordPayment} className="space-y-4">
															<div className="space-y-1.5">
																<Label htmlFor="bulk-payment-method">Payment method</Label>
																<Select
																	value={bulkPaymentMethod}
																	onValueChange={(value) =>
																		setBulkPaymentMethod(value as PaymentMethod | "")
																	}
																>
																	<SelectTrigger id="bulk-payment-method">
																		<SelectValue placeholder="Select payment method" />
																	</SelectTrigger>
																	<SelectContent>
																		<SelectItem value="cash">Cash</SelectItem>
																		<SelectItem value="check">Check</SelectItem>
																		<SelectItem value="credit_card">Credit card</SelectItem>
																		<SelectItem value="ach">ACH</SelectItem>
																		<SelectItem value="other">Other</SelectItem>
																	</SelectContent>
																</Select>
															</div>
															<div className="space-y-1.5">
																<Label htmlFor="bulk-paid-at">Payment date</Label>
																<Input
																	id="bulk-paid-at"
																	type="datetime-local"
																	required
																	value={bulkPaidAt}
																	onChange={(event) => setBulkPaidAt(event.target.value)}
																/>
															</div>
															<Button
																type="submit"
																className="w-full"
																disabled={
																	isBulkPaying ||
																	!bulkPaymentMethod ||
																	selectedPayableInvoices.length === 0
																}
															>
																Confirm bulk payment
															</Button>
														</form>
													</DialogContent>
												</Dialog>
											</div>
										) : null}
									</div>
								) : null}
								{invoiceList.length === 0 ? (
									<EmptyState
										tone="finance"
										icon={<Wallet className="h-6 w-6" aria-hidden="true" />}
										title="No money in motion yet"
										description="We'll show open balances here as soon as you send your first invoice. Start with a draft invoice, then connect payment tools when you're ready."
										action={
											<div className="mt-4 flex flex-wrap justify-center gap-2">
												<Button onClick={openNewInvoiceDialog}>Create first invoice</Button>
												<Button asChild variant="outline">
													<Link to="/settings">Open billing setup</Link>
												</Button>
											</div>
										}
									/>
								) : (
									invoiceList.map((invoice) => (
										<InvoiceRow
											key={invoice.id}
											invoice={invoice}
											guardianName={guardianNameById.get(invoice.guardianId) || "Family account"}
											timezone={centerTimezone}
											familyPaymentsReady={familyPaymentsReady}
											isSelected={selectedInvoiceIds.includes(invoice.id)}
											bulkActionsDisabled={isBulkSending || isBulkPaying}
											onSelectionChange={
												isSelectableInvoice(invoice)
													? (checked) => toggleInvoiceSelection(invoice.id, checked)
													: undefined
											}
											onEdit={
												isEditableStatus(invoice.status)
													? () => openEditInvoiceDialog(invoice)
													: undefined
											}
											onDelete={
												invoice.status === "draft"
													? () => deleteInvoice.mutate(invoice.id)
													: undefined
											}
										/>
									))
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</section>
		</div>
	);
}

interface InvoiceRowProps {
	invoice: Invoice;
	guardianName: string;
	timezone: string;
	familyPaymentsReady: boolean;
	isSelected?: boolean;
	bulkActionsDisabled?: boolean;
	onSelectionChange?: (checked: boolean) => void;
	onEdit?: () => void;
	onDelete?: () => void;
}

/**
 * Converts a datetime-local input value (e.g. "2026-04-17T14:30") interpreted
 * in the given IANA timezone to an ISO 8601 UTC string. Falls back to browser
 * local time when the timezone is unavailable or invalid.
 */
function localDatetimeToISO(value: string, timezone: string): string {
	try {
		// Parse the wall-clock parts from the input
		const [datePart, timePart] = value.split("T");
		if (!datePart || !timePart) return new Date(value).toISOString();
		const [year, month, day] = datePart.split("-").map(Number);
		const [hour, minute] = timePart.split(":").map(Number);
		if (
			year === undefined ||
			month === undefined ||
			day === undefined ||
			hour === undefined ||
			minute === undefined
		) {
			return new Date(value).toISOString();
		}

		// Use Intl.DateTimeFormat to resolve the UTC offset for this timezone at
		// the wall-clock moment. We do this by finding the UTC timestamp that, when
		// formatted in the target timezone, matches the requested wall-clock time.
		const approxUtc = Date.UTC(year, month - 1, day, hour, minute);
		const formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
		const parts = formatter.formatToParts(new Date(approxUtc));
		const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
		const tzYear = get("year");
		const tzMonth = get("month");
		const tzDay = get("day");
		const tzHour = get("hour");
		const tzMinute = get("minute");
		// Compute offset: how far the formatted tz time is from our wall-clock target
		const tzWallMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute);
		const targetMs = Date.UTC(year, month - 1, day, hour, minute);
		const offsetMs = targetMs - tzWallMs;
		return new Date(approxUtc + offsetMs).toISOString();
	} catch {
		return new Date(value).toISOString();
	}
}

function InvoiceRow({
	invoice,
	guardianName,
	timezone,
	familyPaymentsReady,
	isSelected = false,
	bulkActionsDisabled = false,
	onSelectionChange,
	onEdit,
	onDelete,
}: InvoiceRowProps) {
	const sendInvoice = useSendInvoice();
	const recordPayment = useRecordPayment();
	const balanceRemaining = getInvoiceBalance(invoice);
	const [paymentOpen, setPaymentOpen] = useState(false);
	const [amount, setAmount] = useState(String(balanceRemaining));
	const [method, setMethod] = useState<PaymentMethod | "">("");
	const [paidAt, setPaidAt] = useState(() => formatLocalDatetime(timezone));
	const [paymentError, setPaymentError] = useState<string | null>(null);
	const [sendError, setSendError] = useState<string | null>(null);
	const invoiceLabel = `${guardianName}, ${formatShortDate(invoice.periodStart)} - ${formatShortDate(
		invoice.periodEnd,
	)}`;

	useEffect(() => {
		setAmount(String(balanceRemaining));
	}, [balanceRemaining]);

	async function handleSend() {
		setSendError(null);
		try {
			await sendInvoice.mutateAsync(invoice.id);
		} catch (err) {
			setSendError(extractErrorMessage(err, "Could not send invoice."));
		}
	}

	function resetPaymentForm() {
		setAmount(String(balanceRemaining));
		setMethod("");
		setPaidAt(formatLocalDatetime(timezone));
		setPaymentError(null);
		setSendError(null);
	}

	async function handleRecordPayment(e: React.FormEvent) {
		e.preventDefault();
		if (!method) return;
		const parsedAmount = Number(amount);
		if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
		setPaymentError(null);
		try {
			await recordPayment.mutateAsync({
				invoiceId: invoice.id,
				amount: parsedAmount,
				method: method as PaymentMethod,
				provider: "manual",
				paidAt: localDatetimeToISO(paidAt, timezone),
			});
			setPaymentOpen(false);
			resetPaymentForm();
		} catch (err) {
			setPaymentError(extractErrorMessage(err, "Could not record payment."));
		}
	}

	return (
		<div className="rounded-lg border border-border bg-muted/30 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-3">
					{onSelectionChange ? (
						<Checkbox
							aria-label={`Select invoice for ${invoiceLabel}`}
							checked={isSelected}
							disabled={bulkActionsDisabled}
							onCheckedChange={(checked) => onSelectionChange(checked === true)}
						/>
					) : null}
					<div className="space-y-1">
						<p className="text-sm font-medium text-foreground">{guardianName}</p>
						<p className="text-sm text-muted-foreground">
							Invoice for {formatShortDate(invoice.periodStart)} -{" "}
							{formatShortDate(invoice.periodEnd)}
						</p>
						<p className="text-xs text-muted-foreground">
							Created {formatDate(invoice.createdAt, { centerTimezone: timezone })}
						</p>
					</div>
				</div>
				<div className="flex flex-col items-end gap-2">
					<StatusBadge status={invoice.status} />
					<p className="text-sm font-medium text-foreground">{formatCurrency(balanceRemaining)}</p>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				{invoice.publicPayToken &&
				invoice.status !== "paid" &&
				invoice.status !== "void" &&
				familyPaymentsReady ? (
					bulkActionsDisabled ? (
						<Button variant="outline" size="sm" disabled>
							Open pay link
						</Button>
					) : (
						<Button asChild variant="outline" size="sm">
							<Link to="/pay/$token" params={{ token: invoice.publicPayToken }}>
								Open pay link
							</Link>
						</Button>
					)
				) : null}

				{onEdit ? (
					<Button variant="outline" size="sm" disabled={bulkActionsDisabled} onClick={onEdit}>
						<Pencil className="mr-1 h-4 w-4" />
						Edit
					</Button>
				) : null}
				{onDelete ? (
					<ConfirmDestructiveDialog
						trigger={
							<Button
								variant="outline"
								size="sm"
								disabled={bulkActionsDisabled}
								className="text-destructive hover:text-destructive"
							>
								Delete
							</Button>
						}
						title="Delete draft invoice?"
						description={`Delete the draft invoice for ${guardianName}, ${formatShortDate(invoice.periodStart)} – ${formatShortDate(invoice.periodEnd)}? This cannot be undone.`}
						confirmLabel="Delete"
						onConfirm={onDelete}
					/>
				) : null}
				{invoice.status === "draft" && (
					<Button
						variant="outline"
						size="sm"
						disabled={bulkActionsDisabled || sendInvoice.isPending || !familyPaymentsReady}
						onClick={handleSend}
					>
						<Send className="mr-1 h-4 w-4" />
						Send
					</Button>
				)}
				{sendError ? (
					<p role="alert" className="w-full text-sm text-destructive">
						{sendError}
					</p>
				) : null}

				{invoice.status !== "paid" && invoice.status !== "void" && (
					<Dialog
						open={paymentOpen}
						onOpenChange={(open) => {
							setPaymentOpen(open);
							if (!open) resetPaymentForm();
						}}
					>
						<DialogTrigger asChild>
							<Button variant="outline" size="sm" disabled={bulkActionsDisabled}>
								Record payment
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Record payment</DialogTitle>
								<DialogDescription>
									Record a manual payment received for this invoice.
								</DialogDescription>
							</DialogHeader>
							<form onSubmit={handleRecordPayment} className="space-y-4">
								<div className="space-y-1.5">
									<Label htmlFor={`amount-${invoice.id}`}>Amount</Label>
									<div className="relative">
										<span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
											$
										</span>
										<Input
											id={`amount-${invoice.id}`}
											type="number"
											required
											min={0}
											step="0.01"
											value={amount}
											onChange={(e) => setAmount(e.target.value)}
											className="pl-6"
										/>
									</div>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor={`method-${invoice.id}`}>Payment method</Label>
									<Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod | "")}>
										<SelectTrigger id={`method-${invoice.id}`}>
											<SelectValue placeholder="Select payment method" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="cash">Cash</SelectItem>
											<SelectItem value="check">Check</SelectItem>
											<SelectItem value="credit_card">Credit card</SelectItem>
											<SelectItem value="ach">ACH</SelectItem>
											<SelectItem value="other">Other</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor={`paid-at-${invoice.id}`}>Payment date</Label>
									<Input
										id={`paid-at-${invoice.id}`}
										type="datetime-local"
										required
										value={paidAt}
										onChange={(e) => setPaidAt(e.target.value)}
									/>
								</div>
								{paymentError ? (
									<p role="alert" className="text-sm text-destructive">
										{paymentError}
									</p>
								) : null}
								<Button
									type="submit"
									className="w-full"
									disabled={
										bulkActionsDisabled ||
										recordPayment.isPending ||
										!Number.isFinite(Number(amount)) ||
										Number(amount) <= 0
									}
								>
									Confirm payment
								</Button>
							</form>
						</DialogContent>
					</Dialog>
				)}
			</div>
		</div>
	);
}

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
	none: "Not started",
	trialing: "Trial",
	active: "Active",
	past_due: "Past due",
	canceled: "Canceled",
	unpaid: "Unpaid",
	incomplete: "Incomplete",
	incomplete_expired: "Expired",
};

const SUBSCRIPTION_STATUS_TONE: Record<SubscriptionStatus, string> = {
	none: "bg-muted text-muted-foreground",
	trialing: "bg-primary/10 text-primary",
	active: "bg-success/15 text-success",
	past_due: "bg-warning/15 text-warning-foreground",
	canceled: "bg-destructive/10 text-destructive",
	unpaid: "bg-destructive/10 text-destructive",
	incomplete: "bg-warning/15 text-warning-foreground",
	incomplete_expired: "bg-destructive/10 text-destructive",
};

const STRIPE_CONNECT_STATUS_LABELS: Record<StripeAccountStatus, string> = {
	not_connected: "Not connected",
	pending: "Pending",
	connected: "Connected",
	restricted: "Restricted",
	disabled: "Disabled",
};

const STRIPE_CONNECT_STATUS_TONE: Record<StripeAccountStatus, string> = {
	not_connected: "bg-warning/15 text-warning-foreground",
	pending: "bg-warning/15 text-warning-foreground",
	connected: "bg-success/15 text-success",
	restricted: "bg-destructive/10 text-destructive",
	disabled: "bg-destructive/10 text-destructive",
};

function FamilyPaymentsSetupCard({
	role,
	status,
	isLoading,
	isError,
	disabledReason,
}: {
	role: string;
	status: StripeAccountStatus;
	isLoading: boolean;
	isError: boolean;
	disabledReason: string | null;
}) {
	const startOnboarding = useStartStripeConnectOnboarding();
	const [connectError, setConnectError] = useState<string | null>(null);
	const canManagePayments = role === "owner" || role === "director";
	const isConnected = status === "connected";

	async function handleStartOnboarding() {
		setConnectError(null);
		try {
			await startOnboarding.mutateAsync();
		} catch (err) {
			setConnectError(extractErrorMessage(err, "Could not start Stripe onboarding."));
		}
	}

	if (isLoading) {
		return (
			<Card>
				<CardHeader className="flex-row items-center justify-between gap-4">
					<CardTitle>Family payments setup</CardTitle>
					<Badge variant="secondary">Checking</Badge>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
						<CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
						<p className="text-sm text-muted-foreground">Checking payment setup...</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (isError && canManagePayments) {
		return (
			<Card>
				<CardHeader className="flex-row items-center justify-between gap-4">
					<CardTitle>Family payments setup</CardTitle>
					<Badge variant="secondary" className="bg-destructive/10 text-destructive">
						Needs attention
					</Badge>
				</CardHeader>
				<CardContent>
					<div
						role="alert"
						className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4"
					>
						<AlertCircle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
						<div>
							<p className="font-semibold text-foreground">We couldn't check family payments</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Refresh the page before sending invoice links.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-4">
				<CardTitle>Family payments setup</CardTitle>
				<Badge variant="secondary" className={STRIPE_CONNECT_STATUS_TONE[status]}>
					{STRIPE_CONNECT_STATUS_LABELS[status]}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex items-start gap-3">
						{isConnected ? (
							<CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
						) : (
							<CreditCard className="mt-0.5 h-5 w-5 text-warning-foreground" aria-hidden="true" />
						)}
						<div>
							<p className="font-semibold text-foreground">
								{isConnected
									? "Online payments ready"
									: "Connect Stripe before sending online payment links"}
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								{isConnected
									? "Families can pay invoices from secure payment links."
									: "Manual record payment stays available while online payments are being set up."}
							</p>
							{disabledReason ? (
								<p className="mt-2 text-sm text-destructive">{disabledReason}</p>
							) : null}
						</div>
					</div>
					{!isConnected && canManagePayments ? (
						<Button
							type="button"
							onClick={handleStartOnboarding}
							disabled={startOnboarding.isPending}
						>
							{startOnboarding.isPending ? "Opening..." : "Connect Stripe"}
						</Button>
					) : null}
				</div>
				{!canManagePayments ? (
					<p className="text-sm text-muted-foreground">
						Ask an owner or director to connect Stripe for online family payments.
					</p>
				) : null}
				{connectError ? (
					<p role="alert" className="text-sm text-destructive">
						{connectError}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function SubscriptionCard() {
	const { data: session } = useAuthSession();
	const openPortal = useOpenBillingPortal();
	const [portalError, setPortalError] = useState<string | null>(null);
	const [showPlanPicker, setShowPlanPicker] = useState(false);

	if (!session) {
		return null;
	}

	const role = session.membership.role;
	const status: SubscriptionStatus = session.center.subscriptionStatus ?? "none";
	const plan = session.center.subscriptionPlan ?? null;
	const planLabel = plan
		? (SUBSCRIPTION_PLAN_CONFIG[plan]?.label ?? "Unknown plan")
		: "Not selected";
	const trialEndsAt = session.center.trialEndsAt ?? null;
	const currentPeriodEnd = session.center.currentPeriodEnd ?? null;
	const canOpenBillingPortal = session.center.canOpenBillingPortal === true;
	const isOwner = role === "owner";

	async function handleOpenPortal() {
		setPortalError(null);
		try {
			await openPortal.mutateAsync();
		} catch (err) {
			setPortalError(extractErrorMessage(err, "Could not open the billing portal."));
		}
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-4">
				<CardTitle>PebbleDesk subscription</CardTitle>
				<Badge variant="secondary" className={SUBSCRIPTION_STATUS_TONE[status]}>
					{SUBSCRIPTION_STATUS_LABELS[status]}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="grid gap-3 sm:grid-cols-3">
					<SubscriptionDetail label="Plan">{planLabel}</SubscriptionDetail>
					<SubscriptionDetail label="Trial ends">
						{formatDate(trialEndsAt, { centerTimezone: session.center.timezone })}
					</SubscriptionDetail>
					<SubscriptionDetail label="Next bill">
						{formatDate(currentPeriodEnd, { centerTimezone: session.center.timezone })}
					</SubscriptionDetail>
				</div>
				{isOwner ? (
					canOpenBillingPortal ? (
						<Button
							type="button"
							variant="outline"
							onClick={handleOpenPortal}
							disabled={openPortal.isPending}
						>
							{openPortal.isPending ? "Opening…" : "Manage billing"}
						</Button>
					) : (
						<div className="space-y-2">
							<p className="text-sm text-muted-foreground">
								{status === "trialing"
									? "Your no-card trial is active."
									: "Choose a paid plan to add a payment method and manage billing."}
							</p>
							<Button type="button" variant="default" onClick={() => setShowPlanPicker(true)}>
								Choose your plan
							</Button>
							<Dialog open={showPlanPicker} onOpenChange={setShowPlanPicker}>
								<DialogContent className="max-w-4xl">
									<DialogHeader>
										<DialogTitle>Choose your plan</DialogTitle>
										<DialogDescription>
											Pick the plan that works best for your center.
										</DialogDescription>
									</DialogHeader>
									<PlanPicker
										key={showPlanPicker ? "open" : "closed"}
										trialEndsAt={trialEndsAt}
										centerTimezone={session.center.timezone}
									/>
								</DialogContent>
							</Dialog>
						</div>
					)
				) : (
					<p className="text-sm text-muted-foreground">
						Ask your owner to manage billing for this center.
					</p>
				)}
				{portalError ? (
					<p role="alert" className="text-sm text-destructive">
						{portalError}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function SubscriptionDetail({ label, children }: { label: string; children: string }) {
	return (
		<div>
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className="mt-1 text-sm text-foreground">{children}</p>
		</div>
	);
}

function MetricCard({
	label,
	value,
	danger,
	help,
}: {
	label: string;
	value: string;
	danger?: boolean;
	help: string;
}) {
	return (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-center gap-1">
					<p className="text-sm text-muted-foreground">{label}</p>
					<HelpTip label={`Help: ${label}`}>{help}</HelpTip>
				</div>
				<p
					className={`mt-1 text-2xl font-semibold ${danger ? "text-destructive" : "text-foreground"}`}
				>
					{value}
				</p>
			</CardContent>
		</Card>
	);
}

function BillingPageSkeleton() {
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

function formatShortDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)));
}

function isSelectableInvoice(invoice: Invoice) {
	return invoice.status !== "paid" && invoice.status !== "void" && getInvoiceBalance(invoice) > 0;
}

function getGuardianName(invoice: Invoice, guardianNameById: Map<string, string>) {
	return guardianNameById.get(invoice.guardianId) || "Family account";
}

function getInvoiceLabel(invoice: Invoice, guardianNameById: Map<string, string>) {
	return `${getGuardianName(invoice, guardianNameById)}, ${formatShortDate(
		invoice.periodStart,
	)} - ${formatShortDate(invoice.periodEnd)}`;
}

function getInvoiceBalance(invoice: Invoice) {
	return invoice.balanceRemaining ?? invoice.amountDue;
}
