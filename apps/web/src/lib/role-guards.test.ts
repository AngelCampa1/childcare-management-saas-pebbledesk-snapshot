import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedirect } = vi.hoisted(() => ({
	mockRedirect: vi.fn((opts: { to: string; search?: Record<string, string> }) => {
		const err = new Error(`REDIRECT:${opts.to}`);
		(err as unknown as Record<string, unknown>).__isRedirect = true;
		(err as unknown as Record<string, unknown>).to = opts.to;
		(err as unknown as Record<string, unknown>).search = opts.search;
		return err;
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	redirect: mockRedirect,
}));

// Mock use-auth-session so ensureQueryData uses our mock queryFn
vi.mock("../hooks/use-auth-session", async () => {
	const actual = await vi.importActual<typeof import("../hooks/use-auth-session")>(
		"../hooks/use-auth-session",
	);
	return {
		...actual,
		authSessionQuery: {
			queryKey: ["authSession"] as const,
			// queryFn is replaced per-test via mockResolvedValueOnce
			queryFn: vi.fn(),
			// Use Infinity so setQueryData-seeded values are treated as fresh,
			// letting us distinguish the warm-cache path from the cold-cache path.
			staleTime: Number.POSITIVE_INFINITY,
			retry: false,
		},
	};
});

const { requireDirectorOrOwner, requireOwner } = await import("./role-guards");
const { authSessionQuery } = await import("../hooks/use-auth-session");
const { AuthSessionError } = await import("../hooks/use-auth-session");

/** Warm-cache context: session pre-seeded in the QueryClient cache. */
function makeWarmContext(role?: string) {
	const qc = new QueryClient();
	if (role !== undefined) {
		qc.setQueryData(["authSession"], { membership: { role } });
	}
	return { queryClient: qc };
}

/** Cold-cache context: cache is empty but ensureQueryData resolves via queryFn. */
function makeColdContext(role: string | "throw-auth-error" | "throw-network-error") {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	if (role === "throw-auth-error") {
		vi.mocked(authSessionQuery.queryFn).mockRejectedValueOnce(
			new AuthSessionError("onboarding_required", "Onboarding required"),
		);
	} else if (role === "throw-network-error") {
		vi.mocked(authSessionQuery.queryFn).mockRejectedValueOnce(new TypeError("Failed to fetch"));
	} else {
		vi.mocked(authSessionQuery.queryFn).mockResolvedValueOnce({
			user: { id: "u1", name: "Test", email: "t@t.com" },
			membership: { id: "m1", centerId: "c1", role: role as "owner" | "director" | "staff" },
			center: { id: "c1", name: "Test Center", state: "TX", timezone: "UTC" },
			classroomIds: [],
		});
	}

	return { queryClient: qc };
}

// ─── requireDirectorOrOwner ───────────────────────────────────────────────────

describe("requireDirectorOrOwner — warm cache", () => {
	beforeEach(() => vi.clearAllMocks());

	it("does not throw for owner", async () => {
		await expect(requireDirectorOrOwner(makeWarmContext("owner"))).resolves.toBeUndefined();
	});

	it("does not throw for director", async () => {
		await expect(requireDirectorOrOwner(makeWarmContext("director"))).resolves.toBeUndefined();
	});

	it("throws redirect for staff", async () => {
		await expect(requireDirectorOrOwner(makeWarmContext("staff"))).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});

	it("throws redirect when session missing (no cache, no queryFn)", async () => {
		// Warm context with no role seeded — cache returns undefined
		// ensureQueryData will call the mocked queryFn which resolves to no-role staff
		vi.mocked(authSessionQuery.queryFn).mockResolvedValueOnce({
			user: { id: "u1", name: "Test", email: "t@t.com" },
			membership: { id: "m1", centerId: "c1", role: "staff" as const },
			center: { id: "c1", name: "Test Center", state: "TX", timezone: "UTC" },
			classroomIds: [],
		});
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		await expect(requireDirectorOrOwner({ queryClient: qc })).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});

	it("throws redirect when role is unknown string", async () => {
		await expect(requireDirectorOrOwner(makeWarmContext("guest"))).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});
});

describe("requireDirectorOrOwner — cold cache", () => {
	beforeEach(() => vi.clearAllMocks());

	it("does NOT redirect when cold cache resolves to owner", async () => {
		await expect(requireDirectorOrOwner(makeColdContext("owner"))).resolves.toBeUndefined();
		expect(mockRedirect).not.toHaveBeenCalled();
	});

	it("does NOT redirect when cold cache resolves to director", async () => {
		await expect(requireDirectorOrOwner(makeColdContext("director"))).resolves.toBeUndefined();
		expect(mockRedirect).not.toHaveBeenCalled();
	});

	it("redirects with denied when cold cache resolves to staff", async () => {
		await expect(requireDirectorOrOwner(makeColdContext("staff"))).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});

	it("propagates AuthSessionError (onboarding_required) without redirecting to denied", async () => {
		const ctx = makeColdContext("throw-auth-error");
		await expect(requireDirectorOrOwner(ctx)).rejects.toThrow(AuthSessionError);
		// Must NOT have called redirect — the error should bubble to the error boundary
		expect(mockRedirect).not.toHaveBeenCalled();
	});

	it("propagates network errors without redirecting to denied", async () => {
		const ctx = makeColdContext("throw-network-error");
		await expect(requireDirectorOrOwner(ctx)).rejects.toThrow(TypeError);
		expect(mockRedirect).not.toHaveBeenCalled();
	});
});

// ─── requireOwner ─────────────────────────────────────────────────────────────

describe("requireOwner — warm cache", () => {
	beforeEach(() => vi.clearAllMocks());

	it("does not throw for owner", async () => {
		await expect(requireOwner(makeWarmContext("owner"))).resolves.toBeUndefined();
	});

	it("throws redirect for director", async () => {
		await expect(requireOwner(makeWarmContext("director"))).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});

	it("throws redirect for staff", async () => {
		await expect(requireOwner(makeWarmContext("staff"))).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});

	it("throws redirect when session is missing", async () => {
		vi.mocked(authSessionQuery.queryFn).mockResolvedValueOnce({
			user: { id: "u1", name: "Test", email: "t@t.com" },
			membership: { id: "m1", centerId: "c1", role: "staff" as const },
			center: { id: "c1", name: "Test Center", state: "TX", timezone: "UTC" },
			classroomIds: [],
		});
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		await expect(requireOwner({ queryClient: qc })).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});
});

describe("requireOwner — cold cache", () => {
	beforeEach(() => vi.clearAllMocks());

	it("does NOT redirect when cold cache resolves to owner", async () => {
		await expect(requireOwner(makeColdContext("owner"))).resolves.toBeUndefined();
		expect(mockRedirect).not.toHaveBeenCalled();
	});

	it("redirects with denied when cold cache resolves to director", async () => {
		await expect(requireOwner(makeColdContext("director"))).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});

	it("redirects with denied when cold cache resolves to staff", async () => {
		await expect(requireOwner(makeColdContext("staff"))).rejects.toThrow();
		expect(mockRedirect).toHaveBeenCalledWith({ to: "/dashboard", search: { denied: "true" } });
	});

	it("propagates AuthSessionError (onboarding_required) without redirecting to denied", async () => {
		const ctx = makeColdContext("throw-auth-error");
		await expect(requireOwner(ctx)).rejects.toThrow(AuthSessionError);
		expect(mockRedirect).not.toHaveBeenCalled();
	});

	it("propagates network errors without redirecting to denied", async () => {
		const ctx = makeColdContext("throw-network-error");
		await expect(requireOwner(ctx)).rejects.toThrow(TypeError);
		expect(mockRedirect).not.toHaveBeenCalled();
	});
});
