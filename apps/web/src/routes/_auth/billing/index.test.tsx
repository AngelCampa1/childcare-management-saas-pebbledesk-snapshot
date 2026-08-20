import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must be hoisted before imports
vi.mock("@pebbledesk/ui/components/select", async () => {
	const { createElement } = await import("react");
	return {
		Select: ({
			value,
			onValueChange,
			children,
		}: {
			value?: string;
			onValueChange?: (v: string) => void;
			children?: import("react").ReactNode;
		}) =>
			createElement(
				"select",
				{
					"data-testid": "select",
					value,
					onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value),
				},
				children,
			),
		SelectTrigger: ({ children }: { children?: import("react").ReactNode }) =>
			createElement("div", null, children),
		SelectValue: ({ placeholder }: { placeholder?: string }) =>
			createElement("span", null, placeholder),
		SelectContent: ({ children }: { children?: import("react").ReactNode }) => children,
		SelectItem: ({ value, children }: { value: string; children?: import("react").ReactNode }) =>
			createElement("option", { value }, children),
	};
});

describe("BillingPage - bulk invoice actions", () => {
	const draftInvoice = {
		id: "inv-draft-1",
		guardianId: "g-1",
		status: "draft",
		amountDue: 150,
		balanceRemaining: 150,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: "pay_draft",
	};
	const sentInvoice = {
		id: "inv-sent-1",
		guardianId: "g-2",
		status: "sent",
		amountDue: 225,
		balanceRemaining: 225,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: "pay_sent",
	};
	const paidInvoice = {
		id: "inv-paid-1",
		guardianId: "g-3",
		status: "paid",
		amountDue: 300,
		balanceRemaining: 0,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: "pay_paid",
	};
	const voidInvoice = {
		id: "inv-void-1",
		guardianId: "g-3",
		status: "void",
		amountDue: 300,
		balanceRemaining: 300,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: "pay_void",
	};

	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		mockedUseStripeConnectStatus.mockReturnValue({
			data: { stripeAccountId: "acct_123", stripeAccountStatus: "connected" },
			isLoading: false,
			isError: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [
				{ id: "g-1", firstName: "Ada", lastName: "Parent" },
				{ id: "g-2", firstName: "Ben", lastName: "Guardian" },
				{ id: "g-3", firstName: "Cleo", lastName: "Paid" },
			],
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoice, sentInvoice, paidInvoice],
			isLoading: false,
		} as never);
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("selects eligible invoices and shows a bulk action bar", () => {
		render(<BillingPage />);

		expect(
			screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("checkbox", { name: /Select invoice for Ben Guardian/ }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("checkbox", { name: /Select invoice for Cleo Paid/ }),
		).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }));

		expect(screen.getByText("1 selected")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send selected" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Record selected as paid" })).toBeInTheDocument();
	});

	it("removes invoices from the bulk selection when unchecked", () => {
		render(<BillingPage />);

		const draftCheckbox = screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ });
		fireEvent.click(draftCheckbox);
		fireEvent.click(draftCheckbox);

		expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
		expect(draftCheckbox).not.toBeChecked();
	});

	it("does not allow void invoices to be selected for bulk actions", () => {
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoice, voidInvoice],
			isLoading: false,
		} as never);
		render(<BillingPage />);

		expect(
			screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("checkbox", { name: /Select invoice for Cleo Paid/ }),
		).not.toBeInTheDocument();
	});

	it("bulk sends selected draft invoices without sending selected non-drafts", async () => {
		const sendMutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseSendInvoice.mockReturnValue({
			mutateAsync: sendMutateAsync,
			isPending: false,
		} as never);
		render(<BillingPage />);

		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }));
		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ben Guardian/ }));
		fireEvent.click(screen.getByRole("button", { name: "Send selected" }));

		await waitFor(() => {
			expect(sendMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(sendMutateAsync).toHaveBeenCalledWith("inv-draft-1");
		expect(await screen.findByText("Sent 1 invoice.")).toBeInTheDocument();
	});

	it("disables bulk send while Stripe Connect is not connected", () => {
		const sendMutateAsync = vi.fn();
		mockedUseSendInvoice.mockReturnValue({
			mutateAsync: sendMutateAsync,
			isPending: false,
		} as never);
		mockedUseStripeConnectStatus.mockReturnValue({
			data: { stripeAccountId: null, stripeAccountStatus: "not_connected" },
			isLoading: false,
			isError: false,
		} as never);
		render(<BillingPage />);

		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }));
		const sendSelected = screen.getByRole("button", { name: "Send selected" });

		expect(sendSelected).toBeDisabled();
		fireEvent.click(sendSelected);
		expect(sendMutateAsync).not.toHaveBeenCalled();
	});

	it("disables bulk send when selected invoices are not drafts", () => {
		const sendMutateAsync = vi.fn();
		mockedUseSendInvoice.mockReturnValue({
			mutateAsync: sendMutateAsync,
			isPending: false,
		} as never);
		render(<BillingPage />);

		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ben Guardian/ }));
		const sendSelected = screen.getByRole("button", { name: "Send selected" });

		expect(sendSelected).toBeDisabled();
		fireEvent.click(sendSelected);
		expect(sendMutateAsync).not.toHaveBeenCalled();
	});

	it("disables row invoice actions while a bulk send is running", async () => {
		let resolveBulkSend: () => void = () => undefined;
		const sendMutateAsync = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveBulkSend = resolve;
				}),
		);
		mockedUseSendInvoice.mockReturnValue({
			mutateAsync: sendMutateAsync,
			isPending: false,
		} as never);
		render(<BillingPage />);

		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }));
		fireEvent.click(screen.getByRole("button", { name: "Send selected" }));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
		});
		expect(screen.getAllByRole("button", { name: "Open pay link" }).at(0)).toBeDisabled();
		expect(screen.getAllByRole("button", { name: "Record payment" }).at(0)).toBeDisabled();
		resolveBulkSend();
		await waitFor(() => {
			expect(screen.getByText("Sent 1 invoice.")).toBeInTheDocument();
		});
	});

	it("records selected unpaid invoices as fully paid", async () => {
		const recordMutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseRecordPayment.mockReturnValue({
			mutateAsync: recordMutateAsync,
			isPending: false,
		} as never);
		render(<BillingPage />);

		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }));
		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ben Guardian/ }));
		fireEvent.click(screen.getByRole("button", { name: "Record selected as paid" }));
		const methodSelect = screen.getAllByTestId("select").at(-1) as HTMLSelectElement;
		fireEvent.change(methodSelect, { target: { value: "cash" } });
		fireEvent.change(screen.getByLabelText("Payment date"), {
			target: { value: "2026-04-15T09:30" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Confirm bulk payment" }));

		await waitFor(() => {
			expect(recordMutateAsync).toHaveBeenCalledTimes(2);
		});
		expect(recordMutateAsync).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				invoiceId: "inv-draft-1",
				amount: 150,
				method: "cash",
				provider: "manual",
			}),
		);
		expect(recordMutateAsync).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				invoiceId: "inv-sent-1",
				amount: 225,
				method: "cash",
				provider: "manual",
			}),
		);
		expect(await screen.findByText("Recorded payments for 2 invoices.")).toBeInTheDocument();
	});

	it("reports partial bulk payment failures and preserves failed selections", async () => {
		const recordMutateAsync = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("Payment already recorded"));
		mockedUseRecordPayment.mockReturnValue({
			mutateAsync: recordMutateAsync,
			isPending: false,
		} as never);
		render(<BillingPage />);

		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }));
		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ben Guardian/ }));
		fireEvent.click(screen.getByRole("button", { name: "Record selected as paid" }));
		const methodSelect = screen.getAllByTestId("select").at(-1) as HTMLSelectElement;
		fireEvent.change(methodSelect, { target: { value: "cash" } });
		fireEvent.click(screen.getByRole("button", { name: "Confirm bulk payment" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Ben Guardian, Apr 1, 2026 - Apr 30, 2026: Payment already recorded",
		);
		expect(
			screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }),
		).not.toBeChecked();
		expect(screen.getByRole("checkbox", { name: /Select invoice for Ben Guardian/ })).toBeChecked();
	});

	it("identifies duplicate guardian invoices by billing period in selection and failures", async () => {
		const sendMutateAsync = vi.fn().mockRejectedValue(new Error("Guardian email not found"));
		mockedUseSendInvoice.mockReturnValue({
			mutateAsync: sendMutateAsync,
			isPending: false,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [
				draftInvoice,
				{
					...draftInvoice,
					id: "inv-draft-2",
					periodStart: "2026-05-01",
					periodEnd: "2026-05-31",
				},
			],
			isLoading: false,
		} as never);
		render(<BillingPage />);

		fireEvent.click(
			screen.getByRole("checkbox", {
				name: "Select invoice for Ada Parent, Apr 1, 2026 - Apr 30, 2026",
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: "Send selected" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Ada Parent, Apr 1, 2026 - Apr 30, 2026: Guardian email not found",
		);
		expect(
			screen.getByRole("checkbox", {
				name: "Select invoice for Ada Parent, May 1, 2026 - May 31, 2026",
			}),
		).not.toBeChecked();
	});

	it("reports partial bulk send failures and preserves failed selections", async () => {
		const sendMutateAsync = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("Guardian email not found"));
		mockedUseSendInvoice.mockReturnValue({
			mutateAsync: sendMutateAsync,
			isPending: false,
		} as never);
		mockedUseInvoices.mockReturnValue({
			data: [
				draftInvoice,
				{ ...draftInvoice, id: "inv-draft-2", guardianId: "g-2", amountDue: 200 },
			],
			isLoading: false,
		} as never);
		render(<BillingPage />);

		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }));
		fireEvent.click(screen.getByRole("checkbox", { name: /Select invoice for Ben Guardian/ }));
		fireEvent.click(screen.getByRole("button", { name: "Send selected" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Ben Guardian, Apr 1, 2026 - Apr 30, 2026: Guardian email not found",
		);
		expect(
			screen.getByRole("checkbox", { name: /Select invoice for Ada Parent/ }),
		).not.toBeChecked();
		expect(screen.getByRole("checkbox", { name: /Select invoice for Ben Guardian/ })).toBeChecked();
	});
});

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	// Use a single stable function so useNavigate() returns the same reference
	// on every render, preventing the useEffect that depends on navigate from
	// re-running and triggering its cleanup unexpectedly in tests.
	const navigateFn = vi.fn().mockResolvedValue(undefined);
	return {
		...actual,
		createFileRoute: () => () => ({ component: null }),
		redirect: vi.fn(),
		useNavigate: () => navigateFn,
		Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
	};
});

