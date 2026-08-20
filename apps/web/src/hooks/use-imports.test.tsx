import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
import {
	useImportChildren,
	useImportEnroll,
	useImportGuardians,
	useImportInvoices,
} from "./use-imports";

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
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

const CENTER_ID = "center-test";
const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);
const mockedToast = vi.mocked(toast);

function createResponse<T>(payload: T) {
	return {
		ok: true,
		status: 200,
		json: async () => payload,
	} as Response;
}

function createErrorResponse(payload: unknown = { error: "Server error" }) {
	return {
		ok: false,
		status: 500,
		json: async () => payload,
	} as Response;
}

function createWrapperWithClient() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return {
		client,
		Wrapper({ children }: { children: ReactNode }) {
			return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
		},
	};
}

const SAMPLE_CHILDREN_ROWS = [
	{
		firstName: "Alice",
		lastName: "Smith",
		dateOfBirth: "2021-03-15",
		ageGroup: "preschool",
		enrollmentStatus: "active",
		subsidyEligible: false,
	},
];

const SAMPLE_GUARDIANS_ROWS = [
	{ firstName: "Bob", lastName: "Smith", email: "bob@example.com", phone: "5551234567" },
];

const SAMPLE_INVOICES_ROWS = [
	{
		guardianId: "70000000-0000-0000-0000-000000000001",
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		status: "draft",
		lineItems: [
			{
				description: "Tuition",
				quantity: 1,
				unitPrice: 800,
				amount: 800,
			},
		],
		subtotal: 800,
		subsidyCredit: 0,
		amountDue: 800,
	},
];

const SAMPLE_ENROLL_ROWS = [
	{
		child: {
			firstName: "Carol",
			lastName: "Jones",
			dateOfBirth: "2022-06-01",
			ageGroup: "infant",
			enrollmentStatus: "active",
			subsidyEligible: false,
		},
		guardians: [
			{
				type: "new",
				firstName: "Dan",
				lastName: "Jones",
				isPrimary: true,
				authorizedPickup: true,
			},
		],
	},
];

beforeEach(() => {
	mockedApiFetch.mockReset();
	mockedTrack.mockReset();
	mockedToast.success.mockReset();
	mockedToast.error.mockReset();
	mockedToast.info.mockReset();
});

