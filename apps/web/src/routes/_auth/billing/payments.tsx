import { formatCurrency, type Payment } from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { Textarea } from "@pebbledesk/ui/components/textarea";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleDollarSign, Download, RotateCcw, Search, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { DateInput } from "../../../components/date-input";
import { EmptyState } from "../../../components/empty-state";
import { PaymentMethodBadge } from "../../../components/payment-method-badge";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { type PaymentsFilters, usePayments, useReversePayment } from "../../../hooks/use-finance";
import { formatLocalDate } from "../../../lib/dates";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/billing/payments")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: BillingPaymentsPage,
});

type MethodFilter = "all" | "cash" | "check" | "credit_card" | "ach" | "other";
type StatusFilter = "all" | "posted" | "reversed";

const METHOD_OPTIONS: { value: MethodFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "cash", label: "Cash" },
	{ value: "check", label: "Check" },
	{ value: "credit_card", label: "Card" },
	{ value: "ach", label: "ACH" },
	{ value: "other", label: "Other" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "posted", label: "Posted" },
	{ value: "reversed", label: "Reversed" },
];

function useDebounce<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState<T>(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);
	return debounced;
}

function buildCsv(rows: Payment[]): string {
	const header = ["id", "invoiceId", "amount", "method", "status", "paidAt", "provider"];
	const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
	const lines = [
		header.join(","),
		...rows.map((p) =>
			[
				escapeCsv(p.id),
				escapeCsv(p.invoiceId),
				String(p.amount),
				escapeCsv(p.method),
				escapeCsv(p.status),
				escapeCsv(p.paidAt),
				escapeCsv(p.provider),
			].join(","),
		),
	];
	return lines.join("\n");
}

