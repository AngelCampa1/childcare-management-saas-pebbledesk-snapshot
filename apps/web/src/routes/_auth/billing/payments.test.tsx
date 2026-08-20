import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be before any import that transitively uses them.
// ---------------------------------------------------------------------------

const mockedUsePayments = vi.fn();
const mockedUseReversePayment = vi.fn();
const mockedUseAuthSession = vi.fn();

vi.mock("../../../hooks/use-finance", () => ({
	usePayments: (filters: unknown) => mockedUsePayments(filters),
	useReversePayment: () => mockedUseReversePayment(),
}));

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: () => mockedUseAuthSession(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: vi.fn(() => vi.fn(() => ({ component: vi.fn() }))),
	Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { BillingPaymentsPage } from "./payments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayment(
	overrides: Partial<{
		id: string;
		invoiceId: string;
		amount: number;
		method: string;
		provider: string;
		status: string;
		paidAt: string;
		reversedAt: string | null;
		centerId: string;
		createdAt: string;
	}> = {},
) {
	return {
		id: "pay-1",
		centerId: "center-1",
		invoiceId: "inv-1",
		amount: 500,
		method: "cash",
		provider: "manual",
		status: "posted",
		paidAt: "2026-03-15T10:00:00.000Z",
		reversedAt: null,
		createdAt: "2026-03-15T10:00:00.000Z",
		...overrides,
	};
}

