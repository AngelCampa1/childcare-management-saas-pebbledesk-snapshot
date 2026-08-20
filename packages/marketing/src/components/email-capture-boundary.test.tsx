import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/form-interaction-tracker", () => ({
	trackEmailFocus: vi.fn(),
	trackEmailBlurWithoutSubmit: vi.fn(),
	resetFocusTracking: vi.fn(),
}));

vi.mock("./post-signup-survey", () => ({
	PostSignupSurvey: () => {
		throw new Error("post signup survey crash");
	},
}));

import { EmailCapture } from "./email-capture";

beforeEach(() => {
	window.history.pushState({}, "", "/pricing");
});

describe("EmailCapture boundary", () => {
	it("falls back to a static CTA when the survey island crashes", async () => {
		window.history.pushState(
			{},
			"",
			`/pricing?survey=open&e=${btoa("parent@example.com")}&t=test-token`,
		);

		render(
			<EmailCapture
				apiUrl="https://api.test"
				sourcePage="/pricing"
				buttonText="Start Free Trial"
				surveyQuestions={[{ id: "role", text: "Your role?", options: ["Dev", "PM", "Other"] }]}
				discoveryCallUrl="https://cal.com/test"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByRole("link", { name: "Start Free Trial" })).toBeDefined();
		});

		expect(screen.getByRole("link", { name: "Start Free Trial" }).getAttribute("href")).toBe(
			"https://my.pebbledesk.app/signup?source=%2Fpricing",
		);
		expect(screen.queryByRole("form", { name: "Continue with your email" })).toBeNull();
	});
});
