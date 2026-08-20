import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildPostHogBootstrapScript,
	identifyUser,
	type PostHogInstance,
	resolvePostHogConfig,
	sanitizeAnalyticsProperties,
	trackEvent,
} from "./analytics";

function makePostHogMock(overrides: Partial<PostHogInstance> = {}): PostHogInstance {
	return {
		capture: vi.fn(),
		identify: vi.fn(),
		...overrides,
	};
}

describe("resolvePostHogConfig", () => {
	const env = import.meta.env as Record<string, unknown>;
	let originalKey: unknown;
	let originalHost: unknown;

	beforeEach(() => {
		originalKey = env.PUBLIC_POSTHOG_KEY;
		originalHost = env.PUBLIC_POSTHOG_HOST;
	});

	afterEach(() => {
		if (originalKey === undefined) delete env.PUBLIC_POSTHOG_KEY;
		else env.PUBLIC_POSTHOG_KEY = originalKey;
		if (originalHost === undefined) delete env.PUBLIC_POSTHOG_HOST;
		else env.PUBLIC_POSTHOG_HOST = originalHost;
	});

	it("returns null when PUBLIC_POSTHOG_KEY is missing", () => {
		delete env.PUBLIC_POSTHOG_KEY;
		env.PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";

		expect(resolvePostHogConfig()).toBeNull();
	});

	it("uses env-driven key and default host", () => {
		env.PUBLIC_POSTHOG_KEY = "phc_test";
		delete env.PUBLIC_POSTHOG_HOST;

		expect(resolvePostHogConfig()).toEqual({
			apiKey: "phc_test",
			apiHost: "https://us.i.posthog.com",
		});
	});

	it("trims env-driven key and host values", () => {
		env.PUBLIC_POSTHOG_KEY = " phc_test ";
		env.PUBLIC_POSTHOG_HOST = " https://eu.i.posthog.com ";

		expect(resolvePostHogConfig()).toEqual({
			apiKey: "phc_test",
			apiHost: "https://eu.i.posthog.com",
		});
	});

	it("uses the default host when PUBLIC_POSTHOG_HOST is blank", () => {
		env.PUBLIC_POSTHOG_KEY = "phc_test";
		env.PUBLIC_POSTHOG_HOST = " ";

		expect(resolvePostHogConfig()).toEqual({
			apiKey: "phc_test",
			apiHost: "https://us.i.posthog.com",
		});
	});
});

