/**
 * Integration: EmailCapture + ExitIntentPopup error-state persistence
 *
 * Bug 1 — handleEmailChange only clears "error-validation". After a network
 *   error or duplicate, editing the email field leaves the error message
 *   visible. Both EmailCapture and ExitIntentPopup share this flaw.
 *
 * Bug 2 — referredBy uses `|| undefined` in EmailCapture but `?? undefined`
 *   in ExitIntentPopup. An empty ref= URL param is omitted by EmailCapture
 *   (correct) but sent as "" by ExitIntentPopup (inconsistent / wrong).
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailCapture } from "../components/email-capture";
import { ExitIntentPopup } from "../components/exit-intent-popup";

// Mock exit-popup-utils so we can control popup visibility easily.
vi.mock("../lib/exit-popup-utils", () => ({
	SUPPRESS_DAYS: 30,
	SUPPRESS_KEY: "exit-popup-suppressed",
	SIGNED_UP_KEY: "exit-popup-signed-up",
	isSignedUp: vi.fn(() => false),
	isWithinSuppressWindow: vi.fn(() => false),
	setSuppressed: vi.fn(),
	setSignedUp: vi.fn(),
	detectScrollBack: vi.fn(() => false),
}));

const emailCaptureProps = {
	apiUrl: "https://api.test",
	sourcePage: "/",
	surveyQuestions: [{ id: "role", text: "Your role?", options: ["Dev", "PM"] }],
	discoveryCallUrl: "https://cal.com/test",
	buttonText: "Join",
	placeholder: "you@test.com",
	errorInvalidEmail: "Invalid email",
	errorDuplicate: "Already signed up",
	errorGeneric: "Network error",
};

/** Advance the 5 s arm timer and fire mouseleave to show the exit popup. */
async function openExitPopup() {
	act(() => {
		vi.advanceTimersByTime(5100);
	});
	act(() => {
		fireEvent(document, new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }));
	});
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeDefined();
	});
}

beforeEach(() => {
	vi.restoreAllMocks();
	Object.defineProperty(window, "location", {
		value: { search: "" },
		writable: true,
		configurable: true,
	});
});

afterEach(() => {
	vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1 — error state not cleared on email edit
// ─────────────────────────────────────────────────────────────────────────────

describe("EmailCapture — error-state persistence (Bug 1)", () => {
	it("error-validation IS cleared when the user edits their email (correct behavior)", () => {
		vi.stubGlobal("fetch", vi.fn());

		render(<EmailCapture {...emailCaptureProps} />);
		const input = screen.getByPlaceholderText("you@test.com");

		fireEvent.change(input, { target: { value: "bad" } });
		fireEvent.submit(screen.getByRole("button", { name: "Join" }));

		expect(screen.getByText("Invalid email")).toBeDefined();

		// Correct: editing the email clears the validation error
		fireEvent.change(input, { target: { value: "a@b.com" } });
		expect(screen.queryByText("Invalid email")).toBeNull();
	});

	it("error-generic is cleared when the user edits their email (BUG: currently persists)", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

		render(<EmailCapture {...emailCaptureProps} />);
		const input = screen.getByPlaceholderText("you@test.com");

		fireEvent.change(input, { target: { value: "a@b.com" } });
		fireEvent.submit(screen.getByRole("button", { name: "Join" }));

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeDefined();
		});

		// User corrects their email — the generic error should disappear
		fireEvent.change(input, { target: { value: "new@email.com" } });

		// BUG: handleEmailChange only clears error-validation, so "Network error"
		// stays visible even as the user types a new email.
		expect(screen.queryByText("Network error")).toBeNull();
	});

	it("error-duplicate is cleared when the user edits their email (BUG: currently persists)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 409,
				json: () => Promise.resolve({}),
			}),
		);

		render(<EmailCapture {...emailCaptureProps} errorDuplicate="Already signed up" />);
		const input = screen.getByPlaceholderText("you@test.com");

		fireEvent.change(input, { target: { value: "a@b.com" } });
		fireEvent.submit(screen.getByRole("button", { name: "Join" }));

		await waitFor(() => {
			expect(screen.getByText("Already signed up")).toBeDefined();
		});

		// User tries a different email — the duplicate error should disappear
		fireEvent.change(input, { target: { value: "other@email.com" } });

		// BUG: error-duplicate is not cleared by handleEmailChange.
		expect(screen.queryByText("Already signed up")).toBeNull();
	});
});

describe("ExitIntentPopup — lead capture contract", () => {
	it("renders an inline lead-capture form instead of a direct signup link", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });

		render(
			<ExitIntentPopup
				apiUrl="https://api.test"
				siteName="Test"
				headline="Before you go"
				description="Try it free"
				ctaText="Get Started"
				leftPanelLabel="FREE GUIDE"
				successSubMessage="We'll be in touch."
				leadMagnet={{
					title: "Test Guide",
					description: "Try it free",
					slug: "licensing-compliance-checklist",
				}}
			/>,
		);

		await openExitPopup();

		expect(screen.getByRole("textbox", { name: /email address/i })).toBeDefined();
		expect(screen.queryByRole("link", { name: "Get Started" })).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2 — referredBy: || vs ?? inconsistency
// ─────────────────────────────────────────────────────────────────────────────

describe("referredBy — empty ref= param handling (Bug 2)", () => {
	it("EmailCapture omits referredBy when ref param is empty string (|| behavior)", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);

		Object.defineProperty(window, "location", {
			value: { search: "?ref=" },
			writable: true,
			configurable: true,
		});

		render(<EmailCapture {...emailCaptureProps} />);
		fireEvent.change(screen.getByPlaceholderText("you@test.com"), {
			target: { value: "a@b.com" },
		});
		fireEvent.submit(screen.getByRole("button", { name: "Join" }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalled();
		});

		const body = JSON.parse(
			(fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
		) as Record<string, unknown>;
		// EmailCapture uses || — empty string is falsy → referredBy omitted
		expect(body).not.toHaveProperty("referredBy");
	});

	it("ExitIntentPopup does not leak an empty ref param into the lead-capture payload", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true, downloadUrl: "https://cdn.test/guide.pdf" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		Object.defineProperty(window, "location", {
			value: { search: "?ref=" },
			writable: true,
			configurable: true,
		});

		render(
			<ExitIntentPopup
				apiUrl="https://api.test"
				siteName="Test"
				headline="Before you go"
				description="Try it free"
				ctaText="Get Started"
				leftPanelLabel="FREE GUIDE"
				successSubMessage="We'll be in touch."
				leadMagnet={{
					title: "Test Guide",
					description: "Try it free",
					slug: "licensing-compliance-checklist",
				}}
			/>,
		);

		await openExitPopup();

		fireEvent.change(screen.getByRole("textbox", { name: /email address/i }), {
			target: { value: "a@b.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalled();
		});

		const body = JSON.parse(
			(fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
		) as Record<string, unknown>;
		expect(body).not.toHaveProperty("referredBy");
	});

	it("both components omit referredBy when ref param is absent entirely", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);

		// No ref param in URL
		render(<EmailCapture {...emailCaptureProps} />);
		fireEvent.change(screen.getByPlaceholderText("you@test.com"), {
			target: { value: "a@b.com" },
		});
		fireEvent.submit(screen.getByRole("button", { name: "Join" }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalled();
		});

		const body = JSON.parse(
			(fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
		) as Record<string, unknown>;
		expect(body).not.toHaveProperty("referredBy");
	});
});
