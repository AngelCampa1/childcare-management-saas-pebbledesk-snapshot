import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { trackEvent } from "./analytics";

let hasFiredFocus = false;

export function trackEmailFocus(sourcePage: string): void {
	if (hasFiredFocus) return;
	hasFiredFocus = true;
	trackEvent(ANALYTICS_EVENTS.emailFieldFocused, { source_page: sourcePage });
}

export function trackEmailBlurWithoutSubmit(sourcePage: string, hasValue: boolean): void {
	trackEvent(ANALYTICS_EVENTS.emailFieldAbandoned, {
		source_page: sourcePage,
		had_value: hasValue,
	});
}

export function resetFocusTracking(): void {
	hasFiredFocus = false;
}