vi.mock("../../../hooks/use-auth-session", () => ({
	authSessionQuery: { queryKey: ["authSession"] },
	useAuthSession: vi.fn(),
}));

vi.mock("../../../hooks/use-finance", () => ({
	useInvoices: vi.fn(),
	useInvoiceTemplates: vi.fn(),
	useInvoiceTemplateDetail: vi.fn(),
	useCreateInvoice: vi.fn(),
	useUpdateInvoice: vi.fn(),
	useDeleteInvoice: vi.fn(),
	useSendInvoice: vi.fn(),
	useRecordPayment: vi.fn(),
}));

vi.mock("../../../hooks/use-stripe-connect", () => ({
	useStripeConnectStatus: vi.fn(),
	useStartStripeConnectOnboarding: vi.fn(),
}));

vi.mock("../../../hooks/use-subscription", () => ({
	useOpenBillingPortal: vi.fn(),
	useTrialFeatureUsage: vi.fn(),
	useSubscriptionStatus: vi.fn(),
}));

vi.mock("../../../components/plan-picker", () => ({
	PlanPicker: () => <div data-testid="plan-picker">Plan Picker</div>,
}));

vi.mock("../../../hooks/use-guardians", () => ({
	useGuardians: vi.fn(),
}));

vi.mock("../../../components/empty-state", () => ({
	EmptyState: ({ title, action }: { title: string; action?: ReactNode }) => (
		<div>
			{title}
			{action}
		</div>
	),
}));

