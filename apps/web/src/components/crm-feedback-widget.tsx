import { useEffect } from "react";

const DEFAULT_LOADER_URL = "https://widgets.ventoralabs.com/w/v1.js";

/**
 * Injects the Ventora CRM feedback-button widget into the authenticated app
 * surface. The widget key is read from VITE_CRM_WIDGET_KEY; when the variable
 * is absent the component renders nothing. The loader URL defaults to the
 * production CRM but can be overridden via VITE_CRM_LOADER_URL for staging.
 *
 * The CRM enforces an origin allowlist server-side, so the widget fetch
 * no-ops on localhost — this is expected behaviour.
 */
export function CrmFeedbackWidget() {
	const key = import.meta.env.VITE_CRM_WIDGET_KEY as string | undefined;
	const url = (import.meta.env.VITE_CRM_LOADER_URL as string | undefined) || DEFAULT_LOADER_URL;

	// biome-ignore lint/correctness/useExhaustiveDependencies: key is intentionally in the deps so the effect re-runs and re-injects the loader when VITE_CRM_WIDGET_KEY changes.
	useEffect(() => {
		if (!key) return;

		const selector = `script[data-product="${key}"][data-widget="feedback-button"]`;
		if (document.querySelector(selector)) return;

		const script = document.createElement("script");
		script.src = url;
		script.async = true;
		script.setAttribute("data-product", key);
		script.setAttribute("data-widget", "feedback-button");
		document.body.appendChild(script);

		return () => {
			script.remove();
		};
	}, [url, key]);

	return null;
}