describe("useImportChildren", () => {
	it("posts rows to /api/imports/children and returns the API import summary", async () => {
		const result = {
			inserted: 1,
			updated: 0,
			skipped: 1,
			errors: [{ rowIndex: 2, message: "Duplicate child" }],
		};
		mockedApiFetch.mockResolvedValueOnce(createResponse(result));

		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const { result: hook } = renderHook(() => useImportChildren(), { wrapper: Wrapper });

		await act(async () => {
			await hook.current.mutateAsync({ rows: SAMPLE_CHILDREN_ROWS, dedupeStrategy: "skip" });
		});

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/imports/children", {
			method: "POST",
			body: JSON.stringify({ rows: SAMPLE_CHILDREN_ROWS, dedupeStrategy: "skip" }),
		});
		expect(hook.current.data).toEqual(result);
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(mockedToast.success).toHaveBeenCalledWith(expect.stringContaining("1 added"));
		expect(mockedToast.info).toHaveBeenCalledWith(
			expect.stringContaining("1 row could not be imported"),
		);
		expect(mockedTrack).toHaveBeenCalledWith("import_completed", {
			feature_name: "imports",
			action: "import_children",
			result: "success",
			import_type: "children",
			dedupe_strategy: "skip",
			inserted_count: 1,
			updated_count: 0,
			skipped_count: 1,
			error_count: 1,
			row_count_bucket: "1",
		});
	});

	it("throws and toasts when the response is not ok", async () => {
		mockedApiFetch.mockResolvedValueOnce(createErrorResponse({ error: "Boom" }));

		const { Wrapper } = createWrapperWithClient();
		const { result: hook } = renderHook(() => useImportChildren(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				hook.current.mutateAsync({ rows: SAMPLE_CHILDREN_ROWS, dedupeStrategy: "skip" }),
			).rejects.toThrow("Boom");
		});

		await waitFor(() => expect(hook.current.isError).toBe(true));
		expect(mockedToast.error).toHaveBeenCalledWith("Boom");
		expect(mockedTrack).toHaveBeenCalledWith("import_failed", {
			feature_name: "imports",
			action: "import_children",
			result: "failed",
			import_type: "children",
			dedupe_strategy: "skip",
			row_count_bucket: "1",
			error_code: "response_error",
		});
	});

	it("throws a Zod error when the server returns a malformed body", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ inserted: "lots", errors: [] }));

		const { Wrapper } = createWrapperWithClient();
		const { result: hook } = renderHook(() => useImportChildren(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				hook.current.mutateAsync({ rows: SAMPLE_CHILDREN_ROWS, dedupeStrategy: "skip" }),
			).rejects.toThrow();
		});

		await waitFor(() => expect(hook.current.isError).toBe(true));
		expect(mockedToast.error).toHaveBeenCalled();
	});

	it("announces 'no changes' when all counts are zero", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({ inserted: 0, updated: 0, skipped: 0, errors: [] }),
		);

		const { Wrapper } = createWrapperWithClient();
		const { result: hook } = renderHook(() => useImportChildren(), { wrapper: Wrapper });

		await act(async () => {
			await hook.current.mutateAsync({ rows: [], dedupeStrategy: "skip" });
		});

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));
		expect(mockedToast.success).toHaveBeenCalledWith(expect.stringContaining("no changes"));
		expect(mockedToast.info).not.toHaveBeenCalled();
	});

	it("buckets import row counts without sending exact large row totals", async () => {
		const cases = [
			{ count: 2, bucket: "2-10" },
			{ count: 11, bucket: "11-50" },
			{ count: 51, bucket: "51-100" },
			{ count: 101, bucket: "101-500" },
			{ count: 501, bucket: "501+" },
		];

		for (const { count, bucket } of cases) {
			mockedApiFetch.mockResolvedValueOnce(
				createResponse({ inserted: count, updated: 0, skipped: 0, errors: [] }),
			);

			const { Wrapper } = createWrapperWithClient();
			const { result: hook } = renderHook(() => useImportChildren(), { wrapper: Wrapper });
			const rows = Array.from({ length: count }, () => SAMPLE_CHILDREN_ROWS[0]);

			await act(async () => {
				await hook.current.mutateAsync({ rows, dedupeStrategy: "skip" });
			});

			expect(mockedTrack).toHaveBeenLastCalledWith(
				"import_completed",
				expect.objectContaining({
					row_count_bucket: bucket,
				}),
			);
		}
	});
});

describe("useImportGuardians", () => {
	it("posts rows to /api/imports/guardians and returns result", async () => {
		const result = { inserted: 1, updated: 2, skipped: 0, errors: [] };
		mockedApiFetch.mockResolvedValueOnce(createResponse(result));

		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const { result: hook } = renderHook(() => useImportGuardians(), { wrapper: Wrapper });

		await act(async () => {
			await hook.current.mutateAsync({ rows: SAMPLE_GUARDIANS_ROWS, dedupeStrategy: "skip" });
		});

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/imports/guardians", {
			method: "POST",
			body: JSON.stringify({ rows: SAMPLE_GUARDIANS_ROWS, dedupeStrategy: "skip" }),
		});
		expect(hook.current.data).toEqual(result);
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(mockedToast.success).toHaveBeenCalledWith(
			expect.stringMatching(/Guardians import: 1 added, 2 updated/),
		);
		expect(mockedTrack).toHaveBeenCalledWith("import_completed", {
			feature_name: "imports",
			action: "import_guardians",
			result: "success",
			import_type: "guardians",
			dedupe_strategy: "skip",
			inserted_count: 1,
			updated_count: 2,
			skipped_count: 0,
			error_count: 0,
			row_count_bucket: "1",
		});
	});

	it("throws and toasts when the response is not ok", async () => {
		mockedApiFetch.mockResolvedValueOnce(createErrorResponse());

		const { Wrapper } = createWrapperWithClient();
		const { result: hook } = renderHook(() => useImportGuardians(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				hook.current.mutateAsync({ rows: SAMPLE_GUARDIANS_ROWS, dedupeStrategy: "skip" }),
			).rejects.toThrow("Server error");
		});

		await waitFor(() => expect(hook.current.isError).toBe(true));
		expect(mockedToast.error).toHaveBeenCalledWith("Server error");
	});
});