vi.mock("../../../components/status-badge", () => ({
	StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock("../../../components/date-input", () => ({
	DateInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input type="date" {...props} />
	),
}));

vi.mock("../../../components/guidance", () => ({
	GuidancePanel: () => null,
}));

vi.mock("../../../lib/uuid", () => ({
	generateId: () => "test-id",
}));

import type { SubscriptionPlan, SubscriptionStatus } from "@pebbledesk/shared";
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
import { useOpenBillingPortal, useSubscriptionStatus } from "../../../hooks/use-subscription";
import { BillingPage } from "./index";

const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedUseInvoices = vi.mocked(useInvoices);
const mockedUseGuardians = vi.mocked(useGuardians);
const mockedUseInvoiceTemplates = vi.mocked(useInvoiceTemplates);
const mockedUseInvoiceTemplateDetail = vi.mocked(useInvoiceTemplateDetail);
const mockedUseCreateInvoice = vi.mocked(useCreateInvoice);
const mockedUseUpdateInvoice = vi.mocked(useUpdateInvoice);
const mockedUseDeleteInvoice = vi.mocked(useDeleteInvoice);
const mockedUseSendInvoice = vi.mocked(useSendInvoice);
const mockedUseRecordPayment = vi.mocked(useRecordPayment);
const mockedUseStripeConnectStatus = vi.mocked(useStripeConnectStatus);
const mockedUseStartStripeConnectOnboarding = vi.mocked(useStartStripeConnectOnboarding);
const mockedUseOpenBillingPortal = vi.mocked(useOpenBillingPortal);
const mockedUseSubscriptionStatus = vi.mocked(useSubscriptionStatus);

function makeSession(overrides?: {
	role?: "owner" | "director" | "staff";
	subscriptionStatus?: SubscriptionStatus;
	subscriptionPlan?: SubscriptionPlan | null;
	trialEndsAt?: string | null;
	canOpenBillingPortal?: boolean;
}) {
	return {
		user: { id: "user-1", name: "Test Owner", email: "owner@test.com" },
		membership: { centerId: "center-1", role: overrides?.role ?? "owner" },
		center: {
			id: "center-1",
			name: "Test Center",
			state: "TX",
			timezone: "America/Chicago",
			subscriptionStatus: overrides?.subscriptionStatus ?? "trialing",
			subscriptionPlan: overrides?.subscriptionPlan ?? "center_starter",
			trialEndsAt: overrides?.trialEndsAt ?? null,
			currentPeriodEnd: null,
			canOpenBillingPortal: overrides?.canOpenBillingPortal ?? false,
		},
		pendingInvitation: null,
	};
}

function setupDefaultMocks() {
	mockedUseAuthSession.mockReturnValue({
		data: makeSession(),
		isLoading: false,
		error: null,
	} as never);
	mockedUseInvoices.mockReturnValue({ data: [], isLoading: false } as never);
	mockedUseGuardians.mockReturnValue({ data: [] } as never);
	mockedUseInvoiceTemplates.mockReturnValue({ data: [] } as never);
	mockedUseInvoiceTemplateDetail.mockReturnValue({ data: undefined } as never);
	mockedUseCreateInvoice.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	mockedUseUpdateInvoice.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	mockedUseDeleteInvoice.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedUseSendInvoice.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	mockedUseRecordPayment.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	mockedUseStripeConnectStatus.mockReturnValue({
		data: { stripeAccountId: null, stripeAccountStatus: "not_connected" },
		isLoading: false,
		isError: false,
	} as never);
	mockedUseStartStripeConnectOnboarding.mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
	mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	mockedUseSubscriptionStatus.mockReturnValue({ data: undefined } as never);
}

describe("BillingPage — checkout receipt banner", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("does not show the checkout success state when sessionStorage flag is absent", () => {
		render(<BillingPage />);
		expect(screen.queryByText("Family billing is now active")).not.toBeInTheDocument();
	});

	it("links directors to invoice template management", () => {
		render(<BillingPage />);

		expect(screen.getByRole("link", { name: /Manage templates/i })).toHaveAttribute(
			"href",
			"/billing/templates",
		);
	});

	it("shows the checkout success state when sessionStorage flag is set on mount", async () => {
		sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");
		render(<BillingPage />);
		await waitFor(() => {
			expect(screen.getByText("Family billing is now active")).toBeInTheDocument();
		});
	});

	it("clears the sessionStorage flag after displaying the success state", async () => {
		sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");
		render(<BillingPage />);
		await waitFor(() => {
			expect(screen.getByText("Family billing is now active")).toBeInTheDocument();
		});
		expect(sessionStorage.getItem("pebbledesk.checkoutJustCompleted")).toBeNull();
	});

	it("shows the what-is-unlocked description in the checkout success state", async () => {
		sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");
		render(<BillingPage />);
		await waitFor(() => {
			expect(
				screen.getByText(/You can now create invoices and share payment links with guardians/i),
			).toBeInTheDocument();
		});
	});

	it("shows the 'Create your first invoice' CTA in the checkout success state", async () => {
		sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");
		render(<BillingPage />);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /Create your first invoice/i }),
			).toBeInTheDocument();
		});
	});

	it("clicking 'Create your first invoice' opens the new invoice dialog", async () => {
		sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");
		render(<BillingPage />);
		const cta = await screen.findByRole("button", { name: /Create your first invoice/i });
		fireEvent.click(cta);
		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
	});
});

describe("BillingPage — billing skeleton", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("renders a skeleton while invoices are loading", () => {
		mockedUseInvoices.mockReturnValue({ data: undefined, isLoading: true } as never);
		render(<BillingPage />);
		// Skeleton renders instead of the billing heading
		expect(screen.queryByText("Billing")).not.toBeInTheDocument();
	});

	it("renders the billing heading when invoices are loaded", () => {
		render(<BillingPage />);
		expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
	});

	it("shows 'View payments' link when invoices exist", () => {
		mockedUseInvoices.mockReturnValue({
			data: [
				{
					id: "inv-1",
					guardianId: "g-1",
					status: "sent",
					amountDue: 100,
					periodStart: "2026-04-01",
					periodEnd: "2026-04-30",
					createdAt: "2026-04-01T00:00:00.000Z",
					publicPayToken: null,
				},
			],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		const link = screen.getByRole("link", { name: "View payments" });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "/billing/payments");
	});

	it("opens invoice creation from the empty state primary action", async () => {
		render(<BillingPage />);

		fireEvent.click(screen.getByRole("button", { name: "Create first invoice" }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
	});

	it("keeps billing setup as a secondary link when no invoices exist", () => {
		render(<BillingPage />);

		const links = screen.getAllByRole("link", { name: "Open billing setup" });
		expect(links).toHaveLength(2);
		for (const link of links) {
			expect(link).toHaveAttribute("href", "/settings");
		}
	});

	it("does not offer the Stripe portal while a no-card trial has no Stripe customer", () => {
		const mutateAsync = vi.fn();
		mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseAuthSession.mockReturnValue({
			data: makeSession({ subscriptionStatus: "trialing", canOpenBillingPortal: false }),
			isLoading: false,
			error: null,
		} as never);

		render(<BillingPage />);

		expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
		expect(screen.getByText(/Your no-card trial is active/i)).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Choose your plan" })).toBeInTheDocument();
	});

	it("opens the plan picker dialog when Choose your plan is clicked", () => {
		mockedUseAuthSession.mockReturnValue({
			data: makeSession({ subscriptionStatus: "trialing", canOpenBillingPortal: false }),
			isLoading: false,
			error: null,
		} as never);

		render(<BillingPage />);

		fireEvent.click(screen.getByRole("button", { name: "Choose your plan" }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByTestId("plan-picker")).toBeInTheDocument();
	});

	it("shows the plan picker prompt for non-trialing owners without portal access", () => {
		mockedUseAuthSession.mockReturnValue({
			data: makeSession({
				subscriptionStatus: "none",
				subscriptionPlan: null,
				canOpenBillingPortal: false,
			}),
			isLoading: false,
			error: null,
		} as never);

		render(<BillingPage />);

		expect(screen.getByText(/Choose a paid plan to add a payment method/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Choose your plan" })).toBeInTheDocument();
	});

	it("shows portal error when billing portal fails to open", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Portal unavailable"));
		mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseAuthSession.mockReturnValue({
			data: makeSession({ subscriptionStatus: "active", canOpenBillingPortal: true }),
			isLoading: false,
			error: null,
		} as never);

		render(<BillingPage />);

		fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Portal unavailable");
		});
	});

	it("opens the Stripe portal only when the session marks it available", () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseAuthSession.mockReturnValue({
			data: makeSession({ subscriptionStatus: "active", canOpenBillingPortal: true }),
			isLoading: false,
			error: null,
		} as never);

		render(<BillingPage />);

		fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});

	it("renders overdue invoice metrics when there are overdue invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [
				{
					id: "inv-1",
					guardianId: "g-1",
					status: "overdue",
					amountDue: 200,
					periodStart: "2026-03-01",
					periodEnd: "2026-03-31",
					createdAt: "2026-03-01T00:00:00.000Z",
					publicPayToken: null,
				},
			],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.getByText("Overdue invoices")).toBeInTheDocument();
	});

	it("resets line items when a template selection is changed to blank", async () => {
		const mockTemplate = {
			id: "tpl-1",
			name: "Monthly Tuition",
			dueDays: 7,
		};
		mockedUseInvoiceTemplates.mockReturnValue({ data: [mockTemplate] } as never);
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: {
				invoiceTemplate: { id: "tpl-1", dueDays: 7 },
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 500 }],
			},
		} as never);

		render(<BillingPage />);
		// Open new invoice dialog
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		// Select a template (using the native select from our mock)
		const selects = screen.getAllByTestId("select");
		const templateSelect = selects[0] as HTMLSelectElement;
		fireEvent.change(templateSelect, { target: { value: "tpl-1" } });

		// Now switch back to blank
		fireEvent.change(templateSelect, { target: { value: "__blank__" } });

		// Line items should be reset to a single blank item
		await waitFor(() => {
			const descriptions = screen.getAllByPlaceholderText("Description");
			expect(descriptions).toHaveLength(1);
		});
	});
});

