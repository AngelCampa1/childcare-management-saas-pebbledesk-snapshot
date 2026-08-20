import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLoginHref, hasActiveSubscription, subscriptionPollingInterval } from "./_auth";

const authRouteSource = readFileSync(join(process.cwd(), "src/routes/_auth.tsx"), "utf8");

describe("hasActiveSubscription", () => {
	it("returns false when status is undefined (fails closed on unknown)", () => {
		expect(hasActiveSubscription(undefined)).toBe(false);
	});

	it("returns false for 'none'", () => {
		expect(hasActiveSubscription("none")).toBe(false);
	});

	it("returns false for 'canceled'", () => {
		expect(hasActiveSubscription("canceled")).toBe(false);
	});

	it("returns false for 'unpaid'", () => {
		expect(hasActiveSubscription("unpaid")).toBe(false);
	});

	it("returns false for 'incomplete'", () => {
		expect(hasActiveSubscription("incomplete")).toBe(false);
	});

	it("returns false for 'incomplete_expired'", () => {
		expect(hasActiveSubscription("incomplete_expired")).toBe(false);
	});

	it("returns true for 'active'", () => {
		expect(hasActiveSubscription("active")).toBe(true);
	});

	it("returns true for 'trialing'", () => {
		expect(hasActiveSubscription("trialing")).toBe(true);
	});

	it("returns true for 'past_due'", () => {
		expect(hasActiveSubscription("past_due")).toBe(true);
	});
});

describe("subscriptionPollingInterval", () => {
	function makeQuery(status: string | undefined) {
		return { state: { data: status !== undefined ? { subscriptionStatus: status } : undefined } };
	}

	it("returns false (stops polling) when status is 'trialing'", () => {
		expect(subscriptionPollingInterval(makeQuery("trialing") as never)).toBe(false);
	});

	it("returns false (stops polling) when status is 'active'", () => {
		expect(subscriptionPollingInterval(makeQuery("active") as never)).toBe(false);
	});

	it("returns false (stops polling) when status is 'past_due'", () => {
		expect(subscriptionPollingInterval(makeQuery("past_due") as never)).toBe(false);
	});

	it("returns 1000 (keeps polling) when status is undefined (still awaiting transition)", () => {
		expect(subscriptionPollingInterval(makeQuery(undefined) as never)).toBe(1000);
	});

	it("returns 1000 (keeps polling) when status is 'none' (not yet subscribed)", () => {
		expect(subscriptionPollingInterval(makeQuery("none") as never)).toBe(1000);
	});

	it("returns 1000 (keeps polling) when status is 'incomplete'", () => {
		expect(subscriptionPollingInterval(makeQuery("incomplete") as never)).toBe(1000);
	});

	it("returns false (stops polling) when attemptCount reaches CHECKOUT_POLL_MAX_ATTEMPTS", () => {
		// 30 is CHECKOUT_POLL_MAX_ATTEMPTS
		expect(subscriptionPollingInterval(makeQuery("none") as never, 30)).toBe(false);
	});

	it("returns false (stops polling) when attemptCount exceeds CHECKOUT_POLL_MAX_ATTEMPTS", () => {
		expect(subscriptionPollingInterval(makeQuery("none") as never, 31)).toBe(false);
	});

	it("keeps polling (returns 1000) when attemptCount is just below CHECKOUT_POLL_MAX_ATTEMPTS", () => {
		expect(subscriptionPollingInterval(makeQuery("none") as never, 29)).toBe(1000);
	});
});

describe("buildLoginHref", () => {
	it("returns /login for the root path", () => {
		expect(buildLoginHref("/", "")).toBe("/login");
	});

	it("returns /login when already on /login", () => {
		expect(buildLoginHref("/login", "")).toBe("/login");
	});

	it("returns /login when on /signup", () => {
		expect(buildLoginHref("/signup", "")).toBe("/login");
	});

	it("returns /login when on /onboarding", () => {
		expect(buildLoginHref("/onboarding", "")).toBe("/login");
	});

	it("returns /login?redirect=... for a protected path", () => {
		expect(buildLoginHref("/billing", "")).toBe("/login?redirect=%2Fbilling");
	});

	it("includes query string in the redirect param", () => {
		expect(buildLoginHref("/billing", "?tab=invoices")).toBe(
			"/login?redirect=%2Fbilling%3Ftab%3Dinvoices",
		);
	});

	it("encodes the redirect destination fully", () => {
		expect(buildLoginHref("/ratios", "")).toBe("/login?redirect=%2Fratios");
	});

	it("returns /login?redirect=... for /dashboard", () => {
		expect(buildLoginHref("/dashboard", "")).toBe("/login?redirect=%2Fdashboard");
	});
});

describe("mobile navigation accessibility", () => {
	it("provides a dialog title for the mobile navigation sheet", () => {
		expect(authRouteSource).toContain("SheetTitle");
		expect(authRouteSource).toContain("Navigation");
	});
});
