import type {
	CreateInvoiceInput,
	CreateInvoiceTemplateInput,
	CreatePaymentInput,
	CreateSubsidyCaseInput,
	CreateSubsidyClaimInput,
	Invoice,
	InvoiceTemplate,
	Payment,
	ReversePaymentInput,
	SubsidyCase,
	SubsidyClaim,
	UpdateInvoiceInput,
	UpdateInvoiceTemplateInput,
	UpdateSubsidyCaseInput,
	UpdateSubsidyClaimInput,
} from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	invoiceSummaryResponseSchema,
	invoicesListResponseSchema,
	invoiceTemplateDetailResponseSchema,
	invoiceTemplatesListResponseSchema,
	paymentsListResponseSchema,
	subsidyCasesListResponseSchema,
	subsidyClaimsListResponseSchema,
} from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { isUuid } from "../lib/is-uuid";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

/**
 * Response validation schemas for finance mutation hooks.
 * All schemas use passthrough() so unknown fields from the API are preserved.
 * Only the minimal discriminating field (id) is required to stay defensive.
 */
const InvoiceTemplateSummarySchema = z.object({ id: z.string() }).passthrough();
const InvoiceSchema = z.object({ id: z.string() }).passthrough();
const PaymentSchema = z.object({ id: z.string() }).passthrough();
const SubsidyCaseSchema = z.object({ id: z.string() }).passthrough();
const SubsidyClaimSchema = z.object({ id: z.string() }).passthrough();

const CreateInvoiceTemplateResponseSchema = z
	.object({ invoiceTemplate: InvoiceTemplateSummarySchema })
	.passthrough();
const UpdateInvoiceTemplateResponseSchema = z
	.object({ invoiceTemplate: InvoiceTemplateSummarySchema })
	.passthrough();
const CreateInvoiceResponseSchema = z.object({ invoice: InvoiceSchema }).passthrough();
const UpdateInvoiceResponseSchema = z.object({ invoice: InvoiceSchema }).passthrough();
const SendInvoiceResponseSchema = z.object({}).passthrough();
const RecordPaymentResponseSchema = z.object({ payment: PaymentSchema }).passthrough();
const ReversePaymentResponseSchema = z.object({ payment: PaymentSchema }).passthrough();
const CreateSubsidyCaseResponseSchema = z.object({ subsidyCase: SubsidyCaseSchema }).passthrough();
const UpdateSubsidyCaseResponseSchema = z.object({ subsidyCase: SubsidyCaseSchema }).passthrough();
const CreateSubsidyClaimResponseSchema = z
	.object({ subsidyClaim: SubsidyClaimSchema })
	.passthrough();
const DeleteSubsidyClaimResponseSchema = z.object({ deleted: z.boolean(), id: z.string() });
const DeleteInvoiceResponseSchema = z.object({ deleted: z.literal(true), id: z.string() });

export interface ChildSubsidySummary {
	cases: SubsidyCase[];
	activeCase: SubsidyCase | null;
	claims: SubsidyClaim[];
	latestClaim: SubsidyClaim | null;
}

interface InvoiceSummaryResponse {
	overdueInvoiceCount: number;
}

interface FinanceQueryOptions {
	enabled?: boolean;
	refetchInterval?: number;
}

function invalidateInvoiceQueries(
	queryClient: ReturnType<typeof useQueryClient>,
	activeCenterId: string | undefined,
) {
	queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoices"] });
	queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoiceSummary"] });
}

type FinanceFeatureName = "billing" | "payments" | "subsidies";

function trackFinanceCompleted(
	featureName: FinanceFeatureName,
	action: string,
	properties?: Record<string, unknown>,
) {
	track(ANALYTICS_EVENTS.financeActionCompleted, {
		feature_name: featureName,
		action,
		result: "success",
		...properties,
	});
}

function trackFinanceFailed(
	featureName: FinanceFeatureName,
	action: string,
	properties?: Record<string, unknown>,
) {
	track(ANALYTICS_EVENTS.financeActionFailed, {
		feature_name: featureName,
		action,
		result: "failed",
		...properties,
		error_code: "response_error",
	});
}

export type InvoiceTemplateSummary = Omit<InvoiceTemplate, "lineItems">;

export interface InvoiceTemplateLineItemRow {
	id: string;
	invoiceTemplateId: string;
	description: string;
	quantity: number;
	unitPrice: number;
	amount: number;
	sortOrder: number;
}

