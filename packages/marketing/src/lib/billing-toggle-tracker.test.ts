import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogInstance } from "./analytics";
import { trackBillingToggle } from "./billing-toggle-tracker";

function makePostHogMock(overrides: Partial<PostHogInstance> = {}): PostHogInstance {
	return {
		capture: vi.fn(),
		identify: vi.fn(),
		...overrides,
	};
}

describe("trackBillingToggle", () => {
	beforeEach(() => {
		delete window.posthog;
	});

	afterEach(() => {
		delete window.posthog;
	});

	it("fires billing toggle event with monthly period and source page", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });

		trackBillingToggle("monthly", "/pricing");

		expect(capture).toHaveBeenCalledOnce();
		expect(capture).toHaveBeenCalledWith(ANALYTICS_EVENTS.billingToggleSwitched, {
			billing_period: "monthly",
			source_page: "/pricing",
		});
	});

	it("fires billing toggle event with annual period and source page", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });

		trackBillingToggle("annual", "/landing");

		expect(capture).toHaveBeenCalledOnce();
		expect(capture).toHaveBeenCalledWith(ANALYTICS_EVENTS.billingToggleSwitched, {
			billing_period: "annual",
			source_page: "/landing",
		});
	});

	it("does not throw when window.posthog is undefined", () => {
		expect(() => trackBillingToggle("monthly", "/pricing")).not.toThrow();
	});

	it("normalizes source_page to a path without query details", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });

		trackBillingToggle("annual", "/crewroute/pricing?ref=nav");

		expect(capture).toHaveBeenCalledWith(ANALYTICS_EVENTS.billingToggleSwitched, {
			billing_period: "annual",
			source_page: "/crewroute/pricing",
		});
	});

	it("fires a separate event per call", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });

		trackBillingToggle("monthly", "/pricing");
		trackBillingToggle("annual", "/pricing");

		expect(capture).toHaveBeenCalledTimes(2);
		expect(capture).toHaveBeenNthCalledWith(1, ANALYTICS_EVENTS.billingToggleSwitched, {
			billing_period: "monthly",
			source_page: "/pricing",
		});
		expect(capture).toHaveBeenNthCalledWith(2, ANALYTICS_EVENTS.billingToggleSwitched, {
			billing_period: "annual",
			source_page: "/pricing",
		});
	});
});