describe("sanitizeAnalyticsProperties", () => {
	it("drops sensitive keys and nested unsafe values", () => {
		expect(
			sanitizeAnalyticsProperties({
				plan: "center_starter",
				billing: "annual",
				email: "owner@example.com",
				token: "secret",
				nested: { phone: "555-0100", role: "owner" },
				tags: ["safe", { password: "secret" }],
				free_text: "Do not send",
			}),
		).toEqual({
			plan: "center_starter",
			billing: "annual",
		});
	});

	it("keeps safe nested values and drops arrays", () => {
		expect(
			sanitizeAnalyticsProperties({
				source_page: "/pricing",
				section: {
					stage: "hero",
					target: "signup",
					button_text: "owner@example.com",
				},
				trigger: ["hero_cta", "line\r\nbreak", { reason: "pricing", staff_name: "Director" }],
			}),
		).toEqual({
			source_page: "/pricing",
			section: {
				stage: "hero",
				target: "signup",
			},
		});
	});

	it("keeps safe CRO, survey, and calculator properties emitted by marketing trackers", () => {
		expect(
			sanitizeAnalyticsProperties({
				page_path: "/pricing",
				href: "/signup?plan=center_starter#form",
				buyer_stage: "decision",
				threshold: 75,
				time_to_view_ms: 1240,
				milestone_seconds: 60,
				question_text: "What is the main office task slowing you down?",
				question_index: 2,
				has_referral: true,
				question_count: 3,
				qualification_segment: "high_intent",
				team_size: 12,
				trade: "childcare",
				labor_rate: 24,
				parts_markup: 15,
				email_provided: true,
				email: "owner@example.com",
				raw_question_text: "owner@example.com",
			}),
		).toEqual({
			page_path: "/pricing",
			href: "/signup",
			buyer_stage: "decision",
			threshold: 75,
			time_to_view_ms: 1240,
			milestone_seconds: 60,
			question_index: 2,
			has_referral: true,
			question_count: 3,
			qualification_segment: "high_intent",
			team_size: 12,
			trade: "childcare",
			labor_rate: 24,
			parts_markup: 15,
			email_provided: true,
		});
	});

	it("normalizes risky values under otherwise safe marketing property keys", () => {
		expect(
			sanitizeAnalyticsProperties({
				href: "/signup?name=Angel&phone=5550100&token=secret#survey",
				button_text: "Angel Smith clicked this",
				question_text: "A director typed a child name here",
				email_provided: "yes",
				has_referral: "true",
				utm_term: "Angel Smith childcare",
				source: "hero_cta",
				team_size: "12",
				labor_rate: Number.NaN,
			}),
		).toEqual({
			href: "/signup",
			source: "hero_cta",
		});
	});

	it("drops arrays under otherwise safe marketing keys so free text cannot bypass key-aware checks", () => {
		expect(
			sanitizeAnalyticsProperties({
				reason: ["server_error", "Angel Smith"],
				trigger: ["hero_cta"],
				source: { reason: ["pricing", "typed child name"] },
			}),
		).toEqual({
			source: {},
		});
	});

	it("keeps lead capture tracking properties and drops submitted lead payload fields", () => {
		expect(
			sanitizeAnalyticsProperties({
				form_type: "lead_capture",
				source_page: "/free/licensing-compliance-checklist?email=owner@example.com",
				email_provided: true,
				method: "turnstile",
				reason: "server_error",
				magnet_slug: "licensing-compliance-checklist",
				status_code: 500,
				download_available: true,
				emailed: false,
				utm_source: "linkedin",
				utm_medium: "paid_social",
				utm_campaign: "spring_launch",
				email: "owner@example.com",
				turnstileToken: "secret",
				downloadUrl: "/lead-magnets/licensing-compliance-checklist.pdf",
				requestId: "req_123",
				status: "contains free text",
			}),
		).toEqual({
			form_type: "lead_capture",
			source_page: "/free/licensing-compliance-checklist",
			email_provided: true,
			method: "turnstile",
			reason: "server_error",
			magnet_slug: "licensing-compliance-checklist",
			status_code: 500,
			download_available: true,
			emailed: false,
			utm_source: "linkedin",
			utm_medium: "paid_social",
			utm_campaign: "spring_launch",
		});
	});
});