export interface InvoiceTemplateDetail {
	invoiceTemplate: InvoiceTemplateSummary;
	lineItems: InvoiceTemplateLineItemRow[];
}

const CASE_STATUS_PRIORITY: Record<SubsidyCase["status"], number> = {
	active: 0,
	pending: 1,
	expired: 2,
	terminated: 3,
};

export function selectActiveSubsidyCase(cases: SubsidyCase[]): SubsidyCase | null {
	if (cases.length === 0) return null;

	return [...cases].sort(compareSubsidyCases)[0] ?? null;
}

export function selectLatestClaim(claims: SubsidyClaim[]): SubsidyClaim | null {
	if (claims.length === 0) return null;

	return [...claims].sort((left, right) => sortByDate(right.createdAt, left.createdAt))[0] ?? null;
}

export function useSubsidyCases(childId?: string, options?: FinanceQueryOptions) {
	const activeCenterId = useActiveCenterId();
	const validChildId = childId && isUuid(childId) ? childId : undefined;

	return useQuery({
		queryKey: [activeCenterId, "subsidyCases", { childId: validChildId }],
		enabled: options?.enabled ?? true,
		queryFn: async () => {
			const query = validChildId ? `?childId=${encodeURIComponent(validChildId)}` : "";
			const res = await apiFetch(`/api/subsidy-cases${query}`);
			const data = await parseJsonResponse(
				res,
				subsidyCasesListResponseSchema,
				"Failed to fetch subsidy cases",
			);
			return data.subsidyCases as unknown as SubsidyCase[];
		},
	});
}

export function useSubsidyClaims(subsidyCaseId?: string, options?: FinanceQueryOptions) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "subsidyClaims", { subsidyCaseId }],
		enabled: options?.enabled ?? true,
		queryFn: async () => {
			const PAGE_SIZE = 200;
			const allClaims: SubsidyClaim[] = [];
			let cursor = 0;

			for (;;) {
				const params = new URLSearchParams();
				params.set("limit", String(PAGE_SIZE));
				params.set("cursor", String(cursor));
				if (subsidyCaseId) params.set("subsidyCaseId", subsidyCaseId);
				const res = await apiFetch(`/api/subsidy-claims?${params.toString()}`);
				const data = await parseJsonResponse(
					res,
					subsidyClaimsListResponseSchema,
					"Failed to fetch subsidy claims",
				);
				const page = data.subsidyClaims as unknown as SubsidyClaim[];
				allClaims.push(...page);
				if (page.length < PAGE_SIZE) break;
				cursor += PAGE_SIZE;
			}

			return allClaims;
		},
	});
}

export function useInvoices(filters?: { guardianId?: string }, options?: FinanceQueryOptions) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "invoices", filters],
		enabled: options?.enabled,
		refetchInterval: options?.refetchInterval,
		queryFn: async () => {
			// Invoices are transactional records that accumulate indefinitely, and the
			// backend caps every page at PAGE_MAX=200 defaulting to just 50
			// (apps/api/src/lib/pagination.ts). A single un-paginated GET would silently
			// drop every invoice past the first page from the billing list and summary
			// counts, so we drain all pages here — mirroring useSubsidyClaims.
			const PAGE_SIZE = 200;
			const allInvoices: Invoice[] = [];
			let cursor = 0;

			for (;;) {
				const params = new URLSearchParams();
				params.set("limit", String(PAGE_SIZE));
				params.set("cursor", String(cursor));
				if (filters?.guardianId) params.set("guardianId", filters.guardianId);
				const res = await apiFetch(`/api/invoices?${params.toString()}`);
				const data = await parseJsonResponse(
					res,
					invoicesListResponseSchema,
					"Failed to fetch invoices",
				);
				const page = data.invoices as unknown as Invoice[];
				allInvoices.push(...page);
				if (page.length < PAGE_SIZE) break;
				cursor += PAGE_SIZE;
			}

			return allInvoices;
		},
	});
}

export function useInvoiceSummary(options?: FinanceQueryOptions) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "invoiceSummary"],
		enabled: options?.enabled,
		refetchInterval: options?.refetchInterval,
		queryFn: async () => {
			const res = await apiFetch("/api/invoices/summary");
			const data = await parseJsonResponse(
				res,
				invoiceSummaryResponseSchema,
				"Failed to fetch invoice summary",
			);
			return data as unknown as InvoiceSummaryResponse;
		},
	});
}