function stubReverseMutation() {
	return {
		mutate: vi.fn(),
		mutateAsync: vi.fn().mockResolvedValue({}),
		isPending: false,
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	mockedUseAuthSession.mockReturnValue({
		data: {
			user: { id: "u-1" },
			membership: { centerId: "c-1", role: "owner" },
			center: { id: "c-1", timezone: "UTC" },
		},
	});
	mockedUseReversePayment.mockReturnValue(stubReverseMutation());
	mockedUsePayments.mockReturnValue({ data: [], isLoading: false });
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BillingPaymentsPage — filters passed to usePayments", () => {
	it("calls usePayments with empty filters object on initial render", () => {
		render(<BillingPaymentsPage />);
		expect(mockedUsePayments).toHaveBeenCalledWith({});
	});

	it("passes method filter to usePayments when a method button is clicked", () => {
		render(<BillingPaymentsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Cash" }));

		expect(mockedUsePayments).toHaveBeenCalledWith(expect.objectContaining({ method: "cash" }));
	});

	it("passes check method to usePayments when Check button is clicked", () => {
		render(<BillingPaymentsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Check" }));

		expect(mockedUsePayments).toHaveBeenCalledWith(expect.objectContaining({ method: "check" }));
	});

	it("does not include method in filters when All method button is clicked", () => {
		render(<BillingPaymentsPage />);

		// Select Cash then revert to All
		fireEvent.click(screen.getByRole("button", { name: "Cash" }));
		const allButtons = screen.getAllByRole("button", { name: "All" });
		const firstAllButton = allButtons[0];
		if (!firstAllButton) throw new Error("All button not found");
		fireEvent.click(firstAllButton);

		const lastCallArgs = mockedUsePayments.mock.calls[mockedUsePayments.mock.calls.length - 1];
		const lastArgs = (lastCallArgs?.[0] ?? {}) as Record<string, unknown>;
		expect(lastArgs).not.toHaveProperty("method");
	});

	it("passes status filter to usePayments when a status button is clicked", () => {
		render(<BillingPaymentsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Posted" }));

		expect(mockedUsePayments).toHaveBeenCalledWith(expect.objectContaining({ status: "posted" }));
	});

	it("passes reversed status to usePayments when Reversed button is clicked", () => {
		render(<BillingPaymentsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Reversed" }));

		expect(mockedUsePayments).toHaveBeenCalledWith(expect.objectContaining({ status: "reversed" }));
	});

	it("does not include status in filters when All status button is clicked", () => {
		render(<BillingPaymentsPage />);

		// Select Posted then revert to All
		fireEvent.click(screen.getByRole("button", { name: "Posted" }));
		const allButtons = screen.getAllByRole("button", { name: "All" });
		const secondAllButton = allButtons[1];
		if (!secondAllButton) throw new Error("All button not found");
		fireEvent.click(secondAllButton);

		const lastCallArgs = mockedUsePayments.mock.calls[mockedUsePayments.mock.calls.length - 1];
		const lastArgs = (lastCallArgs?.[0] ?? {}) as Record<string, unknown>;
		expect(lastArgs).not.toHaveProperty("status");
	});

	it("passes dateFrom filter to usePayments when date from input changes", () => {
		render(<BillingPaymentsPage />);

		fireEvent.change(screen.getByLabelText("Filter from date"), {
			target: { value: "2026-04-01" },
		});

		expect(mockedUsePayments).toHaveBeenCalledWith(
			expect.objectContaining({ dateFrom: "2026-04-01" }),
		);
	});

	it("passes dateTo filter to usePayments when date to input changes", () => {
		render(<BillingPaymentsPage />);

		fireEvent.change(screen.getByLabelText("Filter to date"), {
			target: { value: "2026-04-30" },
		});

		expect(mockedUsePayments).toHaveBeenCalledWith(
			expect.objectContaining({ dateTo: "2026-04-30" }),
		);
	});

	it("debounces search input — does not pass search to hook before 250ms", () => {
		render(<BillingPaymentsPage />);

		fireEvent.change(screen.getByPlaceholderText("Search by method, status, invoice…"), {
			target: { value: "INV-001" },
		});

		// Before debounce fires, search should NOT be in the filter
		const callsBeforeDebounce = mockedUsePayments.mock.calls.map(
			(c) => (c[0] as Record<string, unknown>).search,
		);
		expect(callsBeforeDebounce.every((s) => s === undefined)).toBe(true);
	});

	it("passes search to usePayments after 250ms debounce", () => {
		render(<BillingPaymentsPage />);

		fireEvent.change(screen.getByPlaceholderText("Search by method, status, invoice…"), {
			target: { value: "INV-001" },
		});

		act(() => {
			vi.advanceTimersByTime(250);
		});

		expect(mockedUsePayments).toHaveBeenCalledWith(expect.objectContaining({ search: "INV-001" }));
	});

	it("trims whitespace from search before passing to usePayments", () => {
		render(<BillingPaymentsPage />);

		fireEvent.change(screen.getByPlaceholderText("Search by method, status, invoice…"), {
			target: { value: "  ref-123  " },
		});

		act(() => {
			vi.advanceTimersByTime(250);
		});

		expect(mockedUsePayments).toHaveBeenCalledWith(expect.objectContaining({ search: "ref-123" }));
	});

	it("does not include search in filters when search is blank after trimming", () => {
		render(<BillingPaymentsPage />);

		fireEvent.change(screen.getByPlaceholderText("Search by method, status, invoice…"), {
			target: { value: "   " },
		});

		act(() => {
			vi.advanceTimersByTime(250);
		});

		const lastCallArgs = mockedUsePayments.mock.calls[mockedUsePayments.mock.calls.length - 1];
		const lastArgs = (lastCallArgs?.[0] ?? {}) as Record<string, unknown>;
		expect(lastArgs).not.toHaveProperty("search");
	});

	it("passes combined filters to usePayments when multiple filters are active", () => {
		render(<BillingPaymentsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Check" }));
		fireEvent.click(screen.getByRole("button", { name: "Posted" }));
		fireEvent.change(screen.getByLabelText("Filter from date"), {
			target: { value: "2026-01-01" },
		});
		fireEvent.change(screen.getByLabelText("Filter to date"), { target: { value: "2026-12-31" } });

		expect(mockedUsePayments).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "check",
				status: "posted",
				dateFrom: "2026-01-01",
				dateTo: "2026-12-31",
			}),
		);
	});
});

describe("BillingPaymentsPage — UI rendering", () => {
	it("renders loading skeleton and hides filter UI while loading", () => {
		mockedUsePayments.mockReturnValue({ data: undefined, isLoading: true });
		render(<BillingPaymentsPage />);
		expect(screen.queryByText("Payments")).not.toBeInTheDocument();
	});

	it("renders payment rows when data is available", () => {
		mockedUsePayments.mockReturnValue({
			data: [makePayment()],
			isLoading: false,
		});
		render(<BillingPaymentsPage />);
		expect(screen.getByText("Payment history")).toBeInTheDocument();
		expect(screen.getByText("Received Mar 15, 2026")).toBeInTheDocument();
		expect(screen.getByText("$500.00")).toBeInTheDocument();
	});

	it("shows the no-data empty state when no payments exist and no filters are active", () => {
		mockedUsePayments.mockReturnValue({ data: [], isLoading: false });
		render(<BillingPaymentsPage />);
		expect(screen.getByText("Payments will land here once families settle up")).toBeInTheDocument();
	});

	it("shows no-results empty state when filters are active but server returned no data", () => {
		mockedUsePayments.mockReturnValue({ data: [], isLoading: false });
		render(<BillingPaymentsPage />);

		// Activate a filter so hasActiveFilters is true
		fireEvent.click(screen.getByRole("button", { name: "Cash" }));

		expect(screen.getByText("No payments match your filters")).toBeInTheDocument();
	});

	it("shows result count badge when filters are active", () => {
		mockedUsePayments.mockReturnValue({
			data: [makePayment()],
			isLoading: false,
		});
		render(<BillingPaymentsPage />);

		// No filters active — count label should not appear
		expect(screen.queryByText(/matching filters/)).not.toBeInTheDocument();

		// Activate any filter
		fireEvent.click(screen.getByRole("button", { name: "Posted" }));

		expect(screen.getByText(/1 result matching filters/)).toBeInTheDocument();
	});

	it("Export CSV button is disabled when payment list is empty", () => {
		mockedUsePayments.mockReturnValue({ data: [], isLoading: false });
		render(<BillingPaymentsPage />);

		expect(screen.getByLabelText("Export CSV")).toBeDisabled();
	});

	it("Export CSV button is enabled when payments are present", () => {
		mockedUsePayments.mockReturnValue({
			data: [makePayment()],
			isLoading: false,
		});
		render(<BillingPaymentsPage />);

		expect(screen.getByLabelText("Export CSV")).not.toBeDisabled();
	});

	it("Export CSV downloads a CSV file with the current payment list", () => {
		mockedUsePayments.mockReturnValue({
			data: [makePayment({ id: "pay-1", invoiceId: "inv-1" })],
			isLoading: false,
		});

		const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
		const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

		render(<BillingPaymentsPage />);

		const clickSpy = vi.fn();
		const realAppendChild = document.body.appendChild.bind(document.body);
		const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
			if (node instanceof HTMLAnchorElement) {
				Object.defineProperty(node, "click", { value: clickSpy, configurable: true });
				return realAppendChild(node);
			}
			return realAppendChild(node);
		});

		fireEvent.click(screen.getByLabelText("Export CSV"));

		expect(createObjectURL).toHaveBeenCalledOnce();
		const blob: Blob = createObjectURL.mock.calls[0]?.[0] as Blob;
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.type).toBe("text/csv;charset=utf-8;");
		expect(clickSpy).toHaveBeenCalledOnce();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");

		appendChildSpy.mockRestore();
		createObjectURL.mockRestore();
		revokeObjectURL.mockRestore();
	});

	it("names the exported CSV using the center timezone's date, not UTC", () => {
		// 2026-03-02T23:30:00Z is still Mar 2 in UTC but already Mar 3 in the
		// far-ahead center timezone Kiritimati (UTC+14). The audit export filename
		// must reflect the center's calendar day.
		vi.setSystemTime(new Date("2026-03-02T23:30:00.000Z"));
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "u-1" },
				membership: { centerId: "c-1", role: "owner" },
				center: { id: "c-1", timezone: "Pacific/Kiritimati" },
			},
		});
		mockedUsePayments.mockReturnValue({
			data: [makePayment({ id: "pay-1", invoiceId: "inv-1" })],
			isLoading: false,
		});

		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

		render(<BillingPaymentsPage />);

		let downloadName: string | null = null;
		const realAppendChild = document.body.appendChild.bind(document.body);
		const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
			if (node instanceof HTMLAnchorElement) {
				downloadName = node.getAttribute("download");
				Object.defineProperty(node, "click", { value: vi.fn(), configurable: true });
			}
			return realAppendChild(node);
		});

		fireEvent.click(screen.getByLabelText("Export CSV"));

		expect(downloadName).toBe("payments-2026-03-03.csv");

		appendChildSpy.mockRestore();
	});

	it("clear filters button resets all filter state", () => {
		mockedUsePayments.mockReturnValue({ data: [], isLoading: false });
		render(<BillingPaymentsPage />);

		// Activate a filter so the no-results state with clear button appears
		fireEvent.click(screen.getByRole("button", { name: "Cash" }));

		const clearButton = screen.getByRole("button", { name: /clear filters/i });
		fireEvent.click(clearButton);

		act(() => {
			vi.advanceTimersByTime(250);
		});

		// After clearing, usePayments should be called with empty filters
		expect(mockedUsePayments).toHaveBeenCalledWith({});
	});
});

