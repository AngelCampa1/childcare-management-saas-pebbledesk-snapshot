import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api";
import {
	AuthSessionDataSchema,
	AuthSessionError,
	AuthVerificationError,
	type PendingInvitation,
	useAuthSession,
} from "./use-auth-session";

vi.mock("../api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../api")>();
	return {
		...actual,
		apiFetch: vi.fn(),
	};
});

const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

describe("useAuthSession", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
	});

	it("loads the current auth session", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				session: {
					user: { id: "user-1", name: "Jane Smith", email: "jane@example.com" },
					membership: { id: "membership-1", centerId: "center-1", role: "director" },
					center: {
						id: "center-1",
						name: "Pebble Center",
						state: "TX",
						timezone: "America/Chicago",
					},
					classroomIds: [],
				},
				pendingInvitation: {
					membershipId: "membership-2",
					centerId: "center-2",
					centerName: "Pebble North",
					role: "staff",
				},
			}),
		} as Response);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me");
		expect(result.current.data?.membership.role).toBe("director");
		expect(result.current.data?.center.timezone).toBe("America/Chicago");
		expect(result.current.data?.pendingInvitation).toEqual({
			membershipId: "membership-2",
			centerId: "center-2",
			centerName: "Pebble North",
			role: "staff",
		});
	});

	it("surfaces a failed auth session request", async () => {
		mockedApiFetch.mockRejectedValueOnce(new ApiError("Unauthorized", 401, {}));

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(AuthSessionError);
		expect((result.current.error as Error).message).toBe("Failed to fetch auth session");
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me");
	});

	it("marks accepted-account users without a center as onboarding required", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("No center membership found", 403, {
				code: "onboarding_required",
				error: "No center membership found",
			}),
		);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(AuthSessionError);
		expect((result.current.error as AuthSessionError).code).toBe("onboarding_required");
	});

	it("marks pending invited users with invitation context", async () => {
		const invitation: PendingInvitation = {
			membershipId: "membership-2",
			centerId: "center-2",
			centerName: "Pebble North",
			role: "staff",
		};
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Invitation pending", 403, {
				code: "invite_pending",
				error: "Invitation pending",
				invitation,
			}),
		);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(AuthSessionError);
		expect((result.current.error as AuthSessionError).code).toBe("invite_pending");
		expect((result.current.error as AuthSessionError).invitation).toEqual(invitation);
	});

	it("treats pending-invitation errors without invitation context as regular errors", async () => {
		mockedApiFetch.mockRejectedValueOnce(
			new ApiError("Invitation pending", 403, {
				code: "invite_pending",
				error: "Invitation pending",
			}),
		);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error).not.toBeInstanceOf(AuthSessionError);
		expect((result.current.error as Error).message).toBe("Invitation pending");
	});

	it("does not fetch the auth session while the query is disabled", async () => {
		const { result } = renderHook(() => useAuthSession({ enabled: false }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("treats rate limiting as a transient verification failure instead of sign-out", async () => {
		mockedApiFetch.mockRejectedValueOnce(new ApiError("Rate limit exceeded", 429, {}));

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(AuthVerificationError);
	});

	it("treats server auth errors as transient verification failures with status context", async () => {
		mockedApiFetch.mockRejectedValueOnce(new ApiError("Server unavailable", 503, {}));

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(AuthVerificationError);
		expect((result.current.error as AuthVerificationError).status).toBe(503);
	});

	it("treats aborted and network auth checks as transient verification failures", async () => {
		mockedApiFetch.mockRejectedValueOnce(new DOMException("Request aborted", "AbortError"));

		const aborted = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(aborted.result.current.isError).toBe(true));
		expect(aborted.result.current.error).toBeInstanceOf(AuthVerificationError);

		mockedApiFetch.mockRejectedValueOnce(new TypeError("Network failed"));

		const network = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(network.result.current.isError).toBe(true));
		expect(network.result.current.error).toBeInstanceOf(AuthVerificationError);
	});

	it("normalizes non-error auth failures to a generic auth session error", async () => {
		mockedApiFetch.mockRejectedValueOnce("unexpected failure");

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(Error);
		expect((result.current.error as Error).message).toBe("Failed to fetch auth session");
	});

	it("sets centerInvalid when the session centerId is not in the memberships list", async () => {
		// First call: /api/auth/me
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				session: {
					user: { id: "user-1", name: "Jane Smith", email: "jane@example.com" },
					membership: { id: "membership-1", centerId: "center-stale", role: "director" },
					center: {
						id: "center-stale",
						name: "Old Center",
						state: "TX",
						timezone: "America/Chicago",
					},
					classroomIds: [],
				},
			}),
		} as Response);

		// Second call: /api/memberships/mine — does not include center-stale
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				memberships: [
					{
						id: "mem-2",
						centerId: "center-active",
						centerName: "Active Center",
						role: "staff",
						acceptedAt: "2026-01-01T00:00:00.000Z",
					},
				],
			}),
		} as Response);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.centerInvalid).toBe(true);
	});

	it("does not set centerInvalid when the session centerId appears in the memberships list", async () => {
		// First call: /api/auth/me
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				session: {
					user: { id: "user-1", name: "Jane Smith", email: "jane@example.com" },
					membership: { id: "membership-1", centerId: "center-1", role: "director" },
					center: {
						id: "center-1",
						name: "Pebble Center",
						state: "TX",
						timezone: "America/Chicago",
					},
					classroomIds: [],
				},
			}),
		} as Response);

		// Second call: /api/memberships/mine — includes center-1
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				memberships: [
					{
						id: "mem-1",
						centerId: "center-1",
						centerName: "Pebble Center",
						role: "director",
						acceptedAt: "2026-01-01T00:00:00.000Z",
					},
				],
			}),
		} as Response);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.centerInvalid).toBeFalsy();
	});

	it("does not block the session when the memberships check fails transiently", async () => {
		// First call: /api/auth/me
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				session: {
					user: { id: "user-1", name: "Jane Smith", email: "jane@example.com" },
					membership: { id: "membership-1", centerId: "center-1", role: "director" },
					center: {
						id: "center-1",
						name: "Pebble Center",
						state: "TX",
						timezone: "America/Chicago",
					},
					classroomIds: [],
				},
			}),
		} as Response);

		// Second call: /api/memberships/mine — throws a network error
		mockedApiFetch.mockRejectedValueOnce(new TypeError("Network failed"));

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		// Session is returned without centerInvalid so the user stays signed in
		expect(result.current.data?.centerInvalid).toBeFalsy();
		expect(result.current.data?.membership.centerId).toBe("center-1");
	});

	it("keeps auth session data immediately stale so account changes are rechecked on mount and focus", async () => {
		mockedApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				session: {
					user: { id: "user-1", name: "Jane Smith", email: "jane@example.com" },
					membership: { id: "membership-1", centerId: "center-1", role: "director" },
					center: {
						id: "center-1",
						name: "Pebble Center",
						state: "TX",
						timezone: "America/Chicago",
					},
					classroomIds: [],
				},
			}),
		} as Response);

		const client = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		// keep a dedicated options inspection render using a fresh client
		const inspectWrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);
		renderHook(() => useAuthSession(), { wrapper: inspectWrapper });

		await waitFor(() => {
			const query = client.getQueryCache().find({ queryKey: ["authSession"] });
			expect(query?.options.staleTime).toBe(0);
			expect(query?.options.refetchOnMount).toBe(true);
			expect(query?.options.refetchOnWindowFocus).toBe(true);
			expect(query?.options.retry).toBe(false);
		});
	});

	it("throws a ZodError when the API response is missing required session fields", async () => {
		// Malformed: missing user.email and membership.role
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				session: {
					user: { id: "user-1", name: "Jane Smith" /* email missing */ },
					membership: { id: "membership-1", centerId: "center-1" /* role missing */ },
					center: {
						id: "center-1",
						name: "Pebble Center",
						state: "TX",
						timezone: "America/Chicago",
					},
					classroomIds: [],
				},
			}),
		} as Response);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(Error);
		// ZodError message includes the field path
		expect((result.current.error as Error).message).toMatch(/email|role/i);
	});

	it("throws when the API returns a completely empty response body", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({}),
		} as Response);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("throws when the API returns an array instead of a session object", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [],
		} as Response);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(Error);
	});

	it("resolves successfully when the API returns pendingInvitation as null at the top level", async () => {
		// Regression: GET /api/auth/me returns `"pendingInvitation": null` but the schema
		// used `.optional()` which rejects null. This crashed every logged-in page load.
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				session: {
					user: { id: "user-1", name: "Jane Smith", email: "jane@example.com" },
					membership: { id: "membership-1", centerId: "center-1", role: "director" },
					center: {
						id: "center-1",
						name: "Pebble Center",
						state: "TX",
						timezone: "America/Chicago",
					},
					classroomIds: [],
					pendingInvitation: null,
				},
				pendingInvitation: null,
			}),
		} as Response);

		// Second call: /api/memberships/mine
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				memberships: [{ centerId: "center-1" }],
			}),
		} as Response);

		const { result } = renderHook(() => useAuthSession(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toBeDefined();
		// null is coerced to undefined/null — either way it must not be a PendingInvitation object
		expect(result.current.data?.pendingInvitation == null).toBe(true);
	});
});