function downloadCsv(content: string, filename: string) {
	const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.setAttribute("download", filename);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

function todayIso(timezone: string): string {
	// Use the center's calendar day for the audit export filename rather than the
	// browser's UTC date, which can name the file with the wrong day.
	return formatLocalDate(timezone);
}

export function BillingPaymentsPage() {
	const { data: session } = useAuthSession();
	const centerTimezone = session?.center.timezone ?? "UTC";
	const [rawSearch, setRawSearch] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

	const debouncedSearch = useDebounce(rawSearch.trim(), 250);

	const filters = useMemo<PaymentsFilters>(() => {
		const f: PaymentsFilters = {};
		if (methodFilter !== "all") f.method = methodFilter;
		if (statusFilter !== "all") f.status = statusFilter;
		if (dateFrom) f.dateFrom = dateFrom;
		if (dateTo) f.dateTo = dateTo;
		if (debouncedSearch) f.search = debouncedSearch;
		return f;
	}, [methodFilter, statusFilter, dateFrom, dateTo, debouncedSearch]);

	const { data: payments, isLoading, isError, refetch } = usePayments(filters);

	if (isLoading) {
		return <BillingPaymentsPageSkeleton />;
	}

	if (isError) {
		return (
			<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p className="text-sm text-destructive">Failed to load payments.</p>
				<button
					type="button"
					onClick={() => void refetch()}
					className="mt-3 text-sm font-medium text-primary hover:underline"
				>
					Try again
				</button>
			</div>
		);
	}

	const paymentList = payments ?? [];

	return (
		<BillingPaymentsContent
			paymentList={paymentList}
			centerTimezone={centerTimezone}
			rawSearch={rawSearch}
			setRawSearch={setRawSearch}
			dateFrom={dateFrom}
			setDateFrom={setDateFrom}
			dateTo={dateTo}
			setDateTo={setDateTo}
			methodFilter={methodFilter}
			setMethodFilter={setMethodFilter}
			statusFilter={statusFilter}
			setStatusFilter={setStatusFilter}
			hasActiveFilters={
				debouncedSearch !== "" ||
				dateFrom !== "" ||
				dateTo !== "" ||
				methodFilter !== "all" ||
				statusFilter !== "all"
			}
		/>
	);
}

interface BillingPaymentsContentProps {
	paymentList: Payment[];
	centerTimezone: string;
	rawSearch: string;
	setRawSearch: (v: string) => void;
	dateFrom: string;
	setDateFrom: (v: string) => void;
	dateTo: string;
	setDateTo: (v: string) => void;
	methodFilter: MethodFilter;
	setMethodFilter: (v: MethodFilter) => void;
	statusFilter: StatusFilter;
	setStatusFilter: (v: StatusFilter) => void;
	hasActiveFilters: boolean;
}

function BillingPaymentsContent({
	paymentList,
	centerTimezone,
	rawSearch,
	setRawSearch,
	dateFrom,
	setDateFrom,
	dateTo,
	setDateTo,
	methodFilter,
	setMethodFilter,
	statusFilter,
	setStatusFilter,
	hasActiveFilters,
}: BillingPaymentsContentProps) {
	function clearFilters() {
		setRawSearch("");
		setDateFrom("");
		setDateTo("");
		setMethodFilter("all");
		setStatusFilter("all");
	}

	function handleExportCsv() {
		const csv = buildCsv(paymentList);
		const filename = `payments-${todayIso(centerTimezone)}.csv`;
		downloadCsv(csv, filename);
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Payment history</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Track received payments and match them to invoice balances.
				</p>
			</div>

			<Card>
				<CardHeader className="flex-row items-center justify-between gap-4">
					<CardTitle>Payments</CardTitle>
					<Badge variant="secondary" className="bg-success/10 text-success-foreground">
						<CircleDollarSign className="mr-1 h-3.5 w-3.5" />
						{paymentList.length} total
					</Badge>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Filters */}
					<div className="flex flex-wrap items-end gap-3">
						{/* Search */}
						<div className="relative min-w-[200px] flex-1">
							<Label htmlFor="payments-search" className="sr-only">
								Search payments
							</Label>
							<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="payments-search"
								placeholder="Search by method, status, invoice…"
								className="pl-8"
								value={rawSearch}
								onChange={(e) => setRawSearch(e.target.value)}
								aria-label="Search payments"
							/>
						</div>

						{/* Date from */}
						<div className="flex flex-col gap-1">
							<Label htmlFor="payments-date-from" className="text-xs text-muted-foreground">
								From
							</Label>
							<DateInput
								id="payments-date-from"
								value={dateFrom}
								maxDate={dateTo || undefined}
								onChange={(e) => setDateFrom(e.target.value)}
								aria-label="Filter from date"
							/>
						</div>

						{/* Date to */}
						<div className="flex flex-col gap-1">
							<Label htmlFor="payments-date-to" className="text-xs text-muted-foreground">
								To
							</Label>
							<DateInput
								id="payments-date-to"
								value={dateTo}
								minDate={dateFrom || undefined}
								onChange={(e) => setDateTo(e.target.value)}
								aria-label="Filter to date"
							/>
						</div>

						{/* Export */}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleExportCsv}
							disabled={paymentList.length === 0}
							aria-label="Export CSV"
						>
							<Download className="mr-1.5 h-3.5 w-3.5" />
							Export CSV
						</Button>
					</div>

					{/* Method segmented control */}
					<fieldset
						aria-label="Filter by method"
						className="flex flex-wrap items-center gap-1 border-0 p-0 m-0"
					>
						{METHOD_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() => setMethodFilter(opt.value)}
								aria-pressed={methodFilter === opt.value}
								className={[
									"rounded-md px-3 py-1 text-sm font-medium transition-colors",
									methodFilter === opt.value
										? "bg-primary text-primary-foreground"
										: "bg-muted text-muted-foreground hover:bg-muted/80",
								].join(" ")}
							>
								{opt.label}
							</button>
						))}
					</fieldset>

					{/* Status segmented control */}
					<fieldset
						aria-label="Filter by status"
						className="flex flex-wrap items-center gap-1 border-0 p-0 m-0"
					>
						{STATUS_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() => setStatusFilter(opt.value)}
								aria-pressed={statusFilter === opt.value}
								className={[
									"rounded-md px-3 py-1 text-sm font-medium transition-colors",
									statusFilter === opt.value
										? "bg-primary text-primary-foreground"
										: "bg-muted text-muted-foreground hover:bg-muted/80",
								].join(" ")}
							>
								{opt.label}
							</button>
						))}
					</fieldset>

					{/* Count */}
					{hasActiveFilters && (
						<p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
							{paymentList.length} result{paymentList.length !== 1 ? "s" : ""} matching filters
						</p>
					)}

					{/* Rows or empty states */}
					{paymentList.length === 0 && !hasActiveFilters ? (
						<EmptyState
							tone="finance"
							icon={<CircleDollarSign className="h-6 w-6" aria-hidden="true" />}
							title="Payments will land here once families settle up"
							description="As soon as families pay open invoices, those payments will appear here for reconciliation."
							action={
								<Button asChild className="mt-4">
									<Link to="/billing">Review invoices</Link>
								</Button>
							}
						/>
					) : paymentList.length === 0 && hasActiveFilters ? (
						<EmptyState
							tone="finance"
							icon={<Search className="h-6 w-6" aria-hidden="true" />}
							title="No payments match your filters"
							description="Try adjusting the search, date range, method, or status filters."
							action={
								<Button variant="outline" className="mt-4" onClick={clearFilters}>
									<X className="mr-1.5 h-3.5 w-3.5" />
									Clear filters
								</Button>
							}
						/>
					) : (
						<div className="space-y-3">
							{paymentList.map((payment) => (
								<PaymentRow key={payment.id} payment={payment} timezone={centerTimezone} />
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function PaymentRow({ payment, timezone }: { payment: Payment; timezone: string }) {
	const reversePayment = useReversePayment();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const canReverse = payment.status === "posted" && payment.provider === "manual";
	const isReversed = payment.status === "reversed";

	function handleDialogOpenChange(open: boolean) {
		setIsDialogOpen(open);
		if (!open) {
			setReason("");
			setError(null);
		}
	}

	async function handleReverse(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmedReason = reason.trim();
		if (!trimmedReason) {
			setError("Enter a reason before reversing.");
			return;
		}

		try {
			setError(null);
			await reversePayment.mutateAsync({
				id: payment.id,
				input: { reason: trimmedReason },
			});
			setReason("");
			setIsDialogOpen(false);
		} catch (err) {
			setError(extractErrorMessage(err, "Failed to reverse payment"));
		}
	}

	return (
		<div className="rounded-lg border border-border bg-muted p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-medium text-foreground">
							Received {formatShortDate(payment.paidAt, timezone)}
						</p>
						{isReversed ? <Badge variant="secondary">Reversed</Badge> : null}
					</div>
					<p className="text-sm text-muted-foreground">
						{isReversed
							? `Reversed ${formatShortDate(payment.reversedAt ?? payment.updatedAt ?? payment.paidAt, timezone)}`
							: "Applied to an open invoice"}
					</p>
					{payment.provider !== "manual" ? (
						<p className="text-sm text-muted-foreground">
							Managed in {payment.provider === "quickbooks" ? "QuickBooks" : "Stripe"}
						</p>
					) : null}
				</div>
				<div className="flex flex-col items-end gap-2">
					<PaymentMethodBadge method={payment.method} />
					<p className="text-sm font-medium text-foreground">{formatCurrency(payment.amount)}</p>
					{canReverse ? (
						<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
							<DialogTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									aria-label={`Reverse payment from ${formatShortDate(payment.paidAt, timezone)}`}
								>
									<RotateCcw className="h-3.5 w-3.5" />
									Reverse
								</Button>
							</DialogTrigger>
							<DialogContent>
								<form onSubmit={handleReverse} className="space-y-4">
									<DialogHeader>
										<DialogTitle>Reverse payment</DialogTitle>
										<DialogDescription>
											Keep the original payment in history and reopen the invoice balance.
										</DialogDescription>
									</DialogHeader>
									<div className="space-y-2">
										<Label htmlFor={`reverse-payment-reason-${payment.id}`}>Reason</Label>
										<Textarea
											id={`reverse-payment-reason-${payment.id}`}
											value={reason}
											onChange={(event) => setReason(event.target.value)}
											maxLength={500}
										/>
									</div>
									{error ? (
										<p role="alert" className="text-sm font-medium text-destructive">
											{error}
										</p>
									) : null}
									<DialogFooter>
										<Button
											type="button"
											variant="outline"
											onClick={() => handleDialogOpenChange(false)}
										>
											Cancel
										</Button>
										<Button type="submit" disabled={reversePayment.isPending}>
											Reverse payment
										</Button>
									</DialogFooter>
								</form>
							</DialogContent>
						</Dialog>
					) : null}
				</div>
			</div>
		</div>
	);
}

function BillingPaymentsPageSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-72" />
			</div>
			<Skeleton className="h-72 rounded-lg" />
		</div>
	);
}

function formatShortDate(value: string, timezone: string) {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: timezone,
	}).format(new Date(value));
}
