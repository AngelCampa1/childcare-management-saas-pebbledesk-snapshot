import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
import {
	selectActiveSubsidyCase,
	selectLatestClaim,
	useChildSubsidySummary,
	useCreateInvoice,
	useCreateInvoiceTemplate,
	useCreateSubsidyCase,
	useCreateSubsidyClaim,
	useDeleteInvoice,
	useDeleteInvoiceTemplate,
	useDeleteSubsidyClaim,
	useInvoiceSummary,
	useInvoices,
	useInvoiceTemplateDetail,
	useInvoiceTemplates,
	usePayments,
	useRecordPayment,
	useReversePayment,
	useSendInvoice,
	useSubmitSubsidyClaim,
	useSubsidyCases,
	useSubsidyClaims,
	useUpdateInvoice,
	useUpdateInvoiceTemplate,
	useUpdateSubsidyCase,
	useUpdateSubsidyClaim,
} from "./use-finance";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const CENTER_ID = "center-test";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);
const mockedToast = vi.mocked(toast);

function createResponse<T>(payload: T) {
	return {
		ok: true,
		json: async () => payload,
	} as Response;
}

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
			mutations: {
				retry: false,
			},
		},
	});

	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

function createWrapperWithClient() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	const wrapper = function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};

	return { wrapper, client };
}

