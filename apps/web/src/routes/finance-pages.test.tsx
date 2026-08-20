import { useQuery } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pebbledesk/ui/components/select", async () => {
	const React = await import("react");

	type SelectCtx = {
		value?: string;
		onChange?: (v: string) => void;
		options: { value: string; label: ReactNode }[];
		addOption: (value: string, label: ReactNode) => void;
		triggerId?: string;
		setTriggerId: (id: string) => void;
	};

	const SelectContext = React.createContext<SelectCtx>({
		options: [],
		addOption: () => {},
		setTriggerId: () => {},
	});

	return {
		Select: ({
			children,
			value,
			onValueChange,
		}: {
			children: ReactNode;
			value?: string;
			onValueChange?: (value: string) => void;
		}) => {
			const [options, setOptions] = React.useState<{ value: string; label: ReactNode }[]>([]);
			const [triggerId, setTriggerId] = React.useState<string | undefined>();
			const addOption = React.useCallback((v: string, label: ReactNode) => {
				setOptions((prev) => {
					if (prev.some((o) => o.value === v)) return prev;
					return [...prev, { value: v, label }];
				});
			}, []);
			return (
				<SelectContext.Provider
					value={{ value, onChange: onValueChange, options, addOption, triggerId, setTriggerId }}
				>
					{children}
				</SelectContext.Provider>
			);
		},
		SelectTrigger: ({
			children: _children,
			id,
			"aria-label": ariaLabel,
		}: {
			children?: ReactNode;
			id?: string;
			className?: string;
			"aria-label"?: string;
		}) => {
			const ctx = React.useContext(SelectContext);
			React.useEffect(() => {
				if (id) ctx.setTriggerId(id);
			}, [id, ctx]);
			return (
				<select
					id={id}
					aria-label={ariaLabel}
					value={ctx.value ?? ""}
					onChange={(e) => ctx.onChange?.(e.target.value)}
				>
					<option value="">--</option>
					{ctx.options.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			);
		},
		SelectValue: ({ placeholder: _p }: { placeholder?: string }) => null,
		SelectContent: ({ children }: { children: ReactNode }) => (
			<div style={{ display: "none" }}>{children}</div>
		),
		SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
			const ctx = React.useContext(SelectContext);
			React.useEffect(() => {
				ctx.addOption(value, children);
			}, [value, children, ctx]);
			return null;
		},
	};
});

import { apiFetch } from "../api";
import {
	useCreateInvoice,
	useInvoices,
	useInvoiceTemplateDetail,
	useInvoiceTemplates,
	usePayments,
	useRecordPayment,
	useReversePayment,
	useSendInvoice,
	useSubsidyCases,
	useSubsidyClaims,
	useUpdateInvoice,
} from "../hooks/use-finance";
import { useGuardians } from "../hooks/use-guardians";
import {
	useApproveQuickBooksReconciliation,
	useDisconnectQuickBooks,
	useDismissQuickBooksReconciliation,
	useQuickBooksReconciliation,
	useQuickBooksStatus,
	useQuickBooksSyncHistory,
	useRunQuickBooksSync,
	useStartQuickBooksConnect,
} from "../hooks/use-quickbooks";
import {
	useStartStripeConnectOnboarding,
	useStripeConnectStatus,
} from "../hooks/use-stripe-connect";
import { BillingPage } from "./_auth/billing/index";
import { BillingPaymentsPage } from "./_auth/billing/payments";
import { SettingsPage } from "./_auth/settings";
import { SubsidiesPage } from "./_auth/subsidies/index";
import { PayPage, Route as PayRoute } from "./pay/$token";