describe("AuthSessionDataSchema", () => {
	const validSession = {
		user: { id: "u-1", name: "Jane Smith", email: "jane@example.com" },
		membership: { id: "m-1", centerId: "c-1", role: "director" as const },
		center: { id: "c-1", name: "Pebble Center", state: "TX", timezone: "America/Chicago" },
		classroomIds: [],
	};

	it("accepts a valid session object", () => {
		expect(() => AuthSessionDataSchema.parse(validSession)).not.toThrow();
	});

	it("rejects a session with an invalid role", () => {
		expect(() =>
			AuthSessionDataSchema.parse({
				...validSession,
				membership: { ...validSession.membership, role: "superadmin" },
			}),
		).toThrow();
	});

	it("rejects a session where classroomIds is not an array", () => {
		expect(() =>
			AuthSessionDataSchema.parse({ ...validSession, classroomIds: "classroom-1" }),
		).toThrow();
	});

	it("rejects a session with an invalid subscriptionStatus", () => {
		expect(() =>
			AuthSessionDataSchema.parse({
				...validSession,
				center: { ...validSession.center, subscriptionStatus: "unknown_status" },
			}),
		).toThrow();
	});

	it("rejects a session with an invalid subscriptionPlan", () => {
		expect(() =>
			AuthSessionDataSchema.parse({
				...validSession,
				center: { ...validSession.center, subscriptionPlan: "enterprise_plus" },
			}),
		).toThrow();
	});

	it("accepts a null subscriptionPlan", () => {
		expect(() =>
			AuthSessionDataSchema.parse({
				...validSession,
				center: { ...validSession.center, subscriptionPlan: null },
			}),
		).not.toThrow();
	});

	it("accepts all valid subscription statuses", () => {
		for (const status of [
			"none",
			"trialing",
			"active",
			"past_due",
			"canceled",
			"unpaid",
			"incomplete",
			"incomplete_expired",
		]) {
			expect(() =>
				AuthSessionDataSchema.parse({
					...validSession,
					center: { ...validSession.center, subscriptionStatus: status },
				}),
			).not.toThrow();
		}
	});
});
