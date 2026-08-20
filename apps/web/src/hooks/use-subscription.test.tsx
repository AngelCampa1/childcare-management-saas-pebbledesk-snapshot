import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
import { useOpenBillingPortal, useStartCheckout, useSubscriptionStatus } from "./use-subscription";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);
const mockedToast = vi.mocked(toast);

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

function jsonResponse<T>(payload: T, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: async () => payload,
	} as Response;
}

const originalLocation = window.location;

beforeEach(() => {
	mockedApiFetch.mockReset();
	mockedTrack.mockReset();
	mockedToast.success.mockReset();
	mockedToast.error.mockReset();
	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: { href: "" } as Location,
	});
});

afterEach(() => {
	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: originalLocation,
	});
});

describe("useSubscriptionStatus", () => {
	it("fetches the current subscription status", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			jsonResponse({
				subscriptionStatus: "trialing",
				subscriptionPlan: "home",
				trialEndsAt: "2026-05-13T00:00:00.000Z",
				currentPeriodEnd: null,
				stripeCustomerId: true,
			}),
		);

		const { result } = renderHook(() => useSubscriptionStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/subscriptions/status");
		expect(result.current.data?.subscriptionStatus).toBe("trialing");
	});

	it("throws the server error when status fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500));

		const { result } = renderHook(() => useSubscriptionStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toEqual(new Error("boom"));
	});

	it("falls back to the default message when status body is missing", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => {
				throw new Error("no body");
			},
		} as unknown as Response);

		const { result } = renderHook(() => useSubscriptionStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toEqual(new Error("Failed to load subscription status"));
	});

	it("rejects a status response that fails schema validation", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			jsonResponse({
				subscriptionStatus: "bogus",
				subscriptionPlan: null,
				trialEndsAt: null,
				currentPeriodEnd: null,
				stripeCustomerId: false,
			}),
		);

		const { result } = renderHook(() => useSubscriptionStatus(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});
});

describe("useStartCheckout", () => {
	it("posts and redirects on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			jsonResponse({ url: "https://checkout.stripe.com/test-session" }),
		);

		const { result } = renderHook(() => useStartCheckout(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync({ plan: "home", cadence: "annual", promoCode: "Y80OFF" });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/subscriptions/checkout", {
			method: "POST",
			body: JSON.stringify({ plan: "home", cadence: "annual", promoCode: "Y80OFF" }),
		});
		expect(mockedTrack).toHaveBeenCalledWith("billing_checkout_started", {
			plan: "home",
			cadence: "annual",
			promo_present: true,
		});
		expect(mockedTrack).toHaveBeenCalledWith("billing_checkout_redirect_opened", {
			feature_name: "billing",
			action: "open_checkout",
			result: "success",
			target: "stripe_checkout",
			plan: "home",
			cadence: "annual",
			promo_present: true,
		});
		expect(window.location.href).toBe("https://checkout.stripe.com/test-session");
	});

	it("surfaces the server error on checkout failure", async () => {
		mockedApiFetch.mockResolvedValueOnce(jsonResponse({ error: "nope" }, false, 400));

		const { result } = renderHook(() => useStartCheckout(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ plan: "center_starter", cadence: "annual" }),
		).rejects.toThrow("nope");
		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("nope"));
		expect(mockedTrack).toHaveBeenCalledWith("billing_checkout_failed", {
			feature_name: "billing",
			action: "open_checkout",
			result: "failed",
			target: "stripe_checkout",
			plan: "center_starter",
			cadence: "annual",
			promo_present: false,
			error_code: "response_error",
		});
	});

	it("falls back to the default checkout error message when body is unreadable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => {
				throw new Error("bad json");
			},
		} as unknown as Response);

		const { result } = renderHook(() => useStartCheckout(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync({ plan: "home", cadence: "monthly" })).rejects.toThrow(
			"Could not start checkout",
		);
	});
});

describe("useOpenBillingPortal", () => {
	it("posts and redirects on success", async () => {
		mockedApiFetch.mockResolvedValueOnce(
			jsonResponse({ url: "https://billing.stripe.com/test-portal" }),
		);

		const { result } = renderHook(() => useOpenBillingPortal(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/subscriptions/portal", { method: "POST" });
		expect(mockedTrack).toHaveBeenCalledWith("billing_portal_opened", {
			feature_name: "billing",
			action: "open_billing_portal",
			result: "success",
			target: "billing_portal",
		});
		expect(window.location.href).toBe("https://billing.stripe.com/test-portal");
	});

	it("surfaces the server error when the portal call fails", async () => {
		mockedApiFetch.mockResolvedValueOnce(jsonResponse({ error: "no customer" }, false, 409));

		const { result } = renderHook(() => useOpenBillingPortal(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync()).rejects.toThrow("no customer");
		await waitFor(() => expect(mockedToast.error).toHaveBeenCalledWith("no customer"));
		expect(mockedTrack).toHaveBeenCalledWith("billing_portal_failed", {
			feature_name: "billing",
			action: "open_billing_portal",
			result: "failed",
			target: "billing_portal",
			error_code: "response_error",
		});
	});

	it("falls back to the default portal error message when body is unreadable", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: async () => {
				throw new Error("bad json");
			},
		} as unknown as Response);

		const { result } = renderHook(() => useOpenBillingPortal(), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync()).rejects.toThrow("Could not open billing portal");
	});
});
