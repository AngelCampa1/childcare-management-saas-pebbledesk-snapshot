import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { trackEvent } from "./analytics";

export function trackBillingToggle(period: "monthly" | "annual", sourcePage: string): void {
	trackEvent(ANALYTICS_EVENTS.billingToggleSwitched, {
		billing_period: period,
		source_page: sourcePage,
	});
}
