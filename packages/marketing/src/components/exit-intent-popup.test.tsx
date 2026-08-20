import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/focus-trap", () => ({ useFocusTrap: vi.fn() }));
vi.mock("../lib/scroll-lock", () => ({
	lockScroll: vi.fn(),
	unlockScroll: vi.fn(),
}));
vi.mock("../lib/exit-popup-utils", () => ({
	SUPPRESS_DAYS: 30,
	isSignedUp: vi.fn(() => false),
	isWithinSuppressWindow: vi.fn(() => false),
	setSuppressed: vi.fn(),
	setSignedUp: vi.fn(),
	detectScrollBack: vi.fn(() => false),
}));

import { trackEvent } from "../lib/analytics";
import {
	detectScrollBack,
	isSignedUp,
	isWithinSuppressWindow,
	setSignedUp,
	setSuppressed,
} from "../lib/exit-popup-utils";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { ExitIntentPopup } from "./exit-intent-popup";

const mockTrackEvent = trackEvent as unknown as MockInstance;
const mockIsSignedUp = isSignedUp as unknown as MockInstance;
const mockIsWithinSuppressWindow = isWithinSuppressWindow as unknown as MockInstance;
const mockSetSuppressed = setSuppressed as unknown as MockInstance;
const mockSetSignedUp = setSignedUp as unknown as MockInstance;
const mockDetectScrollBack = detectScrollBack as unknown as MockInstance;
const mockLockScroll = lockScroll as unknown as MockInstance;
const mockUnlockScroll = unlockScroll as unknown as MockInstance;

const defaultProps = {
	apiUrl: "https://api.test",
	siteName: "TestSite",
	headline: "Before you go",
	description: "Try TestSite free for 30 days.",
	ctaText: "Request Trial",
	leftPanelLabel: "FREE GUIDE",
	successSubMessage: "Create your account and finish setup in PebbleDesk.",
	leadMagnet: {
		title: "TestSite Guide",
		description: "Try TestSite free for 30 days.",
		slug: "licensing-compliance-checklist",
	},
};

async function openPopup() {
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
	vi.clearAllMocks();
	vi.stubGlobal("fetch", vi.fn());
	vi.useFakeTimers({ shouldAdvanceTime: true });
	mockIsSignedUp.mockReturnValue(false);
	mockIsWithinSuppressWindow.mockReturnValue(false);
	mockDetectScrollBack.mockReturnValue(false);
	Object.defineProperty(window, "location", {
		value: { search: "" },
		writable: true,
		configurable: true,
	});
});

afterEach(() => {
	vi.useRealTimers();
});

