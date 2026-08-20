import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrmFeedbackWidget } from "./crm-feedback-widget";

describe("CrmFeedbackWidget", () => {
	beforeEach(() => {
		// Remove any previously injected CRM scripts before each test
		for (const el of document.querySelectorAll('script[data-widget="feedback-button"]')) {
			el.remove();
		}
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		for (const el of document.querySelectorAll('script[data-widget="feedback-button"]')) {
			el.remove();
		}
	});

	it("injects a script tag with the correct src when key is set", () => {
		vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_test_key_123");
		vi.stubEnv("VITE_CRM_LOADER_URL", "");

		render(<CrmFeedbackWidget />);

		const script = document.querySelector(
			'script[data-product="wk_test_key_123"][data-widget="feedback-button"]',
		) as HTMLScriptElement | null;

		expect(script).not.toBeNull();
		expect(script?.getAttribute("data-product")).toBe("wk_test_key_123");
		expect(script?.getAttribute("data-widget")).toBe("feedback-button");
		// src resolves to default loader URL when VITE_CRM_LOADER_URL is empty
		expect(script?.src).toContain("widgets.ventoralabs.com/w/v1.js");
	});

	it("uses VITE_CRM_LOADER_URL when provided", () => {
		vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_test_key_456");
		vi.stubEnv("VITE_CRM_LOADER_URL", "https://crm-staging.ventoralabs.com/w/v1.js");

		render(<CrmFeedbackWidget />);

		const script = document.querySelector(
			'script[data-product="wk_test_key_456"][data-widget="feedback-button"]',
		) as HTMLScriptElement | null;

		expect(script).not.toBeNull();
		expect(script?.src).toBe("https://crm-staging.ventoralabs.com/w/v1.js");
	});

	it("renders nothing (no script injected) when key is absent", () => {
		vi.stubEnv("VITE_CRM_WIDGET_KEY", "");

		render(<CrmFeedbackWidget />);

		const scripts = document.querySelectorAll('script[data-widget="feedback-button"]');
		expect(scripts.length).toBe(0);
	});

	it("does not inject a duplicate script if one already exists", () => {
		vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_test_key_789");
		vi.stubEnv("VITE_CRM_LOADER_URL", "");

		// Pre-inject a matching script
		const existing = document.createElement("script");
		existing.setAttribute("data-product", "wk_test_key_789");
		existing.setAttribute("data-widget", "feedback-button");
		document.body.appendChild(existing);

		render(<CrmFeedbackWidget />);

		const scripts = document.querySelectorAll(
			'script[data-product="wk_test_key_789"][data-widget="feedback-button"]',
		);
		expect(scripts.length).toBe(1);
	});

	it("removes the script on unmount", () => {
		vi.stubEnv("VITE_CRM_WIDGET_KEY", "wk_test_key_abc");
		vi.stubEnv("VITE_CRM_LOADER_URL", "");

		const { unmount } = render(<CrmFeedbackWidget />);

		expect(
			document.querySelector(
				'script[data-product="wk_test_key_abc"][data-widget="feedback-button"]',
			),
		).not.toBeNull();

		unmount();

		expect(
			document.querySelector(
				'script[data-product="wk_test_key_abc"][data-widget="feedback-button"]',
			),
		).toBeNull();
	});
});
