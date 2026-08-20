import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getEmailDomain,
	getRouteAnalyticsContext,
	getSafePagePath,
	groupCenter,
	identifyAuthenticatedUser,
	initPostHog,
	resetAnalytics,
	track,
	trackPageView,
} from "./analytics";

function captureBody(callIndex = 0): Record<string, unknown> {
	const fetchMock = vi.mocked(fetch);
	const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
	return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("web analytics", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		window.localStorage.clear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		window.localStorage.clear();
		resetAnalytics();
	});

	it("does nothing when the Vite PostHog key is missing", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "");
		initPostHog();

		track("signup_started", { plan: "center_starter" });

		expect(fetch).not.toHaveBeenCalled();
		expect(document.querySelector("script[data-posthog-sdk='app']")).toBeNull();
	});

	it("uses direct capture without injecting a third-party SDK script", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");

		initPostHog();
		track("signup_started", { plan: "center_starter" });

		expect(fetch).toHaveBeenCalledWith(
			"https://us.i.posthog.com/capture/",
			expect.objectContaining({
				method: "POST",
				headers: { "content-type": "application/json" },
				keepalive: true,
			}),
		);
		expect(document.querySelector("script[data-posthog-sdk='app']")).toBeNull();
		expect(captureBody()).toMatchObject({
			api_key: "phc_test",
			event: "signup_started",
			properties: { plan: "center_starter", surface: "app" },
		});
	});

	it("sanitizes tracked properties before capture", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		track("signup_started", {
			plan: "center_starter",
			billing: { plan: "center_starter", email: "owner@example.com" },
			email: "owner@example.com",
			address: "123 Main",
			free_text: "Should not leave",
		});

		expect(captureBody()).toMatchObject({
			event: "signup_started",
			properties: {
				plan: "center_starter",
				billing: { plan: "center_starter" },
				surface: "app",
			},
		});
	});

	it("keeps safe attribution and flow context without leaking sensitive values", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		track("flow_step_completed", {
			utm_source: "linkedin",
			utm_medium: "paid_social",
			utm_campaign: "spring_launch",
			utm_content: "hero",
			utm_term: "childcare_software",
			ref: "partner",
			promo_present: true,
			flow: "signup",
			step: "account_created",
			feature_name: "enrollment",
			route_area: "workspace",
			action: "submit",
			result: "success",
			error_code: "validation_failed",
			has_filters: false,
			has_account_id: true,
			count_bucket: "1-10",
			import_type: "children",
			dedupe_strategy: "skip",
			inserted_count: 2,
			line_item_count: 1,
			updated_count: 1,
			skipped_count: 0,
			error_count: 0,
			entity_type: "customer",
			row_count_bucket: "51-100",
			issue_type: "missing_link",
			message_type: "announcement",
			recipient_mode: "classroom",
			recipient_count: 3,
			has_classroom_target: true,
			scanned_count: 2,
			sync_action: "export",
			sync_log_count: 2,
			reconciliation_count: 1,
			email: "owner@example.com",
			unsafe_feature_name: "Angel",
			free_text: "do not send",
		});

		expect(captureBody()).toMatchObject({
			event: "flow_step_completed",
			properties: {
				utm_source: "linkedin",
				utm_medium: "paid_social",
				utm_campaign: "spring_launch",
				utm_content: "hero",
				utm_term: "childcare_software",
				ref: "partner",
				promo_present: true,
				flow: "signup",
				step: "account_created",
				feature_name: "enrollment",
				route_area: "workspace",
				action: "submit",
				result: "success",
				error_code: "validation_failed",
				has_filters: false,
				has_account_id: true,
				count_bucket: "1-10",
				import_type: "children",
				dedupe_strategy: "skip",
				inserted_count: 2,
				line_item_count: 1,
				updated_count: 1,
				skipped_count: 0,
				error_count: 0,
				entity_type: "customer",
				row_count_bucket: "51-100",
				issue_type: "missing_link",
				message_type: "announcement",
				recipient_mode: "classroom",
				recipient_count: 3,
				has_classroom_target: true,
				scanned_count: 2,
				sync_action: "export",
				sync_log_count: 2,
				reconciliation_count: 1,
				surface: "app",
			},
		});
		expect(JSON.stringify(captureBody())).not.toContain("owner@example.com");
		expect(JSON.stringify(captureBody())).not.toContain("Angel");
		expect(JSON.stringify(captureBody())).not.toContain("do not send");
	});

	it("drops invalid semantic values under safe app property keys", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		track("flow_step_completed", {
			feature_name: "Angel",
			route_area: "private_area",
			promo_present: "true",
			has_filters: "false",
			email_verified: "true",
			center_count: "1",
			utm_source: "Angel Smith",
		});

		expect(captureBody()).toMatchObject({
			event: "flow_step_completed",
			properties: { surface: "app" },
		});
		expect(JSON.stringify(captureBody())).not.toContain("Angel");
	});

	it("drops arrays under otherwise safe app keys so free text cannot bypass key-aware checks", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		track("flow_step_completed", {
			reason: ["invalid_credentials", "Angel Smith"],
			action: ["check_in"],
			flow: { reason: ["pricing", "typed child name"] },
		});

		expect(captureBody()).toMatchObject({
			event: "flow_step_completed",
			properties: { flow: {}, surface: "app" },
		});
		expect(JSON.stringify(captureBody())).not.toContain("Angel");
		expect(JSON.stringify(captureBody())).not.toContain("typed child name");
	});

	it("falls back to an in-memory anonymous id when localStorage is unavailable", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});
		const randomUuid = vi
			.spyOn(crypto, "randomUUID")
			.mockReturnValue("00000000-0000-4000-8000-000000000000");
		initPostHog();

		track("signup_started", { plan: "center_starter" });
		track(ANALYTICS_EVENTS.signupCompleted, { method: "email", plan: "center_starter" });

		expect(captureBody()).toMatchObject({
			distinct_id: "00000000-0000-4000-8000-000000000000",
		});
		expect(captureBody(1)).toMatchObject({
			distinct_id: "00000000-0000-4000-8000-000000000000",
		});
		expect(randomUuid).toHaveBeenCalledTimes(1);
		getItem.mockRestore();
		randomUuid.mockRestore();
	});

	it("keeps the generated anonymous id when localStorage writes fail", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("storage quota");
		});
		const randomUuid = vi
			.spyOn(crypto, "randomUUID")
			.mockReturnValue("11111111-1111-4111-8111-111111111111");
		initPostHog();

		track("signup_started", { plan: "center_starter" });

		expect(captureBody()).toMatchObject({
			distinct_id: "11111111-1111-4111-8111-111111111111",
		});
		setItem.mockRestore();
		randomUuid.mockRestore();
	});

	it("swallows rejected analytics requests", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
		initPostHog();

		expect(() => track("signup_started", { plan: "center_starter" })).not.toThrow();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("identifies users with email domain but without raw email", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		window.localStorage.setItem("pebbledesk:analytics:anonymous-id", "anon-1");
		initPostHog();

		identifyAuthenticatedUser({
			id: "user-1",
			email: "director@center.example",
			role: "director",
			emailVerified: true,
			centerCount: 2,
		});

		expect(captureBody()).toMatchObject({
			event: "$identify",
			distinct_id: "user-1",
			properties: {
				$anon_distinct_id: "anon-1",
				$set: {
					role: "director",
					email_domain: "center.example",
					email_verified: true,
					center_count: 2,
				},
				surface: "app",
			},
		});
	});

	it("groups centers with safe center properties", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		groupCenter({
			id: "center-1",
			plan: "center_starter",
			subscriptionStatus: "trialing",
			state: "IL",
			timezone: "America/Chicago",
			role: "owner",
			classroomCount: 4,
			name: "Sunny Days",
		});

		expect(captureBody()).toMatchObject({
			event: "$groupidentify",
			properties: {
				$group_type: "center",
				$group_key: "center-1",
				$group_set: {
					plan: "center_starter",
					subscription_status: "trialing",
					state: "IL",
					timezone: "America/Chicago",
					role: "owner",
					classroom_count: 4,
				},
				surface: "app",
			},
		});
		expect(JSON.stringify(captureBody())).not.toContain("Sunny Days");
	});

	it("captures pageviews once for a path/search pair", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		trackPageView("/dashboard", "?checkout=success");
		trackPageView("/dashboard", "?checkout=success");
		trackPageView("/attendance", "");

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(captureBody()).toMatchObject({
			event: "$pageview",
			properties: {
				path: "/dashboard",
				feature_name: "dashboard",
				route_area: "workspace",
				search_present: true,
				surface: "app",
			},
		});
	});

	it("normalizes dynamic page paths before capture", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		trackPageView("/children/child_123", "");
		trackPageView("/classrooms/classroom_123", "");
		trackPageView("/pay/inv_secret-token", "");

		expect(captureBody()).toMatchObject({
			event: "$pageview",
			properties: {
				path: "/children/:id",
				feature_name: "children",
				route_area: "workspace",
				surface: "app",
			},
		});
		expect(captureBody(1)).toMatchObject({
			event: "$pageview",
			properties: {
				path: "/classrooms/:id",
				feature_name: "classrooms",
				route_area: "workspace",
				surface: "app",
			},
		});
		expect(captureBody(2)).toMatchObject({
			event: "$pageview",
			properties: {
				path: "/pay/:token",
				feature_name: "payments",
				route_area: "conversion",
				surface: "app",
			},
		});
		expect(JSON.stringify(captureBody())).not.toContain("child_123");
		expect(JSON.stringify(captureBody(1))).not.toContain("classroom_123");
		expect(JSON.stringify(captureBody(2))).not.toContain("inv_secret-token");
	});

	it("drops unrecognized paths instead of sending raw identifiers or query strings", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		track("unknown_path_event", { path: "/future/record_123?token=secret" });

		expect(captureBody()).toMatchObject({
			event: "unknown_path_event",
			properties: { surface: "app" },
		});
		expect(JSON.stringify(captureBody())).not.toContain("record_123");
		expect(JSON.stringify(captureBody())).not.toContain("secret");
	});

	it("derives safe page path templates for tracked routes", () => {
		expect(getSafePagePath("/children/child_123")).toBe("/children/:id");
		expect(getSafePagePath("/guardians/guardian_123")).toBe("/guardians/:id");
		expect(getSafePagePath("/classrooms/classroom_123")).toBe("/classrooms/:id");
		expect(getSafePagePath("/messages/thread_123")).toBe("/messages/:id");
		expect(getSafePagePath("/pay/inv_secret-token")).toBe("/pay/:token");
		expect(getSafePagePath("/dashboard")).toBe("/dashboard");
		expect(getSafePagePath("/future/record_123?token=secret")).toBeUndefined();
	});

	it("derives route analytics context for key product journeys", () => {
		expect(getRouteAnalyticsContext("/signup")).toEqual({
			feature_name: "signup",
			route_area: "conversion",
		});
		expect(getRouteAnalyticsContext("/children/enroll")).toEqual({
			feature_name: "enrollment",
			route_area: "workspace",
		});
		expect(getRouteAnalyticsContext("/billing/payments")).toEqual({
			feature_name: "payments",
			route_area: "workspace",
		});
		expect(getRouteAnalyticsContext("/help")).toEqual({
			feature_name: "help",
			route_area: "workspace",
		});
		expect(getRouteAnalyticsContext("/unknown")).toEqual({
			feature_name: "unknown",
			route_area: "other",
		});
	});

	it("resets analytics on logout or unauthenticated state", () => {
		vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
		initPostHog();

		trackPageView("/dashboard", "");
		resetAnalytics();
		trackPageView("/dashboard", "");

		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("extracts domains without leaking raw emails", () => {
		expect(getEmailDomain("Owner@Center.Example")).toBe("center.example");
		expect(getEmailDomain("not-an-email")).toBeUndefined();
	});
});
