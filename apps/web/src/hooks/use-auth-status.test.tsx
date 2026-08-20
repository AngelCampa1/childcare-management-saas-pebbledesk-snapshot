import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api";
import { AuthVerificationError } from "./use-auth-session";
import { useAuthStatus } from "./use-auth-status";

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

describe("useAuthStatus", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
	});

	it("loads the current public auth status without relying on 401 or 403 responses", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				status: "invite_pending",
				invitation: {
					membershipId: "membership-2",
					centerId: "center-2",
					centerName: "Pebble North",
					role: "staff",
				},
			}),
		} as Response);

		const { result } = renderHook(() => useAuthStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/status");
		expect(result.current.data).toEqual({
			status: "invite_pending",
			invitation: {
				membershipId: "membership-2",
				centerId: "center-2",
				centerName: "Pebble North",
				role: "staff",
			},
		});
	});

	it("treats a transient auth-status failure as a verification issue", async () => {
		mockedApiFetch.mockRejectedValueOnce(new ApiError("Rate limit exceeded", 429, {}));

		const { result } = renderHook(() => useAuthStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/status");
		expect(result.current.error).toBeInstanceOf(AuthVerificationError);
	});

	it("uses the same longer cache window without eager auth-status refetches", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ status: "unauthenticated" }),
		} as Response);

		const client = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});

		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		);

		renderHook(() => useAuthStatus(), { wrapper });

		await waitFor(() => {
			const query = client.getQueryCache().find({ queryKey: ["authStatus"] });
			expect(query?.options.staleTime).toBe(5 * 60 * 1000);
			expect(query?.options.refetchOnMount).toBe(false);
			expect(query?.options.refetchOnWindowFocus).toBe(false);
			expect(query?.options.retry).toBe(false);
		});
	});
});
