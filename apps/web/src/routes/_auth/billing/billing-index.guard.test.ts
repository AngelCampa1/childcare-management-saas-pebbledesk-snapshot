import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @tanstack/react-router so createFileRoute passes through but redirect
// is interceptable. All other module-level side effects are stubbed below.
// ---------------------------------------------------------------------------

const { mockRedirect } = vi.hoisted(() => ({
	mockRedirect: vi.fn((opts: { to: string; search?: Record<string, string> }) => {
		const err = new Error(`REDIRECT:${opts.to}`);
		(err as unknown as Record<string, unknown>).__isRedirect = true;
		(err as unknown as Record<string, unknown>).to = opts.to;
		(err as unknown as Record<string, unknown>).search = opts.search;
		return err;
	}),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const original = await importOriginal<typeof import("@tanstack/react-router")>();
	return { ...original, redirect: mockRedirect };
});

// Stub out every hook and heavy dependency imported at module level so the
// route module loads without crashing in a JSDOM environment.
vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
	authSessionQuery: {
		queryKey: ["authSession"],
		queryFn: vi.fn().mockResolvedValue({ membership: null }),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	},
}));
vi.mock("../../../hooks/use-finance", () => ({
	useInvoices: vi.fn(),
	useInvoiceTemplates: vi.fn(),
	useInvoiceTemplateDetail: vi.fn(),
	useCreateInvoice: vi.fn(),
	useUpdateInvoice: vi.fn(),
	useSendInvoice: vi.fn(),
	useRecordPayment: vi.fn(),
}));
vi.mock("../../../hooks/use-guardians", () => ({ useGuardians: vi.fn() }));
vi.mock("../../../hooks/use-stripe-connect", () => ({
	useStripeConnectStatus: vi.fn(),
	useStartStripeConnectOnboarding: vi.fn(),
}));
vi.mock("../../../hooks/use-subscription", () => ({
	useOpenBillingPortal: vi.fn(),
	useTrialFeatureUsage: vi.fn(),
	useSubscriptionStatus: vi.fn(),
}));
vi.mock("../../../components/plan-picker", () => ({ PlanPicker: () => null }));
vi.mock("../../../components/empty-state", () => ({ EmptyState: () => null }));
vi.mock("../../../components/guidance", () => ({ GuidancePanel: () => null }));
vi.mock("../../../components/help-tip", () => ({
	FieldHelp: () => null,
	HelpTip: () => null,
	PageHelpPanel: () => null,
}));
vi.mock("../../../components/status-badge", () => ({ StatusBadge: () => null }));
vi.mock("../../../components/date-input", () => ({ DateInput: () => null }));
vi.mock("../../../lib/guidance-content", () => ({
	getRequiredAppInlineHelpById: () => ({ label: "", text: "" }),
}));
vi.mock("../../../lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../lib/uuid", () => ({ generateId: () => "test-id" }));

const { Route } = await import("./index");

function makeContext(role?: string) {
	const qc = new QueryClient();
	if (role !== undefined) {
		qc.setQueryData(["authSession"], { membership: { role } });
	}
	return { queryClient: qc };
}

describe("/_auth/billing/ — beforeLoad role guard", () => {
	it("Route.options.beforeLoad is defined", () => {
		expect(typeof Route.options.beforeLoad).toBe("function");
	});

	it("allows owner through without throwing", async () => {
		await expect(
			Route.options.beforeLoad?.({
				context: makeContext("owner"),
			} as Parameters<NonNullable<typeof Route.options.beforeLoad>>[0]),
		).resolves.toBeUndefined();
	});

	it("allows director through without throwing", async () => {
		await expect(
			Route.options.beforeLoad?.({
				context: makeContext("director"),
			} as Parameters<NonNullable<typeof Route.options.beforeLoad>>[0]),
		).resolves.toBeUndefined();
	});

	it("redirects staff to /dashboard?denied=true", async () => {
		await expect(
			Route.options.beforeLoad?.({
				context: makeContext("staff"),
			} as Parameters<NonNullable<typeof Route.options.beforeLoad>>[0]),
		).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({
			to: "/dashboard",
			search: { denied: "true" },
		});
	});

	it("redirects unauthenticated visitor (no session) to /dashboard?denied=true", async () => {
		await expect(
			Route.options.beforeLoad?.({
				context: makeContext(undefined),
			} as Parameters<NonNullable<typeof Route.options.beforeLoad>>[0]),
		).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({
			to: "/dashboard",
			search: { denied: "true" },
		});
	});
});