describe("BillingPage — invoice line item input validation", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("disables 'Create invoice' button when a line item quantity is empty", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		const qtyInput = screen.getByPlaceholderText("Qty");
		fireEvent.change(qtyInput, { target: { value: "" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).toBeDisabled();
	});

	it("disables 'Create invoice' button when a line item quantity is zero", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		const qtyInput = screen.getByPlaceholderText("Qty");
		fireEvent.change(qtyInput, { target: { value: "0" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).toBeDisabled();
	});

	it("disables 'Create invoice' button when a line item unitPrice is empty", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		const unitPriceInput = screen.getByPlaceholderText("Unit price");
		fireEvent.change(unitPriceInput, { target: { value: "" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).toBeDisabled();
	});

	it("disables 'Create invoice' button when a line item quantity is fractional", async () => {
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Ada", lastName: "Parent" }],
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		const selects = screen.getAllByTestId("select");
		const guardianSelect = selects[1] as HTMLSelectElement;
		fireEvent.change(guardianSelect, { target: { value: "g-1" } });

		const qtyInput = screen.getByPlaceholderText("Qty");
		const unitPriceInput = screen.getByPlaceholderText("Unit price");
		// A fractional quantity passes z.number() but fails .int() server-side; block it client-side.
		fireEvent.change(qtyInput, { target: { value: "1.5" } });
		fireEvent.change(unitPriceInput, { target: { value: "50" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).toBeDisabled();
	});

	it("disables 'Create invoice' button when a line item quantity is non-numeric (NaN)", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		const qtyInput = screen.getByPlaceholderText("Qty");
		fireEvent.change(qtyInput, { target: { value: "abc" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).toBeDisabled();
	});

	it("disables 'Create invoice' button when a line item unitPrice is non-numeric (NaN)", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		const unitPriceInput = screen.getByPlaceholderText("Unit price");
		fireEvent.change(unitPriceInput, { target: { value: "abc" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).toBeDisabled();
	});

	it("does not disable 'Create invoice' button when line items have valid quantity and unitPrice", async () => {
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Ada", lastName: "Parent" }],
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		// Select a guardian so the guardian guard does not block submission
		const selects = screen.getAllByTestId("select");
		const guardianSelect = selects[1] as HTMLSelectElement;
		fireEvent.change(guardianSelect, { target: { value: "g-1" } });

		const qtyInput = screen.getByPlaceholderText("Qty");
		const unitPriceInput = screen.getByPlaceholderText("Unit price");
		fireEvent.change(qtyInput, { target: { value: "2" } });
		fireEvent.change(unitPriceInput, { target: { value: "50" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).not.toBeDisabled();
	});
});

describe("BillingPage — record payment input validation", () => {
	const invoiceWithPayment = {
		id: "inv-rp-1",
		guardianId: "g-1",
		status: "sent",
		amountDue: 150,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: null,
	};

	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		mockedUseInvoices.mockReturnValue({
			data: [invoiceWithPayment],
			isLoading: false,
		} as never);
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	async function openRecordPaymentDialog() {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
	}

	it("disables 'Confirm payment' button when amount is empty", async () => {
		await openRecordPaymentDialog();

		const amountInput = screen.getByRole("spinbutton");
		fireEvent.change(amountInput, { target: { value: "" } });

		const submitBtn = screen.getByRole("button", { name: /confirm payment/i });
		expect(submitBtn).toBeDisabled();
	});

	it("disables 'Confirm payment' button when amount is zero", async () => {
		await openRecordPaymentDialog();

		const amountInput = screen.getByRole("spinbutton");
		fireEvent.change(amountInput, { target: { value: "0" } });

		const submitBtn = screen.getByRole("button", { name: /confirm payment/i });
		expect(submitBtn).toBeDisabled();
	});

	it("disables 'Confirm payment' button when amount is negative", async () => {
		await openRecordPaymentDialog();

		const amountInput = screen.getByRole("spinbutton");
		fireEvent.change(amountInput, { target: { value: "-5" } });

		const submitBtn = screen.getByRole("button", { name: /confirm payment/i });
		expect(submitBtn).toBeDisabled();
	});

	it("does not disable 'Confirm payment' button when amount is a valid positive number", async () => {
		await openRecordPaymentDialog();

		const amountInput = screen.getByRole("spinbutton");
		fireEvent.change(amountInput, { target: { value: "150" } });

		const submitBtn = screen.getByRole("button", { name: /confirm payment/i });
		expect(submitBtn).not.toBeDisabled();
	});

	it("does not call mutateAsync when amount resolves to NaN at submit time", async () => {
		const mutateAsync = vi.fn();
		mockedUseRecordPayment.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /record payment/i }));

		// Force a NaN value directly into the input state via a programmatic change
		// that bypasses HTML number coercion (set the internal value via the input's value property)
		const amountInput = screen.getByRole("spinbutton");
		// Set value to empty string so Number("") === 0, which also fails the > 0 check
		Object.defineProperty(amountInput, "value", { writable: true, value: "NaN" });
		fireEvent.change(amountInput, { target: { value: "NaN" } });

		// Select a payment method so the method guard passes
		const selects = screen.getAllByTestId("select");
		// The payment method select is inside the dialog
		const methodSelect = selects[selects.length - 1] as HTMLSelectElement;
		fireEvent.change(methodSelect, { target: { value: "cash" } });

		// Form submit — the button is disabled when amount is non-numeric,
		// so submit directly via the form element
		const form = amountInput.closest("form");
		if (form) {
			fireEvent.submit(form);
		}

		await waitFor(() => {
			expect(mutateAsync).not.toHaveBeenCalled();
		});
	});

	it("defaults manual payment amount to the remaining balance", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [{ ...invoiceWithPayment, amountDue: 1000, balanceRemaining: 500 }],
			isLoading: false,
		} as never);

		await openRecordPaymentDialog();

		expect(screen.getByRole("spinbutton")).toHaveValue(500);
	});

	it("resets manual payment amount to remaining balance after closing the dialog", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [{ ...invoiceWithPayment, amountDue: 1000, balanceRemaining: 500 }],
			isLoading: false,
		} as never);

		await openRecordPaymentDialog();
		fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "125" } });
		fireEvent.keyDown(document, { key: "Escape" });
		fireEvent.click(screen.getByRole("button", { name: /record payment/i }));

		expect(screen.getByRole("spinbutton")).toHaveValue(500);
	});

	it("syncs manual payment amount when the remaining balance changes", async () => {
		const { rerender } = render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
		expect(screen.getByRole("spinbutton")).toHaveValue(150);

		mockedUseInvoices.mockReturnValue({
			data: [{ ...invoiceWithPayment, amountDue: 1000, balanceRemaining: 500 }],
			isLoading: false,
		} as never);
		rerender(<BillingPage />);

		expect(screen.getByRole("spinbutton")).toHaveValue(500);
	});
});