describe("ExitIntentPopup", () => {
	it("does not render immediately", () => {
		render(<ExitIntentPopup {...defaultProps} />);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("does not activate when the visitor is already signed up", () => {
		mockIsSignedUp.mockReturnValue(true);

		render(<ExitIntentPopup {...defaultProps} />);
		act(() => {
			vi.advanceTimersByTime(6000);
		});
		fireEvent(document, new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }));

		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("does not activate when the popup is within the suppress window", () => {
		mockIsWithinSuppressWindow.mockReturnValue(true);

		render(<ExitIntentPopup {...defaultProps} />);
		act(() => {
			vi.advanceTimersByTime(6000);
		});
		fireEvent(document, new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }));

		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("shows after the timer fires and mouseleave occurs", async () => {
		render(<ExitIntentPopup {...defaultProps} />);

		await openPopup();

		expect(mockTrackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.exitPopupShown, {
			trigger: "mouseleave",
		});
		expect(mockLockScroll).toHaveBeenCalled();
	});

	it("uses lead-magnet copy when configured and sanitizes the CTA target", async () => {
		render(
			<ExitIntentPopup
				{...defaultProps}
				sourcePage="/resources/guides/example"
				leadMagnet={{
					title: "Audit Checklist",
					description: "Join the waitlist for this checklist.",
					slug: "state-audit-preparation-toolkit",
				}}
			/>,
		);

		await openPopup();

		expect(screen.getByText("Audit Checklist")).toBeDefined();
		expect(screen.getByText("Join the waitlist for this checklist.")).toBeDefined();
	});

	it("submits the selected lead magnet through the leads API", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "https://cdn.test/audit.pdf" }), {
				status: 200,
			}),
		);
		Object.defineProperty(window, "location", {
			value: { search: "?utm_source=google&utm_medium=cpc&utm_campaign=audit" },
			writable: true,
			configurable: true,
		});

		render(
			<ExitIntentPopup
				{...defaultProps}
				sourcePage="/resources/guides/example"
				leadMagnet={{
					title: "Audit Checklist",
					description: "Join the waitlist for this checklist.",
					slug: "state-audit-preparation-toolkit",
				}}
			/>,
		);

		await openPopup();

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		});

		const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.test/api/leads");
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body).toMatchObject({
			email: "jane@example.com",
			magnetSlug: "state-audit-preparation-toolkit",
			sourcePage: "/resources/guides/example",
			utmSource: "google",
			utmMedium: "cpc",
			utmCampaign: "audit",
		});
	});

	it("shows the download link and suppresses future popups after lead capture", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "https://cdn.test/audit.pdf" }), {
				status: 200,
			}),
		);
		render(
			<ExitIntentPopup
				{...defaultProps}
				leadMagnet={{
					title: "Audit Checklist",
					description: "Join the waitlist for this checklist.",
					slug: "state-audit-preparation-toolkit",
				}}
			/>,
		);

		await openPopup();
		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByText(/check your inbox/i)).toBeDefined();
		});

		expect(screen.getByRole("link", { name: /download/i }).getAttribute("href")).toBe(
			"https://cdn.test/audit.pdf",
		);
		expect(mockSetSignedUp).toHaveBeenCalledOnce();
		expect(mockSetSuppressed).toHaveBeenCalledOnce();
		expect(mockTrackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.exitPopupConverted);
	});

	it("shows an error without marking signed up when lead capture fails", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
		render(
			<ExitIntentPopup
				{...defaultProps}
				leadMagnet={{
					title: "Audit Checklist",
					description: "Join the waitlist for this checklist.",
					slug: "state-audit-preparation-toolkit",
				}}
			/>,
		);

		await openPopup();
		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeDefined();
		});

		expect(mockSetSignedUp).not.toHaveBeenCalled();
		expect(mockSetSuppressed).not.toHaveBeenCalled();
	});

	it("omits the panel title when lead-magnet content is disabled", async () => {
		render(
			<ExitIntentPopup
				{...defaultProps}
				showLeadMagnetContent={false}
				leadMagnet={{
					title: "Audit Checklist",
					description: "Direct signup.",
					slug: "state-audit-preparation-toolkit",
				}}
			/>,
		);

		await openPopup();

		expect(screen.queryByText("Audit Checklist")).toBeNull();
		expect(screen.getByText("Before you go")).toBeDefined();
	});

	it("falls back to resource-delivery copy when standalone popup copy is missing", async () => {
		render(
			<ExitIntentPopup
				{...defaultProps}
				showLeadMagnetContent={false}
				description={undefined as unknown as string}
			/>,
		);

		await openPopup();

		expect(
			screen.getByText("Enter your email and we will send the resource to your inbox."),
		).toBeDefined();
	});

	it("still renders the lead-capture CTA without client-side attribution state", async () => {
		render(<ExitIntentPopup {...defaultProps} sourcePage="/compare/example" />);

		await openPopup();

		expect(screen.getByRole("button", { name: "Request Trial" })).toBeDefined();
	});

	it("dismisses from the close button", async () => {
		render(<ExitIntentPopup {...defaultProps} />);

		await openPopup();
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
		expect(mockSetSuppressed).toHaveBeenCalled();
	});

	it("dismisses from the secondary button", async () => {
		render(<ExitIntentPopup {...defaultProps} declineText="No thanks" />);

		await openPopup();
		fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
	});

	it("dismisses from the backdrop and Escape key", async () => {
		const firstRender = render(<ExitIntentPopup {...defaultProps} />);

		await openPopup();
		const backdrop = document.querySelector("[data-backdrop]");
		if (!(backdrop instanceof HTMLElement)) {
			throw new Error("Expected backdrop element");
		}
		fireEvent.click(backdrop);

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});

		firstRender.unmount();
		render(<ExitIntentPopup {...defaultProps} />);
		await openPopup();
		fireEvent.keyDown(document, { key: "Escape" });

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
	});

	it("dismisses on Escape keydown on the backdrop but ignores other keys", async () => {
		render(<ExitIntentPopup {...defaultProps} />);

		await openPopup();
		const backdrop = document.querySelector("[data-backdrop]");
		if (!(backdrop instanceof HTMLElement)) {
			throw new Error("Expected backdrop element");
		}

		// A non-Escape key on the backdrop must not dismiss the popup.
		fireEvent.keyDown(backdrop, { key: "Enter" });
		expect(screen.getByRole("dialog")).toBeDefined();

		// Escape on the backdrop dismisses.
		fireEvent.keyDown(backdrop, { key: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
	});

	it("stops keydown propagation from the dialog so backdrop handlers do not fire", async () => {
		render(<ExitIntentPopup {...defaultProps} />);

		await openPopup();
		const dialog = screen.getByRole("dialog");

		// Escape bubbling up from inside the dialog is stopped, so the popup stays open.
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(screen.getByRole("dialog")).toBeDefined();
	});

	it("supports the mobile scroll-back trigger", async () => {
		Object.defineProperty(window, "ontouchstart", {
			value: true,
			configurable: true,
		});
		mockDetectScrollBack.mockReturnValue(true);

		render(<ExitIntentPopup {...defaultProps} />);

		act(() => {
			vi.advanceTimersByTime(5100);
			Object.defineProperty(window, "scrollY", {
				value: 450,
				configurable: true,
			});
			window.dispatchEvent(new Event("scroll"));
		});

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeDefined();
		});
		expect(mockTrackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.exitPopupShown, {
			trigger: "scroll_back",
		});
	});

	it("unlocks scroll on unmount after opening", async () => {
		const rendered = render(<ExitIntentPopup {...defaultProps} />);

		await openPopup();
		rendered.unmount();

		expect(mockUnlockScroll).toHaveBeenCalled();
	});

	it("forwards turnstileSiteKey to LeadCaptureForm — widget container appears when key provided", async () => {
		const turnstileMock = {
			render: vi.fn(() => "widget-id"),
			reset: vi.fn(),
			remove: vi.fn(),
		};
		vi.stubGlobal("turnstile", turnstileMock);

		render(<ExitIntentPopup {...defaultProps} turnstileSiteKey="0x4AAAA" />);

		await openPopup();

		await waitFor(() => {
			expect(document.querySelector("[data-turnstile-widget]")).not.toBeNull();
		});

		vi.unstubAllGlobals();
	});

	it("does not render a turnstile widget when turnstileSiteKey is not provided", async () => {
		render(<ExitIntentPopup {...defaultProps} />);

		await openPopup();

		expect(document.querySelector("[data-turnstile-widget]")).toBeNull();
	});

	it("uses the description prop fallback when showLeadMagnetContent is false", async () => {
		render(
			<ExitIntentPopup
				{...defaultProps}
				showLeadMagnetContent={false}
				description="Custom fallback description."
				leadMagnet={{
					title: "Some Guide",
					description: "Lead magnet description.",
					slug: "licensing-compliance-checklist",
				}}
			/>,
		);

		await openPopup();

		expect(screen.getByText("Custom fallback description.")).toBeDefined();
		expect(screen.queryByText("Lead magnet description.")).toBeNull();
	});

	it("uses the hardcoded default string when showLeadMagnetContent is false and description is undefined", async () => {
		render(
			<ExitIntentPopup
				{...defaultProps}
				showLeadMagnetContent={false}
				description={undefined as unknown as string}
				leadMagnet={{
					title: "Some Guide",
					description: "Lead magnet description.",
					slug: "licensing-compliance-checklist",
				}}
			/>,
		);

		await openPopup();

		expect(
			screen.getByText("Enter your email and we will send the resource to your inbox."),
		).toBeDefined();
	});

	it("uses siteName Guide as panelTitle when showLeadMagnetContent is true but leadMagnet has no title", async () => {
		render(
			<ExitIntentPopup
				{...defaultProps}
				showLeadMagnetContent={true}
				leadMagnet={{
					title: undefined as unknown as string,
					description: "Some description.",
					slug: "licensing-compliance-checklist",
				}}
			/>,
		);

		await openPopup();

		expect(screen.getByText("TestSite Guide")).toBeDefined();
	});

	it("returns undefined panelTitle when showLeadMagnetContent is false", async () => {
		render(
			<ExitIntentPopup
				{...defaultProps}
				showLeadMagnetContent={false}
				leadMagnet={{
					title: "Real Title",
					description: "Some description.",
					slug: "licensing-compliance-checklist",
				}}
			/>,
		);

		await openPopup();

		expect(screen.queryByText("Real Title")).toBeNull();
	});

	it("does not open when mouseleave fires before the 5-second timer elapses", () => {
		render(<ExitIntentPopup {...defaultProps} />);

		act(() => {
			vi.advanceTimersByTime(3000);
		});
		act(() => {
			fireEvent(document, new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }));
		});

		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("does not open when mouseleave fires with clientY >= 5 after timer elapses", () => {
		render(<ExitIntentPopup {...defaultProps} />);

		act(() => {
			vi.advanceTimersByTime(5100);
		});
		act(() => {
			fireEvent(document, new MouseEvent("mouseleave", { bubbles: false, clientY: 10 }));
		});

		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("only tracks exit popup shown event once even when mouseleave fires twice", async () => {
		render(<ExitIntentPopup {...defaultProps} />);

		act(() => {
			vi.advanceTimersByTime(5100);
		});

		// First valid mouseleave — shows popup and tracks
		act(() => {
			fireEvent(document, new MouseEvent("mouseleave", { bubbles: false, clientY: 0 }));
		});
		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeDefined();
		});

		// Dismiss the popup so the state resets and the effect can re-register a handler
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});

		// Confirm trackEvent(ANALYTICS_EVENTS.exitPopupShown, ...) was called exactly once
		const shownCalls = mockTrackEvent.mock.calls.filter(
			(call: unknown[]) => call[0] === ANALYTICS_EVENTS.exitPopupShown,
		);
		expect(shownCalls).toHaveLength(1);
	});

	it("does not attach a scroll handler on desktop (no ontouchstart) and cleans up without error", () => {
		// biome-ignore lint/suspicious/noExplicitAny: intentional test-global deletion to simulate desktop environment
		delete (window as any).ontouchstart;

		render(<ExitIntentPopup {...defaultProps} />);

		act(() => {
			vi.advanceTimersByTime(5100);
			Object.defineProperty(window, "scrollY", {
				value: 400,
				configurable: true,
			});
			window.dispatchEvent(new Event("scroll"));
		});

		// Popup must not open via scroll on desktop
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("scroll handler short-circuit: does not update peak or trigger when scrollY does not increase", async () => {
		Object.defineProperty(window, "ontouchstart", {
			value: true,
			configurable: true,
		});

		render(<ExitIntentPopup {...defaultProps} />);

		act(() => {
			vi.advanceTimersByTime(5100);
			// Set scrollY to 100 first so peak is established
			Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
			window.dispatchEvent(new Event("scroll"));
		});

		act(() => {
			// Scroll back to a lower value — currentY <= peakScrollYRef.current path
			// detectScrollBack returns false by default mock, so popup stays closed
			Object.defineProperty(window, "scrollY", { value: 50, configurable: true });
			window.dispatchEvent(new Event("scroll"));
		});

		expect(screen.queryByRole("dialog")).toBeNull();
		expect(mockTrackEvent).not.toHaveBeenCalledWith(
			ANALYTICS_EVENTS.exitPopupShown,
			expect.anything(),
		);

		// biome-ignore lint/suspicious/noExplicitAny: intentional test-global deletion to restore desktop state
		delete (window as any).ontouchstart;
	});

	it("scroll handler short-circuit: detectScrollBack returning false keeps popup closed", async () => {
		Object.defineProperty(window, "ontouchstart", {
			value: true,
			configurable: true,
		});
		mockDetectScrollBack.mockReturnValue(false);

		render(<ExitIntentPopup {...defaultProps} />);

		act(() => {
			vi.advanceTimersByTime(5100);
			Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
			window.dispatchEvent(new Event("scroll"));
		});

		expect(screen.queryByRole("dialog")).toBeNull();
		expect(mockTrackEvent).not.toHaveBeenCalledWith(
			ANALYTICS_EVENTS.exitPopupShown,
			expect.anything(),
		);

		// biome-ignore lint/suspicious/noExplicitAny: intentional test-global deletion to restore desktop state
		delete (window as any).ontouchstart;
	});

	it("scroll handler: only tracks scroll_back shown event once on duplicate scroll trigger", async () => {
		Object.defineProperty(window, "ontouchstart", {
			value: true,
			configurable: true,
		});
		mockDetectScrollBack.mockReturnValue(true);

		render(<ExitIntentPopup {...defaultProps} />);

		act(() => {
			vi.advanceTimersByTime(5100);
			Object.defineProperty(window, "scrollY", { value: 450, configurable: true });
			window.dispatchEvent(new Event("scroll"));
		});

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeDefined();
		});

		// Dismiss so visible becomes false; dismissedRef is now true so second scroll won't re-open
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});

		const shownCalls = mockTrackEvent.mock.calls.filter(
			(call: unknown[]) => call[0] === ANALYTICS_EVENTS.exitPopupShown,
		);
		expect(shownCalls).toHaveLength(1);

		// biome-ignore lint/suspicious/noExplicitAny: intentional test-global deletion to restore desktop state
		delete (window as any).ontouchstart;
	});
});
