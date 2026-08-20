import {
	ANALYTICS_EVENTS,
	stripeConnectOnboardingLinkResponseSchema,
	stripeConnectStatusResponseSchema,
} from "@pebbledesk/shared";
import type { StripeAccountStatus } from "@pebbledesk/shared/constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { assertAllowedRedirect } from "../lib/assert-allowed-redirect";
import { extractErrorMessage } from "../lib/extract-error-message";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

export interface StripeConnectStatusPayload {
	stripeAccountId: string | null;
	stripeAccountStatus: StripeAccountStatus;
	stripeAccountDisabledReason?: string | null;
}

interface StripeConnectOnboardingLinkPayload {
	accountId: string;
	url: string;
}

export function useStripeConnectStatus() {
	const activeCenterId = useActiveCenterId();

	return useQuery({
		queryKey: [activeCenterId, "stripeConnectStatus"],
		queryFn: async () => {
			const res = await apiFetch("/api/stripe/connect/status");
			const data = await parseJsonResponse(
				res,
				stripeConnectStatusResponseSchema,
				"Failed to load Stripe Connect status",
			);
			return data as unknown as StripeConnectStatusPayload;
		},
	});
}

export function useStartStripeConnectOnboarding() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (): Promise<StripeConnectOnboardingLinkPayload> => {
			const res = await apiFetch("/api/stripe/connect/onboarding-link", {
				method: "POST",
			});
			const data = await parseJsonResponse(
				res,
				stripeConnectOnboardingLinkResponseSchema,
				"Could not start Stripe onboarding",
			);
			assertAllowedRedirect(data.url);
			return data as unknown as StripeConnectOnboardingLinkPayload;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "stripeConnectStatus"] });
			track(ANALYTICS_EVENTS.stripeConnectOnboardingStarted, {
				feature_name: "billing",
				action: "stripe_connect_onboarding",
				result: "success",
				target: "stripe_connect",
				has_account_id: data.accountId.length > 0,
			});
			toast.success("Redirecting to Stripe to finish setup.");
			window.location.href = data.url;
		},
		onError: (error) => {
			track(ANALYTICS_EVENTS.stripeConnectOnboardingFailed, {
				feature_name: "billing",
				action: "stripe_connect_onboarding",
				result: "failed",
				target: "stripe_connect",
				error_code: "response_error",
			});
			toast.error(extractErrorMessage(error));
		},
	});
}