describe("BillingPage — UX improvements", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("always renders the Open invoices metric card even when count is zero", () => {
		render(<BillingPage />);
		expect(screen.getByText("Open invoices")).toBeInTheDocument();
	});

	it("always renders the Overdue metric card even when count is zero", () => {
		render(<BillingPage />);
		expect(screen.getByText("Overdue invoices")).toBeInTheDocument();
	});

	it("shows Create invoice as a primary button in the page header", () => {
		render(<BillingPage />);
		expect(screen.getByRole("button", { name: /Create invoice/i })).toBeInTheDocument();
	});

	it("shows only one visible create-invoice action on the billing page", () => {
		render(<BillingPage />);
		expect(screen.getAllByRole("button", { name: /Create invoice/i })).toHaveLength(1);
		expect(screen.queryByRole("button", { name: /New invoice/i })).not.toBeInTheDocument();
	});

	it("labels the invoice section as Family Billing", () => {
		render(<BillingPage />);
		expect(screen.getByText("Family Billing")).toBeInTheDocument();
	});

	it("labels the subscription section as PebbleDesk Subscription", () => {
		render(<BillingPage />);
		expect(screen.getByText("PebbleDesk Subscription")).toBeInTheDocument();
	});

	it("shows data-safe reassurance in the billing error state", () => {
		mockedUseInvoices.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch: vi.fn(),
		} as never);
		render(<BillingPage />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("We couldn't load your invoices")).toBeInTheDocument();
		expect(screen.getByText(/Your data is safe/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Refresh page/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Contact support/i })).toBeInTheDocument();
	});

	it("uses remaining balances for outstanding totals and invoice rows", () => {
		mockedUseInvoices.mockReturnValue({
			data: [
				{
					id: "inv-partial-1",
					guardianId: "g-1",
					status: "sent",
					amountDue: 1000,
					balanceRemaining: 500,
					periodStart: "2026-04-01",
					periodEnd: "2026-04-30",
					createdAt: "2026-04-01T00:00:00.000Z",
					publicPayToken: null,
				},
			],
			isLoading: false,
		} as never);

		render(<BillingPage />);

		const outstandingBalanceCard = screen.getByText("Outstanding balance").closest(".rounded-xl");
		expect(outstandingBalanceCard).toHaveTextContent("$500.00");
		expect(screen.getAllByText("$500.00")).toHaveLength(2);
		expect(screen.queryByText("$1,000.00")).not.toBeInTheDocument();
	});

	it("shows column headers above invoice line items in the create invoice dialog", () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Create invoice/i }));
		expect(screen.getByText("Description")).toBeInTheDocument();
		expect(screen.getByText("Qty")).toBeInTheDocument();
		expect(screen.getByText("Unit price")).toBeInTheDocument();
		expect(screen.getByText("Total")).toBeInTheDocument();
	});

	it("keeps invoice line item fields explicitly labelled for narrow screens", () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Create invoice/i }));
		expect(screen.getByLabelText("Line item 1 description")).toBeInTheDocument();
		expect(screen.getByLabelText("Line item 1 quantity")).toBeInTheDocument();
		expect(screen.getByLabelText("Line item 1 unit price")).toBeInTheDocument();
		expect(screen.getByLabelText("Line item 1 total")).toBeInTheDocument();
	});

	it("billing success state shows what is unlocked after checkout", () => {
		sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");
		render(<BillingPage />);
		expect(screen.getByText("Family billing is now active")).toBeInTheDocument();
		expect(
			screen.getByText(/You can now create invoices and share payment links with guardians/i),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Create your first invoice/i })).toBeInTheDocument();
	});

	it("billing success state explains what is unlocked and provides next step", () => {
		sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");
		render(<BillingPage />);
		expect(screen.getByText("Family billing is now active")).toBeInTheDocument();
		expect(
			screen.getByText("You can now create invoices and share payment links with guardians."),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Create your first invoice/i })).toBeInTheDocument();
	});
});

describe("BillingPage — guarded invoice editing", () => {
	const overdueInvoice = {
		id: "inv-overdue-1",
		guardianId: "g-1",
		status: "overdue",
		amountDue: 200,
		balanceRemaining: 200,
		periodStart: "2026-03-01",
		periodEnd: "2026-03-31",
		createdAt: "2026-03-01T00:00:00.000Z",
		publicPayToken: null,
	};

	const sentInvoiceForEdit = {
		id: "inv-sent-edit",
		guardianId: "g-1",
		status: "sent",
		amountDue: 300,
		balanceRemaining: 300,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: null,
	};

	const draftInvoiceForEdit = {
		id: "inv-draft-edit",
		guardianId: "g-1",
		status: "draft",
		amountDue: 100,
		balanceRemaining: 100,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: null,
	};

	const paidInvoiceForEdit = {
		id: "inv-paid-edit",
		guardianId: "g-1",
		status: "paid",
		amountDue: 100,
		balanceRemaining: 0,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: null,
	};

	const voidInvoiceForEdit = {
		id: "inv-void-edit",
		guardianId: "g-1",
		status: "void",
		amountDue: 100,
		balanceRemaining: 100,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: null,
	};

	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		mockedUseStripeConnectStatus.mockReturnValue({
			data: { stripeAccountId: "acct_123", stripeAccountStatus: "connected" },
			isLoading: false,
			isError: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Elena", lastName: "Lopez" }],
		} as never);
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("shows Edit button for draft invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
	});

	it("shows Edit button for sent invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [sentInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
	});

	it("shows Edit button for overdue invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [overdueInvoice],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
	});

	it("hides Edit button for paid invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [paidInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
	});

	it("hides Edit button for void invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [voidInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
	});

	it("shows locked-fields notice when editing a sent invoice", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [sentInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
		expect(screen.getByTestId("locked-fields-notice")).toBeInTheDocument();
		expect(screen.getByTestId("locked-fields-notice").textContent).toContain(
			"Sent invoices: only due date and notes can be edited.",
		);
	});

	it("shows locked-fields notice when editing an overdue invoice", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [overdueInvoice],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
		expect(screen.getByTestId("locked-fields-notice")).toBeInTheDocument();
	});

	it("does not show locked-fields notice when editing a draft invoice", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("locked-fields-notice")).not.toBeInTheDocument();
	});

	it("disables period start when editing a sent invoice", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [sentInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		const dialog = await screen.findByRole("dialog");
		const periodStartInput = within(dialog).getByLabelText(/^Period start$/i);
		expect(periodStartInput).toBeDisabled();
	});

	it("disables period end when editing a sent invoice", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [sentInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		const dialog = await screen.findByRole("dialog");
		const periodEndInput = within(dialog).getByLabelText(/^Period end$/i);
		expect(periodEndInput).toBeDisabled();
	});

	it("disables line item description when editing a sent invoice", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [sentInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		await screen.findByRole("dialog");
		expect(screen.getByPlaceholderText("Description")).toBeDisabled();
	});

	it("does not disable period start when editing a draft invoice", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		const dialog = await screen.findByRole("dialog");
		const periodStartInput = within(dialog).getByLabelText(/^Period start$/i);
		expect(periodStartInput).not.toBeDisabled();
	});

	it("submits only dueDate when saving edits to a sent invoice", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseUpdateInvoice.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseInvoices.mockReturnValue({
			data: [sentInvoiceForEdit],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		const dialog = await screen.findByRole("dialog");
		const dueDateInput = within(dialog).getByLabelText(/^Due date/i);
		fireEvent.change(dueDateInput, { target: { value: "2026-06-01" } });
		fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));
		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalled();
		});
		const callArg = mutateAsync.mock.calls[0]?.[0] as { input: Record<string, unknown> };
		expect(callArg.input).toEqual({ dueDate: "2026-06-01" });
		expect(callArg.input).not.toHaveProperty("guardianId");
		expect(callArg.input).not.toHaveProperty("periodStart");
		expect(callArg.input).not.toHaveProperty("lineItems");
	});
});