// ---------------------------------------------------------------------------
// Audit fix #36 — formatShortDate uses center timezone
// ---------------------------------------------------------------------------

describe("BillingPaymentsPage — date formatted with center timezone (#36)", () => {
	it("formats payment date using center timezone (UTC)", () => {
		mockedUsePayments.mockReturnValue({
			data: [makePayment({ paidAt: "2026-03-15T10:00:00.000Z" })],
			isLoading: false,
		});
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "u-1" },
				membership: { centerId: "c-1", role: "owner" },
				center: { id: "c-1", timezone: "UTC" },
			},
		});

		render(<BillingPaymentsPage />);
		expect(screen.getByText("Received Mar 15, 2026")).toBeInTheDocument();
	});

	it("formats payment date using center timezone (America/New_York) — date stays same for midday UTC", () => {
		// 2026-03-15T15:00:00.000Z = 11:00 AM Eastern (UTC-4 in March DST)
		mockedUsePayments.mockReturnValue({
			data: [makePayment({ paidAt: "2026-03-15T15:00:00.000Z" })],
			isLoading: false,
		});
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "u-1" },
				membership: { centerId: "c-1", role: "owner" },
				center: { id: "c-1", timezone: "America/New_York" },
			},
		});

		render(<BillingPaymentsPage />);
		// 15:00 UTC in New York (UTC-4 in March) is 11:00 AM, still Mar 15
		expect(screen.getByText("Received Mar 15, 2026")).toBeInTheDocument();
	});

	it("formats payment date using center timezone — midnight UTC may differ by timezone", () => {
		// 2026-03-15T02:00:00.000Z = still Mar 14 in US/Pacific (UTC-7 in March)
		mockedUsePayments.mockReturnValue({
			data: [makePayment({ paidAt: "2026-03-15T02:00:00.000Z" })],
			isLoading: false,
		});
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "u-1" },
				membership: { centerId: "c-1", role: "owner" },
				center: { id: "c-1", timezone: "America/Los_Angeles" },
			},
		});

		render(<BillingPaymentsPage />);
		// 02:00 UTC = 19:00 (7 PM) on Mar 14 in Pacific time (UTC-7)
		expect(screen.getByText("Received Mar 14, 2026")).toBeInTheDocument();
	});

	it("falls back to UTC when session is not yet loaded", () => {
		mockedUsePayments.mockReturnValue({
			data: [makePayment({ paidAt: "2026-03-15T12:00:00.000Z" })],
			isLoading: false,
		});
		mockedUseAuthSession.mockReturnValue({ data: undefined });

		render(<BillingPaymentsPage />);
		expect(screen.getByText("Received Mar 15, 2026")).toBeInTheDocument();
	});

	it("shows error box and Try again button instead of empty state when usePayments errors", () => {
		const refetch = vi.fn();
		mockedUsePayments.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch,
		});

		render(<BillingPaymentsPage />);

		expect(
			screen.queryByText("Payments will land here once families settle up"),
		).not.toBeInTheDocument();
		expect(screen.getByText("Failed to load payments.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});
});
