import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

expect.extend(jestDomMatchers);

import { EmailCapture } from "./email-capture";

vi.mock("../lib/analytics", () => ({
	trackEvent: vi.fn(),
}));

vi.mock("../lib/form-interaction-tracker", () => ({
	trackEmailFocus: vi.fn(),
	trackEmailBlurWithoutSubmit: vi.fn(),
	resetFocusTracking: vi.fn(),
}));

const defaultProps = {
	apiUrl: "/api",
	sourcePage: "/guides/privacy",
	signupFlowConfigUrl: "/signup-flow.json",
};

describe("EmailCapture signup flow config", () => {
	it("loads survey config from a public JSON endpoint before rendering the form", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					surveyQuestions: [{ id: "role", text: "Role?", options: ["User", "Other"] }],
					discoveryCallUrl: "https://cal.test/floriva",
					subtitle: "Stored on your device.",
				}),
			}),
		);

		render(<EmailCapture {...defaultProps} />);

		expect(screen.getByText("Loading signup form…", { exact: false })).toBeDefined();

		await waitFor(() => {
			expect(screen.getByLabelText("Email address")).toBeDefined();
			expect(screen.getByText("Stored on your device.")).toBeDefined();
		});
	});

	it("shows a retry state when the signup-flow request fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
			}),
		);

		render(<EmailCapture {...defaultProps} />);

		await waitFor(() => {
			expect(screen.getByText("We couldn't load the signup form.")).toBeDefined();
			expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
		});
	});

	it("renders the passive loading state when no inline config or endpoint is available", () => {
		render(<EmailCapture apiUrl="/api" sourcePage="/guides/privacy" />);

		expect(screen.getByRole("heading", { name: "Loading signup form…" })).toBeDefined();
		expect(screen.getByText("We're preparing the next step for you.")).toBeDefined();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("retries the signup-flow request after an initial failure", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 500,
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					surveyQuestions: [{ id: "role", text: "Role?", options: ["User", "Other"] }],
					discoveryCallUrl: "https://cal.test/floriva",
				}),
			});

		vi.stubGlobal("fetch", fetchMock);

		render(<EmailCapture {...defaultProps} />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
		});

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));

		await waitFor(() => {
			expect(screen.getByLabelText("Email address")).toBeDefined();
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("reuses the loaded signup-flow config across rerenders without fetching again", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				surveyQuestions: [{ id: "role", text: "Role?", options: ["User", "Other"] }],
				discoveryCallUrl: "https://cal.test/floriva",
				subtitle: "Stored on your device.",
			}),
		});

		vi.stubGlobal("fetch", fetchMock);

		const { rerender } = render(<EmailCapture {...defaultProps} />);

		await waitFor(() => {
			expect(screen.getByLabelText("Email address")).toBeDefined();
			expect(screen.getByText("Stored on your device.")).toBeDefined();
		});

		rerender(<EmailCapture {...defaultProps} signupFlowConfigUrl="/signup-flow-v2.json" />);

		await waitFor(() => {
			expect(screen.getByLabelText("Email address")).toBeDefined();
			expect(screen.getByText("Stored on your device.")).toBeDefined();
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("uses signup-flow config copy for duplicate signup errors when no prop override is provided", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					surveyQuestions: [{ id: "role", text: "Role?", options: ["User", "Other"] }],
					discoveryCallUrl: "https://cal.test/floriva",
					errorDuplicate: "You already joined this waitlist.",
				}),
			})
			.mockResolvedValueOnce({
				ok: false,
				status: 409,
				json: async () => ({}),
			});

		vi.stubGlobal("fetch", fetchMock);

		render(<EmailCapture {...defaultProps} />);

		await waitFor(() => {
			expect(screen.getByLabelText("Email address")).toBeDefined();
		});

		fireEvent.change(screen.getByLabelText("Email address"), {
			target: { value: "director@pebbledesk.test" },
		});
		fireEvent.submit(screen.getByRole("form", { name: "Continue with your email" }));

		await waitFor(() => {
			expect(screen.getByText("You already joined this waitlist.")).toBeDefined();
		});
	});

	it("uses signup-flow config copy for generic signup errors when no prop override is provided", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					surveyQuestions: [{ id: "role", text: "Role?", options: ["User", "Other"] }],
					discoveryCallUrl: "https://cal.test/floriva",
					errorGeneric: "We couldn't save your request yet.",
				}),
			})
			.mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: async () => ({}),
			});

		vi.stubGlobal("fetch", fetchMock);

		render(<EmailCapture {...defaultProps} />);

		await waitFor(() => {
			expect(screen.getByLabelText("Email address")).toBeDefined();
		});

		fireEvent.change(screen.getByLabelText("Email address"), {
			target: { value: "director@pebbledesk.test" },
		});
		fireEvent.submit(screen.getByRole("form", { name: "Continue with your email" }));

		await waitFor(() => {
			expect(screen.getByText("We couldn't save your request yet.")).toBeDefined();
		});
	});

	it("uses signup-flow config copy for success preview and privacy note when props do not override them", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					surveyQuestions: [{ id: "role", text: "Role?", options: ["User", "Other"] }],
					discoveryCallUrl: "https://cal.test/floriva",
					surveyPreview: "Quick qualification survey next.",
					privacyNote: "Private by default.",
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					referralCode: "ABC123",
					position: 5,
				}),
			});

		vi.stubGlobal("fetch", fetchMock);

		render(<EmailCapture {...defaultProps} />);

		await waitFor(() => {
			expect(screen.getByLabelText("Email address")).toBeDefined();
		});

		fireEvent.change(screen.getByLabelText("Email address"), {
			target: { value: "director@pebbledesk.test" },
		});
		fireEvent.submit(screen.getByRole("form", { name: "Continue with your email" }));

		await waitFor(() => {
			expect(screen.getByText("Quick qualification survey next.")).toBeDefined();
			expect(screen.getByText("Private by default.")).toBeDefined();
		});
	});
});
