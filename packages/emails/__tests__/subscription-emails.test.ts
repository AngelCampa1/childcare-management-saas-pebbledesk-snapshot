import { getProductAppUrl, PEBBLEDESK_LOGO_EMAIL_URL } from "@pebbledesk/shared";
import { SUBSCRIPTION_TRIAL_EMAIL_COPY } from "@pebbledesk/shared/public-knowledge/emails";
import { describe, expect, it } from "vitest";
import { renderSubscriptionEmail } from "../src/render.js";

const vars = {
	firstName: "Mia",
	planLabel: "Center Starter",
	monthlyPriceLabel: "$99/month",
	trialStartedAt: "April 20, 2026",
	trialEndsAt: "May 20, 2026",
	billingUrl: getProductAppUrl("/billing"),
};

describe("renderSubscriptionEmail", () => {
	it("renders the trial-started email with the key trial dates and billing link", async () => {
		const result = await renderSubscriptionEmail("subscription-trial-started", vars);

		expect(result.subject).toContain("trial has started");
		expect(result.html).toContain(vars.planLabel);
		expect(result.html).toContain(vars.monthlyPriceLabel);
		expect(result.html).toContain(vars.trialStartedAt);
		expect(result.html).toContain(vars.trialEndsAt);
		expect(result.html).toContain(vars.billingUrl);
		expect(result.text).toContain(vars.billingUrl);
	});

	it("includes the PebbleDesk logo image in subscription email HTML", async () => {
		const result = await renderSubscriptionEmail("subscription-trial-started", vars);
		expect(result.html).toContain(PEBBLEDESK_LOGO_EMAIL_URL);
		expect(result.html).toContain('alt="PebbleDesk"');
		expect(result.html).toContain("PebbleDesk billing");
	});

	it("renders the ending-soon reminder with 3-day copy and billing link", async () => {
		const result = await renderSubscriptionEmail("subscription-trial-ending-soon", vars);

		expect(result.subject).toContain(
			`${SUBSCRIPTION_TRIAL_EMAIL_COPY.reminderDaysBeforeEnd} days left`,
		);
		expect(result.html).toContain(SUBSCRIPTION_TRIAL_EMAIL_COPY.endingSoonHeading);
		expect(result.html).toContain(vars.planLabel);
		expect(result.html).toContain(vars.monthlyPriceLabel);
		expect(result.html).toContain(vars.trialStartedAt);
		expect(result.html).toContain(vars.trialEndsAt);
		expect(result.text).toContain(vars.billingUrl);
	});

	it("falls back to a generic greeting when the recipient first name is missing", async () => {
		const anonymousVars = {
			...vars,
			firstName: undefined,
		};

		const started = await renderSubscriptionEmail("subscription-trial-started", anonymousVars);
		const endingSoon = await renderSubscriptionEmail(
			"subscription-trial-ending-soon",
			anonymousVars,
		);

		expect(started.html).toContain("Hi,");
		expect(started.html).not.toContain("Hi Mia,");
		expect(endingSoon.html).toContain("Hi,");
		expect(endingSoon.html).not.toContain("Hi Mia,");
	});
});
