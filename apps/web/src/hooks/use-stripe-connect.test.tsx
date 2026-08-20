import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
import { useStartStripeConnectOnboarding, useStripeConnectStatus } from "./use-stripe-connect";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);
const mockedToast = vi.mocked(toast);

function createResponse<T>(payload: T) {
	return {
		ok: true,
		json: async () => payload,
	} as Response;
}

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

describe("Stripe Connect hooks", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("loads the connected Stripe account status", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				stripeAccountId: "acct_123",
				stripeAccountStatus: "connected",
				stripeAccountDisabledReason: null,
			}),
		);

		const { result } = renderHook(() => useStripeConnectStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/stripe/connect/status");
		expect(result.current.data?.stripeAccountStatus).toBe("connected");
	});

	it("surfaces Stripe account status loading failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useStripeConnectStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect((result.current.error as Error).message).toBe("Failed to load Stripe Connect status");
	});

	it("starts Stripe Connect onboarding and redirects to the returned account link", async () => {
		const originalLocation = window.location;
		const locationMock = { ...originalLocation, href: "" } as Location;
		Object.defineProperty(window, "location", {
			configurable: true,
			value: locationMock,
		});
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({
				accountId: "acct_123",
				url: "https://connect.stripe.com/setup/s/acct_123",
			}),
		);

		const { result } = renderHook(() => useStartStripeConnectOnboarding(), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/stripe/connect/onboarding-link", {
			method: "POST",
		});
		expect(window.location.href).toBe("https://connect.stripe.com/setup/s/acct_123");
		expect(mockedTrack).toHaveBeenCalledWith("stripe_connect_onboarding_started", {
			feature_name: "billing",
			action: "stripe_connect_onboarding",
			result: "success",
			target: "stripe_connect",
			has_account_id: true,
		});

		Object.defineProperty(window, "location", {
			configurable: true,
			value: originalLocation,
		});
	});

	it("surfaces Stripe Connect onboarding failures with server error message", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: vi.fn().mockResolvedValue({ error: "Stripe onboarding unavailable" }),
		} as unknown as Response);

		const { result } = renderHook(() => useStartStripeConnectOnboarding(), {
			wrapper: createWrapper(),
		});

		await expect(result.current.mutateAsync()).rejects.toThrow("Stripe onboarding unavailable");
		await waitFor(() =>
			expect(mockedToast.error).toHaveBeenCalledWith("Stripe onboarding unavailable"),
		);
		expect(mockedTrack).toHaveBeenCalledWith("stripe_connect_onboarding_failed", {
			feature_name: "billing",
			action: "stripe_connect_onboarding",
			result: "failed",
			target: "stripe_connect",
			error_code: "response_error",
		});
	});

	it("rejects a Stripe status response that fails schema validation", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			createResponse({ stripeAccountId: null, stripeAccountStatus: "bogus" }),
		);

		const { result } = renderHook(() => useStripeConnectStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});
});