describe("useImportInvoices", () => {
	it("posts rows to /api/imports/invoices and returns result", async () => {
		const result = { inserted: 1, updated: 0, skipped: 0, errors: [] };
		mockedApiFetch.mockResolvedValueOnce(createResponse(result));

		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const { result: hook } = renderHook(() => useImportInvoices(), { wrapper: Wrapper });

		await act(async () => {
			await hook.current.mutateAsync({ rows: SAMPLE_INVOICES_ROWS, dedupeStrategy: "skip" });
		});

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoices"] });
		// The dashboard overdue badge reads invoiceSummary; imported overdue invoices must refresh it.
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "invoiceSummary"] });
		expect(mockedToast.success).toHaveBeenCalled();
		expect(mockedTrack).toHaveBeenCalledWith("import_completed", {
			feature_name: "imports",
			action: "import_invoices",
			result: "success",
			import_type: "invoices",
			dedupe_strategy: "skip",
			inserted_count: 1,
			updated_count: 0,
			skipped_count: 0,
			error_count: 0,
			row_count_bucket: "1",
		});
	});

	it("throws and toasts when the response is not ok", async () => {
		mockedApiFetch.mockResolvedValueOnce(createErrorResponse());

		const { Wrapper } = createWrapperWithClient();
		const { result: hook } = renderHook(() => useImportInvoices(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				hook.current.mutateAsync({ rows: SAMPLE_INVOICES_ROWS, dedupeStrategy: "skip" }),
			).rejects.toThrow("Server error");
		});
		expect(mockedToast.error).toHaveBeenCalled();
	});
});

describe("useImportEnroll", () => {
	it("posts rows and invalidates children, guardians, classrooms", async () => {
		const result = { inserted: 1, updated: 0, skipped: 0, errors: [] };
		mockedApiFetch.mockResolvedValueOnce(createResponse(result));

		const { client, Wrapper } = createWrapperWithClient();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");
		const { result: hook } = renderHook(() => useImportEnroll(), { wrapper: Wrapper });

		await act(async () => {
			await hook.current.mutateAsync({ rows: SAMPLE_ENROLL_ROWS, dedupeStrategy: "skip" });
		});

		await waitFor(() => expect(hook.current.isSuccess).toBe(true));
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "children"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "guardians"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [CENTER_ID, "classrooms"] });
		expect(mockedToast.success).toHaveBeenCalled();
		expect(mockedTrack).toHaveBeenCalledWith("import_completed", {
			feature_name: "imports",
			action: "import_enrollment",
			result: "success",
			import_type: "enrollment",
			dedupe_strategy: "skip",
			inserted_count: 1,
			updated_count: 0,
			skipped_count: 0,
			error_count: 0,
			row_count_bucket: "1",
		});
	});

	it("throws and toasts when the response is not ok", async () => {
		mockedApiFetch.mockResolvedValueOnce(createErrorResponse());

		const { Wrapper } = createWrapperWithClient();
		const { result: hook } = renderHook(() => useImportEnroll(), { wrapper: Wrapper });

		await act(async () => {
			await expect(
				hook.current.mutateAsync({ rows: SAMPLE_ENROLL_ROWS, dedupeStrategy: "skip" }),
			).rejects.toThrow("Server error");
		});
		expect(mockedToast.error).toHaveBeenCalled();
	});
});