export interface PaymentsFilters {
	invoiceId?: string;
	method?: string;
	status?: string;
	dateFrom?: string;
	dateTo?: string;
	search?: string;
}

export function usePayments(filters?: PaymentsFilters) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "payments", filters],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (filters?.invoiceId) params.set("invoiceId", filters.invoiceId);
			if (filters?.method) params.set("method", filters.method);
			if (filters?.status) params.set("status", filters.status);
			if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
			if (filters?.dateTo) params.set("dateTo", filters.dateTo);
			if (filters?.search) params.set("search", filters.search);
			const qs = params.toString();
			const res = await apiFetch(`/api/payments${qs ? `?${qs}` : ""}`);
			const data = await parseJsonResponse(
				res,
				paymentsListResponseSchema,
				"Failed to fetch payments",
			);
			return data.payments as unknown as Payment[];
		},
	});
}

export function useChildSubsidySummary(childId: string, options?: { enabled?: boolean }) {
	const activeCenterId = useActiveCenterId();
	const validChildId = isUuid(childId) ? childId : "";

	return useQuery({
		queryKey: [activeCenterId, "childSubsidySummary", validChildId],
		// The summary reads GET /api/subsidy-cases, which is Owner/Director only
		// (subsidy-cases.ts requireRole). Callers gate with `enabled` for staff so
		// a staff viewer of the child profile never fires a doomed 403 request.
		enabled: (options?.enabled ?? true) && validChildId.length > 0,
		queryFn: async () => {
			const casesRes = await apiFetch(
				`/api/subsidy-cases?childId=${encodeURIComponent(validChildId)}`,
			);
			const casesData = await parseJsonResponse(
				casesRes,
				subsidyCasesListResponseSchema,
				"Failed to fetch subsidy cases",
			);
			const subsidyCases = casesData.subsidyCases as unknown as SubsidyCase[];
			const activeCase = selectActiveSubsidyCase(subsidyCases);

			if (!activeCase) {
				return {
					cases: subsidyCases,
					activeCase: null,
					claims: [],
					latestClaim: null,
				};
			}

			const claimsRes = await apiFetch(
				`/api/subsidy-claims?subsidyCaseId=${encodeURIComponent(activeCase.id)}`,
			);
			const claimsData = await parseJsonResponse(
				claimsRes,
				subsidyClaimsListResponseSchema,
				"Failed to fetch subsidy claims",
			);
			const subsidyClaims = claimsData.subsidyClaims as unknown as SubsidyClaim[];

			return {
				cases: subsidyCases,
				activeCase,
				claims: subsidyClaims,
				latestClaim: selectLatestClaim(subsidyClaims),
			};
		},
	});
}

export function useInvoiceTemplates() {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "invoiceTemplates"],
		queryFn: async () => {
			const res = await apiFetch("/api/invoice-templates");
			const data = await parseJsonResponse(
				res,
				invoiceTemplatesListResponseSchema,
				"Failed to fetch invoice templates",
			);
			return data.invoiceTemplates as unknown as InvoiceTemplateSummary[];
		},
	});
}

export function useInvoiceTemplateDetail(id: string | undefined) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "invoiceTemplate", id],
		enabled: !!id,
		queryFn: async () => {
			const res = await apiFetch(`/api/invoice-templates/${encodeURIComponent(id ?? "")}`);
			const data = await parseJsonResponse(
				res,
				invoiceTemplateDetailResponseSchema,
				"Failed to fetch invoice template",
			);
			return data as unknown as InvoiceTemplateDetail;
		},
	});
}