describe("finance hooks", () => {
	const CHILD_ID = "550e8400-e29b-41d4-a716-446655440000";
	const SUBSIDY_CASE_ID = "660e8400-e29b-41d4-a716-446655440000";

	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("prefers the active subsidy case and the newest claim", () => {
		const cases = [
			{
				id: "case-2",
				status: "pending",
				effectiveDate: "2026-01-10",
				createdAt: "2026-01-10T12:00:00.000Z",
			},
			{
				id: "case-1",
				status: "active",
				effectiveDate: "2026-01-01",
				createdAt: "2026-01-01T12:00:00.000Z",
			},
		] as Parameters<typeof selectActiveSubsidyCase>[0];

		const claims = [
			{
				id: "claim-1",
				createdAt: "2026-02-01T12:00:00.000Z",
			},
			{
				id: "claim-2",
				createdAt: "2026-02-10T12:00:00.000Z",
			},
		] as Parameters<typeof selectLatestClaim>[0];

		expect(selectActiveSubsidyCase(cases)?.id).toBe("case-1");
		expect(selectLatestClaim(claims)?.id).toBe("claim-2");
	});

	it("loads subsidy cases for a child", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				subsidyCases: [
					{
						id: "case-1",
						childId: CHILD_ID,
						status: "active",
						effectiveDate: "2026-01-01",
						createdAt: "2026-01-01T12:00:00.000Z",
					},
				],
			}),
		);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useSubsidyCases(CHILD_ID), {
			wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/subsidy-cases?childId=${CHILD_ID}`);
		expect(result.current.data?.[0].id).toBe("case-1");
	});

	it("loads subsidy claims for a subsidy case", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				subsidyClaims: [
					{
						id: "claim-1",
						subsidyCaseId: "case-1",
						status: "draft",
						createdAt: "2026-02-01T12:00:00.000Z",
					},
				],
			}),
		);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useSubsidyClaims(SUBSIDY_CASE_ID), {
			wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith(
			`/api/subsidy-claims?limit=200&cursor=0&subsidyCaseId=${SUBSIDY_CASE_ID}`,
		);
		expect(result.current.data?.[0].id).toBe("claim-1");
	});

	it("loads invoices for a guardian", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				invoices: [
					{
						id: "invoice-1",
						guardianId: "guardian-1",
						status: "sent",
						subtotal: 1000,
						subsidyCredit: 200,
						amountDue: 800,
						createdAt: "2026-02-01T12:00:00.000Z",
					},
				],
			}),
		);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useInvoices({ guardianId: "guardian-1" }), {
			wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/invoices?limit=200&cursor=0&guardianId=guardian-1",
		);
		expect(result.current.data?.[0].amountDue).toBe(800);
	});

	it("rejects an invoices response that fails schema validation", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ invoices: [{ status: "sent" }] }));

		const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("does not load invoices when the invoice query is disabled", () => {
		const wrapper = createWrapper();
		renderHook(() => useInvoices(undefined, { enabled: false }), {
			wrapper,
		});

		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads the invoice summary for dashboard counts", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ overdueInvoiceCount: 37 }));

		const wrapper = createWrapper();
		const { result } = renderHook(() => useInvoiceSummary(), {
			wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoices/summary");
		expect(result.current.data?.overdueInvoiceCount).toBe(37);
	});

	it("does not load the invoice summary when the summary query is disabled", () => {
		const wrapper = createWrapper();
		renderHook(() => useInvoiceSummary({ enabled: false }), {
			wrapper,
		});

		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads payments for an invoice", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				payments: [
					{
						id: "payment-1",
						invoiceId: "invoice-1",
						amount: 800,
						method: "card",
						provider: "manual",
						paidAt: "2026-02-12T12:00:00.000Z",
						createdAt: "2026-02-12T12:00:00.000Z",
					},
				],
			}),
		);

		const wrapper = createWrapper();
		const { result } = renderHook(() => usePayments({ invoiceId: "invoice-1" }), {
			wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/payments?invoiceId=invoice-1");
		expect(result.current.data?.[0].id).toBe("payment-1");
	});

	it("loads a child subsidy summary from the child subsidy endpoints", async () => {
		mockedApiFetch
			.mockResolvedValueOnce(
				createResponse({
					subsidyCases: [
						{
							id: "case-1",
							childId: CHILD_ID,
							status: "active",
							effectiveDate: "2026-01-01",
							createdAt: "2026-01-01T12:00:00.000Z",
						},
					],
				}),
			)
			.mockResolvedValueOnce(
				createResponse({
					subsidyClaims: [
						{
							id: "claim-old",
							subsidyCaseId: "case-1",
							status: "submitted",
							createdAt: "2026-02-01T12:00:00.000Z",
						},
						{
							id: "claim-new",
							subsidyCaseId: "case-1",
							status: "paid",
							createdAt: "2026-02-10T12:00:00.000Z",
						},
					],
				}),
			);

		const wrapper = createWrapper();
		const { result } = renderHook(() => useChildSubsidySummary(CHILD_ID), {
			wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, `/api/subsidy-cases?childId=${CHILD_ID}`);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/subsidy-claims?subsidyCaseId=case-1");
		expect(result.current.data?.activeCase?.id).toBe("case-1");
		expect(result.current.data?.latestClaim?.id).toBe("claim-new");
	});

	it("does not fetch subsidy summary for malformed child identifiers", () => {
		const wrapper = createWrapper();
		const { result } = renderHook(() => useChildSubsidySummary("child-1"), {
			wrapper,
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("does not fetch subsidy summary when disabled via options (staff viewer)", () => {
		const wrapper = createWrapper();
		const { result } = renderHook(() => useChildSubsidySummary(CHILD_ID, { enabled: false }), {
			wrapper,
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads subsidy cases without a childId filter", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyCases: [] }));

		const { result } = renderHook(() => useSubsidyCases(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/subsidy-cases");
	});

	it("ignores a non-UUID childId for subsidy cases", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyCases: [] }));

		const { result } = renderHook(() => useSubsidyCases("not-a-uuid"), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/subsidy-cases");
	});

	it("loads subsidy claims without a subsidyCaseId filter", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyClaims: [] }));

		const { result } = renderHook(() => useSubsidyClaims(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/subsidy-claims?limit=200&cursor=0");
	});

	it("paginates subsidy claims: fetches two pages and concatenates results", async () => {
		// First page: exactly 200 items — hook should request a second page
		const page1 = Array.from({ length: 200 }, (_, i) => ({
			id: `claim-page1-${i}`,
			subsidyCaseId: "case-1",
			status: "draft",
			createdAt: "2026-02-01T12:00:00.000Z",
		}));
		// Second page: 2 items — hook should stop
		const page2 = [
			{
				id: "claim-page2-0",
				subsidyCaseId: "case-1",
				status: "submitted",
				createdAt: "2026-03-01T12:00:00.000Z",
			},
			{
				id: "claim-page2-1",
				subsidyCaseId: "case-1",
				status: "paid",
				createdAt: "2026-04-01T12:00:00.000Z",
			},
		];

		mockedApiFetch
			.mockResolvedValueOnce(createResponse({ subsidyClaims: page1 }))
			.mockResolvedValueOnce(createResponse({ subsidyClaims: page2 }));

		const { result } = renderHook(() => useSubsidyClaims(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledTimes(2);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/subsidy-claims?limit=200&cursor=0");
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/subsidy-claims?limit=200&cursor=200");
		expect(result.current.data).toHaveLength(202);
		expect(result.current.data?.[0].id).toBe("claim-page1-0");
		expect(result.current.data?.[200].id).toBe("claim-page2-0");
	});

	it("does not fetch a second page when the first page has fewer than 200 items", async () => {
		const shortPage = [
			{
				id: "claim-a",
				subsidyCaseId: "case-1",
				status: "draft",
				createdAt: "2026-02-01T12:00:00.000Z",
			},
			{
				id: "claim-b",
				subsidyCaseId: "case-1",
				status: "submitted",
				createdAt: "2026-03-01T12:00:00.000Z",
			},
		];

		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyClaims: shortPage }));

		const { result } = renderHook(() => useSubsidyClaims(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledTimes(1);
		expect(result.current.data).toHaveLength(2);
	});

	it("paginates subsidy claims with a subsidyCaseId filter", async () => {
		const page1 = Array.from({ length: 200 }, (_, i) => ({
			id: `claim-case-page1-${i}`,
			subsidyCaseId: SUBSIDY_CASE_ID,
			status: "draft",
			createdAt: "2026-02-01T12:00:00.000Z",
		}));
		const page2 = [
			{
				id: "claim-case-page2-0",
				subsidyCaseId: SUBSIDY_CASE_ID,
				status: "paid",
				createdAt: "2026-04-01T12:00:00.000Z",
			},
		];

		mockedApiFetch
			.mockResolvedValueOnce(createResponse({ subsidyClaims: page1 }))
			.mockResolvedValueOnce(createResponse({ subsidyClaims: page2 }));

		const { result } = renderHook(() => useSubsidyClaims(SUBSIDY_CASE_ID), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledTimes(2);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			1,
			`/api/subsidy-claims?limit=200&cursor=0&subsidyCaseId=${SUBSIDY_CASE_ID}`,
		);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			2,
			`/api/subsidy-claims?limit=200&cursor=200&subsidyCaseId=${SUBSIDY_CASE_ID}`,
		);
		expect(result.current.data).toHaveLength(201);
	});

	it("does not fetch subsidy claims when enabled: false is passed", () => {
		const { result } = renderHook(() => useSubsidyClaims(undefined, { enabled: false }), {
			wrapper: createWrapper(),
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("does not fetch subsidy cases when enabled: false is passed", () => {
		const { result } = renderHook(() => useSubsidyCases(undefined, { enabled: false }), {
			wrapper: createWrapper(),
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads invoices without a guardianId filter", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ invoices: [] }));

		const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoices?limit=200&cursor=0");
	});

	it("drains every invoice page so large billing histories are not silently truncated", async () => {
		const fullPage = Array.from({ length: 200 }, (_value, index) => ({
			id: `invoice-${index}`,
			status: "sent",
			amountDue: 100,
		}));
		mockedApiFetch
			.mockResolvedValueOnce(createResponse({ invoices: fullPage }))
			.mockResolvedValueOnce(
				createResponse({ invoices: [{ id: "invoice-200", status: "sent", amountDue: 100 }] }),
			);

		const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/invoices?limit=200&cursor=0");
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/invoices?limit=200&cursor=200");
		expect(result.current.data).toHaveLength(201);
	});

	it("loads payments without an invoiceId filter", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ payments: [] }));

		const { result } = renderHook(() => usePayments(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/payments");
	});

	it("returns empty summary when there is no active subsidy case", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyCases: [] }));

		const { result } = renderHook(() => useChildSubsidySummary(CHILD_ID), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.activeCase).toBeNull();
		expect(result.current.data?.claims).toHaveLength(0);
		expect(result.current.data?.latestClaim).toBeNull();
	});

	it.each([
		[
			"useSubsidyCases",
			() => useSubsidyCases(CHILD_ID),
			`/api/subsidy-cases?childId=${CHILD_ID}`,
			"Failed to fetch subsidy cases",
		],
		[
			"useSubsidyClaims",
			() => useSubsidyClaims(SUBSIDY_CASE_ID),
			`/api/subsidy-claims?limit=200&cursor=0&subsidyCaseId=${SUBSIDY_CASE_ID}`,
			"Failed to fetch subsidy claims",
		],
		[
			"useInvoices",
			() => useInvoices({ guardianId: "guardian-1" }),
			"/api/invoices?limit=200&cursor=0&guardianId=guardian-1",
			"Failed to fetch invoices",
		],
		[
			"usePayments",
			() => usePayments({ invoiceId: "invoice-1" }),
			"/api/payments?invoiceId=invoice-1",
			"Failed to fetch payments",
		],
	] as const)("surfaces %s fetch failures", async (_name, hook, _expectedUrl, errorMessage) => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(hook, { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect((result.current.error as Error).message).toBe(errorMessage);
	});

	it("surfaces child subsidy summary failures for subsidy cases fetch", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useChildSubsidySummary(CHILD_ID), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect((result.current.error as Error).message).toBe("Failed to fetch subsidy cases");
	});

	it("surfaces child subsidy summary failures for subsidy claims fetch", async () => {
		mockedApiFetch
			.mockResolvedValueOnce(
				createResponse({
					subsidyCases: [
						{
							id: "case-1",
							childId: CHILD_ID,
							status: "active",
							effectiveDate: "2026-01-01",
							createdAt: "2026-01-01T12:00:00.000Z",
						},
					],
				}),
			)
			.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useChildSubsidySummary(CHILD_ID), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect((result.current.error as Error).message).toBe("Failed to fetch subsidy claims");
	});

	it("correctly sorts subsidy cases with equal statuses by effectiveDate", () => {
		const cases = [
			{
				id: "case-older",
				status: "active",
				effectiveDate: "2026-01-01",
				createdAt: "2026-01-01T12:00:00.000Z",
			},
			{
				id: "case-newer",
				status: "active",
				effectiveDate: "2026-02-01",
				createdAt: "2026-02-01T12:00:00.000Z",
			},
		] as Parameters<typeof selectActiveSubsidyCase>[0];

		expect(selectActiveSubsidyCase(cases)?.id).toBe("case-newer");
	});

	it("falls back to createdAt when subsidy cases share status and effectiveDate", () => {
		const cases = [
			{
				id: "case-created-first",
				status: "active",
				effectiveDate: "2026-01-01",
				createdAt: "2026-01-01T08:00:00.000Z",
			},
			{
				id: "case-created-last",
				status: "active",
				effectiveDate: "2026-01-01",
				createdAt: "2026-01-01T18:00:00.000Z",
			},
		] as Parameters<typeof selectActiveSubsidyCase>[0];

		expect(selectActiveSubsidyCase(cases)?.id).toBe("case-created-last");
	});

	it("returns null for empty cases or claims collections", () => {
		expect(selectActiveSubsidyCase([])).toBeNull();
		expect(selectLatestClaim([])).toBeNull();
	});

	it("creates an invoice and invalidates the invoices cache", async () => {
		const input = {
			guardianId: "550e8400-e29b-41d4-a716-446655440001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			lineItems: [
				{
					description: "Monthly tuition",
					quantity: 1,
					unitPrice: 1200,
					amount: 1200,
				},
			],
		};

		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				invoice: {
					id: "invoice-new",
					...input,
					status: "draft",
					subtotal: 1200,
					subsidyCredit: 0,
					amountDue: 1200,
					createdAt: "2026-04-01T00:00:00.000Z",
				},
			}),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useCreateInvoice(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync(input);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoices", {
			method: "POST",
			body: JSON.stringify(input),
		});
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoiceSummary"] });
		expect(mockedToast.success).toHaveBeenCalled();
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "billing",
			action: "create_invoice",
			result: "success",
			line_item_count: 1,
		});
	});

	it("surfaces create invoice failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				guardianId: "550e8400-e29b-41d4-a716-446655440001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				lineItems: [
					{
						description: "Monthly tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		).rejects.toThrow("Failed to create invoice");
		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("Failed to create invoice"));
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "billing",
			action: "create_invoice",
			result: "failed",
			line_item_count: 1,
			error_code: "response_error",
		});
	});

	it("sends an invoice and invalidates the invoices cache", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ ok: true }),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useSendInvoice(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync("invoice-1");
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoices/invoice-1/send", {
			method: "POST",
		});
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoiceSummary"] });
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "billing",
			action: "send_invoice",
			result: "success",
		});
	});

	it("surfaces send invoice failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "Email delivery failed" }),
		} as unknown as Response);

		const { result } = renderHook(() => useSendInvoice(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("invoice-1")).rejects.toThrow("Email delivery failed");
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "billing",
			action: "send_invoice",
			result: "failed",
			error_code: "response_error",
		});
	});

	it("falls back to default message when send invoice error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useSendInvoice(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("invoice-1")).rejects.toThrow("Failed to send invoice");
	});

	it("records a payment and invalidates both invoices and payments caches", async () => {
		const input = {
			invoiceId: "550e8400-e29b-41d4-a716-446655440002",
			amount: 800,
			method: "card" as const,
			paidAt: "2026-04-15T10:00:00.000Z",
		};

		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				payment: {
					id: "payment-new",
					...input,
					provider: "manual",
					createdAt: "2026-04-15T10:00:00.000Z",
				},
			}),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useRecordPayment(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync(input);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/payments", {
			method: "POST",
			body: JSON.stringify(input),
		});
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "payments"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoiceSummary"] });
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "payments",
			action: "record_payment",
			result: "success",
			method: "card",
		});
	});

	it("surfaces record payment failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "Payment exceeds invoice balance" }),
		} as unknown as Response);

		const { result } = renderHook(() => useRecordPayment(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				invoiceId: "550e8400-e29b-41d4-a716-446655440002",
				amount: 800,
				method: "card" as const,
				paidAt: "2026-04-15T10:00:00.000Z",
			}),
		).rejects.toThrow("Payment exceeds invoice balance");
		await waitFor(() =>
			expect(mockedToast.error).toHaveBeenCalledWith("Payment exceeds invoice balance"),
		);
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "payments",
			action: "record_payment",
			result: "failed",
			method: "card",
			error_code: "response_error",
		});
	});

	it("falls back to default message when record payment error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useRecordPayment(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				invoiceId: "550e8400-e29b-41d4-a716-446655440002",
				amount: 800,
				method: "card" as const,
				paidAt: "2026-04-15T10:00:00.000Z",
			}),
		).rejects.toThrow("Failed to record payment");
	});

	it("reverses a payment and invalidates both invoices and payments caches", async () => {
		const input = {
			reason: "Duplicate entry",
			reversedAt: "2026-05-01T15:30:00.000Z",
		};

		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				payment: {
					id: "payment/1",
					centerId: CENTER_ID,
					invoiceId: "invoice-1",
					amount: 800,
					method: "ach",
					provider: "manual",
					status: "reversed",
					paidAt: "2026-04-15T10:00:00.000Z",
					reversedAt: input.reversedAt,
					createdAt: "2026-04-15T10:00:00.000Z",
					updatedAt: "2026-05-01T15:30:00.000Z",
				},
			}),
		);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useReversePayment(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: "payment/1", input });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/payments/payment%2F1/reverse", {
			method: "PATCH",
			body: JSON.stringify(input),
		});
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "payments"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoiceSummary"] });
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "payments",
			action: "reverse_payment",
			result: "success",
		});
	});

	it("surfaces reverse payment failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "PAYMENT_ALREADY_REVERSED" }),
		} as unknown as Response);

		const { result } = renderHook(() => useReversePayment(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ id: "payment-1", input: { reason: "Duplicate entry" } }),
		).rejects.toThrow("PAYMENT_ALREADY_REVERSED");
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "payments",
			action: "reverse_payment",
			result: "failed",
			error_code: "response_error",
		});
	});

	const subsidyCaseInput = {
		childId: CHILD_ID,
		program: "ccdf" as const,
		caseNumber: "CASE-001",
		agencyName: "County Services",
		effectiveDate: "2026-04-01",
	};

	it("creates a subsidy case and invalidates both caches", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				subsidyCase: {
					id: "case-new",
					centerId: "center-1",
					...subsidyCaseInput,
					status: "active",
					createdAt: "2026-04-01T00:00:00.000Z",
					updatedAt: "2026-04-01T00:00:00.000Z",
				},
			}),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useCreateSubsidyCase(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync(subsidyCaseInput);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/subsidy-cases", {
			method: "POST",
			body: JSON.stringify(subsidyCaseInput),
		});
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyCases"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "childSubsidySummary"] });
	});

	it("surfaces create subsidy case failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "Case number already exists" }),
		} as unknown as Response);

		const { result } = renderHook(() => useCreateSubsidyCase(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync(subsidyCaseInput)).rejects.toThrow(
			"Case number already exists",
		);
	});

	it("falls back to default message when create subsidy case error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useCreateSubsidyCase(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync(subsidyCaseInput)).rejects.toThrow(
			"Failed to create subsidy case",
		);
	});

	const subsidyClaimInput = {
		subsidyCaseId: SUBSIDY_CASE_ID,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-07",
		daysAttended: 5,
		hoursAttended: 25,
		amountClaimed: 325,
	};

	it("creates a subsidy claim and invalidates both caches", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				subsidyClaim: {
					id: "claim-new",
					centerId: "center-1",
					...subsidyClaimInput,
					status: "draft",
					createdAt: "2026-04-08T00:00:00.000Z",
					updatedAt: "2026-04-08T00:00:00.000Z",
				},
			}),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useCreateSubsidyClaim(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync(subsidyClaimInput);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/subsidy-claims", {
			method: "POST",
			body: JSON.stringify(subsidyClaimInput),
		});
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyClaims"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "childSubsidySummary"] });
		// A new claim changes its parent case's claims/latestClaim, which the
		// subsidyCases list renders — refresh it too, like the submit/update/delete
		// claim mutations already do.
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyCases"] });
	});

	it("surfaces create subsidy claim failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "Period overlaps existing claim" }),
		} as unknown as Response);

		const { result } = renderHook(() => useCreateSubsidyClaim(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync(subsidyClaimInput)).rejects.toThrow(
			"Period overlaps existing claim",
		);
	});

	it("falls back to default message when create subsidy claim error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useCreateSubsidyClaim(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync(subsidyClaimInput)).rejects.toThrow(
			"Failed to create subsidy claim",
		);
	});

	it("submits a subsidy claim and invalidates the relevant caches", async () => {
		const claimId = "claim-submit-1";
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				subsidyClaim: {
					id: claimId,
					centerId: "center-1",
					...subsidyClaimInput,
					status: "submitted",
					createdAt: "2026-04-08T00:00:00.000Z",
					updatedAt: "2026-04-08T00:00:00.000Z",
				},
			}),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useSubmitSubsidyClaim(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync(claimId);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(
			`/api/subsidy-claims/${encodeURIComponent(claimId)}/submit`,
			{ method: "POST" },
		);
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyClaims"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyCases"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "childSubsidySummary"] });
		expect(mockedToast.success).toHaveBeenCalledWith("Subsidy claim submitted to agency.");
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "subsidies",
			action: "submit_subsidy_claim",
			result: "success",
		});
	});

	it("surfaces submit subsidy claim failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "invalid_status_transition" }),
		} as unknown as Response);

		const { result } = renderHook(() => useSubmitSubsidyClaim(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("claim-1")).rejects.toThrow(
			"invalid_status_transition",
		);
		await waitFor(() =>
			expect(mockedToast.error).toHaveBeenCalledWith("invalid_status_transition"),
		);
		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "subsidies",
			action: "submit_subsidy_claim",
			result: "failed",
			error_code: "response_error",
		});
	});

	it("falls back to default message when submit subsidy claim error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useSubmitSubsidyClaim(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("claim-1")).rejects.toThrow(
			"Failed to submit subsidy claim",
		);
	});

	it("deletes a draft subsidy claim and invalidates the relevant caches", async () => {
		const claimId = "claim-delete-1";
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ deleted: true, id: claimId }),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useDeleteSubsidyClaim(), { wrapper });

		await act(async () => {
			const data = await result.current.mutateAsync(claimId);
			expect(data).toEqual({ deleted: true, id: claimId });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(
			`/api/subsidy-claims/${encodeURIComponent(claimId)}`,
			{ method: "DELETE" },
		);
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyClaims"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyCases"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "childSubsidySummary"] });
		expect(mockedToast.success).toHaveBeenCalledWith("Draft claim deleted.");
	});

	it("surfaces delete subsidy claim failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "claim_locked" }),
		} as unknown as Response);

		const { result } = renderHook(() => useDeleteSubsidyClaim(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("claim-1")).rejects.toThrow("claim_locked");
		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("claim_locked"));
	});

	it("falls back to default message when delete subsidy claim error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useDeleteSubsidyClaim(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("claim-1")).rejects.toThrow(
			"Failed to delete subsidy claim",
		);
	});

	it("lists invoice templates", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				invoiceTemplates: [
					{
						id: "template-1",
						centerId: "center-1",
						name: "Monthly tuition",
						description: "Standard monthly",
						dueDays: 14,
						isDefault: true,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				],
			}),
		);

		const { result } = renderHook(() => useInvoiceTemplates(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoice-templates");
		expect(result.current.data?.[0].name).toBe("Monthly tuition");
	});

	it("fetches invoice template detail when id is provided", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				invoiceTemplate: {
					id: "template-1",
					centerId: "center-1",
					name: "Monthly tuition",
					description: null,
					dueDays: 14,
					isDefault: true,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
				lineItems: [
					{
						id: "li-1",
						invoiceTemplateId: "template-1",
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
						sortOrder: 0,
					},
				],
			}),
		);

		const { result } = renderHook(() => useInvoiceTemplateDetail("template-1"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoice-templates/template-1");
		expect(result.current.data?.lineItems[0].description).toBe("Tuition");
	});

	it("skips invoice template detail fetch when id is empty", () => {
		const { result } = renderHook(() => useInvoiceTemplateDetail(undefined), {
			wrapper: createWrapper(),
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("creates invoice templates with line items", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				invoiceTemplate: {
					id: "template-1",
					centerId: CENTER_ID,
					name: "Monthly tuition",
				},
			}),
		);

		const input = {
			name: "Monthly tuition",
			dueDays: 14,
			lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1200, amount: 1200 }],
		};
		const { result } = renderHook(() => useCreateInvoiceTemplate(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync(input);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoice-templates", {
			method: "POST",
			body: JSON.stringify(input),
		});
	});

	it("surfaces create invoice template failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "Template name already exists" }),
		} as unknown as Response);

		const input = {
			name: "Monthly tuition",
			dueDays: 14,
			lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1200, amount: 1200 }],
		};
		const { result } = renderHook(() => useCreateInvoiceTemplate(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync(input)).rejects.toThrow("Template name already exists");
	});

	it("updates invoice templates", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				invoiceTemplate: {
					id: "template-1",
					centerId: CENTER_ID,
					name: "Updated tuition",
				},
			}),
		);

		const input = { name: "Updated tuition", dueDays: 10 };
		const { result } = renderHook(() => useUpdateInvoiceTemplate(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync({ id: "template-1", input });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoice-templates/template-1", {
			method: "PATCH",
			body: JSON.stringify(input),
		});
	});

	it("falls back to default message when update invoice template error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useUpdateInvoiceTemplate(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ id: "template-1", input: { name: "Updated tuition" } }),
		).rejects.toThrow("Failed to update invoice template");
	});

	it("deletes invoice templates", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: true } as Response);

		const { result } = renderHook(() => useDeleteInvoiceTemplate(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync("template-1");
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoice-templates/template-1", {
			method: "DELETE",
		});
	});

	it("encodes invoice template ids before deleting", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: true } as Response);

		const { result } = renderHook(() => useDeleteInvoiceTemplate(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync("template/one");
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoice-templates/template%2Fone", {
			method: "DELETE",
		});
	});

	it("surfaces delete invoice template failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "Invoice template not found" }),
		} as unknown as Response);

		const { result } = renderHook(() => useDeleteInvoiceTemplate(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("template-1")).rejects.toThrow(
			"Invoice template not found",
		);
	});

	it("throws ZodError when useCreateInvoiceTemplate receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notATemplate: true }));
		const { result } = renderHook(() => useCreateInvoiceTemplate(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				name: "Test",
				dueDays: 14,
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1200, amount: 1200 }],
			}),
		).rejects.toThrow();
	});

	it("throws ZodError when useUpdateInvoiceTemplate receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notATemplate: true }));
		const { result } = renderHook(() => useUpdateInvoiceTemplate(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ id: "template-1", input: { name: "Updated" } }),
		).rejects.toThrow();
	});

	it("throws ZodError when useCreateInvoice receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ error: null }));
		const { result } = renderHook(() => useCreateInvoice(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				guardianId: "550e8400-e29b-41d4-a716-446655440001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1200, amount: 1200 }],
			}),
		).rejects.toThrow();
	});

	it("throws ZodError when useUpdateInvoice receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ noInvoice: true }));
		const { result } = renderHook(() => useUpdateInvoice(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ id: "invoice-1", input: { status: "sent" as const } }),
		).rejects.toThrow();
	});

	it("throws ZodError when useSendInvoice receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse(null));
		const { result } = renderHook(() => useSendInvoice(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("invoice-1")).rejects.toThrow();
	});

	it("throws ZodError when useRecordPayment receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ noPayment: true }));
		const { result } = renderHook(() => useRecordPayment(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				invoiceId: "550e8400-e29b-41d4-a716-446655440002",
				amount: 800,
				method: "card" as const,
				paidAt: "2026-04-15T10:00:00.000Z",
			}),
		).rejects.toThrow();
	});

	it("throws ZodError when useReversePayment receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ noPayment: true }));
		const { result } = renderHook(() => useReversePayment(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ id: "payment-1", input: { reason: "Duplicate" } }),
		).rejects.toThrow();
	});

	it("throws ZodError when useCreateSubsidyCase receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notACase: true }));
		const { result } = renderHook(() => useCreateSubsidyCase(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync(subsidyCaseInput)).rejects.toThrow();
	});

	it("throws ZodError when useUpdateSubsidyCase receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notACase: true }));
		const { result } = renderHook(() => useUpdateSubsidyCase(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ id: SUBSIDY_CASE_ID, input: { status: "expired" as const } }),
		).rejects.toThrow();
	});

	it("throws ZodError when useCreateSubsidyClaim receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ notAClaim: true }));
		const { result } = renderHook(() => useCreateSubsidyClaim(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync(subsidyClaimInput)).rejects.toThrow();
	});

	// Fix 1: subsidy-case mutations must also invalidate subsidyClaims
	it("createSubsidyCase also invalidates subsidyClaims cache", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				subsidyCase: {
					id: "case-new",
					centerId: "center-1",
					...subsidyCaseInput,
					status: "active",
					createdAt: "2026-04-01T00:00:00.000Z",
					updatedAt: "2026-04-01T00:00:00.000Z",
				},
			}),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useCreateSubsidyCase(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync(subsidyCaseInput);
		});

		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyClaims"] });
	});

	it("updateSubsidyCase also invalidates subsidyClaims cache", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				subsidyCase: {
					id: SUBSIDY_CASE_ID,
					centerId: "center-1",
					...subsidyCaseInput,
					status: "expired",
					createdAt: "2026-04-01T00:00:00.000Z",
					updatedAt: "2026-04-01T00:00:00.000Z",
				},
			}),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useUpdateSubsidyCase(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync({
				id: SUBSIDY_CASE_ID,
				input: { status: "expired" as const },
			});
		});

		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyClaims"] });
	});

	// Fix 2a: useUpdateSubsidyClaim hook
	const subsidyClaimUpdateInput = {
		amountApproved: 300,
		amountPaid: 300,
		status: "paid" as const,
		paidAt: "2026-05-01T00:00:00.000Z",
	};

	it("updates a subsidy claim and invalidates all three caches", async () => {
		const claimId = "claim-update-1";
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				subsidyClaim: {
					id: claimId,
					centerId: "center-1",
					...subsidyClaimInput,
					...subsidyClaimUpdateInput,
					createdAt: "2026-04-08T00:00:00.000Z",
					updatedAt: "2026-05-01T00:00:00.000Z",
				},
			}),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useUpdateSubsidyClaim(), { wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: claimId, input: subsidyClaimUpdateInput });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(
			`/api/subsidy-claims/${encodeURIComponent(claimId)}`,
			{ method: "PATCH", body: JSON.stringify(subsidyClaimUpdateInput) },
		);
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyClaims"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "subsidyCases"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "childSubsidySummary"] });
		expect(mockedToast.success).toHaveBeenCalledWith("Subsidy claim updated.");
	});

	it("returns parsed subsidyClaim from useUpdateSubsidyClaim", async () => {
		const claimId = "claim-update-2";
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				subsidyClaim: {
					id: claimId,
					centerId: "center-1",
					...subsidyClaimInput,
					status: "paid",
					createdAt: "2026-04-08T00:00:00.000Z",
					updatedAt: "2026-05-01T00:00:00.000Z",
				},
			}),
		} as Response);

		const { result } = renderHook(() => useUpdateSubsidyClaim(), { wrapper: createWrapper() });

		let returned: unknown;
		await act(async () => {
			returned = await result.current.mutateAsync({
				id: claimId,
				input: { status: "paid" as const },
			});
		});

		expect((returned as { id: string }).id).toBe(claimId);
	});

	it("surfaces update subsidy claim failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "claim_locked" }),
		} as unknown as Response);

		const { result } = renderHook(() => useUpdateSubsidyClaim(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ id: "claim-1", input: { status: "paid" as const } }),
		).rejects.toThrow("claim_locked");
		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("claim_locked"));
	});

	it("falls back to default message when update subsidy claim error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useUpdateSubsidyClaim(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ id: "claim-1", input: { status: "paid" as const } }),
		).rejects.toThrow("Failed to update subsidy claim");
	});

	it("deletes a draft invoice and invalidates the invoice caches", async () => {
		const invoiceId = "inv-draft-del-1";
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ deleted: true, id: invoiceId }),
		} as Response);

		const { wrapper, client } = createWrapperWithClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const { result } = renderHook(() => useDeleteInvoice(), { wrapper });

		await act(async () => {
			const data = await result.current.mutateAsync(invoiceId);
			expect(data).toEqual({ deleted: true, id: invoiceId });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
			method: "DELETE",
		});
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoiceSummary"] });
		expect(mockedToast.success).toHaveBeenCalledWith("Invoice deleted.");
	});

	it("encodes invoice ids with special characters before deleting", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ deleted: true, id: "inv/1" }),
		} as Response);

		const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync("inv/1");
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/invoices/inv%2F1", {
			method: "DELETE",
		});
	});

	it("surfaces delete invoice failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "invoice_locked" }),
		} as unknown as Response);

		const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("inv-1")).rejects.toThrow("invoice_locked");
		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("invoice_locked"));
	});

	it("falls back to default message when delete invoice error body is unavailable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockRejectedValue(new Error("no body")),
		} as unknown as Response);

		const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("inv-1")).rejects.toThrow("Failed to delete invoice");
	});

	it("throws ZodError when useDeleteInvoice receives a malformed response", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ deleted: false, id: "inv-1" }));
		const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync("inv-1")).rejects.toThrow();
	});

	it("tracks finance_action_completed for update_invoice on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ invoice: { id: "inv-1" } }));

		const { result } = renderHook(() => useUpdateInvoice(), { wrapper: createWrapper() });
		await act(async () => {
			await result.current.mutateAsync({ id: "inv-1", input: {} });
		});

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "billing",
			action: "update_invoice",
			result: "success",
		});
	});

	it("tracks finance_action_failed for update_invoice on error", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "not found" }),
		} as unknown as Response);

		const { result } = renderHook(() => useUpdateInvoice(), { wrapper: createWrapper() });
		await expect(result.current.mutateAsync({ id: "inv-1", input: {} })).rejects.toThrow();

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "billing",
			action: "update_invoice",
			result: "failed",
			error_code: "response_error",
		});
	});

	it("tracks finance_action_completed for delete_invoice on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ deleted: true, id: "inv-1" }));

		const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });
		await act(async () => {
			await result.current.mutateAsync("inv-1");
		});

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "billing",
			action: "delete_invoice",
			result: "success",
		});
	});

	it("tracks finance_action_failed for delete_invoice on error", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "locked" }),
		} as unknown as Response);

		const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });
		await expect(result.current.mutateAsync("inv-1")).rejects.toThrow();

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "billing",
			action: "delete_invoice",
			result: "failed",
			error_code: "response_error",
		});
	});

	it("tracks finance_action_completed for create_subsidy_case on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyCase: { id: "case-new" } }));

		const { result } = renderHook(() => useCreateSubsidyCase(), { wrapper: createWrapper() });
		await act(async () => {
			await result.current.mutateAsync({
				childId: CHILD_ID,
				agencyId: "agency-1",
				status: "active",
				effectiveDate: "2026-01-01",
			});
		});

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "subsidies",
			action: "create_subsidy_case",
			result: "success",
		});
	});

	it("tracks finance_action_failed for create_subsidy_case on error", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "bad" }),
		} as unknown as Response);

		const { result } = renderHook(() => useCreateSubsidyCase(), { wrapper: createWrapper() });
		await expect(
			result.current.mutateAsync({
				childId: CHILD_ID,
				agencyId: "agency-1",
				status: "active",
				effectiveDate: "2026-01-01",
			}),
		).rejects.toThrow();

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "subsidies",
			action: "create_subsidy_case",
			result: "failed",
			error_code: "response_error",
		});
	});

	it("tracks finance_action_completed for update_subsidy_case on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyCase: { id: "case-1" } }));

		const { result } = renderHook(() => useUpdateSubsidyCase(), { wrapper: createWrapper() });
		await act(async () => {
			await result.current.mutateAsync({ id: "case-1", input: { status: "expired" } });
		});

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "subsidies",
			action: "update_subsidy_case",
			result: "success",
		});
	});

	it("tracks finance_action_failed for update_subsidy_case on error", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "bad" }),
		} as unknown as Response);

		const { result } = renderHook(() => useUpdateSubsidyCase(), { wrapper: createWrapper() });
		await expect(
			result.current.mutateAsync({ id: "case-1", input: { status: "expired" } }),
		).rejects.toThrow();

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "subsidies",
			action: "update_subsidy_case",
			result: "failed",
			error_code: "response_error",
		});
	});

	it("tracks finance_action_completed for create_subsidy_claim on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyClaim: { id: "claim-new" } }));

		const { result } = renderHook(() => useCreateSubsidyClaim(), { wrapper: createWrapper() });
		await act(async () => {
			await result.current.mutateAsync({
				subsidyCaseId: SUBSIDY_CASE_ID,
				periodStart: "2026-01-01",
				periodEnd: "2026-01-31",
				amount: 500,
				status: "draft",
			});
		});

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "subsidies",
			action: "create_subsidy_claim",
			result: "success",
		});
	});

	it("tracks finance_action_failed for create_subsidy_claim on error", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "bad" }),
		} as unknown as Response);

		const { result } = renderHook(() => useCreateSubsidyClaim(), { wrapper: createWrapper() });
		await expect(
			result.current.mutateAsync({
				subsidyCaseId: SUBSIDY_CASE_ID,
				periodStart: "2026-01-01",
				periodEnd: "2026-01-31",
				amount: 500,
				status: "draft",
			}),
		).rejects.toThrow();

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "subsidies",
			action: "create_subsidy_claim",
			result: "failed",
			error_code: "response_error",
		});
	});

	it("tracks finance_action_completed for update_subsidy_claim on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ subsidyClaim: { id: "claim-1" } }));

		const { result } = renderHook(() => useUpdateSubsidyClaim(), { wrapper: createWrapper() });
		await act(async () => {
			await result.current.mutateAsync({ id: "claim-1", input: { status: "paid" as const } });
		});

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "subsidies",
			action: "update_subsidy_claim",
			result: "success",
		});
	});

	it("tracks finance_action_failed for update_subsidy_claim on error", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "locked" }),
		} as unknown as Response);

		const { result } = renderHook(() => useUpdateSubsidyClaim(), { wrapper: createWrapper() });
		await expect(
			result.current.mutateAsync({ id: "claim-1", input: { status: "paid" as const } }),
		).rejects.toThrow();

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "subsidies",
			action: "update_subsidy_claim",
			result: "failed",
			error_code: "response_error",
		});
	});

	it("tracks finance_action_completed for delete_subsidy_claim on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ deleted: true, id: "claim-del-1" }));

		const { result } = renderHook(() => useDeleteSubsidyClaim(), { wrapper: createWrapper() });
		await act(async () => {
			await result.current.mutateAsync("claim-del-1");
		});

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_completed", {
			feature_name: "subsidies",
			action: "delete_subsidy_claim",
			result: "success",
		});
	});

	it("tracks finance_action_failed for delete_subsidy_claim on error", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "locked" }),
		} as unknown as Response);

		const { result } = renderHook(() => useDeleteSubsidyClaim(), { wrapper: createWrapper() });
		await expect(result.current.mutateAsync("claim-del-1")).rejects.toThrow();

		expect(mockedTrack).toHaveBeenCalledWith("finance_action_failed", {
			feature_name: "subsidies",
			action: "delete_subsidy_claim",
			result: "failed",
			error_code: "response_error",
		});
	});
});