describe("buildPostHogBootstrapScript", () => {
	const testConfig = { apiKey: "phc_test", apiHost: "https://us.i.posthog.com" };

	it("enables automatic pageview and pageleave capture", () => {
		const script = buildPostHogBootstrapScript("RestrictedBooks", testConfig);

		expect(script).toContain("capture_pageview: true");
		expect(script).toContain("capture_pageleave: true");
	});

	it("registers the site tag with the provided site name", () => {
		const script = buildPostHogBootstrapScript("RestrictedBooks", testConfig);

		expect(script).toContain('site: "RestrictedBooks"');
	});

	it("uses the provided API key and host values", () => {
		const script = buildPostHogBootstrapScript("RestrictedBooks", {
			apiKey: "test-key",
			apiHost: "https://example.i.posthog.com",
		});

		expect(script).toContain('posthog.init("test-key", {');
		expect(script).toContain('api_host: "https://example.i.posthog.com"');
		expect(script).toContain("mask_all_text: true");
		expect(script).toContain("maskAllInputs: true");
	});

	it("returns an empty script when config is missing", () => {
		expect(buildPostHogBootstrapScript("RestrictedBooks", null)).toBe("");
	});

	it("does not throw when posthog.init throws during bootstrap", () => {
		const script = buildPostHogBootstrapScript("RestrictedBooks", testConfig);
		const init = vi.fn(() => {
			throw new ReferenceError("options is not defined");
		});
		const register = vi.fn();

		expect(() =>
			new Function(
				"document",
				"window",
				`const posthog = window.posthog; ${script}; return window.posthog;`,
			)(
				{},
				{
					posthog: {
						__SV: 1,
						init,
						register,
					},
				},
			),
		).not.toThrow();

		expect(init).toHaveBeenCalledOnce();
		expect(register).toHaveBeenCalledOnce();
	});

	it("does not throw when posthog.register throws during bootstrap", () => {
		const script = buildPostHogBootstrapScript("RestrictedBooks", testConfig);
		const register = vi.fn(() => {
			throw new ReferenceError("options is not defined");
		});
		const init = vi.fn();

		expect(() =>
			new Function(
				"document",
				"window",
				`const posthog = window.posthog; ${script}; return window.posthog;`,
			)(
				{},
				{
					posthog: {
						__SV: 1,
						init,
						register,
					},
				},
			),
		).not.toThrow();

		expect(init).toHaveBeenCalledOnce();
		expect(register).toHaveBeenCalledOnce();
		expect(register).toHaveBeenCalledWith({ site: "RestrictedBooks" });
	});
});

describe("trackEvent", () => {
	beforeEach(() => {
		delete window.posthog;
	});

	afterEach(() => {
		delete window.posthog;
	});

	it("calls window.posthog.capture with event name and properties when posthog exists", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });

		trackEvent("signup_started", { source: "hero", email: "owner@example.com" });

		expect(capture).toHaveBeenCalledOnce();
		expect(capture).toHaveBeenCalledWith("signup_started", { source: "hero" });
	});

	it("does not throw when window.posthog is undefined", () => {
		expect(() => trackEvent("some_event", { key: "value" })).not.toThrow();
	});

	it("calls capture with no properties when properties arg is omitted", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });

		trackEvent("page_viewed");

		expect(capture).toHaveBeenCalledOnce();
		expect(capture).toHaveBeenCalledWith("page_viewed", undefined);
	});

	it("does not throw when posthog.capture throws", () => {
		const capture = vi.fn(() => {
			throw new ReferenceError("options is not defined");
		});
		window.posthog = makePostHogMock({ capture });

		expect(() => trackEvent("section_viewed", { section: "hero" })).not.toThrow();
	});
});

describe("identifyUser", () => {
	beforeEach(() => {
		delete window.posthog;
	});

	afterEach(() => {
		delete window.posthog;
	});

	it("calls window.posthog.identify with distinctId and properties when posthog exists", () => {
		const identify = vi.fn();
		window.posthog = makePostHogMock({ identify });

		identifyUser("user-abc", { role: "owner", email: "test@example.com" });

		expect(identify).toHaveBeenCalledOnce();
		expect(identify).toHaveBeenCalledWith("user-abc", {
			role: "owner",
		});
	});

	it("does not throw when window.posthog is undefined", () => {
		expect(() => identifyUser("user-abc", { email: "test@example.com" })).not.toThrow();
	});

	it("calls identify with no properties when properties arg is omitted", () => {
		const identify = vi.fn();
		window.posthog = makePostHogMock({ identify });

		identifyUser("user-1");

		expect(identify).toHaveBeenCalledOnce();
		expect(identify).toHaveBeenCalledWith("user-1", undefined);
	});

	it("does not throw when posthog.identify throws", () => {
		const identify = vi.fn(() => {
			throw new ReferenceError("options is not defined");
		});
		window.posthog = makePostHogMock({ identify });

		expect(() => identifyUser("user-1", { email: "test@example.com" })).not.toThrow();
	});
});
