import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The Time Entries page lists the full center roster via useMembers(), which
// hits GET /api/members — Owner/Director only on the backend
// (apps/api/src/routes/members.ts:60 requireRole("owner","director")). The page
// fires useMembers() on mount, so a staff user who deep-links /scheduling/time
// would get a 403 and land on a broken page. The sidebar already gates the
// "Time Entries" nav link to owner/director, so the route MUST carry a matching
// beforeLoad guard to redirect staff first.
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
vi.mock("../../../hooks/use-members", () => ({ useMembers: vi.fn() }));
vi.mock("../../../hooks/use-phase5", () => ({
	useTimeEntries: vi.fn(),
	useApproveTimeEntry: vi.fn(),
}));

const { Route } = await import("./time");

function makeContext(role?: string) {
	const qc = new QueryClient();
	if (role !== undefined) {
		qc.setQueryData(["authSession"], { membership: { role } });
	}
	return { queryClient: qc };
}

describe("/_auth/scheduling/time — beforeLoad role guard", () => {
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
