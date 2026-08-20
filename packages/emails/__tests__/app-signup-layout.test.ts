import { getProductAppUrl, PEBBLEDESK_LOGO_EMAIL_URL } from "@pebbledesk/shared";
import { render } from "@react-email/render";
import React from "react";
import { describe, expect, it } from "vitest";
import { AppSignupLayout } from "../src/app-signup-layout.js";

describe("AppSignupLayout", () => {
	it("renders the brand name, logo image, and eyebrow text", async () => {
		const element = React.createElement(
			AppSignupLayout,
			{
				previewText: "Set up your PebbleDesk trial",
				ctaHref: getProductAppUrl("/onboarding"),
				ctaLabel: "Get started",
			},
			null,
		);
		const html = await render(element);

		expect(html).toContain("PebbleDesk");
		expect(html).toContain(PEBBLEDESK_LOGO_EMAIL_URL);
		expect(html).toContain('alt="PebbleDesk"');
		expect(html).toContain("PebbleDesk trial setup");
	});

	it("renders the preview text in the email", async () => {
		const element = React.createElement(AppSignupLayout, {
			previewText: "Welcome to PebbleDesk — let's get you set up",
			ctaHref: getProductAppUrl("/onboarding"),
			ctaLabel: "Start setup",
		});
		const html = await render(element);

		expect(html).toContain("Welcome to PebbleDesk");
	});

	it("renders the CTA button with the provided href and label", async () => {
		const element = React.createElement(AppSignupLayout, {
			previewText: "Set up your trial",
			ctaHref: getProductAppUrl("/onboarding?ref=email"),
			ctaLabel: "Activate your trial",
		});
		const html = await render(element);

		expect(html).toContain(getProductAppUrl("/onboarding?ref=email"));
		expect(html).toContain("Activate your trial");
	});

	it("renders the footer unsubscribe notice", async () => {
		const element = React.createElement(AppSignupLayout, {
			previewText: "Set up your trial",
			ctaHref: getProductAppUrl("/onboarding"),
			ctaLabel: "Get started",
		});
		const html = await render(element);

		expect(html).toContain("unsubscribe");
		expect(html).toContain("PebbleDesk account");
	});

	it("renders children inside the panel section", async () => {
		const child = React.createElement("p", null, "Custom inner content for testing");
		const element = React.createElement(
			AppSignupLayout,
			{
				previewText: "Trial setup",
				ctaHref: getProductAppUrl("/onboarding"),
				ctaLabel: "Begin",
			},
			child,
		);
		const html = await render(element);

		expect(html).toContain("Custom inner content for testing");
	});

	it("renders without children (children omitted)", async () => {
		const element = React.createElement(AppSignupLayout, {
			previewText: "Trial setup",
			ctaHref: getProductAppUrl("/onboarding"),
			ctaLabel: "Begin",
		});
		const html = await render(element);

		expect(html).toContain("<!DOCTYPE html");
		expect(html).toContain("Begin");
	});
});
