import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The classroom DETAIL page fires three Owner/Director-only GETs on mount:
//   - useRatios()           → GET /api/ratios            (ratios.ts:60)
//   - useClassroomChildren()→ GET /api/classrooms/:id/children (classrooms.ts:361)
//   - useClassroomStaff()   → GET /api/classrooms/:id/staff    (classrooms.ts:401)
// all guarded by requireRole("owner","director"). A staff user who deep-links
// /classrooms/<id> would fire those, get 403s, and land on a broken page. The
// "Classrooms" nav link is already gated to owner/director, so the route MUST
// carry a matching beforeLoad guard to redirect staff first.
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

// Stub the hooks imported across the route module tree so it loads under JSDOM.
vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
	authSessionQuery: {
		queryKey: ["authSession"],
		queryFn: vi.fn().mockResolvedValue({ membership: null }),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	},
}));
vi.mock("../../../hooks/use-children", () => ({ useChildren: vi.fn() }));
vi.mock("../../../hooks/use-members", () => ({ useMembers: vi.fn() }));
vi.mock("../../../hooks/use-ratios", () => ({ useRatios: vi.fn() }));
vi.mock("../../../hooks/use-classrooms", () => ({
	useArchiveClassroom: vi.fn(),
	useAssignChild: vi.fn(),
	useAssignStaff: vi.fn(),
	useClassroom: vi.fn(),
	useClassroomChildren: vi.fn(),
	useClassroomStaff: vi.fn(),
	useClassrooms: vi.fn(),
	useCreateClassroom: vi.fn(),
	useUnarchiveClassroom: vi.fn(),
	useUnassignChild: vi.fn(),
	useUnassignStaff: vi.fn(),
	useUpdateClassroom: vi.fn(),
}));

const { Route } = await import("./$id");

function makeContext(role?: string) {
	const qc = new QueryClient();
	if (role !== undefined) {
		qc.setQueryData(["authSession"], { membership: { role } });
	}
	return { queryClient: qc };
}

describe("/_auth/classrooms/$id — beforeLoad role guard", () => {
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
