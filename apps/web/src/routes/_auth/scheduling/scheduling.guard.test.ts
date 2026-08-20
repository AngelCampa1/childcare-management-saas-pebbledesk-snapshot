import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
	authSessionQuery: {
		queryKey: ["authSession"],
		queryFn: vi.fn().mockResolvedValue({ membership: null }),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	},
}));
vi.mock("../../../hooks/use-classrooms", () => ({ useClassrooms: vi.fn() }));
vi.mock("../../../hooks/use-members", () => ({ useMembers: vi.fn() }));
vi.mock("../../../hooks/use-phase5", () => ({
	useSchedules: vi.fn(),
	useShifts: vi.fn(),
	useCreateSchedule: vi.fn(),
	useCreateShift: vi.fn(),
	useDeleteSchedule: vi.fn(),
	useDeleteShift: vi.fn(),
}));
vi.mock("../../../components/empty-state", () => ({ EmptyState: () => null }));
vi.mock("../../../components/design-system", () => ({
	ComplianceSummary: () => null,
	ConfirmDestructiveDialog: () => null,
}));
vi.mock("../../../components/help-tip", () => ({
	FieldHelp: () => null,
	PageHelpPanel: () => null,
}));
vi.mock("../../../components/date-input", () => ({ DateInput: () => null }));

const { Route } = await import("./index");

function makeContext(role?: string) {
	const qc = new QueryClient();
	if (role !== undefined) {
		qc.setQueryData(["authSession"], { membership: { role } });
	}
	return { queryClient: qc };
}

describe("/_auth/scheduling/ — role access", () => {
	it("Route.options.beforeLoad is not defined (no route-level guard — staff may access read-only view)", () => {
		expect(Route.options.beforeLoad).toBeUndefined();
	});

	it("allows owner through without throwing (no guard present)", () => {
		// beforeLoad is undefined — optional call returns undefined (no redirect thrown)
		expect(
			Route.options.beforeLoad?.({
				context: makeContext("owner"),
			} as Parameters<NonNullable<typeof Route.options.beforeLoad>>[0]),
		).toBeUndefined();
	});

	it("allows director through without throwing (no guard present)", () => {
		// beforeLoad is undefined — optional call returns undefined (no redirect thrown)
		expect(
			Route.options.beforeLoad?.({
				context: makeContext("director"),
			} as Parameters<NonNullable<typeof Route.options.beforeLoad>>[0]),
		).toBeUndefined();
	});

	it("allows staff through without redirecting (staff sees read-only scheduling view)", () => {
		// beforeLoad is undefined — optional call returns undefined (no redirect thrown)
		expect(
			Route.options.beforeLoad?.({
				context: makeContext("staff"),
			} as Parameters<NonNullable<typeof Route.options.beforeLoad>>[0]),
		).toBeUndefined();
		expect(mockRedirect).not.toHaveBeenCalled();
	});
});
