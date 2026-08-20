import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The ratio HISTORY page fires Owner/Director-only GETs on mount:
//   - useRatioViolations() → GET /api/ratios/violations (ratios.ts:215)
//   - useRatioSnapshots()  → GET /api/ratios/snapshots  (ratios.ts:170)
// both guarded by requireRole("owner","director"). The "Ratios" nav link is
// gated to owner/director and the main /ratios route already carries a guard,
// so the history route MUST carry a matching beforeLoad guard to redirect staff
// (and unauthenticated deep-linkers) before those doomed 403s fire.
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

// Stub the hooks imported at module level so the route loads under JSDOM.
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
vi.mock("../../../hooks/use-ratios", () => ({
	useRatioSnapshots: vi.fn(),
	useRatioViolations: vi.fn(),
	useUpdateViolationNotes: vi.fn(),
}));

const { Route } = await import("./history");

function makeContext(role?: string) {
	const qc = new QueryClient();
	if (role !== undefined) {
		qc.setQueryData(["authSession"], { membership: { role } });
	}
	return { queryClient: qc };
}

describe("/_auth/ratios/history — beforeLoad role guard", () => {
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