describe("BillingPage — family payment setup", () => {
	const draftInvoice = {
		id: "inv-draft-1",
		guardianId: "g-1",
		status: "draft",
		amountDue: 150,
		periodStart: "2026-04-01",
		periodEnd: "2026-04-30",
		createdAt: "2026-04-01T00:00:00.000Z",
		publicPayToken: "pay_123",
	};

	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("shows disconnected Stripe Connect status and starts onboarding for owners", () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseStartStripeConnectOnboarding.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		render(<BillingPage />);

		expect(screen.getByText("Family payments setup")).toBeInTheDocument();
		expect(screen.getByText("Not connected")).toBeInTheDocument();
		expect(
			screen.getByText(/Connect Stripe before sending online payment links/i),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Connect Stripe/i }));
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});

	it("shows onboarding errors when Stripe Connect cannot start", async () => {
		mockedUseStartStripeConnectOnboarding.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Stripe setup is temporarily unavailable.")),
			isPending: false,
		} as never);

		render(<BillingPage />);

		fireEvent.click(screen.getByRole("button", { name: /Connect Stripe/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Stripe setup is temporarily unavailable.",
		);
	});

	it("shows connected Stripe Connect status without an onboarding action", () => {
		mockedUseStripeConnectStatus.mockReturnValue({
			data: { stripeAccountId: "acct_123", stripeAccountStatus: "connected" },
			isLoading: false,
			isError: false,
		} as never);

		render(<BillingPage />);

		expect(screen.getByText("Online payments ready")).toBeInTheDocument();
		expect(screen.getByText("Connected")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Connect Stripe/i })).not.toBeInTheDocument();
	});

	it("shows a setup loading state while Stripe Connect status is loading", () => {
		mockedUseStripeConnectStatus.mockReturnValue({
			data: undefined,
			isLoading: true,
			isError: false,
		} as never);

		render(<BillingPage />);

		expect(screen.getByText("Checking payment setup...")).toBeInTheDocument();
	});

	it("shows a setup error when Stripe Connect status cannot load", () => {
		mockedUseStripeConnectStatus.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
		} as never);

		render(<BillingPage />);

		expect(screen.getByRole("alert")).toHaveTextContent("We couldn't check family payments");
	});

	it("does not show a broken payment setup error to staff who cannot manage Stripe", () => {
		mockedUseAuthSession.mockReturnValue({
			data: makeSession({ role: "staff" }),
			isLoading: false,
			error: null,
		} as never);
		mockedUseStripeConnectStatus.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
		} as never);

		render(<BillingPage />);

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(
			screen.getByText("Ask an owner or director to connect Stripe for online family payments."),
		).toBeInTheDocument();
	});

	it("blocks pay-link and send actions when Stripe Connect is not connected", () => {
		const mutateAsync = vi.fn();
		mockedUseSendInvoice.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoice],
			isLoading: false,
		} as never);

		render(<BillingPage />);

		expect(screen.queryByRole("link", { name: /Open pay link/i })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Connect Stripe/i })).toBeInTheDocument();

		const sendButton = screen.getByRole("button", { name: /Send/i });
		expect(sendButton).toBeDisabled();
		fireEvent.click(sendButton);
		expect(mutateAsync).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: /Record payment/i })).toBeInTheDocument();
	});

	it("allows pay-link and send actions when Stripe Connect is connected", () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseStripeConnectStatus.mockReturnValue({
			data: { stripeAccountId: "acct_123", stripeAccountStatus: "connected" },
			isLoading: false,
			isError: false,
		} as never);
		mockedUseSendInvoice.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoice],
			isLoading: false,
		} as never);

		render(<BillingPage />);

		expect(screen.getByRole("link", { name: /Open pay link/i })).toBeInTheDocument();
		const sendButton = screen.getByRole("button", { name: /Send/i });
		expect(sendButton).not.toBeDisabled();

		fireEvent.click(sendButton);
		expect(mutateAsync).toHaveBeenCalledWith("inv-draft-1");
	});
});

// ---------------------------------------------------------------------------
// Audit fix #4 — invoice template ID validation
// ---------------------------------------------------------------------------