export function useCreateInvoiceTemplate() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (input: CreateInvoiceTemplateInput) => {
			const res = await apiFetch("/api/invoice-templates", {
				method: "POST",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to create invoice template");
			}
			const raw: unknown = await res.json();
			const data = CreateInvoiceTemplateResponseSchema.parse(raw);
			return data.invoiceTemplate as unknown as InvoiceTemplateSummary;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoiceTemplates"] });
			toast.success("Invoice template created.");
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useUpdateInvoiceTemplate() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: UpdateInvoiceTemplateInput }) => {
			const res = await apiFetch(`/api/invoice-templates/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to update invoice template");
			}
			const raw: unknown = await res.json();
			const data = UpdateInvoiceTemplateResponseSchema.parse(raw);
			return data.invoiceTemplate as unknown as InvoiceTemplateSummary;
		},
		onSuccess: (_invoiceTemplate, { id }) => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoiceTemplates"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoiceTemplate", id] });
			toast.success("Invoice template updated.");
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useDeleteInvoiceTemplate() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/invoice-templates/${encodeURIComponent(id)}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to delete invoice template");
			}
		},
		onSuccess: (_value, id) => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "invoiceTemplates"] });
			queryClient.removeQueries({ queryKey: [activeCenterId, "invoiceTemplate", id] });
			toast.success("Invoice template deleted.");
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useCreateInvoice() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (input: CreateInvoiceInput) => {
			const res = await apiFetch("/api/invoices", {
				method: "POST",
				body: JSON.stringify(input),
			});
			if (!res.ok) throw new Error("Failed to create invoice");
			const raw: unknown = await res.json();
			const data = CreateInvoiceResponseSchema.parse(raw);
			return data.invoice as unknown as Invoice;
		},
		onSuccess: (_invoice, input) => {
			invalidateInvoiceQueries(queryClient, activeCenterId);
			trackFinanceCompleted("billing", "create_invoice", {
				line_item_count: input.lineItems.length,
			});
			toast.success("Invoice created.");
		},
		onError: (error, input) => {
			trackFinanceFailed("billing", "create_invoice", {
				line_item_count: input.lineItems.length,
			});
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useUpdateInvoice() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: UpdateInvoiceInput }) => {
			const res = await apiFetch(`/api/invoices/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to update invoice");
			}
			const raw: unknown = await res.json();
			const data = UpdateInvoiceResponseSchema.parse(raw);
			return data.invoice as unknown as Invoice;
		},
		onSuccess: () => {
			invalidateInvoiceQueries(queryClient, activeCenterId);
			trackFinanceCompleted("billing", "update_invoice");
			toast.success("Invoice updated.");
		},
		onError: (error) => {
			trackFinanceFailed("billing", "update_invoice");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useDeleteInvoice() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/invoices/${encodeURIComponent(id)}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to delete invoice");
			}
			const raw: unknown = await res.json();
			return DeleteInvoiceResponseSchema.parse(raw);
		},
		onSuccess: () => {
			invalidateInvoiceQueries(queryClient, activeCenterId);
			trackFinanceCompleted("billing", "delete_invoice");
			toast.success("Invoice deleted.");
		},
		onError: (error) => {
			trackFinanceFailed("billing", "delete_invoice");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useSendInvoice() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/invoices/${id}/send`, {
				method: "POST",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to send invoice");
			}
			const raw: unknown = await res.json();
			return SendInvoiceResponseSchema.parse(raw);
		},
		onSuccess: () => {
			invalidateInvoiceQueries(queryClient, activeCenterId);
			trackFinanceCompleted("billing", "send_invoice");
			toast.success("Invoice sent.");
		},
		onError: (error) => {
			trackFinanceFailed("billing", "send_invoice");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useRecordPayment() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (input: CreatePaymentInput) => {
			const res = await apiFetch("/api/payments", {
				method: "POST",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to record payment");
			}
			const raw: unknown = await res.json();
			const data = RecordPaymentResponseSchema.parse(raw);
			return data.payment as unknown as Payment;
		},
		onSuccess: (_payment, input) => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "payments"] });
			invalidateInvoiceQueries(queryClient, activeCenterId);
			trackFinanceCompleted("payments", "record_payment", { method: input.method });
			toast.success("Payment recorded.");
		},
		onError: (error, input) => {
			trackFinanceFailed("payments", "record_payment", { method: input.method });
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useReversePayment() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: ReversePaymentInput }) => {
			const res = await apiFetch(`/api/payments/${encodeURIComponent(id)}/reverse`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to reverse payment");
			}
			const raw: unknown = await res.json();
			const data = ReversePaymentResponseSchema.parse(raw);
			return data.payment as unknown as Payment;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "payments"] });
			invalidateInvoiceQueries(queryClient, activeCenterId);
			trackFinanceCompleted("payments", "reverse_payment");
			toast.success("Payment reversed.");
		},
		onError: (error) => {
			trackFinanceFailed("payments", "reverse_payment");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useCreateSubsidyCase() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (input: CreateSubsidyCaseInput) => {
			const res = await apiFetch("/api/subsidy-cases", {
				method: "POST",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to create subsidy case");
			}
			const raw: unknown = await res.json();
			const data = CreateSubsidyCaseResponseSchema.parse(raw);
			return data.subsidyCase as unknown as SubsidyCase;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyCases"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyClaims"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "childSubsidySummary"] });
			trackFinanceCompleted("subsidies", "create_subsidy_case");
			toast.success("Subsidy case created.");
		},
		onError: (error) => {
			trackFinanceFailed("subsidies", "create_subsidy_case");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useUpdateSubsidyCase() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: UpdateSubsidyCaseInput }) => {
			const res = await apiFetch(`/api/subsidy-cases/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to update subsidy case");
			}
			const raw: unknown = await res.json();
			const data = UpdateSubsidyCaseResponseSchema.parse(raw);
			return data.subsidyCase as unknown as SubsidyCase;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyCases"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyClaims"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "childSubsidySummary"] });
			trackFinanceCompleted("subsidies", "update_subsidy_case");
			toast.success("Subsidy case updated.");
		},
		onError: (error) => {
			trackFinanceFailed("subsidies", "update_subsidy_case");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useCreateSubsidyClaim() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (input: CreateSubsidyClaimInput) => {
			const res = await apiFetch("/api/subsidy-claims", {
				method: "POST",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to create subsidy claim");
			}
			const raw: unknown = await res.json();
			const data = CreateSubsidyClaimResponseSchema.parse(raw);
			return data.subsidyClaim as unknown as SubsidyClaim;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyClaims"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyCases"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "childSubsidySummary"] });
			trackFinanceCompleted("subsidies", "create_subsidy_claim");
			toast.success("Subsidy claim created.");
		},
		onError: (error) => {
			trackFinanceFailed("subsidies", "create_subsidy_claim");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useSubmitSubsidyClaim() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/subsidy-claims/${encodeURIComponent(id)}/submit`, {
				method: "POST",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to submit subsidy claim");
			}
			const raw: unknown = await res.json();
			const data = CreateSubsidyClaimResponseSchema.parse(raw);
			return data.subsidyClaim as unknown as SubsidyClaim;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyClaims"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyCases"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "childSubsidySummary"] });
			trackFinanceCompleted("subsidies", "submit_subsidy_claim");
			toast.success("Subsidy claim submitted to agency.");
		},
		onError: (error) => {
			trackFinanceFailed("subsidies", "submit_subsidy_claim");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useDeleteSubsidyClaim() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/subsidy-claims/${encodeURIComponent(id)}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to delete subsidy claim");
			}
			const raw: unknown = await res.json();
			const data = DeleteSubsidyClaimResponseSchema.parse(raw);
			return data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyClaims"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyCases"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "childSubsidySummary"] });
			trackFinanceCompleted("subsidies", "delete_subsidy_claim");
			toast.success("Draft claim deleted.");
		},
		onError: (error) => {
			trackFinanceFailed("subsidies", "delete_subsidy_claim");
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useUpdateSubsidyClaim() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: UpdateSubsidyClaimInput }) => {
			const res = await apiFetch(`/api/subsidy-claims/${encodeURIComponent(id)}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to update subsidy claim");
			}
			const raw: unknown = await res.json();
			const data = CreateSubsidyClaimResponseSchema.parse(raw);
			return data.subsidyClaim as unknown as SubsidyClaim;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyClaims"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "subsidyCases"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "childSubsidySummary"] });
			trackFinanceCompleted("subsidies", "update_subsidy_claim");
			toast.success("Subsidy claim updated.");
		},
		onError: (error) => {
			trackFinanceFailed("subsidies", "update_subsidy_claim");
			toast.error(extractErrorMessage(error));
		},
	});
}

function compareSubsidyCases(left: SubsidyCase, right: SubsidyCase): number {
	const statusComparison = CASE_STATUS_PRIORITY[left.status] - CASE_STATUS_PRIORITY[right.status];
	if (statusComparison !== 0) return statusComparison;

	return (
		sortByDate(right.effectiveDate, left.effectiveDate) ||
		sortByDate(right.createdAt, left.createdAt)
	);
}

function sortByDate(left: string, right: string): number {
	return new Date(left).getTime() - new Date(right).getTime();
}
