/**
 * Integration: ExitIntentPopup lead-capture flow.
 *
 * Uses real exit-popup-utils and localStorage so successful lead capture
 * exercises the real signup/suppression path.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExitIntentPopup } from "../components/exit-intent-popup";
import { SIGNED_UP_KEY, SUPPRESS_KEY } from "../lib/exit-popup-utils";

const defaultProps = {
	apiUrl: "https://api.test",
	siteName: "TestSite",
	headline: "Before you go — get started",
	description: "Try TestSite free for 30 days.",
	ctaText: "Get Started",
	leftPanelLabel: "FREE GUIDE",
	successSubMessage: "Check your inbox for your login details.",
	leadMagnet: {
		title: "TestSite Guide",
		description: "Try TestSite free for 30 days.",
		slug: "licensing-compliance-checklist",
	},
};

function stubSuccessfulLeadCapture() {
	const fetchMock = vi.fn().mockResolvedValue(
		new Response(JSON.stringify({ ok: true, downloadUrl: "https://cdn.test/guide.pdf" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

/** Advance past the 5s arming delay then fire a mouseleave near the top. */
async function triggerPopup() {
	act(() => {
		vi.advanceTimersByTime(5100);
	});
	act(() => {
		fireEvent(document, new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }));
	});
}

beforeEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	vi.useFakeTimers({ shouldAdvanceTime: true });
	Object.defineProperty(window, "location", {
		value: { search: "" },
		writable: true,
		configurable: true,
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe("ExitIntentPopup full signup flow", () => {
	it("renders an inline lead-capture form and no direct signup CTA", async () => {
		render(<ExitIntentPopup {...defaultProps} />);

		await triggerPopup();

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeDefined();
		});

		expect(screen.getByRole("textbox", { name: /email address/i })).toBeDefined();
		expect(screen.getByRole("button", { name: "Get Started" })).toBeDefined();
		expect(screen.queryByRole("link", { name: "Get Started" })).toBeNull();
	});

	it("submitting the form stores signup and suppress timestamps", async () => {
		const fetchMock = stubSuccessfulLeadCapture();
		render(<ExitIntentPopup {...defaultProps} />);

		await triggerPopup();
		await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

		fireEvent.change(screen.getByRole("textbox", { name: /email address/i }), {
			target: { value: "jane@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Get Started" }));

		await waitFor(() => {
			expect(screen.getByRole("link", { name: /download now/i }).getAttribute("href")).toBe(
				"https://cdn.test/guide.pdf",
			);
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.test/api/leads",
			expect.objectContaining({ method: "POST" }),
		);
		expect(localStorage.getItem(SUPPRESS_KEY)).not.toBeNull();
		expect(localStorage.getItem(SIGNED_UP_KEY)).not.toBeNull();
	});

	it("popup does not re-open on remount after lead capture within the suppress window", async () => {
		stubSuccessfulLeadCapture();
		const { unmount } = render(<ExitIntentPopup {...defaultProps} />);

		await triggerPopup();
		await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());

		fireEvent.change(screen.getByRole("textbox", { name: /email address/i }), {
			target: { value: "jane@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Get Started" }));
		await waitFor(() => expect(localStorage.getItem(SUPPRESS_KEY)).not.toBeNull());

		unmount();
		vi.useRealTimers();
		vi.useFakeTimers({ shouldAdvanceTime: true });

		render(<ExitIntentPopup {...defaultProps} />);

		await triggerPopup();

		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