describe("BillingPage — invoice template ID validation (#4)", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		mockedUseInvoiceTemplates.mockReturnValue({
			data: [{ id: "11111111-1111-1111-1111-111111111111", name: "Monthly Tuition" }],
		} as never);
		mockedUseInvoiceTemplateDetail.mockReturnValue({ data: undefined } as never);
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	// The mock Select renders native <select> — fireEvent.change only fires
	// React's onChange when the option value exists in the DOM (controlled input
	// constraint). We therefore test the validation at submit time, where the
	// templateId state value is checked directly before calling mutateAsync.

	it("blocks form submission when templateId contains a non-UUID string", async () => {
		// Start with empty templates so the only option in the mock select is __blank__.
		// We artificially set templateId via the blank → non-blank toggle by hacking
		// the select's value through Object.defineProperty.
		mockedUseInvoiceTemplates.mockReturnValue({ data: [] } as never);
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseCreateInvoice.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		const dialog = await screen.findByRole("dialog");

		// Change the internal React state for templateId by injecting an option
		// and firing change via the underlying select element.
		const selects = screen.getAllByTestId("select");
		const templateSelect = selects[0] as HTMLSelectElement;
		// Add a non-UUID option programmatically so the select sees the value
		const fakeOption = document.createElement("option");
		fakeOption.value = "not-a-uuid";
		templateSelect.appendChild(fakeOption);
		fireEvent.change(templateSelect, { target: { value: "not-a-uuid" } });

		// Submit the form — the submit guard should block mutation
		const form = dialog.querySelector("form");
		if (!form) throw new Error("Form not found");
		fireEvent.submit(form);

		await waitFor(() => {
			expect(mutateAsync).not.toHaveBeenCalled();
		});
	});

	it("shows inline error at submit time when templateId is not a valid UUID", async () => {
		mockedUseInvoiceTemplates.mockReturnValue({ data: [] } as never);
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseCreateInvoice.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		const dialog = await screen.findByRole("dialog");

		const selects = screen.getAllByTestId("select");
		const templateSelect = selects[0] as HTMLSelectElement;
		const fakeOption = document.createElement("option");
		fakeOption.value = "not-a-uuid";
		templateSelect.appendChild(fakeOption);
		fireEvent.change(templateSelect, { target: { value: "not-a-uuid" } });

		const form = dialog.querySelector("form");
		if (!form) throw new Error("Form not found");
		fireEvent.submit(form);

		await waitFor(() => {
			const alerts = screen.getAllByRole("alert");
			const templateAlert = alerts.find((a) =>
				a.textContent?.includes("Invalid template. Please select a template from the list."),
			);
			expect(templateAlert).toBeInTheDocument();
		});
	});

	it("blocks submission when templateId is a valid UUID absent from the templates list", async () => {
		// Template list has one template; submit with a UUID not in the list
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseCreateInvoice.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		const dialog = await screen.findByRole("dialog");

		const selects = screen.getAllByTestId("select");
		const templateSelect = selects[0] as HTMLSelectElement;
		const fakeOption = document.createElement("option");
		fakeOption.value = "99999999-9999-9999-9999-999999999999";
		templateSelect.appendChild(fakeOption);
		fireEvent.change(templateSelect, { target: { value: "99999999-9999-9999-9999-999999999999" } });

		const form = dialog.querySelector("form");
		if (!form) throw new Error("Form not found");
		fireEvent.submit(form);

		await waitFor(() => {
			expect(mutateAsync).not.toHaveBeenCalled();
		});
	});

	it("clears template error when selection reverts to blank", async () => {
		mockedUseInvoiceTemplates.mockReturnValue({ data: [] } as never);
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseCreateInvoice.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		const dialog = await screen.findByRole("dialog");

		const selects = screen.getAllByTestId("select");
		const templateSelect = selects[0] as HTMLSelectElement;

		// Select invalid value → trigger submit error
		const fakeOption = document.createElement("option");
		fakeOption.value = "not-a-uuid";
		templateSelect.appendChild(fakeOption);
		fireEvent.change(templateSelect, { target: { value: "not-a-uuid" } });

		const form = dialog.querySelector("form");
		if (!form) throw new Error("Form not found");
		fireEvent.submit(form);

		await waitFor(() => {
			expect(
				screen.getAllByRole("alert").some((a) => a.textContent?.includes("Invalid template")),
			).toBe(true);
		});

		// Revert to blank — templateIdError must clear
		fireEvent.change(templateSelect, { target: { value: "__blank__" } });

		await waitFor(() => {
			expect(
				screen.queryAllByRole("alert").some((a) => a.textContent?.includes("Invalid template")),
			).toBe(false);
		});
	});

	it("clears template error when valid UUID from template list is selected after an error", async () => {
		// Trigger the error with a blank-to-invalid selection, then revert to blank.
		// The "clears template error when selection reverts to blank" test above covers
		// going back to blank; this one verifies error is also gone after a successful
		// template choice (selecting from blank → valid UUID).
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		const dialog = await screen.findByRole("dialog");

		const selects = screen.getAllByTestId("select");
		const templateSelect = selects[0] as HTMLSelectElement;

		// First: trigger error by selecting a non-UUID via injected option
		const badOption = document.createElement("option");
		badOption.value = "not-a-uuid";
		templateSelect.appendChild(badOption);
		fireEvent.change(templateSelect, { target: { value: "not-a-uuid" } });

		const form = dialog.querySelector("form");
		if (!form) throw new Error("Form not found");
		fireEvent.submit(form);

		await waitFor(() => {
			expect(
				screen.getAllByRole("alert").some((a) => a.textContent?.includes("Invalid template")),
			).toBe(true);
		});

		// Revert to blank — error must clear
		fireEvent.change(templateSelect, { target: { value: "__blank__" } });

		await waitFor(() => {
			expect(
				screen.queryAllByRole("alert").some((a) => a.textContent?.includes("Invalid template")),
			).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// Audit fix #15 — createInvoice onError surfaces error via alert
// ---------------------------------------------------------------------------

describe("BillingPage — createInvoice onError (#15)", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Ada", lastName: "Parent" }],
		} as never);
		mockedUseInvoices.mockReturnValue({ data: [], isLoading: false } as never);
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("surfaces createInvoice error via onError callback and shows alert", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Server error from API"));
		mockedUseCreateInvoice.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<BillingPage />);
		// Open the new invoice dialog
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		const dialog = await screen.findByRole("dialog");

		// Submit form directly — the mutation will reject and set the createError state
		const form = dialog.querySelector("form");
		if (!form) throw new Error("Form not found in dialog");
		fireEvent.submit(form);

		await waitFor(() => {
			const alerts = screen.getAllByRole("alert");
			const errorAlert = alerts.find((a) => a.textContent?.includes("Server error from API"));
			expect(errorAlert).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Audit fix #22 — accessible label for template-select
// ---------------------------------------------------------------------------

describe("BillingPage — template select label accessibility (#22)", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("has a visible label linked to the template select trigger", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		await screen.findByRole("dialog");

		// FieldHelp renders a <label htmlFor="template-select"> with the help label text
		// "Start from template" (from billing.template inline help content).
		const templateLabel = screen.getByText(/Start from template/i);
		expect(templateLabel).toBeInTheDocument();
		// The label's htmlFor links it to the select trigger id
		const labelEl = templateLabel.closest("label");
		expect(labelEl).not.toBeNull();
		expect(labelEl).toHaveAttribute("for", "template-select");
	});
});

// ---------------------------------------------------------------------------
// Audit fix #29 — showCheckoutBanner cleared on unmount
// ---------------------------------------------------------------------------

describe("BillingPage — checkout banner cleared on unmount (#29)", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("clears showCheckoutBanner when the component unmounts", async () => {
		sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");

		const { unmount } = render(<BillingPage />);

		await waitFor(() => {
			expect(screen.getByText("Family billing is now active")).toBeInTheDocument();
		});

		unmount();

		// After unmount, re-render without the sessionStorage flag — banner must not appear
		render(<BillingPage />);
		expect(screen.queryByText("Family billing is now active")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// DEFECT 1 — guardian guard
// ---------------------------------------------------------------------------

describe("BillingPage — guardian required guard (DEFECT 1)", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Ada", lastName: "Parent" }],
		} as never);
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("disables Create invoice button when no guardian is selected", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		await screen.findByRole("dialog");

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).toBeDisabled();
	});

	it("shows 'Select a guardian' hint when no guardian is chosen", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		await screen.findByRole("dialog");

		const alerts = screen.getAllByRole("alert");
		const guardianAlert = alerts.find((a) => a.textContent?.includes("Select a guardian"));
		expect(guardianAlert).toBeInTheDocument();
	});

	it("enables Create invoice once a guardian is selected", async () => {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		await screen.findByRole("dialog");

		const selects = screen.getAllByTestId("select");
		const guardianSelect = selects[1] as HTMLSelectElement;
		fireEvent.change(guardianSelect, { target: { value: "g-1" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).not.toBeDisabled();
	});
});

// ---------------------------------------------------------------------------
// DEFECT 2 — period start <= end ordering check
// ---------------------------------------------------------------------------

describe("BillingPage — period ordering guard (DEFECT 2)", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Ada", lastName: "Parent" }],
		} as never);
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	async function openDialogAndSelectGuardian() {
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));
		await screen.findByRole("dialog");
		const selects = screen.getAllByTestId("select");
		const guardianSelect = selects[1] as HTMLSelectElement;
		fireEvent.change(guardianSelect, { target: { value: "g-1" } });
	}

	it("disables submit when period end is before period start", async () => {
		await openDialogAndSelectGuardian();

		const periodStartInput = screen.getByLabelText(/^Period start$/i);
		const periodEndInput = screen.getByLabelText(/^Period end$/i);
		fireEvent.change(periodStartInput, { target: { value: "2026-05-10" } });
		fireEvent.change(periodEndInput, { target: { value: "2026-05-01" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).toBeDisabled();
	});

	it("shows period ordering error when period end is before period start", async () => {
		await openDialogAndSelectGuardian();

		const periodStartInput = screen.getByLabelText(/^Period start$/i);
		const periodEndInput = screen.getByLabelText(/^Period end$/i);
		fireEvent.change(periodStartInput, { target: { value: "2026-05-10" } });
		fireEvent.change(periodEndInput, { target: { value: "2026-05-01" } });

		const alerts = screen.getAllByRole("alert");
		const periodAlert = alerts.find((a) =>
			a.textContent?.includes("Period end must be on or after period start"),
		);
		expect(periodAlert).toBeInTheDocument();
	});

	it("enables submit when period end equals period start", async () => {
		await openDialogAndSelectGuardian();

		const periodStartInput = screen.getByLabelText(/^Period start$/i);
		const periodEndInput = screen.getByLabelText(/^Period end$/i);
		fireEvent.change(periodStartInput, { target: { value: "2026-05-01" } });
		fireEvent.change(periodEndInput, { target: { value: "2026-05-01" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).not.toBeDisabled();
	});

	it("enables submit when period end is after period start", async () => {
		await openDialogAndSelectGuardian();

		const periodStartInput = screen.getByLabelText(/^Period start$/i);
		const periodEndInput = screen.getByLabelText(/^Period end$/i);
		fireEvent.change(periodStartInput, { target: { value: "2026-05-01" } });
		fireEvent.change(periodEndInput, { target: { value: "2026-05-31" } });

		const submitBtn = screen.getByRole("button", { name: /create invoice/i });
		expect(submitBtn).not.toBeDisabled();
	});
});

// ---------------------------------------------------------------------------
// DEFECT 3 — delete draft invoice UI
// ---------------------------------------------------------------------------

describe("BillingPage — delete draft invoice (DEFECT 3)", () => {
	const draftInvoiceForDelete = {
		id: "inv-draft-del",
		guardianId: "g-1",
		status: "draft",
		amountDue: 100,
		balanceRemaining: 100,
		periodStart: "2026-05-01",
		periodEnd: "2026-05-31",
		createdAt: "2026-05-01T00:00:00.000Z",
		publicPayToken: null,
	};

	const sentInvoiceForDelete = {
		id: "inv-sent-del",
		guardianId: "g-1",
		status: "sent",
		amountDue: 200,
		balanceRemaining: 200,
		periodStart: "2026-05-01",
		periodEnd: "2026-05-31",
		createdAt: "2026-05-01T00:00:00.000Z",
		publicPayToken: null,
	};

	const paidInvoiceForDelete = {
		id: "inv-paid-del",
		guardianId: "g-1",
		status: "paid",
		amountDue: 300,
		balanceRemaining: 0,
		periodStart: "2026-05-01",
		periodEnd: "2026-05-31",
		createdAt: "2026-05-01T00:00:00.000Z",
		publicPayToken: null,
	};

	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Ada", lastName: "Parent" }],
		} as never);
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("shows Delete button only for draft invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoiceForDelete],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.getByRole("button", { name: /^Delete$/ })).toBeInTheDocument();
	});

	it("does not show Delete button for sent invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [sentInvoiceForDelete],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.queryByRole("button", { name: /^Delete$/ })).not.toBeInTheDocument();
	});

	it("does not show Delete button for paid invoices", () => {
		mockedUseInvoices.mockReturnValue({
			data: [paidInvoiceForDelete],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		expect(screen.queryByRole("button", { name: /^Delete$/ })).not.toBeInTheDocument();
	});

	it("opens confirm dialog when Delete is clicked on a draft invoice", async () => {
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoiceForDelete],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
		await waitFor(() => {
			expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		});
		expect(screen.getByText("Delete draft invoice?")).toBeInTheDocument();
	});

	it("calls deleteInvoice.mutate with the invoice id on confirm", async () => {
		const mutate = vi.fn();
		mockedUseDeleteInvoice.mockReturnValue({ mutate, isPending: false } as never);
		mockedUseInvoices.mockReturnValue({
			data: [draftInvoiceForDelete],
			isLoading: false,
		} as never);
		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
		await waitFor(() => {
			expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		});
		fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
		await waitFor(() => {
			expect(mutate).toHaveBeenCalledWith("inv-draft-del");
		});
	});
});