vi.mock("../hooks/use-finance", () => ({
	useInvoices: vi.fn(),
	usePayments: vi.fn(),
	useSubsidyCases: vi.fn(),
	useSubsidyClaims: vi.fn(),
	useCreateInvoice: vi.fn(),
	useUpdateInvoice: vi.fn(),
	useDeleteInvoice: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useSendInvoice: vi.fn(),
	useRecordPayment: vi.fn(),
	useReversePayment: vi.fn(),
	useInvoiceTemplates: vi.fn(() => ({ data: [], isLoading: false })),
	useInvoiceTemplateDetail: vi.fn(() => ({ data: undefined, isLoading: false })),
	useCreateSubsidyCase: vi.fn(() => ({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	useCreateSubsidyClaim: vi.fn(() => ({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	useUpdateSubsidyCase: vi.fn(() => ({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	useSubmitSubsidyClaim: vi.fn(() => ({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	useDeleteSubsidyClaim: vi.fn(() => ({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	useUpdateSubsidyClaim: vi.fn(() => ({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	})),
}));

vi.mock("../hooks/use-children", () => ({
	useChildren: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("../hooks/use-guardians", () => ({
	useGuardians: vi.fn(),
}));

vi.mock("../hooks/use-members", () => ({
	useMembers: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
	useInviteMember: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
	useRemoveMember: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("../hooks/use-center", () => ({
	useCurrentCenter: vi.fn(() => ({ data: null, isLoading: false })),
	useUpdateCenter: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({
		data: {
			user: { id: "u-1", name: "E2E" },
			membership: { id: "m-1", centerId: "center-1", role: "owner" },
			center: {
				id: "center-1",
				name: "Sunshine",
				state: "TX",
				timezone: "America/Chicago",
				subscriptionPlan: "center_pro",
				subscriptionStatus: "active",
			},
			classroomIds: [],
		},
	})),
}));

vi.mock("../hooks/use-subscription", () => ({
	useOpenBillingPortal: vi.fn(() => ({
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	useStartCheckout: vi.fn(() => ({
		mutateAsync: vi.fn(),
		isPending: false,
	})),
	useTrialFeatureUsage: vi.fn(() => ({ data: { usedFeatures: [] } })),
	useSubscriptionStatus: vi.fn(() => ({ data: undefined })),
}));

vi.mock("../hooks/use-stripe-connect", () => ({
	useStripeConnectStatus: vi.fn(),
	useStartStripeConnectOnboarding: vi.fn(),
}));

vi.mock("../components/plan-picker", () => ({
	PlanPicker: () => <div data-testid="plan-picker">Plan Picker</div>,
}));

vi.mock("../hooks/use-quickbooks", () => ({
	useQuickBooksStatus: vi.fn(),
	useQuickBooksSyncHistory: vi.fn(),
	useQuickBooksReconciliation: vi.fn(),
	useStartQuickBooksConnect: vi.fn(),
	useDisconnectQuickBooks: vi.fn(),
	useRunQuickBooksSync: vi.fn(),
	useApproveQuickBooksReconciliation: vi.fn(),
	useDismissQuickBooksReconciliation: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-query")>()),
	useQuery: vi.fn(),
}));

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

const navigateFn = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: vi.fn(() =>
		vi.fn(() => ({
			component: vi.fn(),
			useSearch: vi.fn(() => ({ quickbooks: undefined, reason: undefined })),
			useParams: vi.fn(() => ({})),
		})),
	),
	useNavigate: () => navigateFn,
	redirect: vi.fn(),
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		const href = to === "/pay/$token" && params?.token ? `/pay/${params.token}` : to;
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

const mockedUseSubsidyCases = vi.mocked(useSubsidyCases);
const mockedUseSubsidyClaims = vi.mocked(useSubsidyClaims);
const mockedUseInvoices = vi.mocked(useInvoices);
const mockedUsePayments = vi.mocked(usePayments);
const mockedUseGuardians = vi.mocked(useGuardians);
const mockedUseCreateInvoice = vi.mocked(useCreateInvoice);
const mockedUseUpdateInvoice = vi.mocked(useUpdateInvoice);
const mockedUseSendInvoice = vi.mocked(useSendInvoice);
const mockedUseRecordPayment = vi.mocked(useRecordPayment);
const mockedUseReversePayment = vi.mocked(useReversePayment);
const mockedUseInvoiceTemplates = vi.mocked(useInvoiceTemplates);
const mockedUseInvoiceTemplateDetail = vi.mocked(useInvoiceTemplateDetail);
const mockedUseStripeConnectStatus = vi.mocked(useStripeConnectStatus);
const mockedUseStartStripeConnectOnboarding = vi.mocked(useStartStripeConnectOnboarding);
const mockedUseQuery = vi.mocked(useQuery);
const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseQuickBooksStatus = vi.mocked(useQuickBooksStatus);
const mockedUseQuickBooksSyncHistory = vi.mocked(useQuickBooksSyncHistory);
const mockedUseQuickBooksReconciliation = vi.mocked(useQuickBooksReconciliation);
const mockedUseStartQuickBooksConnect = vi.mocked(useStartQuickBooksConnect);
const mockedUseDisconnectQuickBooks = vi.mocked(useDisconnectQuickBooks);
const mockedUseRunQuickBooksSync = vi.mocked(useRunQuickBooksSync);
const mockedUseApproveQuickBooksReconciliation = vi.mocked(useApproveQuickBooksReconciliation);
const mockedUseDismissQuickBooksReconciliation = vi.mocked(useDismissQuickBooksReconciliation);

function createMutationSpy() {
	return {
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);
	mockedUseCreateInvoice.mockReturnValue(createMutationSpy() as never);
	mockedUseUpdateInvoice.mockReturnValue(createMutationSpy() as never);
	mockedUseSendInvoice.mockReturnValue(createMutationSpy() as never);
	mockedUseRecordPayment.mockReturnValue(createMutationSpy() as never);
	mockedUseReversePayment.mockReturnValue(createMutationSpy() as never);
	mockedUseStripeConnectStatus.mockReturnValue({
		data: { stripeAccountId: "acct_test", stripeAccountStatus: "connected" },
		isLoading: false,
		isError: false,
	} as never);
	mockedUseStartStripeConnectOnboarding.mockReturnValue(createMutationSpy() as never);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function createQuickBooksMutationSpy() {
	return {
		mutate: vi.fn(),
		isPending: false,
	};
}

describe("finance routes", () => {
	it("renders the subsidies page with summary data", () => {
		mockedUseSubsidyCases.mockReturnValue({
			data: [
				{
					id: "case-1",
					centerId: "center-1",
					childId: "child-1",
					program: "ccdf",
					caseNumber: "CASE-123",
					agencyName: "County Services",
					authorizedHoursWeekly: 32,
					rateDaily: 45,
					effectiveDate: "2026-01-01",
					status: "active",
					createdAt: "2026-01-01T12:00:00.000Z",
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		});
		mockedUseSubsidyClaims.mockReturnValue({
			data: [
				{
					id: "claim-1",
					centerId: "center-1",
					subsidyCaseId: "case-1",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-07",
					daysAttended: 5,
					hoursAttended: 24,
					amountClaimed: 300,
					status: "submitted",
					createdAt: "2026-02-07T12:00:00.000Z",
					updatedAt: "2026-02-07T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<SubsidiesPage />);

		expect(screen.getByText("Subsidies")).toBeInTheDocument();
		expect(screen.getByText("CASE-123")).toBeInTheDocument();
		expect(screen.getByText("Submitted claims")).toBeInTheDocument();
		expect(screen.getByText("CCDF / Effective Jan 1, 2026")).toBeInTheDocument();
		expect(
			screen.getByText("Latest claim: Feb 1, 2026 - Feb 7, 2026 / $300.00"),
		).toBeInTheDocument();
	});

	it("renders the subsidies loading state", () => {
		mockedUseSubsidyCases.mockReturnValue({
			data: undefined,
			isLoading: true,
		});
		mockedUseSubsidyClaims.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		render(<SubsidiesPage />);

		expect(screen.queryByText("Subsidy cases")).not.toBeInTheDocument();
	});

	it("renders the subsidies empty state", () => {
		mockedUseSubsidyCases.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseSubsidyClaims.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<SubsidiesPage />);

		expect(screen.getByText("No subsidy cases yet")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Start your first subsidy case so claims, balances, and audit history live in one place. Begin by reviewing children who may qualify.",
			),
		).toBeInTheDocument();
		expect(screen.getAllByRole("link", { name: "Review subsidy roster" })).toHaveLength(2);
		for (const link of screen.getAllByRole("link", { name: "Review subsidy roster" })) {
			expect(link).toHaveAttribute("href", "/children");
		}
		// Zero-value stat cards remain visible because zero is informative.
		expect(screen.getByText("Active cases")).toBeInTheDocument();
		expect(screen.getByText("Submitted claims")).toBeInTheDocument();
		expect(screen.getByText("Paid claims")).toBeInTheDocument();
	});

	it("renders the billing page with public pay links", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "guardian-1",
					centerId: "center-1",
					firstName: "Elena",
					lastName: "Lopez",
					email: "elena@example.com",
					phone: "5125550111",
					relationshipToChild: null,
					createdAt: "2026-02-20T12:00:00.000Z",
					updatedAt: "2026-02-20T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [
				{
					id: "invoice-1",
					centerId: "center-1",
					guardianId: "guardian-1",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-28",
					status: "sent",
					subtotal: 1000,
					subsidyCredit: 200,
					amountDue: 800,
					publicLinkToken: "token-123",
					publicPayToken: "signed-token-123.signature",
					publicLinkVersion: 1,
					createdAt: "2026-02-28T12:00:00.000Z",
					updatedAt: "2026-02-28T12:00:00.000Z",
				},
				{
					id: "invoice-2",
					centerId: "center-1",
					guardianId: "guardian-2",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-28",
					status: "paid",
					subtotal: 500,
					subsidyCredit: 0,
					amountDue: 500,
					publicPayToken: "signed-token-456.signature",
					publicLinkVersion: 1,
					createdAt: "2026-02-28T12:00:00.000Z",
					updatedAt: "2026-02-28T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<BillingPage />);

		expect(screen.getByText("Billing")).toBeInTheDocument();
		expect(screen.getByText("Elena Lopez")).toBeInTheDocument();
		expect(screen.getByText("Family account")).toBeInTheDocument();
		expect(screen.getAllByText("Invoice for Feb 1, 2026 - Feb 28, 2026")).toHaveLength(2);
		expect(screen.getByText("Open pay link")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open pay link" })).toHaveAttribute(
			"href",
			"/pay/signed-token-123.signature",
		);
		expect(screen.getAllByText("$800.00")).toHaveLength(2);
		expect(screen.getAllByRole("link", { name: "Open pay link" })).toHaveLength(1);
		expect(screen.queryByText("invoice-1")).not.toBeInTheDocument();
		expect(screen.queryByText("Guardian guardian-1")).not.toBeInTheDocument();
	});

	it("uses semantic text tokens in the billing header", () => {
		mockedUseInvoices.mockReturnValue({
			data: [],
			isLoading: false,
		});

		const { container } = render(<BillingPage />);
		const heading = screen.getByRole("heading", { name: "Billing" });
		const summary = screen.getByText(
			"Review invoices and open the payment link for families who need it.",
		);

		expect(heading.className).toContain("text-foreground");
		expect(summary.className).toContain("text-muted-foreground");
		expect(container.innerHTML).not.toMatch(/text-gray-\d{2,3}/);
	});

	it("excludes draft invoices from open totals and outstanding balance", () => {
		mockedUseInvoices.mockReturnValue({
			data: [
				{
					id: "invoice-draft",
					centerId: "center-1",
					guardianId: "guardian-1",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-28",
					status: "draft",
					subtotal: 400,
					subsidyCredit: 0,
					amountDue: 400,
					publicPayToken: null,
					publicLinkVersion: 1,
					createdAt: "2026-02-10T12:00:00.000Z",
					updatedAt: "2026-02-10T12:00:00.000Z",
				},
				{
					id: "invoice-sent",
					centerId: "center-1",
					guardianId: "guardian-1",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-28",
					status: "sent",
					subtotal: 600,
					subsidyCredit: 0,
					amountDue: 600,
					publicPayToken: "signed-token-789.signature",
					publicLinkVersion: 1,
					createdAt: "2026-02-28T12:00:00.000Z",
					updatedAt: "2026-02-28T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<BillingPage />);

		const openInvoicesCard = screen.getByText("Open invoices").closest(".rounded-xl");
		const outstandingBalanceCard = screen.getByText("Outstanding balance").closest(".rounded-xl");

		expect(openInvoicesCard).toHaveTextContent("1");
		expect(outstandingBalanceCard).toHaveTextContent("$600.00");
		expect(screen.queryByText("$1,000.00")).not.toBeInTheDocument();
		expect(screen.getAllByText("Invoice for Feb 1, 2026 - Feb 28, 2026")).toHaveLength(2);
	});

	it("renders the billing loading state", () => {
		mockedUseInvoices.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		render(<BillingPage />);

		expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
	});

	it("renders the billing empty state", () => {
		mockedUseInvoices.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<BillingPage />);

		expect(screen.getByText("No money in motion yet")).toBeInTheDocument();
		expect(
			screen.getByText(
				"We'll show open balances here as soon as you send your first invoice. Start with a draft invoice, then connect payment tools when you're ready.",
			),
		).toBeInTheDocument();
		expect(screen.getAllByRole("link", { name: "Open billing setup" })).toHaveLength(2);
		for (const link of screen.getAllByRole("link", { name: "Open billing setup" })) {
			expect(link).toHaveAttribute("href", "/settings");
		}
		// Zero-value stat cards are always visible — zero is informative
		expect(screen.getByText("Open invoices")).toBeInTheDocument();
		expect(screen.getByText("Outstanding balance")).toBeInTheDocument();
		// The "0 total" invoice header pill renders muted so zero counts do not
		// masquerade as a warning.
		const zeroPill = screen.getByText(/0 total/).closest("div");
		expect(zeroPill?.className).toContain("bg-muted");
		expect(zeroPill?.className).toContain("text-muted-foreground");
	});

	it("renders the payment history page", () => {
		mockedUsePayments.mockReturnValue({
			data: [
				{
					id: "payment-1",
					centerId: "center-1",
					invoiceId: "invoice-1",
					amount: 800,
					method: "card",
					provider: "manual",
					status: "posted",
					paidAt: "2026-02-28T12:00:00.000Z",
					reversedAt: null,
					createdAt: "2026-02-28T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<BillingPaymentsPage />);

		expect(screen.getByText("Payment history")).toBeInTheDocument();
		expect(screen.getByText("Received Feb 28, 2026")).toBeInTheDocument();
		expect(screen.getByText("Applied to an open invoice")).toBeInTheDocument();
		expect(screen.getByText("$800.00")).toBeInTheDocument();
		expect(screen.queryByText("payment-1")).not.toBeInTheDocument();
		expect(screen.queryByText("Invoice invoice-1")).not.toBeInTheDocument();
	});

	it("reverses a posted manual payment with a required reason", async () => {
		const reverseMutation = createMutationSpy();
		reverseMutation.mutateAsync.mockResolvedValue({
			id: "payment-1",
			status: "reversed",
		});
		mockedUseReversePayment.mockReturnValue(reverseMutation as never);
		mockedUsePayments.mockReturnValue({
			data: [
				{
					id: "payment-1",
					centerId: "center-1",
					invoiceId: "invoice-1",
					amount: 800,
					method: "card",
					provider: "manual",
					status: "posted",
					paidAt: "2026-02-28T12:00:00.000Z",
					reversedAt: null,
					createdAt: "2026-02-28T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<BillingPaymentsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Reverse payment from Feb 28, 2026" }));
		fireEvent.click(screen.getByRole("button", { name: "Reverse payment" }));
		expect(screen.getByRole("alert")).toHaveTextContent("Enter a reason before reversing.");

		fireEvent.change(screen.getByLabelText("Reason"), {
			target: { value: "Duplicate entry" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reverse payment" }));

		await waitFor(() => {
			expect(reverseMutation.mutateAsync).toHaveBeenCalledWith({
				id: "payment-1",
				input: { reason: "Duplicate entry" },
			});
		});
	});

	it("shows reverse payment failures and lets directors cancel the dialog", async () => {
		const reverseMutation = createMutationSpy();
		reverseMutation.mutateAsync.mockRejectedValue(new Error("PAYMENT_ALREADY_REVERSED"));
		mockedUseReversePayment.mockReturnValue(reverseMutation as never);
		mockedUsePayments.mockReturnValue({
			data: [
				{
					id: "payment-1",
					centerId: "center-1",
					invoiceId: "invoice-1",
					amount: 800,
					method: "card",
					provider: "manual",
					status: "posted",
					paidAt: "2026-02-28T12:00:00.000Z",
					reversedAt: null,
					createdAt: "2026-02-28T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<BillingPaymentsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Reverse payment from Feb 28, 2026" }));
		fireEvent.change(screen.getByLabelText("Reason"), {
			target: { value: "Duplicate entry" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Reverse payment" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("PAYMENT_ALREADY_REVERSED");
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => {
			expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		});
		fireEvent.click(screen.getByRole("button", { name: "Reverse payment from Feb 28, 2026" }));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Reason")).toHaveValue("");
	});

	it("keeps reversed payments visible without another reverse action", () => {
		mockedUsePayments.mockReturnValue({
			data: [
				{
					id: "payment-1",
					centerId: "center-1",
					invoiceId: "invoice-1",
					amount: 800,
					method: "card",
					provider: "manual",
					status: "reversed",
					paidAt: "2026-02-28T12:00:00.000Z",
					reversedAt: "2026-03-01T12:00:00.000Z",
					createdAt: "2026-02-28T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<BillingPaymentsPage />);

		expect(screen.getByText("Reversed Mar 1, 2026")).toBeInTheDocument();
		// "Reversed" appears in both the payment status badge and the status-filter button
		expect(screen.getAllByText("Reversed").length).toBeGreaterThanOrEqual(1);
		expect(screen.queryByRole("button", { name: /Reverse payment from/ })).not.toBeInTheDocument();
	});

	it("does not offer local reversal for provider-managed payments", () => {
		mockedUsePayments.mockReturnValue({
			data: [
				{
					id: "payment-1",
					centerId: "center-1",
					invoiceId: "invoice-1",
					amount: 800,
					method: "card",
					provider: "stripe",
					status: "posted",
					paidAt: "2026-02-28T12:00:00.000Z",
					reversedAt: null,
					createdAt: "2026-02-28T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<BillingPaymentsPage />);

		expect(screen.queryByRole("button", { name: /Reverse payment from/ })).not.toBeInTheDocument();
		expect(screen.getByText("Managed in Stripe")).toBeInTheDocument();
	});

	it("labels QuickBooks-managed payments without a local reverse action", () => {
		mockedUsePayments.mockReturnValue({
			data: [
				{
					id: "payment-1",
					centerId: "center-1",
					invoiceId: "invoice-1",
					amount: 800,
					method: "ach",
					provider: "quickbooks",
					status: "posted",
					paidAt: "2026-02-28T12:00:00.000Z",
					reversedAt: null,
					createdAt: "2026-02-28T12:00:00.000Z",
				},
			],
			isLoading: false,
		});

		render(<BillingPaymentsPage />);

		expect(screen.queryByRole("button", { name: /Reverse payment from/ })).not.toBeInTheDocument();
		expect(screen.getByText("Managed in QuickBooks")).toBeInTheDocument();
	});

	it("renders the payment loading state", () => {
		mockedUsePayments.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		render(<BillingPaymentsPage />);

		expect(screen.queryByText("Payments")).not.toBeInTheDocument();
	});

	it("renders the payment empty state", () => {
		mockedUsePayments.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<BillingPaymentsPage />);

		expect(screen.getByText("Payments will land here once families settle up")).toBeInTheDocument();
		expect(
			screen.getByText(
				"As soon as families pay open invoices, those payments will appear here for reconciliation.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Review invoices" })).toHaveAttribute(
			"href",
			"/billing",
		);
	});

	it("renders the settings page with a disconnected quickbooks connect prompt", () => {
		mockedUseStartQuickBooksConnect.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseQuickBooksStatus.mockReturnValue({
			data: {
				status: "disconnected",
				connection: null,
				openReconciliationCount: 0,
				lastSync: null,
			},
			isLoading: false,
		} as never);
		mockedUseQuickBooksSyncHistory.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseQuickBooksReconciliation.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseDisconnectQuickBooks.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseRunQuickBooksSync.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseApproveQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);
		mockedUseDismissQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);

		const { container } = render(<SettingsPage />);

		expect(screen.getByText("Settings")).toBeInTheDocument();
		expect(screen.getByText("Owner only")).toBeInTheDocument();
		expect(
			screen.getByText("Review connected services, sync history, and local bookkeeping links."),
		).toBeInTheDocument();
		expect(
			screen.queryByText("Update your center profile, billing plan, and connected services."),
		).not.toBeInTheDocument();
		expect(screen.getByText("QuickBooks")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Connect QuickBooks" })).toBeInTheDocument();
		// The disconnected state collapses to a single page-level banner and the
		// disabled connect button — the in-card peach banner has been removed.
		expect(screen.queryByText(/Start the Intuit consent flow/i)).not.toBeInTheDocument();
		expect(screen.getByTestId("quickbooks-not-connected-banner")).toHaveTextContent(
			/QuickBooks isn't connected/,
		);
		expect(screen.getByText("No reconciliation items are waiting for review.")).toBeInTheDocument();
		expect(container.innerHTML).not.toMatch(
			/\b(?:bg|text|border)-(?:green|amber|blue|gray|red)-\d{2,3}\b/,
		);
	});

	it("disables quickbooks connect when the environment is not configured", () => {
		mockedUseStartQuickBooksConnect.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseQuickBooksStatus.mockReturnValue({
			data: {
				status: "disconnected",
				connection: null,
				openReconciliationCount: 0,
				lastSync: null,
				isConfigured: false,
				configurationIssue: "QuickBooks isn't configured in this environment yet.",
			},
			isLoading: false,
		} as never);
		mockedUseQuickBooksSyncHistory.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseQuickBooksReconciliation.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseDisconnectQuickBooks.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseRunQuickBooksSync.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseApproveQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);
		mockedUseDismissQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);

		render(<SettingsPage />);

		expect(
			screen.getByText("QuickBooks isn't configured in this environment yet."),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Connect QuickBooks" })).toBeDisabled();
	});

	it("renders quickbooks loading states", () => {
		mockedUseQuickBooksStatus.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseQuickBooksSyncHistory.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseQuickBooksReconciliation.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseDisconnectQuickBooks.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseRunQuickBooksSync.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseApproveQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);
		mockedUseDismissQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);

		render(<SettingsPage />);

		expect(screen.queryByRole("button", { name: "Connect QuickBooks" })).not.toBeInTheDocument();
		expect(screen.getByText("Recent sync history")).toBeInTheDocument();
	});

	it("starts the oauth quickbooks connection flow and approves a draft link", () => {
		const connectMutation = createQuickBooksMutationSpy();
		const approveMutation = createQuickBooksMutationSpy();
		mockedUseStartQuickBooksConnect.mockReturnValue(connectMutation as never);
		mockedUseQuickBooksStatus.mockReturnValue({
			data: {
				status: "disconnected",
				connection: null,
				openReconciliationCount: 1,
				lastSync: null,
			},
			isLoading: false,
		} as never);
		mockedUseQuickBooksSyncHistory.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseQuickBooksReconciliation.mockReturnValue({
			data: [
				{
					id: "item-2",
					centerId: "center-1",
					connectionId: "connection-1",
					entityType: "invoice",
					entityId: "invoice-2",
					qbEntityType: "invoice",
					issueType: "missing_link",
					title: "Invoice needs a QuickBooks link",
					description: "Invoice invoice-2 still needs a manual QuickBooks link.",
					status: "open",
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseDisconnectQuickBooks.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseRunQuickBooksSync.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseApproveQuickBooksReconciliation.mockReturnValue(approveMutation as never);
		mockedUseDismissQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);

		render(<SettingsPage />);

		const locationAssign = vi.fn();
		Object.defineProperty(window, "location", {
			value: { assign: locationAssign },
			writable: true,
		});

		connectMutation.mutate.mockImplementation((_value, options) => {
			options?.onSuccess?.({
				url: "https://appcenter.intuit.com/connect/oauth2?state=signed-state",
			});
		});

		fireEvent.click(screen.getByRole("button", { name: "Connect QuickBooks" }));

		fireEvent.change(screen.getByLabelText("QuickBooks entity id for item-2"), {
			target: { value: "qb-invoice-2" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));

		expect(connectMutation.mutate).toHaveBeenCalledWith(undefined, expect.any(Object));
		expect(locationAssign).toHaveBeenCalledWith(
			"https://appcenter.intuit.com/connect/oauth2?state=signed-state",
		);
		expect(approveMutation.mutate).toHaveBeenCalledWith({
			id: "item-2",
			qbEntityId: "qb-invoice-2",
			qbEntityType: "invoice",
			localTargetId: undefined,
		});
	});

	it("requires a local invoice selection for quickbooks-origin approvals", () => {
		const approveMutation = createQuickBooksMutationSpy();
		mockedUseStartQuickBooksConnect.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseQuickBooksStatus.mockReturnValue({
			data: {
				status: "connected",
				connection: {
					id: "connection-1",
					centerId: "center-1",
					realmId: "realm-1",
					companyName: "Pebble Books",
					status: "connected",
					syncDirection: "pull",
					tokenExpiresAt: "2026-05-10T00:00:00.000Z",
					connectedAt: "2026-05-01T09:00:00.000Z",
					lastSyncAt: "2026-05-01T09:10:00.000Z",
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:10:00.000Z",
				},
				openReconciliationCount: 1,
				lastSync: null,
			},
			isLoading: false,
		} as never);
		mockedUseQuickBooksSyncHistory.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseQuickBooksReconciliation.mockReturnValue({
			data: [
				{
					id: "item-qb-1",
					centerId: "center-1",
					connectionId: "connection-1",
					origin: "quickbooks",
					entityType: "payment",
					entityId: "qb-payment-1",
					qbEntityId: "qb-payment-1",
					qbEntityType: "payment",
					issueType: "missing_link",
					title: "QuickBooks payment needs a PebbleDesk invoice",
					description: "Match this payment to a local invoice before applying it.",
					proposedChanges: { amount: 200, lineItems: [] },
					status: "open",
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [
				{
					id: "invoice-7",
					centerId: "center-1",
					guardianId: "guardian-1",
					periodStart: "2026-05-01",
					periodEnd: "2026-05-31",
					subtotal: 200,
					subsidyCredit: 0,
					amountDue: 200,
					status: "sent",
					dueDate: "2026-05-15",
					publicPayToken: undefined,
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseDisconnectQuickBooks.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseRunQuickBooksSync.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseApproveQuickBooksReconciliation.mockReturnValue(approveMutation as never);
		mockedUseDismissQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);

		render(<SettingsPage />);

		const approveButton = screen.getByRole("button", { name: "Approve" });
		expect(approveButton).toBeDisabled();
		expect(screen.getByRole("option", { name: "invoice-7 / sent / $200.00" })).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Local invoice for item-qb-1"), {
			target: { value: "invoice-7" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));

		expect(approveMutation.mutate).toHaveBeenCalledWith({
			id: "item-qb-1",
			qbEntityId: "qb-payment-1",
			qbEntityType: "payment",
			localTargetId: "invoice-7",
		});
	});

	it("requires a local guardian selection for quickbooks-origin customer approvals", () => {
		const approveMutation = createQuickBooksMutationSpy();
		mockedUseStartQuickBooksConnect.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseQuickBooksStatus.mockReturnValue({
			data: {
				status: "connected",
				connection: {
					id: "connection-1",
					centerId: "center-1",
					realmId: "realm-1",
					companyName: "Pebble Books",
					status: "connected",
					syncDirection: "pull",
					tokenExpiresAt: "2026-05-10T00:00:00.000Z",
					connectedAt: "2026-05-01T09:00:00.000Z",
					lastSyncAt: "2026-05-01T09:10:00.000Z",
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:10:00.000Z",
				},
				openReconciliationCount: 1,
				lastSync: null,
			},
			isLoading: false,
		} as never);
		mockedUseQuickBooksSyncHistory.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseQuickBooksReconciliation.mockReturnValue({
			data: [
				{
					id: "item-qb-customer-1",
					centerId: "center-1",
					connectionId: "connection-1",
					origin: "quickbooks",
					entityType: "customer",
					entityId: "qb-customer-2",
					qbEntityId: "qb-customer-2",
					qbEntityType: "customer",
					issueType: "missing_link",
					title: "QuickBooks customer needs a PebbleDesk guardian",
					description:
						"Match this QuickBooks customer to a local PebbleDesk guardian before applying imported contact changes.",
					proposedChanges: { firstName: "Sam", lastName: "Taylor" },
					status: "open",
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseInvoices.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "guardian-8",
					centerId: "center-1",
					firstName: "Sam",
					lastName: "Taylor",
					email: "sam@example.com",
					phone: null,
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseDisconnectQuickBooks.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseRunQuickBooksSync.mockReturnValue(createQuickBooksMutationSpy() as never);
		mockedUseApproveQuickBooksReconciliation.mockReturnValue(approveMutation as never);
		mockedUseDismissQuickBooksReconciliation.mockReturnValue(
			createQuickBooksMutationSpy() as never,
		);

		render(<SettingsPage />);

		const approveButton = screen.getByRole("button", { name: "Approve" });
		expect(approveButton).toBeDisabled();
		expect(
			screen.getByRole("option", { name: "Sam Taylor / sam@example.com" }),
		).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Local guardian for item-qb-customer-1"), {
			target: { value: "guardian-8" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));

		expect(approveMutation.mutate).toHaveBeenCalledWith({
			id: "item-qb-customer-1",
			qbEntityId: "qb-customer-2",
			qbEntityType: "customer",
			localTargetId: "guardian-8",
		});
	});

	it("renders the connected quickbooks state and triggers sync and review actions", () => {
		const connectMutation = createQuickBooksMutationSpy();
		const disconnectMutation = createQuickBooksMutationSpy();
		const syncMutation = createQuickBooksMutationSpy();
		const approveMutation = createQuickBooksMutationSpy();
		const dismissMutation = createQuickBooksMutationSpy();

		mockedUseStartQuickBooksConnect.mockReturnValue(connectMutation as never);
		mockedUseQuickBooksStatus.mockReturnValue({
			data: {
				status: "connected",
				connection: {
					id: "connection-1",
					centerId: "center-1",
					realmId: "realm-1",
					companyName: "Pebble Books",
					status: "connected",
					syncDirection: "pull",
					tokenExpiresAt: "2026-05-10T00:00:00.000Z",
					connectedAt: "2026-05-01T09:00:00.000Z",
					lastSyncAt: "2026-05-01T09:10:00.000Z",
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:10:00.000Z",
				},
				openReconciliationCount: 1,
				lastSync: {
					id: "log-1",
					centerId: "center-1",
					connectionId: "connection-1",
					entityType: "invoice",
					entityId: "invoice-1",
					qbEntityId: "qb-invoice-1",
					status: "success",
					direction: "push",
					syncedAt: "2026-05-01T09:10:00.000Z",
					createdAt: "2026-05-01T09:10:00.000Z",
				},
			},
			isLoading: false,
		} as never);
		mockedUseQuickBooksSyncHistory.mockReturnValue({
			data: [
				{
					id: "log-1",
					centerId: "center-1",
					connectionId: "connection-1",
					entityType: "invoice",
					entityId: "invoice-1",
					qbEntityId: "qb-invoice-1",
					status: "success",
					direction: "push",
					syncedAt: "2026-05-01T09:10:00.000Z",
					createdAt: "2026-05-01T09:10:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseQuickBooksReconciliation.mockReturnValue({
			data: [
				{
					id: "item-1",
					centerId: "center-1",
					connectionId: "connection-1",
					entityType: "invoice",
					entityId: "invoice-1",
					qbEntityId: "qb-invoice-1",
					qbEntityType: "invoice",
					issueType: "status_mismatch",
					title: "Invoice status changed in QuickBooks",
					description: "Status differs from PebbleDesk.",
					status: "open",
					createdAt: "2026-05-01T09:00:00.000Z",
					updatedAt: "2026-05-01T09:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseDisconnectQuickBooks.mockReturnValue(disconnectMutation as never);
		mockedUseRunQuickBooksSync.mockReturnValue(syncMutation as never);
		mockedUseApproveQuickBooksReconciliation.mockReturnValue(approveMutation as never);
		mockedUseDismissQuickBooksReconciliation.mockReturnValue(dismissMutation as never);

		render(<SettingsPage />);

		expect(screen.getByText("Pebble Books")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Full sync" })).toBeInTheDocument();
		expect(screen.getByText("Invoice status changed in QuickBooks")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));
		fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
		fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

		expect(syncMutation.mutate).toHaveBeenCalledWith("export");
		expect(approveMutation.mutate).toHaveBeenCalledWith({
			id: "item-1",
			qbEntityId: "qb-invoice-1",
			qbEntityType: "invoice",
			localTargetId: undefined,
		});
		expect(dismissMutation.mutate).toHaveBeenCalledWith("item-1");
		expect(disconnectMutation.mutate).toHaveBeenCalled();
	});

	it("loads the public payment session from the payment-intent endpoint", async () => {
		vi.spyOn(PayRoute, "useParams").mockReturnValue({ token: "token-123.signature" } as never);
		mockedUseQuery.mockReturnValue({
			data: {
				invoice: {
					id: "invoice-1",
					amountDue: 800,
					status: "sent",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-28",
				},
				center: {
					name: "Downtown Center",
				},
				guardian: {
					firstName: "Mia",
					lastName: "Johnson",
				},
				stripePublishableKey: "pk_test_123",
				clientSecret: "pi_client_secret_123",
			},
			isLoading: false,
			isError: false,
		} as never);

		render(<PayPage />);

		expect(screen.getByText("Pay your invoice")).toBeInTheDocument();
		expect(
			screen.getByText("Review the balance and complete payment for your family's invoice."),
		).toBeInTheDocument();
		expect(screen.getByText("invoice-1")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Pay $800.00" })).toBeInTheDocument();

		const queryFn = mockedUseQuery.mock.calls.at(-1)?.[0].queryFn as
			| (() => Promise<unknown>)
			| undefined;
		expect(queryFn).toBeDefined();
		expect(mockedUseQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["publicPaymentSession", "token-123.signature"],
				refetchOnMount: false,
				refetchOnReconnect: false,
				refetchOnWindowFocus: false,
				staleTime: Infinity,
			}),
		);

		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				invoice: {
					id: "invoice-1",
					amountDue: 800,
					status: "sent",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-28",
				},
				center: {
					name: "Downtown Center",
				},
				guardian: {
					firstName: "Mia",
					lastName: "Johnson",
				},
				stripePublishableKey: "pk_test_123",
				clientSecret: "pi_client_secret_123",
			}),
		} as never);

		await expect(queryFn?.()).resolves.toMatchObject({
			invoice: {
				id: "invoice-1",
			},
			clientSecret: "pi_client_secret_123",
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/public/invoices/token-123.signature/payment-intent",
			{
				credentials: "omit",
				method: "POST",
			},
		);
	});

	it("renders the Stripe checkout form and completes a payment", async () => {
		vi.spyOn(PayRoute, "useParams").mockReturnValue({ token: "token-456.signature" } as never);
		const mount = vi.fn();
		const confirmCardPayment = vi.fn().mockResolvedValue({
			paymentIntent: {
				status: "succeeded",
			},
		});
		vi.stubGlobal(
			"Stripe",
			vi.fn(() => ({
				elements: vi.fn(() => ({
					create: vi.fn(() => ({
						mount,
						unmount: vi.fn(),
					})),
				})),
				confirmCardPayment,
			})),
		);
		mockedUseQuery.mockReturnValue({
			data: {
				invoice: {
					id: "invoice-2",
					amountDue: 800,
					status: "sent",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-28",
				},
				center: {
					name: "Downtown Center",
				},
				guardian: {
					firstName: "Mia",
					lastName: "Johnson",
				},
				stripePublishableKey: "pk_test_123",
				clientSecret: "pi_client_secret_123",
			},
			isLoading: false,
			isError: false,
		} as never);
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({
				invoice: {
					id: "invoice-2",
					amountDue: 800,
					status: "sent",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-28",
				},
				center: {
					name: "Downtown Center",
				},
				guardian: {
					firstName: "Mia",
					lastName: "Johnson",
				},
				stripePublishableKey: "pk_test_123",
				paymentIntentId: "pi_123",
				clientSecret: "pi_client_secret_123",
			}),
		} as never);

		render(<PayPage />);

		const payButton = await screen.findByRole("button", { name: "Pay $800.00" });
		await waitFor(() => expect(mount).toHaveBeenCalled());
		await waitFor(() => expect(payButton).toBeEnabled());

		fireEvent.click(payButton);

		await waitFor(() =>
			expect(confirmCardPayment).toHaveBeenCalledWith(
				"pi_client_secret_123",
				expect.objectContaining({
					payment_method: expect.objectContaining({
						card: expect.any(Object),
					}),
				}),
			),
		);
		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/public/invoices/token-456.signature/payment-intent",
			{
				credentials: "omit",
				method: "POST",
			},
		);
		await waitFor(() =>
			expect(screen.getByText("Payment complete. Thank you.")).toBeInTheDocument(),
		);
	});

	it("shows an already-paid state when the invoice has already been paid", () => {
		vi.spyOn(PayRoute, "useParams").mockReturnValue({ token: "token-789.signature" } as never);
		mockedUseQuery.mockReturnValue({
			data: undefined,
			error: Object.assign(new Error("This invoice has already been paid."), {
				kind: "already_paid",
			}),
			isLoading: false,
			isError: true,
		} as never);

		render(<PayPage />);

		expect(screen.getByText("This invoice has already been paid.")).toBeInTheDocument();
	});

	it("shows an invalid-link state when the payment session cannot be loaded", () => {
		vi.spyOn(PayRoute, "useParams").mockReturnValue({ token: "missing-token.signature" } as never);
		mockedUseQuery.mockReturnValue({
			data: undefined,
			error: Object.assign(new Error("This payment link is invalid or has expired."), {
				kind: "invalid_link",
			}),
			isLoading: false,
			isError: true,
		} as never);

		render(<PayPage />);

		expect(screen.getByText("This payment link is invalid or has expired.")).toBeInTheDocument();
	});

	it("short-circuits malformed public pay tokens before checkout starts", () => {
		vi.spyOn(PayRoute, "useParams").mockReturnValue({ token: "not-a-real-token" } as never);
		mockedUseQuery.mockReturnValue({
			data: undefined,
			error: null,
			isLoading: false,
			isError: false,
		} as never);

		render(<PayPage />);

		expect(screen.getByText("This payment link is invalid or has expired.")).toBeInTheDocument();
		expect(mockedUseQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["publicPaymentSession", "not-a-real-token"],
				enabled: false,
			}),
		);
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("shows already-paid error and skips Stripe when fetchPublicPaymentSession returns a paid invoice on submit", async () => {
		vi.spyOn(PayRoute, "useParams").mockReturnValue({ token: "token-paid.signature" } as never);
		const mount = vi.fn();
		const confirmCardPayment = vi.fn();
		vi.stubGlobal(
			"Stripe",
			vi.fn(() => ({
				elements: vi.fn(() => ({
					create: vi.fn(() => ({
						mount,
						unmount: vi.fn(),
					})),
				})),
				confirmCardPayment,
			})),
		);
		mockedUseQuery.mockReturnValue({
			data: {
				invoice: {
					id: "invoice-pay",
					amountDue: 250,
					status: "sent",
					periodStart: "2026-04-01",
					periodEnd: "2026-04-30",
				},
				center: { name: "Center A" },
				guardian: { firstName: "Jo", lastName: "Smith" },
				stripePublishableKey: "pk_test_xyz",
				clientSecret: "pi_secret_xyz",
			},
			isLoading: false,
			isError: false,
		} as never);

		// Submit fetch returns a paid invoice
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({
				invoice: {
					id: "invoice-pay",
					amountDue: 250,
					status: "paid",
					periodStart: "2026-04-01",
					periodEnd: "2026-04-30",
				},
				center: { name: "Center A" },
				guardian: { firstName: "Jo", lastName: "Smith" },
				stripePublishableKey: "pk_test_xyz",
				paymentIntentId: "pi_pay",
				clientSecret: "pi_secret_xyz",
			}),
		} as never);

		render(<PayPage />);

		const payButton = await screen.findByRole("button", { name: "Pay $250.00" });
		await waitFor(() => expect(mount).toHaveBeenCalled());
		await waitFor(() => expect(payButton).toBeEnabled());

		fireEvent.click(payButton);

		await waitFor(() =>
			expect(screen.getByText("This invoice has already been paid.")).toBeInTheDocument(),
		);
		expect(confirmCardPayment).not.toHaveBeenCalled();
	});

	it("disables the Pay button while a submission is in progress to prevent double-click", async () => {
		vi.spyOn(PayRoute, "useParams").mockReturnValue({ token: "token-dbl.signature" } as never);
		const mount = vi.fn();
		let resolveConfirm: (value: unknown) => void = () => undefined;
		const confirmCardPayment = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveConfirm = resolve;
				}),
		);
		vi.stubGlobal(
			"Stripe",
			vi.fn(() => ({
				elements: vi.fn(() => ({
					create: vi.fn(() => ({
						mount,
						unmount: vi.fn(),
					})),
				})),
				confirmCardPayment,
			})),
		);
		mockedUseQuery.mockReturnValue({
			data: {
				invoice: {
					id: "invoice-dbl",
					amountDue: 100,
					status: "sent",
					periodStart: "2026-04-01",
					periodEnd: "2026-04-30",
				},
				center: { name: "Center B" },
				guardian: { firstName: "Bo", lastName: "Evans" },
				stripePublishableKey: "pk_test_dbl",
				clientSecret: "pi_secret_dbl",
			},
			isLoading: false,
			isError: false,
		} as never);
		mockedApiFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({
				invoice: {
					id: "invoice-dbl",
					amountDue: 100,
					status: "sent",
					periodStart: "2026-04-01",
					periodEnd: "2026-04-30",
				},
				center: { name: "Center B" },
				guardian: { firstName: "Bo", lastName: "Evans" },
				stripePublishableKey: "pk_test_dbl",
				paymentIntentId: "pi_dbl",
				clientSecret: "pi_secret_dbl",
			}),
		} as never);

		render(<PayPage />);

		const payButton = await screen.findByRole("button", { name: "Pay $100.00" });
		await waitFor(() => expect(mount).toHaveBeenCalled());
		await waitFor(() => expect(payButton).toBeEnabled());

		fireEvent.click(payButton);

		// While processing, button should be disabled and show Processing...
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Processing..." })).toBeDisabled(),
		);

		resolveConfirm({ paymentIntent: { status: "succeeded" } });
		await waitFor(() =>
			expect(screen.getByText("Payment complete. Thank you.")).toBeInTheDocument(),
		);
	});

	describe("billing page invoice creation, send, and payment flows", () => {
		const sampleInvoice = {
			id: "invoice-draft-1",
			centerId: "center-1",
			guardianId: "guardian-1",
			periodStart: "2026-03-01",
			periodEnd: "2026-03-31",
			status: "draft",
			subtotal: 500,
			subsidyCredit: 0,
			amountDue: 500,
			publicPayToken: null,
			publicLinkVersion: 1,
			createdAt: "2026-03-01T12:00:00.000Z",
			updatedAt: "2026-03-01T12:00:00.000Z",
		};

		const sentInvoice = {
			id: "invoice-sent-1",
			centerId: "center-1",
			guardianId: "guardian-1",
			periodStart: "2026-03-01",
			periodEnd: "2026-03-31",
			status: "sent",
			subtotal: 500,
			subsidyCredit: 0,
			amountDue: 500,
			publicPayToken: "token-abc.sig",
			publicLinkVersion: 1,
			createdAt: "2026-03-01T12:00:00.000Z",
			updatedAt: "2026-03-01T12:00:00.000Z",
		};

		const paidInvoice = {
			id: "invoice-paid-1",
			centerId: "center-1",
			guardianId: "guardian-1",
			periodStart: "2026-03-01",
			periodEnd: "2026-03-31",
			status: "paid",
			subtotal: 500,
			subsidyCredit: 0,
			amountDue: 500,
			publicPayToken: null,
			publicLinkVersion: 1,
			createdAt: "2026-03-01T12:00:00.000Z",
			updatedAt: "2026-03-01T12:00:00.000Z",
		};

		const voidInvoice = {
			id: "invoice-void-1",
			centerId: "center-1",
			guardianId: "guardian-1",
			periodStart: "2026-03-01",
			periodEnd: "2026-03-31",
			status: "void",
			subtotal: 500,
			subsidyCredit: 0,
			amountDue: 500,
			publicPayToken: null,
			publicLinkVersion: 1,
			createdAt: "2026-03-01T12:00:00.000Z",
			updatedAt: "2026-03-01T12:00:00.000Z",
		};

		function setupBillingPage(invoices: object[]) {
			mockedUseInvoices.mockReturnValue({ data: invoices, isLoading: false } as never);
			mockedUseGuardians.mockReturnValue({
				data: [
					{
						id: "guardian-1",
						centerId: "center-1",
						firstName: "Maria",
						lastName: "Garcia",
						email: "maria@example.com",
						phone: null,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				],
				isLoading: false,
			} as never);
		}

		it("Create invoice button renders", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			expect(screen.getByRole("button", { name: /create invoice/i })).toBeInTheDocument();
		});

		it("Create invoice dialog opens with correct fields", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			expect(screen.getByLabelText(/^guardian$/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/^period start$/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/^period end$/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/^due date \(optional\)$/i)).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /create invoice/i })).toBeInTheDocument();
		});

		it("Submitting create invoice form calls useCreateInvoice", async () => {
			const createSpy = createMutationSpy();
			createSpy.mutateAsync.mockResolvedValue({ id: "new-invoice-1" });
			mockedUseCreateInvoice.mockReturnValue(createSpy as never);
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			// Fill in guardian
			const guardianSelect = screen.getByLabelText(/^guardian$/i);
			fireEvent.change(guardianSelect, { target: { value: "guardian-1" } });

			// Fill in dates
			fireEvent.change(screen.getByLabelText(/^period start$/i), {
				target: { value: "2026-04-01" },
			});
			fireEvent.change(screen.getByLabelText(/^period end$/i), {
				target: { value: "2026-04-30" },
			});

			// Fill line item
			const descriptionInputs = screen.getAllByPlaceholderText(/description/i);
			fireEvent.change(descriptionInputs[0], { target: { value: "Childcare April" } });
			const unitPriceInputs = screen.getAllByPlaceholderText(/unit price/i);
			fireEvent.change(unitPriceInputs[0], { target: { value: "500" } });

			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			await waitFor(() => {
				expect(createSpy.mutateAsync).toHaveBeenCalledWith(
					expect.objectContaining({
						guardianId: "guardian-1",
						periodStart: "2026-04-01",
						periodEnd: "2026-04-30",
						status: "draft",
						subtotal: 500,
						subsidyCredit: 0,
						amountDue: 500,
					}),
					expect.anything(),
				);
			});
		});

		it("Send button renders for draft invoices only", () => {
			setupBillingPage([sampleInvoice, sentInvoice]);
			render(<BillingPage />);
			// draft has Send button
			const sendButtons = screen.getAllByRole("button", { name: /^send$/i });
			expect(sendButtons).toHaveLength(1);
		});

		it("Clicking Send calls useSendInvoice with correct invoice id", async () => {
			const sendSpy = createMutationSpy();
			sendSpy.mutateAsync.mockResolvedValue({ ok: true });
			mockedUseSendInvoice.mockReturnValue(sendSpy as never);
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

			await waitFor(() => {
				expect(sendSpy.mutateAsync).toHaveBeenCalledWith("invoice-draft-1");
			});
		});

		it("Send surfaces server error message when mutateAsync throws", async () => {
			const sendSpy = createMutationSpy();
			sendSpy.mutateAsync.mockRejectedValue(new Error("Email delivery failed"));
			mockedUseSendInvoice.mockReturnValue(sendSpy as never);
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

			expect(await screen.findByRole("alert")).toHaveTextContent("Email delivery failed");
		});

		it("Record payment button renders when invoice is not paid or void", () => {
			setupBillingPage([sampleInvoice, sentInvoice, paidInvoice, voidInvoice]);
			render(<BillingPage />);
			const recordButtons = screen.getAllByRole("button", { name: /record payment/i });
			// draft and sent qualify; paid and void do not
			expect(recordButtons).toHaveLength(2);
		});

		it("Record payment dialog opens with pre-filled amount", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /record payment/i }));

			expect(screen.getByRole("dialog")).toBeInTheDocument();
			const amountInput = screen.getByLabelText(/^amount$/i);
			expect(amountInput).toHaveValue(500);
		});

		it("Submitting payment calls useRecordPayment with correct payload", async () => {
			const paymentSpy = createMutationSpy();
			paymentSpy.mutateAsync.mockResolvedValue({ id: "payment-1" });
			mockedUseRecordPayment.mockReturnValue(paymentSpy as never);
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /record payment/i }));

			// Select method
			const methodSelect = screen.getByLabelText(/payment method/i);
			fireEvent.change(methodSelect, { target: { value: "cash" } });

			// Set paid at (already has a default)
			const paidAtInput = screen.getByLabelText(/payment date/i);
			fireEvent.change(paidAtInput, { target: { value: "2026-04-01T10:00" } });

			fireEvent.click(screen.getByRole("button", { name: /confirm payment/i }));

			await waitFor(() => {
				expect(paymentSpy.mutateAsync).toHaveBeenCalledWith(
					expect.objectContaining({
						invoiceId: "invoice-draft-1",
						amount: 500,
						method: "cash",
						provider: "manual",
					}),
				);
			});
		});

		it("Record payment dialog closes on success", async () => {
			const paymentSpy = createMutationSpy();
			paymentSpy.mutateAsync.mockResolvedValue({ id: "payment-1" });
			mockedUseRecordPayment.mockReturnValue(paymentSpy as never);
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
			expect(screen.getByRole("dialog")).toBeInTheDocument();

			const methodSelect = screen.getByLabelText(/payment method/i);
			fireEvent.change(methodSelect, { target: { value: "check" } });

			fireEvent.click(screen.getByRole("button", { name: /confirm payment/i }));

			await waitFor(() => {
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			});
		});

		it("Add line item button adds a new line item row", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			// Initially 1 line item
			expect(screen.getAllByPlaceholderText(/description/i)).toHaveLength(1);

			fireEvent.click(screen.getByRole("button", { name: /add line item/i }));

			expect(screen.getAllByPlaceholderText(/description/i)).toHaveLength(2);
		});

		it("Remove button appears and removes a line item when more than one exists", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			// Add a second line item
			fireEvent.click(screen.getByRole("button", { name: /add line item/i }));
			expect(screen.getAllByPlaceholderText(/description/i)).toHaveLength(2);

			// Remove the first one
			const removeButtons = screen.getAllByRole("button", { name: /remove/i });
			expect(removeButtons).toHaveLength(2);
			fireEvent.click(removeButtons[0]);

			expect(screen.getAllByPlaceholderText(/description/i)).toHaveLength(1);
			expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
		});

		it("Changing due date, quantity, and amount fields updates the form", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			// Due date
			fireEvent.change(screen.getByLabelText(/^due date \(optional\)$/i), {
				target: { value: "2026-05-15" },
			});
			expect(screen.getByLabelText(/^due date \(optional\)$/i)).toHaveValue("2026-05-15");

			// Quantity
			const qtyInputs = screen.getAllByPlaceholderText(/qty/i);
			fireEvent.change(qtyInputs[0], { target: { value: "3" } });
			expect(qtyInputs[0]).toHaveValue(3);
		});

		it("Changing amount in the record payment dialog updates the value", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /record payment/i }));

			const amountInput = screen.getByLabelText(/^amount$/i);
			fireEvent.change(amountInput, { target: { value: "250" } });
			expect(amountInput).toHaveValue(250);
		});

		it("Record payment does nothing if method is empty", async () => {
			const paymentSpy = createMutationSpy();
			mockedUseRecordPayment.mockReturnValue(paymentSpy as never);
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
			// Do not select a method, submit form directly
			const form = screen.getByRole("button", { name: /confirm payment/i }).closest("form");
			if (form) fireEvent.submit(form);

			await waitFor(() => {
				expect(paymentSpy.mutateAsync).not.toHaveBeenCalled();
			});
		});

		it("Add line item button is hidden after 10 items are added", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			// Add 9 more to reach 10 total
			for (let i = 0; i < 9; i++) {
				fireEvent.click(screen.getByRole("button", { name: /add line item/i }));
			}

			expect(screen.getAllByPlaceholderText(/description/i)).toHaveLength(10);
			expect(screen.queryByRole("button", { name: /add line item/i })).not.toBeInTheDocument();
		}, 10_000);

		it("Create invoice keeps dialog open when mutateAsync throws", async () => {
			const createSpy = createMutationSpy();
			createSpy.mutateAsync.mockRejectedValue(new Error("Network error"));
			mockedUseCreateInvoice.mockReturnValue(createSpy as never);
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			// Fill required fields
			fireEvent.change(screen.getByLabelText(/^guardian$/i), { target: { value: "guardian-1" } });
			fireEvent.change(screen.getByLabelText(/^period start$/i), {
				target: { value: "2026-04-01" },
			});
			fireEvent.change(screen.getByLabelText(/^period end$/i), {
				target: { value: "2026-04-30" },
			});
			const descInputs = screen.getAllByPlaceholderText(/description/i);
			fireEvent.change(descInputs[0], { target: { value: "Service" } });
			const unitPriceInputs = screen.getAllByPlaceholderText(/unit price/i);
			fireEvent.change(unitPriceInputs[0], { target: { value: "100" } });

			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			await waitFor(() => {
				expect(createSpy.mutateAsync).toHaveBeenCalled();
				// Dialog stays open after error
				expect(screen.getByRole("dialog")).toBeInTheDocument();
			});
		});

		it("Record payment keeps dialog open and surfaces error message when mutateAsync throws", async () => {
			const paymentSpy = createMutationSpy();
			paymentSpy.mutateAsync.mockRejectedValue(new Error("Payment exceeds invoice balance"));
			mockedUseRecordPayment.mockReturnValue(paymentSpy as never);
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);

			fireEvent.click(screen.getByRole("button", { name: /record payment/i }));

			const methodSelect = screen.getByLabelText(/payment method/i);
			fireEvent.change(methodSelect, { target: { value: "ach" } });

			fireEvent.click(screen.getByRole("button", { name: /confirm payment/i }));

			await waitFor(() => {
				expect(paymentSpy.mutateAsync).toHaveBeenCalled();
				expect(screen.getByRole("dialog")).toBeInTheDocument();
				expect(screen.getByRole("alert")).toHaveTextContent("Payment exceeds invoice balance");
			});
		});

		it("Renders without guardians data (null guardians)", () => {
			mockedUseInvoices.mockReturnValue({ data: [sampleInvoice], isLoading: false } as never);
			mockedUseGuardians.mockReturnValue({ data: undefined, isLoading: false } as never);
			render(<BillingPage />);
			// Should show Family account fallback
			expect(screen.getByText("Family account")).toBeInTheDocument();
		});

		it("Closing create invoice dialog without submitting resets the form", async () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
			expect(document.activeElement).toBe(screen.getByLabelText(/^guardian$/i));

			// Fill in period start
			fireEvent.change(screen.getByLabelText(/^period start$/i), {
				target: { value: "2026-05-01" },
			});
			expect(screen.getByLabelText(/^period start$/i)).toHaveValue("2026-05-01");

			fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
			await waitFor(() => {
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			});

			// Reopen and check reset
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
			expect(screen.getByLabelText(/^period start$/i)).toHaveValue("");
		});

		it("Closing record payment dialog resets the amount field", async () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /record payment/i }));

			const amountInput = screen.getByLabelText(/^amount$/i);
			fireEvent.change(amountInput, { target: { value: "100" } });

			// Close dialog via Escape
			const dialog = screen.getByRole("dialog");
			fireEvent.keyDown(dialog, { key: "Escape" });

			await waitFor(() => {
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			});

			// Reopen and check reset
			fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
			expect(screen.getByLabelText(/^amount$/i)).toHaveValue(500);
		});

		it("renders with undefined invoices data (isLoading false) as empty list", () => {
			mockedUseInvoices.mockReturnValue({ data: undefined, isLoading: false } as never);
			mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);
			render(<BillingPage />);
			// Falls back to empty list — shows empty state
			expect(screen.getByText("No money in motion yet")).toBeInTheDocument();
			// Header link shows "Open billing setup" (empty list path)
			const links = screen.getAllByRole("link", { name: "Open billing setup" });
			expect(links.length).toBeGreaterThan(0);
		});

		it("updateLineItem ternary passes unchanged items through when updating a different index", () => {
			setupBillingPage([sampleInvoice]);
			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			// Add a second line item so there are two rows
			fireEvent.click(screen.getByRole("button", { name: /add line item/i }));
			const descriptionInputs = screen.getAllByPlaceholderText(/description/i);
			expect(descriptionInputs).toHaveLength(2);

			// Update the first item's description — the second item's map arm returns unchanged
			fireEvent.change(descriptionInputs[0], { target: { value: "Childcare May" } });
			expect(descriptionInputs[0]).toHaveValue("Childcare May");
			// Second item remains unchanged (empty)
			expect(descriptionInputs[1]).toHaveValue("");
		});

		it("prefills create invoice line items and due date from a selected template", () => {
			setupBillingPage([sampleInvoice]);
			mockedUseInvoiceTemplates.mockReturnValue({
				data: [
					{
						id: "template-1",
						centerId: "center-1",
						name: "Monthly tuition",
						description: "Standard monthly",
						dueDays: 10,
						isDefault: true,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				],
				isLoading: false,
			} as never);
			mockedUseInvoiceTemplateDetail.mockReturnValue({
				data: {
					invoiceTemplate: {
						id: "template-1",
						centerId: "center-1",
						name: "Monthly tuition",
						dueDays: 10,
						isDefault: true,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
					lineItems: [
						{
							id: "li-1",
							invoiceTemplateId: "template-1",
							description: "Tuition",
							quantity: 2,
							unitPrice: 600,
							amount: 1200,
							sortOrder: 0,
						},
						{
							id: "li-2",
							invoiceTemplateId: "template-1",
							description: "Supplies",
							quantity: 1,
							unitPrice: 50,
							amount: 50,
							sortOrder: 1,
						},
					],
				},
				isLoading: false,
			} as never);

			render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			const templateSelect = screen.getByLabelText(/^start from template$/i) as HTMLSelectElement;
			fireEvent.change(templateSelect, { target: { value: "template-1" } });

			const descriptionInputs = screen.getAllByPlaceholderText(
				/description/i,
			) as HTMLInputElement[];
			expect(descriptionInputs).toHaveLength(2);
			expect(descriptionInputs[0].value).toBe("Tuition");
			expect(descriptionInputs[1].value).toBe("Supplies");

			const dueDateInput = screen.getByLabelText(/^due date \(optional\)$/i) as HTMLInputElement;
			expect(dueDateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});

		it("does not re-apply the selected template when the template detail refetches", () => {
			// Reset template-detail mock so it only returns data once the user
			// actually selects the template (avoids state leaking from previous
			// test configuring the same mock).
			mockedUseInvoiceTemplateDetail.mockReturnValue({
				data: undefined,
				isLoading: false,
			} as never);
			setupBillingPage([sampleInvoice]);
			mockedUseInvoiceTemplates.mockReturnValue({
				data: [
					{
						id: "template-1",
						centerId: "center-1",
						name: "Monthly tuition",
						description: "Standard monthly",
						dueDays: 10,
						isDefault: true,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				],
				isLoading: false,
			} as never);

			// Two distinct object references representing the same template detail —
			// as would happen on a background refetch triggered by window focus or
			// cache invalidation.
			const makeDetail = () => ({
				data: {
					invoiceTemplate: {
						id: "template-1",
						centerId: "center-1",
						name: "Monthly tuition",
						dueDays: 10,
						isDefault: true,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
					lineItems: [
						{
							id: "li-1",
							invoiceTemplateId: "template-1",
							description: "Tuition",
							quantity: 2,
							unitPrice: 600,
							amount: 1200,
							sortOrder: 0,
						},
					],
				},
				isLoading: false,
			});
			mockedUseInvoiceTemplateDetail.mockReturnValue(makeDetail() as never);

			const { rerender } = render(<BillingPage />);
			fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

			const templateSelect = screen.getByLabelText(/^start from template$/i) as HTMLSelectElement;
			fireEvent.change(templateSelect, { target: { value: "template-1" } });

			// The template prefilled a single line item
			const descriptionInput = screen.getByPlaceholderText(/description/i) as HTMLInputElement;
			expect(descriptionInput.value).toBe("Tuition");

			// User edits the description
			fireEvent.change(descriptionInput, { target: { value: "Custom tuition for April" } });
			expect(descriptionInput.value).toBe("Custom tuition for April");

			// Simulate a background refetch: fresh object reference, same template.
			mockedUseInvoiceTemplateDetail.mockReturnValue(makeDetail() as never);
			rerender(<BillingPage />);

			// The user's edit must be preserved — template should NOT re-apply.
			const descriptionAfter = screen.getByPlaceholderText(/description/i) as HTMLInputElement;
			expect(descriptionAfter.value).toBe("Custom tuition for April");
		});

		it("formatShortDate uses fallback values for partial date strings", () => {
			// An invoice whose periodStart has no month/day part triggers the ?? fallbacks
			mockedUseInvoices.mockReturnValue({
				data: [
					{
						id: "invoice-partial-date",
						centerId: "center-1",
						guardianId: "guardian-1",
						periodStart: "2026",
						periodEnd: "2026",
						status: "draft",
						subtotal: 100,
						subsidyCredit: 0,
						amountDue: 100,
						publicPayToken: null,
						publicLinkVersion: 1,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				],
				isLoading: false,
			} as never);
			mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);
			render(<BillingPage />);
			// Date renders without throwing — fallbacks (month=1, day=1) produce Jan 1, 2026
			expect(screen.getByText(/Jan 1, 2026 - Jan 1, 2026/)).toBeInTheDocument();
		});

		describe("PebbleDesk subscription card", () => {
			it("opens the Stripe billing portal when the owner clicks Manage billing", async () => {
				const mutateAsync = vi.fn().mockResolvedValue({ url: "https://stripe.example/portal" });
				const { useOpenBillingPortal } = await import("../hooks/use-subscription");
				vi.mocked(useOpenBillingPortal).mockReturnValue({
					mutateAsync,
					isPending: false,
				} as never);
				const { useAuthSession } = await import("../hooks/use-auth-session");
				vi.mocked(useAuthSession).mockReturnValue({
					data: {
						user: { id: "u-1", name: "Owner" },
						membership: { id: "m-1", centerId: "c-1", role: "owner" },
						center: {
							id: "c-1",
							name: "Sunshine",
							state: "TX",
							timezone: "America/Chicago",
							subscriptionStatus: "trialing",
							subscriptionPlan: "home",
							trialEndsAt: "2026-05-13T00:00:00.000Z",
							currentPeriodEnd: "2026-06-13T00:00:00.000Z",
							canOpenBillingPortal: true,
						},
						classroomIds: [],
					},
				} as never);
				mockedUseInvoices.mockReturnValue({ data: [], isLoading: false } as never);
				mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);

				render(<BillingPage />);

				expect(screen.getByText("PebbleDesk subscription")).toBeInTheDocument();
				expect(screen.getByText("Trial")).toBeInTheDocument();
				expect(screen.getByText("Home")).toBeInTheDocument();

				fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

				await waitFor(() => {
					expect(mutateAsync).toHaveBeenCalled();
				});
			});

			it("opens the plan picker when no Stripe customer is attached", async () => {
				const { useAuthSession } = await import("../hooks/use-auth-session");
				vi.mocked(useAuthSession).mockReturnValue({
					data: {
						user: { id: "u-1", name: "Owner" },
						membership: { id: "m-1", centerId: "c-1", role: "owner" },
						center: {
							id: "c-1",
							name: "Sunshine",
							state: "TX",
							timezone: "America/Chicago",
							subscriptionStatus: "none",
							subscriptionPlan: null,
							trialEndsAt: null,
							currentPeriodEnd: null,
						},
						classroomIds: [],
					},
				} as never);
				mockedUseInvoices.mockReturnValue({ data: [], isLoading: false } as never);
				mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);

				render(<BillingPage />);

				fireEvent.click(screen.getByRole("button", { name: "Choose your plan" }));

				expect(screen.getByRole("dialog")).toBeInTheDocument();
				expect(screen.getByText("Not selected")).toBeInTheDocument();
			});

			it("tells directors to ask their owner to manage billing", async () => {
				const { useAuthSession } = await import("../hooks/use-auth-session");
				vi.mocked(useAuthSession).mockReturnValue({
					data: {
						user: { id: "u-1", name: "Director" },
						membership: { id: "m-1", centerId: "c-1", role: "director" },
						center: {
							id: "c-1",
							name: "Sunshine",
							state: "TX",
							timezone: "America/Chicago",
							subscriptionStatus: "active",
							subscriptionPlan: "center_starter",
							trialEndsAt: null,
							currentPeriodEnd: "2026-05-01T00:00:00.000Z",
							canOpenBillingPortal: true,
						},
						classroomIds: [],
					},
				} as never);
				mockedUseInvoices.mockReturnValue({ data: [], isLoading: false } as never);
				mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);

				render(<BillingPage />);

				expect(
					screen.getByText("Ask your owner to manage billing for this center."),
				).toBeInTheDocument();
				expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
			});

			it("surfaces the server error when opening the billing portal fails", async () => {
				const mutateAsync = vi.fn().mockRejectedValue(new Error("Stripe boom"));
				const { useOpenBillingPortal } = await import("../hooks/use-subscription");
				vi.mocked(useOpenBillingPortal).mockReturnValue({
					mutateAsync,
					isPending: false,
				} as never);
				const { useAuthSession } = await import("../hooks/use-auth-session");
				vi.mocked(useAuthSession).mockReturnValue({
					data: {
						user: { id: "u-1", name: "Owner" },
						membership: { id: "m-1", centerId: "c-1", role: "owner" },
						center: {
							id: "c-1",
							name: "Sunshine",
							state: "TX",
							timezone: "America/Chicago",
							subscriptionStatus: "active",
							subscriptionPlan: "center_starter",
							trialEndsAt: null,
							currentPeriodEnd: "2026-05-01T00:00:00.000Z",
							canOpenBillingPortal: true,
						},
						classroomIds: [],
					},
				} as never);
				mockedUseInvoices.mockReturnValue({ data: [], isLoading: false } as never);
				mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);

				render(<BillingPage />);

				fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

				expect(await screen.findByRole("alert")).toHaveTextContent("Stripe boom");
			});

			it("hides the subscription card when the session is unavailable", async () => {
				const { useAuthSession } = await import("../hooks/use-auth-session");
				vi.mocked(useAuthSession).mockReturnValue({ data: undefined } as never);
				mockedUseInvoices.mockReturnValue({ data: [], isLoading: false } as never);
				mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);

				render(<BillingPage />);

				expect(screen.queryByText("PebbleDesk subscription")).not.toBeInTheDocument();
			});
		});

		describe("edit invoice", () => {
			it("Edit button shows for draft and sent invoices but not for paid or void", () => {
				setupBillingPage([sampleInvoice, sentInvoice, paidInvoice, voidInvoice]);
				render(<BillingPage />);
				const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
				// draft and sent invoices each get an Edit button; paid and void do not
				expect(editButtons).toHaveLength(2);
			});

			it("Edit form is pre-populated with invoice data", () => {
				const draftWithDueDate = {
					...sampleInvoice,
					id: "invoice-edit-prefill",
					dueDate: "2026-04-15",
				};
				setupBillingPage([draftWithDueDate]);
				render(<BillingPage />);

				fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

				expect(screen.getByRole("dialog")).toBeInTheDocument();
				expect(screen.getByText("Edit invoice")).toBeInTheDocument();
				expect(screen.getByLabelText(/^period start$/i)).toHaveValue("2026-03-01");
				expect(screen.getByLabelText(/^period end$/i)).toHaveValue("2026-03-31");
				expect(screen.getByLabelText(/^due date \(optional\)$/i)).toHaveValue("2026-04-15");
				expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
			});

			it("PATCH is called with updated fields on save", async () => {
				const updateSpy = createMutationSpy();
				updateSpy.mutateAsync.mockResolvedValue({ ...sampleInvoice });
				mockedUseUpdateInvoice.mockReturnValue(updateSpy as never);
				setupBillingPage([sampleInvoice]);
				render(<BillingPage />);

				fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

				// Update period end
				fireEvent.change(screen.getByLabelText(/^period end$/i), {
					target: { value: "2026-04-30" },
				});
				// Update a line item description
				const descriptionInputs = screen.getAllByPlaceholderText(/description/i);
				fireEvent.change(descriptionInputs[0], { target: { value: "April childcare" } });
				const unitPriceInputs = screen.getAllByPlaceholderText(/unit price/i);
				fireEvent.change(unitPriceInputs[0], { target: { value: "600" } });

				fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

				await waitFor(() => {
					expect(updateSpy.mutateAsync).toHaveBeenCalledWith(
						expect.objectContaining({
							id: "invoice-draft-1",
							input: expect.objectContaining({
								guardianId: "guardian-1",
								periodStart: "2026-03-01",
								periodEnd: "2026-04-30",
							}),
						}),
					);
				});
			});
		});
	});
});
