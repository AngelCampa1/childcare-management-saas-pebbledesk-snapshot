import {
	PEBBLEDESK_DEFAULT_SIGNUP_URL,
	PEBBLEDESK_LOGO_EMAIL_URL,
	PEBBLEDESK_POSTAL_ADDRESS,
} from "@pebbledesk/shared";
import { render } from "@react-email/render";
import React from "react";
import { describe, expect, it } from "vitest";
import { NurtureCta } from "../src/cta.js";
import { Layout } from "../src/layout.js";
import { renderTemplate, type TemplateVars } from "../src/render.js";

const baseVars: TemplateVars = {
	firstName: "Sarah",
	magnetSlug: "childcare-ratio-guide",
	magnetTitle: "The Childcare Ratio Compliance Guide",
	downloadUrl: "https://example.com/download/childcare-ratio-guide.pdf",
	unsubscribeUrl: "https://example.com/unsubscribe?token=abc123",
};

describe("renderTemplate", () => {
	it("renders the immediate lead magnet delivery email", async () => {
		const result = await renderTemplate("nurture-0-welcome", baseVars);

		expect(result.html).toContain("<!DOCTYPE html");
		expect(result.html).toContain(baseVars.downloadUrl);
		expect(result.html).toContain(baseVars.unsubscribeUrl);
		expect(result.html).toContain(PEBBLEDESK_POSTAL_ADDRESS);
		expect(result.html).toContain(PEBBLEDESK_LOGO_EMAIL_URL);
		expect(result.text).toContain(baseVars.downloadUrl);
		expect(result.subject.toLowerCase()).toMatch(/childcare ratio compliance guide|quick note/i);
	});

	it("uses provided signupUrl in the secondary CTA", async () => {
		const result = await renderTemplate("nurture-0-welcome", {
			...baseVars,
			signupUrl: "http://localhost:3040/signup",
		});

		expect(result.html).toContain("http://localhost:3040/signup");
	});

	it("renders without firstName", async () => {
		const result = await renderTemplate("nurture-0-welcome", {
			magnetSlug: "childcare-ratio-guide",
			magnetTitle: "The Childcare Ratio Compliance Guide",
			unsubscribeUrl: "https://example.com/unsubscribe?token=abc123",
		});

		expect(result.html).toContain("The Childcare Ratio Compliance Guide");
	});
});

function collapseWhitespace(html: string): string {
	return html.replace(/\s+/g, " ");
}

describe("Layout component", () => {
	it("renders without previewText", async () => {
		const child = React.createElement("p", null, "Hello");
		const element = React.createElement(
			Layout,
			{ unsubscribeUrl: "https://example.com/unsub", previewText: undefined },
			child,
		);
		const html = await render(element, { pretty: true });

		expect(html).toContain("Hello");
		expect(html).toContain("https://example.com/unsub");
		expect(html).toContain(PEBBLEDESK_LOGO_EMAIL_URL);
		expect(html).toContain('alt="PebbleDesk"');
		expect(html).toContain("The Audit-Ready Childcare Platform");
		expect(collapseWhitespace(html)).toContain(PEBBLEDESK_POSTAL_ADDRESS);
	});

	it("renders with previewText when provided", async () => {
		const child = React.createElement("p", null, "Content");
		const element = React.createElement(
			Layout,
			{ unsubscribeUrl: "https://example.com/unsub", previewText: "Check this out" },
			child,
		);
		const html = await render(element, { pretty: true });
		expect(html).toContain("Check this out");
	});

	it("omits the unsubscribe link when no unsubscribeUrl is supplied", async () => {
		const child = React.createElement("p", null, "Body");
		const element = React.createElement(Layout, { previewText: undefined }, child);
		const html = await render(element, { pretty: true });
		const text = await render(element, { plainText: true });

		expect(html).not.toMatch(/>Unsubscribe</);
		expect(text.toLowerCase()).not.toContain("unsubscribe");
		expect(collapseWhitespace(html)).toContain(PEBBLEDESK_POSTAL_ADDRESS);
	});
});

describe("NurtureCta component", () => {
	it("uses default signup URL when href is undefined", async () => {
		const element = React.createElement(NurtureCta, { label: "Test CTA" });
		const html = await render(element);
		expect(html).toContain(PEBBLEDESK_DEFAULT_SIGNUP_URL);
		expect(html).toContain("Test CTA");
	});

	it("uses default signup URL when href is an empty string", async () => {
		const element = React.createElement(NurtureCta, { href: "", label: "Test CTA" });
		const html = await render(element);
		expect(html).toContain(PEBBLEDESK_DEFAULT_SIGNUP_URL);
	});

	it("uses provided href when non-empty", async () => {
		const customUrl = "https://example.com/custom";
		const element = React.createElement(NurtureCta, { href: customUrl, label: "Test CTA" });
		const html = await render(element);
		expect(html).toContain(customUrl);
		expect(html).not.toContain(PEBBLEDESK_DEFAULT_SIGNUP_URL);
	});

	it("renders default microcopy when not provided", async () => {
		const element = React.createElement(NurtureCta, { label: "Test CTA" });
		const html = await render(element);
		expect(html).toContain("No credit card required");
	});

	it("renders custom microcopy when provided", async () => {
		const element = React.createElement(NurtureCta, {
			label: "Test CTA",
			microcopy: "Custom supporting text.",
		});
		const html = await render(element);
		expect(html).toContain("Custom supporting text.");
		expect(html).not.toContain("No credit card required");
	});
});