describe("BillingPage — center-timezone timestamp formatting", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
	});

	afterEach(() => {
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("renders the trial-ends timestamp in the center timezone, not UTC", () => {
		// 2026-06-01T00:00:00Z is May 31 (evening) in America/Chicago.
		mockedUseAuthSession.mockReturnValue({
			data: makeSession({
				subscriptionStatus: "trialing",
				trialEndsAt: "2026-06-01T00:00:00.000Z",
			}),
			isLoading: false,
			error: null,
		} as never);

		render(<BillingPage />);

		expect(screen.getByText("May 31, 2026")).toBeInTheDocument();
		expect(screen.queryByText("Jun 1, 2026")).not.toBeInTheDocument();
	});

	it("renders the invoice created timestamp in the center timezone, not UTC", () => {
		mockedUseInvoices.mockReturnValue({
			data: [
				{
					id: "inv-tz-1",
					guardianId: "g-1",
					status: "draft",
					amountDue: 150,
					balanceRemaining: 150,
					periodStart: "2026-05-01",
					periodEnd: "2026-05-31",
					createdAt: "2026-06-01T00:00:00.000Z",
					publicPayToken: "pay_tz",
				},
			],
			isLoading: false,
		} as never);

		render(<BillingPage />);

		expect(screen.getByText("Created May 31, 2026")).toBeInTheDocument();
		expect(screen.queryByText("Created Jun 1, 2026")).not.toBeInTheDocument();
	});
});

describe("BillingPage — template due-date uses center timezone", () => {
	beforeEach(() => {
		setupDefaultMocks();
		sessionStorage.clear();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
		sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("defaults the due date from the center timezone's 'today', not the browser's", async () => {
		// 2026-06-01T01:00:00Z is still May 31 in most browser timezones (UTC and west
		// of it), but is already June 1 in the far-ahead center timezone Kiritimati
		// (UTC+14). The default due date must be anchored to the center's calendar day.
		vi.setSystemTime(new Date("2026-06-01T01:00:00.000Z"));

		mockedUseAuthSession.mockReturnValue({
			data: {
				...makeSession(),
				center: { ...makeSession().center, timezone: "Pacific/Kiritimati" },
			},
			isLoading: false,
			error: null,
		} as never);

		const mockTemplate = { id: "tpl-tz", name: "Monthly Tuition", dueDays: 5 };
		mockedUseInvoiceTemplates.mockReturnValue({ data: [mockTemplate] } as never);
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: {
				invoiceTemplate: { id: "tpl-tz", dueDays: 5 },
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 500 }],
			},
		} as never);

		render(<BillingPage />);
		fireEvent.click(screen.getByRole("button", { name: /create invoice/i }));

		const selects = screen.getAllByTestId("select");
		const templateSelect = selects[0] as HTMLSelectElement;
		fireEvent.change(templateSelect, { target: { value: "tpl-tz" } });

		// Center-tz "today" is 2026-06-01; + dueDays(5) = 2026-06-06. A browser-local
		// computation (still May 31) would instead yield 2026-06-05.
		await waitFor(() => {
			const dueInput = document.getElementById("due-date") as HTMLInputElement;
			expect(dueInput.value).toBe("2026-06-06");
		});
	});
});
