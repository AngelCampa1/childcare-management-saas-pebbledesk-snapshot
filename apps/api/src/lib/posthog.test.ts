import { afterEach, describe, expect, it, vi } from "vitest";
import {
	analyticsDistinctId,
	capturePostHogEvent,
	getExecutionContext,
	sanitizePostHogProperties,
	schedulePostHogEvent,
} from "./posthog.js";

describe("sanitizePostHogProperties", () => {
	it("keeps safe lifecycle properties and drops sensitive values", () => {
		expect(
			sanitizePostHogProperties({
				center_id: "center-1",
				source_app: "api",
				page_path: "/pricing",
				landing_page: "/",
				utm_source: "linkedin",
				utm_medium: "social",
				utm_campaign: "spring",
				referring_domain: "example.com",
				country: "US",
				lead_type: "waitlist",
				activation_type: "trial",
				organization_id: "center-1",
				plan: "center_starter",
				subscription_status: "trialing",
				promo_present: true,
				email: "owner@example.com",
				stripe_subscription_id: "sub_123",
				nested: { role: "owner", phone: "555-0100" },
				free_text: "do not send",
			}),
		).toEqual({
			source_app: "api",
			page_path: "/pricing",
			landing_page: "/",
			utm_source: "linkedin",
			utm_medium: "social",
			utm_campaign: "spring",
			referring_domain: "example.com",
			country: "US",
			lead_type: "waitlist",
			activation_type: "trial",
			plan: "center_starter",
			subscription_status: "trialing",
			promo_present: true,
		});
	});

	it("sanitizes nested object values when an allowlisted property receives one", () => {
		expect(
			sanitizePostHogProperties({
				plan: { center_id: "center-1", email: "owner@example.com" },
			}),
		).toEqual({
			plan: {},
		});
	});

	it("keeps planned safe funnel, activation, and usage properties", () => {
		expect(
			sanitizePostHogProperties({
				method: "email",
				reason: "invalid_credentials",
				stage: "signup",
				field_count: 3,
				role: "owner",
				state: "IL",
				timezone: "America/Chicago",
				self_serve: true,
				age_group: "preschool",
				subject_type: "child",
				report_type: "attendance",
				feature_name: "attendance",
				action: "check_in",
				result: "success",
				promo_present: true,
				email: "owner@example.com",
				child_name: "Do not send",
				free_text: "Do not send",
			}),
		).toEqual({
			method: "email",
			reason: "invalid_credentials",
			stage: "signup",
			field_count: 3,
			role: "owner",
			state: "IL",
			timezone: "America/Chicago",
			self_serve: true,
			age_group: "preschool",
			subject_type: "child",
			report_type: "attendance",
			feature_name: "attendance",
			action: "check_in",
			result: "success",
			promo_present: true,
		});
	});

	it("drops invalid semantic values under safe server property keys", () => {
		expect(
			sanitizePostHogProperties({
				feature_name: "Angel",
				action: "typed child name",
				result: "maybe",
				self_serve: "true",
				field_count: "3",
				promo_present: "true",
				state: "Illinois",
				landing_page: "/pricing?name=Angel&token=secret",
				page_path: "/signup?phone=5550100",
				referring_domain: "not a domain",
				country: "United States",
				lead_type: "Angel Smith note",
				organization_id: "Angel Smith",
				plan: "center starter",
				subscription_status: "past due",
				user_id: "Angel Smith",
				utm_source: "Angel Smith",
			}),
		).toEqual({
			landing_page: "/pricing",
			page_path: "/signup",
		});
	});

	it("drops arrays under otherwise safe keys so free text cannot bypass key-aware checks", () => {
		expect(
			sanitizePostHogProperties({
				reason: ["invalid_credentials", "Angel Smith"],
				plan: ["center_starter"],
				stage: { reason: ["pricing", "typed child name"] },
			}),
		).toEqual({
			stage: {},
		});
	});
});

describe("analyticsDistinctId", () => {
	it("returns a stable non-reversible distinct id", async () => {
		await expect(analyticsDistinctId("center", "center-1")).resolves.toMatch(
			/^center:[a-f0-9]{64}$/,
		);
		await expect(analyticsDistinctId("center", "center-1")).resolves.not.toContain("center-1");
	});
});

describe("schedulePostHogEvent", () => {
	it("uses waitUntil when an execution context is available", () => {
		const waitUntil = vi.fn();

		schedulePostHogEvent(
			{},
			{ waitUntil },
			{ event: "trial_expired", distinctId: "center:center-1" },
		);

		expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
	});

	it("falls back to fire-and-forget capture when no execution context is available", () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 })));

		expect(() =>
			schedulePostHogEvent({ POSTHOG_PROJECT_API_KEY: "phc_test" }, undefined, {
				event: "trial_expired",
				distinctId: "center:center-1",
			}),
		).not.toThrow();
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("returns undefined when reading execution context throws", () => {
		const target = {};
		Object.defineProperty(target, "executionCtx", {
			get() {
				throw new Error("not in Cloudflare runtime");
			},
		});

		expect(getExecutionContext(target)).toBeUndefined();
	});
});

describe("capturePostHogEvent", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("does nothing when the project API key is missing", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			capturePostHogEvent(
				{},
				{
					event: "subscription_checkout_completed",
					distinctId: "center:1",
					properties: { center_id: "center-1" },
				},
			),
		).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends sanitized properties to PostHog", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			capturePostHogEvent(
				{
					POSTHOG_PROJECT_API_KEY: "phc_test",
					POSTHOG_HOST: "https://us.i.posthog.com",
				},
				{
					event: "payment_failed",
					distinctId: "center:center-1",
					properties: {
						subscription_status: "past_due",
						customer_email: "owner@example.com",
					},
				},
			),
		).resolves.toBe(true);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://us.i.posthog.com/capture/",
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					api_key: "phc_test",
					event: "payment_failed",
					distinct_id: "center:center-1",
					properties: {
						subscription_status: "past_due",
					},
				}),
			}),
		);
	});

	it("stays best-effort on fetch failure", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network down")));

		await expect(
			capturePostHogEvent(
				{ POSTHOG_PROJECT_API_KEY: "phc_test" },
				{ event: "payment_failed", distinctId: "center:center-1" },
			),
		).resolves.toBe(false);
	});
});
