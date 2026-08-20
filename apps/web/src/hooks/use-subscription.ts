import type {
	BillingCadence,
	PlanFeature,
	SubscriptionPlan,
	SubscriptionStatus,
} from "@pebbledesk/shared";
import {
	redirectUrlResponseSchema,
	subscriptionStatusResponseSchema,
	trialFeatureUsageResponseSchema,
} from "@pebbledesk/shared";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared/constants";
import type { Query } from "@tanstack/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { assertAllowedRedirect } from "../lib/assert-allowed-redirect";
import { extractErrorMessage } from "../lib/extract-error-message";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";

export interface SubscriptionStatusPayload {
	subscriptionStatus: SubscriptionStatus;
	subscriptionPlan: SubscriptionPlan | null;
	trialEndsAt: string | null;
	currentPeriodEnd: string | null;
	stripeCustomerId: boolean;
}

export interface StartCheckoutInput {
	plan: Exclude<SubscriptionPlan, "enterprise">;
	cadence: BillingCadence;
	promoCode?: string;
}

interface RedirectResponse {
	url: string;
}

function checkoutAnalyticsProperties(input: StartCheckoutInput) {
	return {
		plan: input.plan,
		cadence: input.cadence,
		promo_present: Boolean(input.promoCode),
	};
}

type RefetchIntervalOption =
	| number
	| false
	| ((query: Query<SubscriptionStatusPayload>) => number | false);

export function useSubscriptionStatus(options?: {
	enabled?: boolean;
	refetchInterval?: RefetchIntervalOption;
}) {
	return useQuery({
		queryKey: ["subscriptionStatus"],
		refetchOnWindowFocus: true,
		enabled: options?.enabled ?? true,
		refetchInterval: options?.refetchInterval,
		queryFn: async () => {
			const res = await apiFetch("/api/subscriptions/status");
			const data = await parseJsonResponse(
				res,
				subscriptionStatusResponseSchema,
				"Failed to load subscription status",
			);
			return data as unknown as SubscriptionStatusPayload;
		},
	});
}

export function useStartCheckout() {
	return useMutation({
		mutationFn: async (input: StartCheckoutInput): Promise<RedirectResponse> => {
			track(ANALYTICS_EVENTS.billingCheckoutStarted, checkoutAnalyticsProperties(input));
			const res = await apiFetch("/api/subscriptions/checkout", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				redirectUrlResponseSchema,
				"Could not start checkout",
			);
			assertAllowedRedirect(data.url);
			return data as RedirectResponse;
		},
		onSuccess: (data, input) => {
			track(ANALYTICS_EVENTS.billingCheckoutRedirectOpened, {
				feature_name: "billing",
				action: "open_checkout",
				result: "success",
				target: "stripe_checkout",
				...checkoutAnalyticsProperties(input),
			});
			toast.success("Redirecting to secure checkout.");
			window.location.href = data.url;
		},
		onError: (error, input) => {
			track(ANALYTICS_EVENTS.billingCheckoutFailed, {
				feature_name: "billing",
				action: "open_checkout",
				result: "failed",
				target: "stripe_checkout",
				...checkoutAnalyticsProperties(input),
				error_code: "response_error",
			});
			toast.error(extractErrorMessage(error));
		},
	});
}

export interface TrialFeatureUsagePayload {
	usedFeatures: PlanFeature[];
}

export function useTrialFeatureUsage() {
	return useQuery({
		queryKey: ["trialFeatureUsage"],
		queryFn: async () => {
			const res = await apiFetch("/api/subscriptions/trial-usage");
			const data = await parseJsonResponse(
				res,
				trialFeatureUsageResponseSchema,
				"Failed to load trial feature usage",
			);
			return data as unknown as TrialFeatureUsagePayload;
		},
	});
}

export function useOpenBillingPortal() {
	return useMutation({
		mutationFn: async (): Promise<RedirectResponse> => {
			const res = await apiFetch("/api/subscriptions/portal", {
				method: "POST",
			});
			const data = await parseJsonResponse(
				res,
				redirectUrlResponseSchema,
				"Could not open billing portal",
			);
			assertAllowedRedirect(data.url);
			return data as RedirectResponse;
		},
		onSuccess: (data) => {
			track(ANALYTICS_EVENTS.billingPortalOpened, {
				feature_name: "billing",
				action: "open_billing_portal",
				result: "success",
				target: "billing_portal",
			});
			toast.success("Opening your billing portal.");
			window.location.href = data.url;
		},
		onError: (error) => {
			track(ANALYTICS_EVENTS.billingPortalFailed, {
				feature_name: "billing",
				action: "open_billing_portal",
				result: "failed",
				target: "billing_portal",
				error_code: "response_error",
			});
			toast.error(extractErrorMessage(error));
		},
	});
}
